import type { SQLiteDatabase } from 'expo-sqlite';

import { assertForeignKeysValid } from '@/db/database';
import { isValidScheduledDose } from '@/services/doseOccurrences';
import type { DoseLog, DoseLogStatus } from '@/types/medication';

type DoseLogRow = {
  id: number;
  medication_id: number;
  schedule_id: number;
  scheduled_at: number;
  taken_at: number | null;
  status: DoseLogStatus;
  created_at: number;
  updated_at: number;
};

type ValidityRow = {
  medication_id: number;
  medication_created_at: number;
  medication_updated_at: number;
  medication_is_active: number;
  schedule_medication_id: number;
  hour: number;
  minute: number;
  weekday_mask: number;
  schedule_created_at: number;
  schedule_updated_at: number;
  schedule_is_active: number;
};

function toDoseLog(row: DoseLogRow): DoseLog {
  return {
    id: row.id,
    medicationId: row.medication_id,
    scheduleId: row.schedule_id,
    scheduledAt: row.scheduled_at,
    takenAt: row.taken_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getDoseLogsForRange(
  db: SQLiteDatabase,
  startInclusive: number,
  endExclusive: number,
): Promise<DoseLog[]> {
  const rows = await db.getAllAsync<DoseLogRow>(
    `SELECT * FROM dose_logs
     WHERE scheduled_at >= ? AND scheduled_at < ?
     ORDER BY scheduled_at, medication_id, schedule_id`,
    startInclusive,
    endExclusive,
  );
  return rows.map(toDoseLog);
}

export type MarkDoseTakenInput = {
  medicationId: number;
  scheduleId: number;
  scheduledAt: number;
  takenAt?: number;
};

type DoseIdentity = Pick<MarkDoseTakenInput, 'medicationId' | 'scheduleId' | 'scheduledAt'>;

export async function getDoseLogByIdentity(
  db: SQLiteDatabase,
  input: DoseIdentity,
): Promise<DoseLog | null> {
  const row = await db.getFirstAsync<DoseLogRow>(
    `SELECT * FROM dose_logs
     WHERE medication_id = ? AND schedule_id = ? AND scheduled_at = ?`,
    input.medicationId,
    input.scheduleId,
    input.scheduledAt,
  );
  return row ? toDoseLog(row) : null;
}

function validateDoseIdentity(input: DoseIdentity): void {
  const { medicationId, scheduleId, scheduledAt } = input;
  if (!Number.isSafeInteger(medicationId) || medicationId <= 0
    || !Number.isSafeInteger(scheduleId) || scheduleId <= 0
    || !Number.isSafeInteger(scheduledAt) || scheduledAt <= 0) {
    throw new Error('Invalid dose identity.');
  }
}

async function assertValidScheduledDose(db: SQLiteDatabase, input: DoseIdentity): Promise<void> {
  const row = await db.getFirstAsync<ValidityRow>(
    `SELECT m.id AS medication_id,
            m.created_at AS medication_created_at,
            m.updated_at AS medication_updated_at,
            m.is_active AS medication_is_active,
            s.medication_id AS schedule_medication_id,
            s.hour, s.minute, s.weekday_mask,
            s.created_at AS schedule_created_at,
            s.updated_at AS schedule_updated_at,
            s.is_active AS schedule_is_active
     FROM medication_schedules AS s
     JOIN medications AS m ON m.id = s.medication_id
     WHERE s.id = ? AND m.id = ?`,
    input.scheduleId,
    input.medicationId,
  );
  if (!row || !isValidScheduledDose(
    {
      id: row.medication_id,
      createdAt: row.medication_created_at,
      updatedAt: row.medication_updated_at,
      isActive: row.medication_is_active === 1,
    },
    {
      medicationId: row.schedule_medication_id,
      hour: row.hour,
      minute: row.minute,
      weekdayMask: row.weekday_mask,
      createdAt: row.schedule_created_at,
      updatedAt: row.schedule_updated_at,
      isActive: row.schedule_is_active === 1,
    },
    input.scheduledAt,
  )) {
    throw new Error('Scheduled dose does not belong to the supplied medication or time.');
  }
}

async function readDoseLog(db: SQLiteDatabase, input: DoseIdentity): Promise<DoseLog> {
  const log = await getDoseLogByIdentity(db, input);
  if (!log) throw new Error('Dose log could not be read after saving.');
  return log;
}

export async function markDoseTaken(db: SQLiteDatabase, input: MarkDoseTakenInput): Promise<DoseLog> {
  validateDoseIdentity(input);
  const { medicationId, scheduleId, scheduledAt } = input;
  const takenAt = input.takenAt ?? Date.now();
  if (!Number.isSafeInteger(takenAt) || takenAt <= 0) {
    throw new Error('Invalid confirmation time.');
  }

  let saved: DoseLog | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await assertValidScheduledDose(txn, input);

    const now = Date.now();
    await txn.runAsync(
      `INSERT INTO dose_logs
         (medication_id, schedule_id, scheduled_at, taken_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'taken', ?, ?)
       ON CONFLICT(medication_id, schedule_id, scheduled_at) DO UPDATE SET
         status = 'taken',
         taken_at = CASE
           WHEN dose_logs.status = 'taken' AND dose_logs.taken_at IS NOT NULL
             THEN dose_logs.taken_at
           ELSE excluded.taken_at
         END,
         updated_at = CASE
           WHEN dose_logs.status = 'taken' AND dose_logs.taken_at IS NOT NULL
             THEN dose_logs.updated_at
           ELSE excluded.updated_at
         END`,
      medicationId,
      scheduleId,
      scheduledAt,
      takenAt,
      now,
      now,
    );
    await assertForeignKeysValid(txn);
    saved = await readDoseLog(txn, input);
  });

  if (!saved) throw new Error('Dose confirmation failed.');
  return saved;
}

