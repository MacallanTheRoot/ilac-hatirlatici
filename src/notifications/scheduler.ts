import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { deleteAlarmChannel, ensureAlarmChannel, getAlarmChannelId, getDesiredAlarmChannelId, setAlarmChannelId } from '@/notifications/alarmSound';
import { getDoseLogByIdentity, getDoseLogsForRange } from '@/db/doseLogs';
import { getActiveMedications } from '@/db/medications';
import {
  ACTION_SNOOZE_5,
  ACTION_TAKEN,
  SNOOZE_MINUTES,
  baseReminderIdentifier,
  medicationNotificationPayload,
  parseMedicationNotificationPayload,
  REMINDER_CATEGORY_ID,
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

export async function getMedicationReminderInventory() {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  return requests.flatMap((request) => {
    const payload = parseMedicationNotificationPayload(request.content.data);
    if (!payload) return [];
    return [{
      identifier: request.identifier,
      kind: payload.kind,
      medicationId: payload.medicationId,
      scheduleId: payload.scheduleId,
      scheduledAt: payload.scheduledAt,
      trigger: request.trigger,
    }];
  }).sort((a, b) => a.scheduledAt - b.scheduledAt || a.identifier.localeCompare(b.identifier));
}

let setupPromise: Promise<void> | null = null;
let syncTail: Promise<unknown> = Promise.resolve();
const CHANNEL_MIGRATION_SAFETY_MS = 60_000;

export function prepareReminderNotifications(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      if (Platform.OS === 'android') {
        ensureAlarmChannel(getDesiredAlarmChannelId());
        if (getAlarmChannelId() === getDesiredAlarmChannelId()) {
          setAlarmChannelId(getDesiredAlarmChannelId());
        }
      }
      await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY_ID, [
        { identifier: ACTION_TAKEN, buttonTitle: 'Aldım', options: { opensAppToForeground: false } },
        { identifier: ACTION_SNOOZE_5, buttonTitle: '5 dk ertele', options: { opensAppToForeground: false } },
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
    const channel = await Notifications.getNotificationChannelAsync(getAlarmChannelId());
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

function scheduledChannel(request: Notifications.NotificationRequest): string | null {
  return request.trigger && 'channelId' in request.trigger
    ? String(request.trigger.channelId ?? '') : null;
}

function scheduledDate(request: Notifications.NotificationRequest): number | null {
  const trigger = request.trigger;
  if (trigger && 'type' in trigger && trigger.type === 'date' && 'value' in trigger) {
    return Number(trigger.value);
  }
  return null;
}

/** Replaces each Expo request in place, retaining its identifier and fire time. */
async function migrateScheduledChannels(target: string): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  let failures = 0;
  for (const request of scheduled) {
    const payload = parseMedicationNotificationPayload(request.content.data);
    if (!payload || scheduledChannel(request) === target) continue;
    const date = scheduledDate(request);
    // Expo drops a one-shot request if its trigger expires during replacement.
    // Keep near-due requests intact; the native delivery patch selects the
    // current sound channel when the original request fires.
    if (!date || date <= Date.now() + CHANNEL_MIGRATION_SAFETY_MS) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: request.identifier,
        content: {
          title: request.content.title ?? undefined,
          body: request.content.body ?? undefined,
          data: request.content.data,
          categoryIdentifier: request.content.categoryIdentifier ?? undefined,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: target },
      });
    } catch (cause) {
      failures++;
      console.error('Could not migrate medication alarm channel:', cause);
    }
  }
  return failures;
}

async function rotateMedicationAlarmSoundChannel(): Promise<void> {
  await prepareReminderNotifications();
  const next = getDesiredAlarmChannelId();
  ensureAlarmChannel(next);
  setAlarmChannelId(next);
  if (await migrateScheduledChannels(next)) throw new Error('Alarm sound saved; reminder migration needs retry.');
  await cleanupInactiveChannels();
}

export function changeMedicationAlarmSoundChannel(): Promise<void> {
  const run = syncTail.then(rotateMedicationAlarmSoundChannel);
  syncTail = run.catch(() => undefined);
  return run;
}

async function cleanupInactiveChannels(): Promise<void> {
  const [scheduled, presented, channels] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    Notifications.getPresentedNotificationsAsync(),
    Notifications.getNotificationChannelsAsync(),
  ]);
  const ownedPresented = presented.filter((notification) =>
    parseMedicationNotificationPayload(notification.request.content.data));
  const uncertainPresentedChannel = ownedPresented.some((notification) =>
    !scheduledChannel(notification.request));
  for (const channel of channels ?? []) {
    const id = channel.id;
    if (!/^medication_alarm_[0-9a-f]{16}$/.test(id) || id === getAlarmChannelId()
      || uncertainPresentedChannel) continue;
    if (scheduled.some((request) => parseMedicationNotificationPayload(request.content.data)
      && scheduledChannel(request) === id)) continue;
    if (ownedPresented.some((notification) => scheduledChannel(notification.request) === id)) continue;
    deleteAlarmChannel(id);
  }
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
    ensureAlarmChannel(getDesiredAlarmChannelId());
    if (getAlarmChannelId() !== getDesiredAlarmChannelId()) {
      await rotateMedicationAlarmSoundChannel();
    }
    const channelId = getAlarmChannelId();
    result.failureCount += await migrateScheduledChannels(channelId);
    if (!(await getReminderPermission()).granted) return emptySyncResult('disabled');

    const now = Date.now();
    const firstDay = localDayStart(new Date(now));
    const endExclusive = reminderHorizonEnd(now);
    const [medications, logs, scheduled] = await Promise.all([
      getActiveMedications(db),
      getDoseLogsForRange(db, firstDay.getTime(), endExclusive),
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
    for (const request of existing) {
      const payload = ownedSnoozePayload(request);
      if (!payload) continue;
      const active = activeKeys.has(`${payload.medicationId}:${payload.scheduleId}`);
      // A snooze may have been scheduled just before its SQLite write. Do not
      // cancel that in-flight request merely because its log is not visible yet.
      const log = active ? await getDoseLogByIdentity(db, payload) : null;
      if (request.identifier !== snoozeReminderIdentifier(payload) || !active || log?.status === 'taken') {
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
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: occurrence.scheduledAt,
            channelId,
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
    else await cleanupInactiveChannels();
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

async function performScheduleSnoozeReminder(
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
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: now + SNOOZE_MINUTES * 60_000,
      channelId: getAlarmChannelId(),
    },
  });
  if (returnedIdentifier !== identifier) throw new Error('Native snooze identifier changed.');
}

export function scheduleSnoozeReminder(
  identity: DoseNotificationIdentity,
  medicationName: string,
  dosage: string,
  now?: number,
): Promise<void> {
  const run = syncTail.then(() => performScheduleSnoozeReminder(identity, medicationName, dosage, now ?? Date.now()));
  syncTail = run.catch(() => undefined);
  return run;
}
