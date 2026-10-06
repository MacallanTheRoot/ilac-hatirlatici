import type {
  DoseLog,
  DoseOccurrence,
  Medication,
  MedicationSchedule,
  MedicationWithSchedules,
} from '@/types/medication';

export function weekdayBitForDate(date: Date): number {
  // JavaScript is Sunday-first; the saved mask is Monday-first.
  return 1 << ((date.getDay() + 6) % 7);
}

export function localDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function localDayOffset(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function formatLocalDate(date: Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(date);
}

export function formatLocalTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function isValidScheduledDose(
  medication: Pick<Medication, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>,
  schedule: Pick<MedicationSchedule,
    'medicationId' | 'hour' | 'minute' | 'weekdayMask' | 'createdAt' | 'updatedAt' | 'isActive'>,
  scheduledAt: number,
): boolean {
  if (!Number.isSafeInteger(scheduledAt) || scheduledAt <= 0) return false;
  if (schedule.medicationId !== medication.id) return false;
  if (medication.createdAt > scheduledAt || (!medication.isActive && scheduledAt >= medication.updatedAt)) {
    return false;
  }
  if (schedule.createdAt > scheduledAt || (!schedule.isActive && scheduledAt >= schedule.updatedAt)) {
    return false;
  }

  const scheduled = new Date(scheduledAt);
  return scheduled.getHours() === schedule.hour
    && scheduled.getMinutes() === schedule.minute
    && scheduled.getSeconds() === 0
    && scheduled.getMilliseconds() === 0
    && (schedule.weekdayMask & weekdayBitForDate(scheduled)) !== 0;
}

export function occurrencesForLocalDate(
  date: Date,
  medications: readonly MedicationWithSchedules[],
  logs: readonly DoseLog[],
  activeMedicationsOnly = false,
): DoseOccurrence[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const logsByIdentity = new Map<string, DoseLog>();
  for (const log of logs) {
    logsByIdentity.set(`${log.medicationId}:${log.scheduleId}:${log.scheduledAt}`, log);
  }

  const occurrences: DoseOccurrence[] = [];
  for (const medication of medications) {
    if (activeMedicationsOnly && !medication.isActive) continue;
    for (const schedule of medication.schedules) {
      const scheduledAt = new Date(year, month, day, schedule.hour, schedule.minute, 0, 0).getTime();
      if (!isValidScheduledDose(medication, schedule, scheduledAt)) continue;
      const log = logsByIdentity.get(`${medication.id}:${schedule.id}:${scheduledAt}`);
      occurrences.push({
        medicationId: medication.id,
        scheduleId: schedule.id,
        medicationName: medication.name,
        dosage: medication.dosage,
        instructions: medication.instructions,
        photoPath: medication.photoPath,
        scheduledAt,
        hour: schedule.hour,
        minute: schedule.minute,
        weekdayMask: schedule.weekdayMask,
        doseLogId: log?.id ?? null,
        status: log?.status ?? null,
        takenAt: log?.takenAt ?? null,
      });
    }
  }

  return occurrences.sort((a, b) =>
    a.scheduledAt - b.scheduledAt
    || a.medicationId - b.medicationId
    || a.scheduleId - b.scheduleId,
  );
}