export async function markDoseSnoozed(db: SQLiteDatabase, input: DoseIdentity): Promise<DoseLog> {
  validateDoseIdentity(input);
  let saved: DoseLog | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const eligibility = await getDoseSnoozeEligibility(txn, input);
    if (eligibility === 'alreadyTaken') {
      saved = await readDoseLog(txn, input);
      return;
    }
    const now = Date.now();
    await txn.runAsync(
      `INSERT INTO dose_logs
         (medication_id, schedule_id, scheduled_at, taken_at, status, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'snoozed', ?, ?)
       ON CONFLICT(medication_id, schedule_id, scheduled_at) DO UPDATE SET
         status = CASE WHEN dose_logs.status = 'taken' THEN 'taken' ELSE 'snoozed' END,
         taken_at = CASE WHEN dose_logs.status = 'taken' THEN dose_logs.taken_at ELSE NULL END,
         updated_at = CASE
           WHEN dose_logs.status = 'taken' THEN dose_logs.updated_at
           ELSE excluded.updated_at
         END`,
      input.medicationId,
      input.scheduleId,
      input.scheduledAt,
      now,
      now,
    );
    await assertForeignKeysValid(txn);
    saved = await readDoseLog(txn, input);
  });
  if (!saved) throw new Error('Snooze status could not be saved.');
  return saved;
}

export async function getDoseSnoozeEligibility(
  db: SQLiteDatabase,
  input: DoseIdentity,
): Promise<'allowed' | 'alreadyTaken'> {
  validateDoseIdentity(input);
  await assertValidScheduledDose(db, input);
  const activeSchedule = await db.getFirstAsync(
    `SELECT 1 FROM medication_schedules AS s
     JOIN medications AS m ON m.id = s.medication_id
     WHERE m.id = ? AND s.id = ? AND m.is_active = 1 AND s.is_active = 1`,
    input.medicationId,
    input.scheduleId,
  );
  if (!activeSchedule) throw new Error('Inactive dose cannot be snoozed.');
  const existing = await db.getFirstAsync<Pick<DoseLogRow, 'status'>>(
    `SELECT status FROM dose_logs
     WHERE medication_id = ? AND schedule_id = ? AND scheduled_at = ?`,
    input.medicationId,
    input.scheduleId,
    input.scheduledAt,
  );
  return existing?.status === 'taken' ? 'alreadyTaken' : 'allowed';
}
