import type { SQLiteDatabase } from 'expo-sqlite';

import { assertForeignKeysValid } from '@/db/database';
import { isOwnedMedicationPhoto } from '@/services/medicationPhotos';
import type {
  Medication,
  MedicationInput,
  MedicationSchedule,
  MedicationWithSchedules,
  ScheduleInput,
} from '@/types/medication';
import { normalizeMedicationInput } from '@/utils/medication';

type MedicationRow = {
  id: number;
  name: string;
  dosage: string;
  instructions: string | null;
  photo_path: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
};

type ScheduleRow = {
  id: number;
  medication_id: number;
  hour: number;
  minute: number;
  weekday_mask: number;
  is_active: number;
  created_at: number;
  updated_at: number;
};

function toMedication(row: MedicationRow): Medication {
  return {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    instructions: row.instructions,
    photoPath: row.photo_path,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSchedule(row: ScheduleRow): MedicationSchedule {
  return {
    id: row.id,
    medicationId: row.medication_id,
    hour: row.hour,
    minute: row.minute,
    weekdayMask: row.weekday_mask,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insertSchedules(
  db: SQLiteDatabase,
  medicationId: number,
  schedules: ScheduleInput[],
  now: number,
): Promise<void> {
  for (const schedule of schedules) {
    await db.runAsync(
      `INSERT INTO medication_schedules
        (medication_id, hour, minute, weekday_mask, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      medicationId,
      schedule.hour,
      schedule.minute,
      schedule.weekdayMask,
      now,
      now,
    );
  }
}

export async function getActiveMedications(db: SQLiteDatabase): Promise<MedicationWithSchedules[]> {
  const medications = await db.getAllAsync<MedicationRow>(
    'SELECT * FROM medications WHERE is_active = 1 ORDER BY name COLLATE NOCASE, id',
  );
  if (medications.length === 0) return [];

  const schedules = await db.getAllAsync<ScheduleRow>(
    `SELECT s.* FROM medication_schedules AS s
     JOIN medications AS m ON m.id = s.medication_id
     WHERE m.is_active = 1 AND s.is_active = 1
     ORDER BY s.hour, s.minute, s.id`,
  );
  const byMedication = new Map<number, MedicationSchedule[]>();
  for (const row of schedules) {
    const current = byMedication.get(row.medication_id) ?? [];
    current.push(toSchedule(row));
    byMedication.set(row.medication_id, current);
  }

  return medications.map((row) => ({
    ...toMedication(row),
    schedules: byMedication.get(row.id) ?? [],
  }));
}

export async function getMedicationById(
  db: SQLiteDatabase,
  id: number,
): Promise<MedicationWithSchedules | null> {
  const row = await db.getFirstAsync<MedicationRow>(
    'SELECT * FROM medications WHERE id = ? AND is_active = 1',
    id,
  );
  if (!row) return null;

  const scheduleRows = await db.getAllAsync<ScheduleRow>(
    `SELECT * FROM medication_schedules
     WHERE medication_id = ? AND is_active = 1
     ORDER BY hour, minute, id`,
    id,
  );
  return {
    ...toMedication(row),
    schedules: scheduleRows.map(toSchedule),
  };
}

export async function createMedication(db: SQLiteDatabase, input: MedicationInput): Promise<number> {
  const normalized = normalizeMedicationInput(input);
  if (normalized.photoPath && !isOwnedMedicationPhoto(normalized.photoPath)) {
    throw new Error('Photo path is outside app-owned storage.');
  }
  const now = Date.now();
  let medicationId = 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const result = await txn.runAsync(
      `INSERT INTO medications (name, dosage, instructions, photo_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      normalized.name,
      normalized.dosage,
      normalized.instructions,
      normalized.photoPath,
      now,
      now,
    );
    medicationId = result.lastInsertRowId;
    await insertSchedules(txn, medicationId, normalized.schedules, now);
    await assertForeignKeysValid(txn);
  });

  return medicationId;
}

export async function updateMedication(
  db: SQLiteDatabase,
  id: number,
  input: MedicationInput,
): Promise<void> {
  const normalized = normalizeMedicationInput(input);
  if (normalized.photoPath && !isOwnedMedicationPhoto(normalized.photoPath)) {
    throw new Error('Photo path is outside app-owned storage.');
  }
  const now = Date.now();

  await db.withExclusiveTransactionAsync(async (txn) => {
    const result = await txn.runAsync(
      `UPDATE medications SET name = ?, dosage = ?, instructions = ?, photo_path = ?, updated_at = ?
       WHERE id = ? AND is_active = 1`,
      normalized.name,
      normalized.dosage,
      normalized.instructions,
      normalized.photoPath,
      now,
      id,
    );
    if (result.changes !== 1) throw new Error('Active medication not found.');

    await txn.runAsync(
      `UPDATE medication_schedules SET is_active = 0, updated_at = ?
       WHERE medication_id = ? AND is_active = 1`,
      now,
      id,
    );
    await insertSchedules(txn, id, normalized.schedules, now);
    await assertForeignKeysValid(txn);
  });
}

export async function deactivateMedication(db: SQLiteDatabase, id: number): Promise<void> {
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const result = await txn.runAsync(
      'UPDATE medications SET is_active = 0, updated_at = ? WHERE id = ? AND is_active = 1',
      now,
      id,
    );
    if (result.changes !== 1) throw new Error('Active medication not found.');
    await txn.runAsync(
      `UPDATE medication_schedules SET is_active = 0, updated_at = ?
       WHERE medication_id = ? AND is_active = 1`,
      now,
      id,
    );
    await assertForeignKeysValid(txn);
  });
}
