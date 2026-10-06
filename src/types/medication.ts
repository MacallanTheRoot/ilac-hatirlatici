export const EVERY_DAY = 127;

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS: readonly { day: Weekday; label: string; bit: number }[] = [
  { day: 0, label: 'Pzt', bit: 1 },
  { day: 1, label: 'Sal', bit: 2 },
  { day: 2, label: 'Çar', bit: 4 },
  { day: 3, label: 'Per', bit: 8 },
  { day: 4, label: 'Cum', bit: 16 },
  { day: 5, label: 'Cmt', bit: 32 },
  { day: 6, label: 'Paz', bit: 64 },
];

export type ScheduleInput = {
  hour: number;
  minute: number;
  weekdayMask: number;
};

export type MedicationInput = {
  name: string;
  dosage: string;
  instructions: string | null;
  photoPath: string | null;
  schedules: ScheduleInput[];
};

export type Medication = {
  id: number;
  name: string;
  dosage: string;
  instructions: string | null;
  photoPath: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type MedicationSchedule = ScheduleInput & {
  id: number;
  medicationId: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type MedicationWithSchedules = Medication & {
  schedules: MedicationSchedule[];
};

export type DoseLogStatus = 'pending' | 'taken' | 'snoozed' | 'unconfirmed';

export type DoseLog = {
  id: number;
  medicationId: number;
  scheduleId: number;
  scheduledAt: number;
  takenAt: number | null;
  status: DoseLogStatus;
  createdAt: number;
  updatedAt: number;
};

export type DoseOccurrence = {
  medicationId: number;
  scheduleId: number;
  medicationName: string;
  dosage: string;
  instructions: string | null;
  photoPath: string | null;
  scheduledAt: number;
  hour: number;
  minute: number;
  weekdayMask: number;
  doseLogId: number | null;
  status: DoseLogStatus | null;
  takenAt: number | null;
};
