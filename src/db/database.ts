import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'dad-medicine.db';
const DATABASE_VERSION = 1;

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  // Foreign keys are enabled per connection; run this on every open.
  await db.execAsync('PRAGMA foreign_keys = ON');
  await db.execAsync('PRAGMA journal_mode = WAL');

  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion > DATABASE_VERSION) {
    throw new Error(`Database version ${currentVersion} is newer than this app supports.`);
  }

  if (currentVersion === 0) {
    // Version 1 reserves the migration path; domain tables arrive in Phase 02.
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
}
