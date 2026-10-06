import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { getDoseLogsForRange, getSnoozedDoseLogs } from '@/db/doseLogs';
import { getActiveMedications } from '@/db/medications';
import {
  ACTION_SNOOZE_10,
  ACTION_TAKEN,
  baseReminderIdentifier,
  medicationNotificationPayload,
  REMINDER_CATEGORY_ID,
  REMINDER_CHANNEL_ID,
  snoozeReminderIdentifier,
  type DoseNotificationIdentity,
} from '@/notifications/constants';
import {
  ownedSnoozePayload,
  planBaseReconciliation,
  planBaseReminders,
  reminderHorizonEnd,
} from '@/notifications/planner';
import { localDayStart } from '@/services/doseOccurrences';
import type { MedicationWithSchedules } from '@/types/medication';

export type ReminderPermission = {
  granted: boolean;
  canAskAgain: boolean;
  undetermined: boolean;
};

export type ReminderSyncResult = {
  status: 'disabled' | 'scheduled' | 'partialFailure';
  desiredCount: number;
  retainedCount: number;
  newlyScheduledCount: number;
  canceledObsoleteCount: number;
  canceledSnoozeCount: number;
  failureCount: number;
  capped: boolean;
};

let setupPromise: Promise<void> | null = null;
let syncTail: Promise<unknown> = Promise.resolve();

export function prepareReminderNotifications(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
          name: 'İlaç hatırlatmaları',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
          enableVibrate: true,
          vibrationPattern: [0, 250, 250, 250],
          bypassDnd: false,
        });
      }
      await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY_ID, [
        { identifier: ACTION_TAKEN, buttonTitle: 'Aldım', options: { opensAppToForeground: false } },
        { identifier: ACTION_SNOOZE_10, buttonTitle: '10 dk ertele', options: { opensAppToForeground: false } },
      ]);
    })().catch((cause: unknown) => {
      setupPromise = null;
      throw cause;
    });
  }
  return setupPromise;
}

export async function getReminderPermission(): Promise<ReminderPermission> {
  const result = await Notifications.getPermissionsAsync();
  if (Platform.OS === 'android' && result.granted) {
    const channel = await Notifications.getNotificationChannelAsync(REMINDER_CHANNEL_ID);
    if (channel?.importance === Notifications.AndroidImportance.NONE) {
      return { granted: false, canAskAgain: false, undetermined: false };
    }
  }
  return {
    granted: result.granted,
    canAskAgain: result.canAskAgain,
    undetermined: result.status === 'undetermined',
  };
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  await prepareReminderNotifications();
  const current = await getReminderPermission();
  if (current.granted || !current.canAskAgain) return current;
  const result = await Notifications.requestPermissionsAsync();
  return {
    granted: result.granted,
    canAskAgain: result.canAskAgain,
    undetermined: result.status === 'undetermined',
  };
}

function emptySyncResult(status: ReminderSyncResult['status']): ReminderSyncResult {
  return {
    status, desiredCount: 0, retainedCount: 0, newlyScheduledCount: 0,
    canceledObsoleteCount: 0, canceledSnoozeCount: 0, failureCount: 0, capped: false,
  };
}

function activeScheduleKeys(medications: readonly MedicationWithSchedules[]): Set<string> {
  const keys = new Set<string>();
  for (const medication of medications) {
    if (!medication.isActive) continue;
    for (const schedule of medication.schedules) {
      if (schedule.isActive) keys.add(`${medication.id}:${schedule.id}`);
    }
  }
  return keys;
}

