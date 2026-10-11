import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';

import { DATABASE_NAME, initializeDatabase } from '@/db/database';
import { getDoseLogByIdentity, getDoseSnoozeEligibility, markDoseSnoozed, markDoseTaken } from '@/db/doseLogs';
import { getMedicationById } from '@/db/medications';
import {
  ACTION_SNOOZE_5,
  ACTION_TAKEN,
  baseReminderIdentifier,
  payloadFromNotificationContent,
  snoozeReminderIdentifier,
  type DoseNotificationIdentity,
} from '@/notifications/constants';
import { emitDoseStateChanged } from '@/notifications/events';
import {
  cancelDoseNotifications,
  scheduleSnoozeReminder,
  syncMedicationReminders,
} from '@/notifications/scheduler';

export type NotificationActionResult = 'ignored' | 'taken' | 'snoozed' | 'alreadyTaken';

const recentResponses = new Map<string, { startedAt: number; promise: Promise<NotificationActionResult> }>();

async function dismissPresentedNotification(identifier: string): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(identifier);
  } catch (cause) {
    console.warn('Could not dismiss handled medication notification:', cause);
  }
}

async function dismissDoseNotifications(identity: DoseNotificationIdentity, requestIdentifier?: string) {
  if (requestIdentifier) {
    await dismissPresentedNotification(requestIdentifier);
    return;
  }
  await Promise.all([
    dismissPresentedNotification(baseReminderIdentifier(identity)),
    dismissPresentedNotification(snoozeReminderIdentifier(identity)),
  ]);
}

/** Shared by notification actions and the alarm screen. No React state or route logic. */
export async function performMedicationDoseAction(
  identity: DoseNotificationIdentity,
  action: 'taken' | 'snooze',
  providedDb?: SQLite.SQLiteDatabase,
  requestIdentifier?: string,
  originKind: 'dose' | 'snooze' = 'dose',
): Promise<NotificationActionResult> {
  // A headless task can run in the same Android process as SQLiteProvider.
  // Give it its own native handle so closing it cannot invalidate the UI handle.
  const db = providedDb ?? await SQLite.openDatabaseAsync(DATABASE_NAME, { useNewConnection: true });
  try {
    if (!providedDb) await initializeDatabase(db);
    if (action === 'taken') {
      await markDoseTaken(db, identity);
      emitDoseStateChanged();
      await cancelDoseNotifications(identity);
      await dismissDoseNotifications(identity, requestIdentifier);
      const result = await syncMedicationReminders(db);
      if (result.status !== 'scheduled') {
        console.warn('Dose confirmed but reminders are not fully active:', result);
      }
      return 'taken';
    }

    const medication = await getMedicationById(db, identity.medicationId);
    if (!medication?.schedules.some((schedule) => schedule.id === identity.scheduleId)) {
      return 'ignored';
    }
    const eligibility = await getDoseSnoozeEligibility(db, identity);
    if (eligibility === 'alreadyTaken') {
      await cancelDoseNotifications(identity);
      await dismissDoseNotifications(identity, requestIdentifier);
      const result = await syncMedicationReminders(db);
      if (result.status !== 'scheduled') {
        console.warn('Taken dose still has a reminder warning:', result);
      }
      return 'alreadyTaken';
    }
    if (originKind === 'dose' && (await getDoseLogByIdentity(db, identity))?.status === 'snoozed') {
      await dismissDoseNotifications(identity, requestIdentifier);
      return 'snoozed';
    }

    // Replenish the base horizon before creating the snooze. A concurrent
    // reconciliation must not remove the just-created native snooze request.
    const syncResult = await syncMedicationReminders(db);
    if (syncResult.status !== 'scheduled') {
      console.warn('Reminder synchronization incomplete before snooze:', syncResult);
    }
    await scheduleSnoozeReminder(identity, medication.name, medication.dosage);
    let log;
    try {
      log = await markDoseSnoozed(db, identity);
    } catch (cause) {
      try {
        await Notifications.cancelScheduledNotificationAsync(snoozeReminderIdentifier(identity));
      } catch (cleanupCause) {
        console.warn('Could not cancel snooze after dose-log failure:', cleanupCause);
      }
      throw cause;
    }
    emitDoseStateChanged();
    if (log.status === 'taken') {
      await cancelDoseNotifications(identity);
      await dismissDoseNotifications(identity, requestIdentifier);
      const result = await syncMedicationReminders(db);
      if (result.status !== 'scheduled') {
        console.warn('Taken dose still has a reminder warning:', result);
      }
      return 'alreadyTaken';
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(baseReminderIdentifier(identity));
    } catch (cause) {
      console.warn('Could not cancel original reminder after snooze:', cause);
    }
    await dismissDoseNotifications(identity, requestIdentifier);
    return 'snoozed';
  } finally {
    if (!providedDb) {
      try {
        await db.closeAsync();
      } catch (cause) {
        console.warn('Could not close background medication database:', cause);
      }
    }
  }
}

async function processResponse(
  response: Notifications.NotificationResponse,
  providedDb?: SQLite.SQLiteDatabase,
): Promise<NotificationActionResult> {
  if (response.actionIdentifier !== ACTION_TAKEN
    && response.actionIdentifier !== ACTION_SNOOZE_5) return 'ignored';
  const payload = payloadFromNotificationContent(response.notification.request.content);
  if (!payload) return 'ignored';
  const expectedIdentifier = payload.kind === 'dose'
    ? baseReminderIdentifier(payload)
    : snoozeReminderIdentifier(payload);
  const requestIdentifier = response.notification.request.identifier;
  if (requestIdentifier !== expectedIdentifier) return 'ignored';
  return performMedicationDoseAction(
    payload,
    response.actionIdentifier === ACTION_TAKEN ? 'taken' : 'snooze',
    providedDb,
    requestIdentifier,
    payload.kind,
  );
}

export function handleMedicationNotificationResponse(
  response: Notifications.NotificationResponse,
  db?: SQLite.SQLiteDatabase,
): Promise<NotificationActionResult> {
  const request = response?.notification?.request;
  if (!request || typeof request.identifier !== 'string' || !request.content) {
    return Promise.resolve('ignored');
  }
  const key = `${response.notification.request.identifier}:${response.actionIdentifier}:${response.notification.date}`;
  const now = Date.now();
  for (const [oldKey, value] of recentResponses) {
    if (now - value.startedAt > 5_000) recentResponses.delete(oldKey);
  }
  const recent = recentResponses.get(key);
  if (recent) return recent.promise;
  const promise = processResponse(response, db);
  recentResponses.set(key, { startedAt: now, promise });
  void promise.catch(() => {
    if (recentResponses.get(key)?.promise === promise) recentResponses.delete(key);
  });
  return promise;
}
