import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';

import { DATABASE_NAME, initializeDatabase } from '@/db/database';
import { markDoseSnoozed, markDoseTaken } from '@/db/doseLogs';
import { getMedicationById } from '@/db/medications';
import {
  ACTION_SNOOZE_10,
  ACTION_TAKEN,
  baseReminderIdentifier,
  parseMedicationNotificationPayload,
  snoozeReminderIdentifier,
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

async function processResponse(
  response: Notifications.NotificationResponse,
  providedDb?: SQLite.SQLiteDatabase,
): Promise<NotificationActionResult> {
  if (response.actionIdentifier !== ACTION_TAKEN
    && response.actionIdentifier !== ACTION_SNOOZE_10) return 'ignored';
  const payload = parseMedicationNotificationPayload(response.notification.request.content.data);
  if (!payload) return 'ignored';
  const expectedIdentifier = payload.kind === 'dose'
    ? baseReminderIdentifier(payload)
    : snoozeReminderIdentifier(payload);
  const requestIdentifier = response.notification.request.identifier;
  if (requestIdentifier !== expectedIdentifier) return 'ignored';

  const db = providedDb ?? await SQLite.openDatabaseAsync(DATABASE_NAME);
  try {
    if (!providedDb) await initializeDatabase(db);
    if (response.actionIdentifier === ACTION_TAKEN) {
      await markDoseTaken(db, payload);
      emitDoseStateChanged();
      await cancelDoseNotifications(payload);
      await dismissPresentedNotification(requestIdentifier);
      const result = await syncMedicationReminders(db);
      if (result.status !== 'scheduled') {
        console.warn('Dose confirmed but reminders are not fully active:', result);
      }
      return 'taken';
    }

    const medication = await getMedicationById(db, payload.medicationId);
    if (!medication?.schedules.some((schedule) => schedule.id === payload.scheduleId)) {
      await dismissPresentedNotification(requestIdentifier);
      return 'ignored';
    }
    const log = await markDoseSnoozed(db, payload);
    emitDoseStateChanged();
    if (log.status === 'taken') {
      await cancelDoseNotifications(payload);
      await dismissPresentedNotification(requestIdentifier);
      const result = await syncMedicationReminders(db);
      if (result.status !== 'scheduled') {
        console.warn('Taken dose still has a reminder warning:', result);
      }
      return 'alreadyTaken';
    }

    try {
      await scheduleSnoozeReminder(payload, medication.name, medication.dosage);
    } catch (cause) {
      console.error('Snooze status saved but native snooze could not be scheduled:', cause);
      await syncMedicationReminders(db);
      throw cause;
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(baseReminderIdentifier(payload));
    } catch (cause) {
      console.warn('Could not cancel original reminder after snooze:', cause);
    }
    await dismissPresentedNotification(requestIdentifier);
    const result = await syncMedicationReminders(db);
    if (result.status !== 'scheduled') {
      console.warn('Snooze saved but reminders are not fully active:', result);
    }
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
