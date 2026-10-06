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

export async function markDoseTaken(db: SQLiteDatabase, input: MarkDoseTakenInput): Promise<DoseLog> {
  const { medicationId, scheduleId, scheduledAt } = input;
  const takenAt = input.takenAt ?? Date.now();
  if (!Number.isSafeInteger(medicationId) || medicationId <= 0
    || !Number.isSafeInteger(scheduleId) || scheduleId <= 0
    || !Number.isSafeInteger(scheduledAt) || scheduledAt <= 0
    || !Number.isSafeInteger(takenAt) || takenAt <= 0) {
    throw new Error('Invalid dose identity or confirmation time.');
  }

  let saved: DoseLog | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync<ValidityRow>(
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
      scheduleId,
      medicationId,
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
      scheduledAt,
    )) {
      throw new Error('Scheduled dose does not belong to the supplied medication or time.');
    }

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
    const savedRow = await txn.getFirstAsync<DoseLogRow>(
      `SELECT * FROM dose_logs
       WHERE medication_id = ? AND schedule_id = ? AND scheduled_at = ?`,
      medicationId,
      scheduleId,
      scheduledAt,
    );
    if (!savedRow) throw new Error('Dose confirmation could not be read after saving.');
    saved = toDoseLog(savedRow);
  });

  if (!saved) throw new Error('Dose confirmation failed.');
  return saved;
}