async function performReminderSync(db: SQLiteDatabase): Promise<ReminderSyncResult> {
  const result = emptySyncResult('scheduled');
  try {
    await prepareReminderNotifications();
    if (!(await getReminderPermission()).granted) return emptySyncResult('disabled');

    const now = Date.now();
    const firstDay = localDayStart(new Date(now));
    const endExclusive = reminderHorizonEnd(now);
    const [medications, logs, snoozedLogs, scheduled] = await Promise.all([
      getActiveMedications(db),
      getDoseLogsForRange(db, firstDay.getTime(), endExclusive),
      getSnoozedDoseLogs(db),
      Notifications.getAllScheduledNotificationsAsync(),
    ]);
    const plan = planBaseReminders(now, medications, logs);
    result.desiredCount = plan.desired.length;
    result.capped = plan.truncated;
    if (plan.truncated) console.warn('Medication reminder horizon exceeded the 400 base reminder cap.');

    const existing = scheduled.map((request) => ({
      identifier: request.identifier,
      data: request.content.data,
    }));
    const changes = planBaseReconciliation(plan.desired, existing);
    result.retainedCount = changes.keep.length;
    const activeKeys = activeScheduleKeys(medications);
    const snoozedKeys = new Set(snoozedLogs.map((log) =>
      `${log.medicationId}:${log.scheduleId}:${log.scheduledAt}`));

    for (const request of existing) {
      const payload = ownedSnoozePayload(request);
      if (!payload) continue;
      const active = activeKeys.has(`${payload.medicationId}:${payload.scheduleId}`);
      const snoozed = snoozedKeys.has(
        `${payload.medicationId}:${payload.scheduleId}:${payload.scheduledAt}`,
      );
      if (request.identifier !== snoozeReminderIdentifier(payload) || !active || !snoozed) {
        try {
          await Notifications.cancelScheduledNotificationAsync(request.identifier);
          result.canceledSnoozeCount++;
        } catch (cause) {
          result.failureCount++;
          console.error('Could not cancel obsolete snooze:', cause);
        }
      }
    }

    for (const identifier of changes.cancel) {
      try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
        result.canceledObsoleteCount++;
      } catch (cause) {
        result.failureCount++;
        console.error('Could not cancel obsolete base reminder:', cause);
      }
    }
    for (const occurrence of changes.schedule) {
      // Time may have advanced while native requests were being inspected/canceled.
      if (occurrence.scheduledAt <= Date.now() + 5_000) continue;
      try {
        const identifier = baseReminderIdentifier(occurrence);
        const returnedIdentifier = await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: 'İlaç zamanı',
            body: `${occurrence.medicationName} — ${occurrence.dosage}`,
            data: medicationNotificationPayload('dose', occurrence),
            categoryIdentifier: REMINDER_CATEGORY_ID,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: occurrence.scheduledAt,
            channelId: REMINDER_CHANNEL_ID,
          },
        });
        if (returnedIdentifier !== identifier) throw new Error('Native reminder identifier changed.');
        result.newlyScheduledCount++;
      } catch (cause) {
        result.failureCount++;
        console.error('Could not schedule base reminder:', cause);
      }
    }
    if (result.failureCount > 0) result.status = 'partialFailure';
    return result;
  } catch (cause) {
    result.status = 'partialFailure';
    result.failureCount++;
    console.error('Could not reconcile medication reminders:', cause);
    return result;
  }
}

export function syncMedicationReminders(db: SQLiteDatabase): Promise<ReminderSyncResult> {
  const run = syncTail.then(() => performReminderSync(db));
  syncTail = run.catch(() => undefined);
  return run;
}

export async function cancelDoseNotifications(identity: DoseNotificationIdentity): Promise<void> {
  const ids = [baseReminderIdentifier(identity), snoozeReminderIdentifier(identity)];
  const results = await Promise.allSettled(ids.map((id) =>
    Notifications.cancelScheduledNotificationAsync(id)));
  for (const result of results) {
    if (result.status === 'rejected') console.warn('Could not cancel confirmed dose reminder:', result.reason);
  }
}

export async function scheduleSnoozeReminder(
  identity: DoseNotificationIdentity,
  medicationName: string,
  dosage: string,
  now = Date.now(),
): Promise<void> {
  await prepareReminderNotifications();
  const identifier = snoozeReminderIdentifier(identity);
  await Notifications.cancelScheduledNotificationAsync(identifier);
  const returnedIdentifier = await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'İlaç hatırlatması',
      body: `${medicationName} — ${dosage}`,
      data: medicationNotificationPayload('snooze', identity),
      categoryIdentifier: REMINDER_CATEGORY_ID,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: now + 10 * 60_000,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
  if (returnedIdentifier !== identifier) throw new Error('Native snooze identifier changed.');
}
