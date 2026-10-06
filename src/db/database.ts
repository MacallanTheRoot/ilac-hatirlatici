import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'dad-medicine.db';
export const DATABASE_VERSION = 2;

export async function assertForeignKeysValid(db: SQLiteDatabase): Promise<void> {
  // Expo's exclusive transaction opens a new connection after BEGIN. Its
  // foreign_keys setting cannot be changed inside that transaction, so check
  // the resulting rows before the transaction commits.
  const violation = await db.getFirstAsync('PRAGMA foreign_key_check');
  if (violation) throw new Error('Foreign key constraint failed.');
}

const MIGRATION_TO_V2 = `
  CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    dosage TEXT NOT NULL CHECK (length(trim(dosage)) > 0),
    instructions TEXT,
    photo_path TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS medication_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medication_id INTEGER NOT NULL,
    hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
    minute INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 59),
    weekday_mask INTEGER NOT NULL CHECK (weekday_mask BETWEEN 1 AND 127),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE RESTRICT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS medication_schedule_identity
    ON medication_schedules(id, medication_id);
  CREATE UNIQUE INDEX IF NOT EXISTS active_medication_schedule
    ON medication_schedules(medication_id, hour, minute, weekday_mask)
    WHERE is_active = 1;

  CREATE TABLE IF NOT EXISTS dose_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    medication_id INTEGER NOT NULL,
    schedule_id INTEGER NOT NULL,
    scheduled_at INTEGER NOT NULL,
    taken_at INTEGER,
    status TEXT NOT NULL CHECK (status IN ('pending', 'taken', 'snoozed', 'unconfirmed')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (medication_id, schedule_id, scheduled_at),
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE RESTRICT,
    FOREIGN KEY (schedule_id, medication_id)
      REFERENCES medication_schedules(id, medication_id) ON DELETE RESTRICT
  );
`;

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  // Foreign keys are enabled per connection; run this on every open.
  await db.execAsync('PRAGMA foreign_keys = ON');
  await db.execAsync('PRAGMA journal_mode = WAL');

  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion > DATABASE_VERSION) {
    throw new Error(`Database version ${currentVersion} is newer than this app supports.`);
  }

  if (currentVersion === DATABASE_VERSION) return;

  await db.withExclusiveTransactionAsync(async (txn) => {
    // Recheck inside the transaction in case initialization was started twice.
    const versionRow = await txn.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const version = versionRow?.user_version ?? 0;
    if (version > DATABASE_VERSION) {
      throw new Error(`Database version ${version} is newer than this app supports.`);
    }
    if (version < 2) {
      await txn.execAsync(MIGRATION_TO_V2);
      await assertForeignKeysValid(txn);
      await txn.execAsync('PRAGMA user_version = 2');
    }
  });
}
