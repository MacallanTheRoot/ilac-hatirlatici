import {
  baseReminderIdentifier,
  parseMedicationNotificationPayload,
  type MedicationNotificationPayload,
} from '@/notifications/constants';
import { localDayOffset, localDayStart, occurrencesForLocalDate } from '@/services/doseOccurrences';
import type { DoseLog, DoseOccurrence, MedicationWithSchedules } from '@/types/medication';

export const REMINDER_HORIZON_DAYS = 90;
export const MAX_BASE_REMINDERS = 400;
export const REMINDER_SAFETY_MS = 5_000;

export type ExistingReminder = { identifier: string; data: unknown };

export function reminderHorizonEnd(now: number): number {
  return localDayOffset(localDayStart(new Date(now)), REMINDER_HORIZON_DAYS + 1).getTime();
}

export function planBaseReminders(
  now: number,
  medications: readonly MedicationWithSchedules[],
  logs: readonly DoseLog[],
): { desired: DoseOccurrence[]; truncated: boolean; endExclusive: number } {
  const today = localDayStart(new Date(now));
  const endExclusive = reminderHorizonEnd(now);
  const candidates: DoseOccurrence[] = [];
  for (let day = 0; day <= REMINDER_HORIZON_DAYS; day++) {
    candidates.push(...occurrencesForLocalDate(localDayOffset(today, day), medications, logs, true)
      .filter((occurrence) => occurrence.scheduledAt > now + REMINDER_SAFETY_MS
        && occurrence.status !== 'taken'));
  }
  candidates.sort((a, b) => a.scheduledAt - b.scheduledAt
    || a.medicationId - b.medicationId || a.scheduleId - b.scheduleId);
  return {
    desired: candidates.slice(0, MAX_BASE_REMINDERS),
    truncated: candidates.length > MAX_BASE_REMINDERS,
    endExclusive,
  };
}

export function planBaseReconciliation(
  desired: readonly DoseOccurrence[],
  scheduled: readonly ExistingReminder[],
): { keep: string[]; cancel: string[]; schedule: DoseOccurrence[] } {
  const desiredIds = new Set(desired.map(baseReminderIdentifier));
  const keep = new Set<string>();
  const cancel: string[] = [];
  for (const request of scheduled) {
    const payload = parseMedicationNotificationPayload(request.data);
    if (payload?.kind !== 'dose') continue;
    const correctIdentifier = request.identifier === baseReminderIdentifier(payload);
    if (correctIdentifier && desiredIds.has(request.identifier)) {
      keep.add(request.identifier);
    } else {
      cancel.push(request.identifier);
    }
  }
  return {
    keep: [...keep],
    cancel,
    schedule: desired.filter((occurrence) => !keep.has(baseReminderIdentifier(occurrence))),
  };
}

export function ownedSnoozePayload(request: ExistingReminder): MedicationNotificationPayload | null {
  const payload = parseMedicationNotificationPayload(request.data);
  return payload?.kind === 'snooze' ? payload : null;
}
