const { DatabaseSync } = require('node:sqlite');

// In-memory, fictional v2 records. The snapshot is reusable by a future v3
// migration test; no app database or photo is opened by this fixture.
function openDatabase({ failOnSql, file = ':memory:' } = {}) {
  const native = new DatabaseSync(file);
  const db = {
    execAsync: async (sql) => {
      if (failOnSql && sql.includes(failOnSql)) throw new Error('Injected SQLite failure');
      native.exec(sql);
    },
    getFirstAsync: async (sql, ...params) => native.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => native.prepare(sql).all(...params),
    runAsync: async (sql, ...params) => native.prepare(sql).run(...params),
    withExclusiveTransactionAsync: async (callback) => {
      native.exec('BEGIN EXCLUSIVE');
      try {
        const value = await callback(db);
        native.exec('COMMIT');
        return value;
      } catch (error) {
        native.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { native, db, close: () => native.close() };
}

function localTime(day, hour, minute = 0) {
  return new Date(2026, 9, day, hour, minute, 0, 0).getTime();
}

function seedPopulatedV2(native) {
  const created = localTime(1, 7);
  const inactiveAt = localTime(10, 7);
  const medicines = [
    [1, 'Sample A', 'one unit', null, null, 1, created + 2_000, created + 2_000],
    [2, 'Sample B', 'two units', null, null, 1, created, created],
    [3, 'Sample C', 'three units', null, null, 1, created, created],
    [4, 'Sample Retired', 'one unit', null, null, 0, created, inactiveAt],
  ];
  const insertMedicine = native.prepare('INSERT INTO medications VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of medicines) insertMedicine.run(...row);

  const schedules = [
    [11, 1, 8, 0, 127, 1, created + 2_000, created + 2_000],
    [12, 1, 21, 30, 31, 1, created + 2_000, created + 2_000],
    [21, 2, 8, 0, 127, 1, created, created],
    [31, 3, 8, 0, 127, 1, created, created],
    [41, 4, 9, 0, 127, 0, created, inactiveAt],
  ];
  const insertSchedule = native.prepare('INSERT INTO medication_schedules VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of schedules) insertSchedule.run(...row);

  const historical = localTime(9, 9);
  native.prepare('INSERT INTO dose_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(101, 4, 41, historical, historical + 60_000, 'taken', historical, historical);
  native.prepare('INSERT INTO dose_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(102, 3, 31, localTime(9, 8), null, 'unconfirmed', historical, historical);
  return {
    simultaneous: [
      { medicationId: 1, scheduleId: 11, scheduledAt: localTime(11, 8) },
      { medicationId: 2, scheduleId: 21, scheduledAt: localTime(11, 8) },
      { medicationId: 3, scheduleId: 31, scheduledAt: localTime(11, 8) },
    ],
    historical: { medicationId: 4, scheduleId: 41, scheduledAt: historical },
    weekday: { medicationId: 1, scheduleId: 12, scheduledAt: localTime(12, 21, 30) },
  };
}

function snapshotV2(native) {
  return {
    version: native.prepare('PRAGMA user_version').get().user_version,
    medicines: native.prepare('SELECT * FROM medications ORDER BY id').all(),
    schedules: native.prepare('SELECT * FROM medication_schedules ORDER BY id').all(),
    logs: native.prepare('SELECT * FROM dose_logs ORDER BY id').all(),
    foreignKeyViolations: native.prepare('PRAGMA foreign_key_check').all(),
  };
}

module.exports = { openDatabase, localTime, seedPopulatedV2, snapshotV2 };
