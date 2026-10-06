export const REMINDER_CHANNEL_ID = 'medication_reminders';
export const REMINDER_CATEGORY_ID = 'MEDICATION_REMINDER';
export const ACTION_TAKEN = 'TAKEN';
export const ACTION_SNOOZE_10 = 'SNOOZE10';
export const BACKGROUND_NOTIFICATION_TASK = 'DAD_MEDICINE_NOTIFICATION_ACTION';

export type MedicationNotificationPayload = {
  owner: 'dad-medicine';
  version: 1;
  kind: 'dose' | 'snooze';
  medicationId: number;
  scheduleId: number;
  scheduledAt: number;
};

export type DoseNotificationIdentity = Pick<
  MedicationNotificationPayload,
  'medicationId' | 'scheduleId' | 'scheduledAt'
>;

export function baseReminderIdentifier(identity: DoseNotificationIdentity): string {
  return `dose_m${identity.medicationId}_s${identity.scheduleId}_t${identity.scheduledAt}`;
}

export function snoozeReminderIdentifier(identity: DoseNotificationIdentity): string {
  return `snooze_m${identity.medicationId}_s${identity.scheduleId}_t${identity.scheduledAt}`;
}

export function medicationNotificationPayload(
  kind: MedicationNotificationPayload['kind'],
  identity: DoseNotificationIdentity,
): MedicationNotificationPayload {
  return { owner: 'dad-medicine', version: 1, kind, ...identity };
}

export function parseMedicationNotificationPayload(value: unknown): MedicationNotificationPayload | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.owner !== 'dad-medicine' || data.version !== 1
    || (data.kind !== 'dose' && data.kind !== 'snooze')) return null;
  if (!Number.isSafeInteger(data.medicationId) || Number(data.medicationId) <= 0
    || !Number.isSafeInteger(data.scheduleId) || Number(data.scheduleId) <= 0
    || !Number.isSafeInteger(data.scheduledAt) || Number(data.scheduledAt) <= 0) return null;
  return {
    owner: 'dad-medicine',
    version: 1,
    kind: data.kind,
    medicationId: Number(data.medicationId),
    scheduleId: Number(data.scheduleId),
    scheduledAt: Number(data.scheduledAt),
  };
}
