import type { DoseOccurrence, MedicationWithSchedules } from '@/types/medication';
import type { DoseNotificationIdentity } from '@/notifications/constants';

export function alarmIdentityKey(item: DoseNotificationIdentity): string {
  return `${item.medicationId}:${item.scheduleId}:${item.scheduledAt}`;
}

export function isActiveAlarmOccurrence(
  item: DoseOccurrence,
  medications: readonly MedicationWithSchedules[],
  kind: 'dose' | 'snooze',
): boolean {
  if (item.status === 'taken' || (kind === 'dose' && item.status === 'snoozed')) return false;
  const medication = medications.find((candidate) => candidate.id === item.medicationId);
  return Boolean(medication?.isActive && medication.schedules.some((schedule) =>
    schedule.id === item.scheduleId && schedule.isActive));
}

/** Stable across JS restarts; creation time wins, with numeric IDs for ties. */
export function sortAlarmOccurrences(
  occurrences: readonly DoseOccurrence[],
  medications: readonly MedicationWithSchedules[],
): DoseOccurrence[] {
  const createdAt = new Map(medications.map((item) => [item.id, item.createdAt]));
  return [...occurrences].sort((a, b) => a.scheduledAt - b.scheduledAt
    || (createdAt.get(a.medicationId) ?? 0) - (createdAt.get(b.medicationId) ?? 0)
    || a.medicationId - b.medicationId || a.scheduleId - b.scheduleId);
}

export function simultaneousAlarmQueue(
  occurrences: readonly DoseOccurrence[],
  medications: readonly MedicationWithSchedules[],
  identity: DoseNotificationIdentity,
  kind: 'dose' | 'snooze',
): DoseOccurrence[] {
  const requested = occurrences.find((item) => alarmIdentityKey(item) === alarmIdentityKey(identity));
  if (!requested || !isActiveAlarmOccurrence(requested, medications, kind)) return [];
  if (kind === 'snooze') return [requested];
  return sortAlarmOccurrences(occurrences.filter((item) =>
    item.scheduledAt === identity.scheduledAt && isActiveAlarmOccurrence(item, medications, 'dose')), medications);
}
