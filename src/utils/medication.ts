import { EVERY_DAY, WEEKDAYS, type MedicationInput, type ScheduleInput } from '@/types/medication';

export class MedicationValidationError extends Error {}

export function normalizeMedicationInput(input: MedicationInput): MedicationInput {
  const name = input.name.trim();
  const dosage = input.dosage.trim();
  const instructions = input.instructions?.trim() || null;

  if (!name) throw new MedicationValidationError('İlaç adı gerekli.');
  if (!dosage) throw new MedicationValidationError('Doz gerekli.');
  if (name.length > 120) throw new MedicationValidationError('İlaç adı çok uzun.');
  if (dosage.length > 120) throw new MedicationValidationError('Doz bilgisi çok uzun.');
  if (instructions && instructions.length > 1000) {
    throw new MedicationValidationError('Not çok uzun.');
  }
  if (input.schedules.length === 0) {
    throw new MedicationValidationError('En az bir hatırlatma saati ekleyin.');
  }

  const seen = new Set<string>();
  const schedules = input.schedules.map((schedule) => {
    if (!Number.isInteger(schedule.hour) || schedule.hour < 0 || schedule.hour > 23) {
      throw new MedicationValidationError('Saat 0 ile 23 arasında olmalı.');
    }
    if (!Number.isInteger(schedule.minute) || schedule.minute < 0 || schedule.minute > 59) {
      throw new MedicationValidationError('Dakika 0 ile 59 arasında olmalı.');
    }
    if (
      !Number.isInteger(schedule.weekdayMask) ||
      schedule.weekdayMask < 1 ||
      schedule.weekdayMask > EVERY_DAY
    ) {
      throw new MedicationValidationError('En az bir gün seçin.');
    }
    const key = `${schedule.hour}:${schedule.minute}:${schedule.weekdayMask}`;
    if (seen.has(key)) {
      throw new MedicationValidationError('Aynı saat ve günler birden fazla eklenemez.');
    }
    seen.add(key);
    return schedule;
  });

  return { name, dosage, instructions, schedules };
}

export function formatTime(schedule: ScheduleInput): string {
  return `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;
}

export function formatWeekdays(mask: number): string {
  if (mask === EVERY_DAY) return 'Her gün';
  return WEEKDAYS.filter((weekday) => (mask & weekday.bit) !== 0)
    .map((weekday) => weekday.label)
    .join(', ');
}
