const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const { openDatabase, localTime, seedPopulatedV2, snapshotV2 } =
  require('./fixtures/v2-reliability.cjs');

function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

const calendar = load('src/services/doseOccurrences.ts');
const database = load('src/db/database.ts');
const medications = load('src/db/medications.ts', {
  '@/db/database': database,
  '@/services/medicationPhotos': { isOwnedMedicationPhoto: () => true },
  '@/utils/medication': { normalizeMedicationInput: (value) => value },
});
const logs = load('src/db/doseLogs.ts', {
  '@/db/database': database,
  '@/services/doseOccurrences': calendar,
});
const constants = load('src/notifications/constants.ts');
const planner = load('src/notifications/planner.ts', {
  '@/notifications/constants': constants,
  '@/services/doseOccurrences': calendar,
});
const queue = load('src/notifications/alarmQueue.ts');

async function schemaAndHistory() {
  const fresh = openDatabase();
  const populated = openDatabase();
  const failed = openDatabase({ failOnSql: 'PRAGMA user_version = 2' });
  try {
    await database.initializeDatabase(fresh.db);
    assert.equal(snapshotV2(fresh.native).version, 2);
    assert.deepEqual(snapshotV2(fresh.native).foreignKeyViolations, []);
    assert.equal(snapshotV2(fresh.native).medicines.length, 0);
    await database.initializeDatabase(fresh.db);
    assert.equal(snapshotV2(fresh.native).version, 2, 'repeated initialization is idempotent');

    await database.initializeDatabase(populated.db);
    const identities = seedPopulatedV2(populated.native);
    const before = snapshotV2(populated.native);
    await database.initializeDatabase(populated.db);
    assert.deepEqual(snapshotV2(populated.native), before, 'reopen must preserve all v2 rows');
    assert.deepEqual(before.foreignKeyViolations, []);
    assert.equal(before.schedules.filter((item) => item.medication_id === 1).length, 2);
    assert.equal(before.logs.find((item) => item.medication_id === 4).status, 'taken');

    const timeline = await medications.getMedicationTimeline(populated.db);
    const active = await medications.getActiveMedications(populated.db);
    assert.deepEqual(active.map((item) => item.id), [1, 2, 3]);
    assert.equal(timeline.length, 4);
    const history = calendar.occurrencesForLocalDate(new Date(identities.historical.scheduledAt),
      timeline, await logs.getDoseLogsForRange(populated.db, localTime(9, 0), localTime(10, 0)));
    assert.equal(history.find((item) => item.medicationId === 4).status, 'taken',
      'inactive medication keeps its historical confirmation');
    assert.equal(history.find((item) => item.medicationId === 3).status, 'unconfirmed');
    assert.equal(history.find((item) => item.medicationId === 2).status, null,
      'unanswered is not silently turned into taken or missed');
    const current = calendar.occurrencesForLocalDate(new Date(identities.simultaneous[0].scheduledAt),
      timeline, [], true);
    assert.equal(current.some((item) => item.medicationId === 4), false);

    await assert.rejects(database.initializeDatabase(failed.db), /Injected SQLite failure/);
    assert.equal(failed.native.prepare('PRAGMA user_version').get().user_version, 0);
    assert.equal(failed.native.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'dose_logs'").get().n, 0,
      'a failed migration rolls back schema changes');
    return identities;
  } finally {
    fresh.close(); populated.close(); failed.close();
  }
}

async function persistenceRestart() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dad-v2-synthetic-'));
  const file = path.join(directory, 'fixture.sqlite');
  let connection;
  try {
    connection = openDatabase({ file });
    await database.initializeDatabase(connection.db);
    seedPopulatedV2(connection.native);
    const before = snapshotV2(connection.native);
    connection.close();
    connection = openDatabase({ file });
    await database.initializeDatabase(connection.db);
    assert.deepEqual(snapshotV2(connection.native), before,
      'all medical rows survive a real SQLite connection close/reopen');
  } finally {
    if (connection) connection.close();
    fs.rmSync(directory, { recursive: true }); // only this test-created directory
  }
}

async function actionsAndQueue() {
  const fixture = openDatabase();
  try {
    await database.initializeDatabase(fixture.db);
    const { simultaneous } = seedPopulatedV2(fixture.native);
    const meds = await medications.getMedicationTimeline(fixture.db);
    const time = simultaneous[0].scheduledAt;
    const occurrences = calendar.occurrencesForLocalDate(new Date(time), meds, []);
    const two = queue.simultaneousAlarmQueue(occurrences.filter((item) =>
      item.medicationId === 1 || item.medicationId === 2), meds, simultaneous[0], 'dose');
    assert.deepEqual(two.map((item) => item.medicationId), [2, 1]);
    const ordered = queue.simultaneousAlarmQueue(occurrences, meds, simultaneous[0], 'dose');
    assert.deepEqual(ordered.map((item) => item.medicationId), [2, 3, 1]);
    assert.deepEqual(queue.simultaneousAlarmQueue([...occurrences].reverse(), meds,
      simultaneous[2], 'dose').map((item) => item.medicationId), [2, 3, 1]);
    assert.equal(new Set(ordered.map(queue.alarmIdentityKey)).size, 3);
    assert.equal(new Set(ordered.map(constants.baseReminderIdentifier)).size, 3);
    for (const item of ordered) {
      assert.deepEqual(constants.parseMedicationNotificationPayload(
        constants.medicationNotificationPayload('dose', item)),
      constants.medicationNotificationPayload('dose', item));
    }

    const first = simultaneous[1];
    const second = simultaneous[2];
    const takenAt = time + 30_000;
    assert.equal((await logs.markDoseTaken(fixture.db, { ...first, takenAt })).takenAt, takenAt);
    assert.equal((await logs.markDoseTaken(fixture.db, { ...first, takenAt: time + 90_000 })).takenAt,
      takenAt, 'retry retains the first confirmation time');
    assert.equal((await logs.markDoseSnoozed(fixture.db, first)).status, 'taken');
    assert.equal((await logs.markDoseSnoozed(fixture.db, second)).status, 'snoozed');
    assert.equal((await logs.markDoseSnoozed(fixture.db, second)).status, 'snoozed');
    assert.equal(await logs.getDoseLogByIdentity(fixture.db, simultaneous[0]), null);
    assert.equal(fixture.native.prepare('SELECT count(*) AS n FROM dose_logs WHERE scheduled_at = ?')
      .get(time).n, 2);
    const current = calendar.occurrencesForLocalDate(new Date(time), meds,
      await logs.getDoseLogsForRange(fixture.db, calendar.localDayStart(new Date(time)).getTime(),
        calendar.localDayOffset(new Date(time), 1).getTime()));
    assert.deepEqual(queue.simultaneousAlarmQueue(current, meds, simultaneous[0], 'dose')
      .map((item) => item.medicationId), [1]);
    assert.deepEqual(queue.simultaneousAlarmQueue(current, meds, second, 'snooze')
      .map((item) => item.medicationId), [3]);
    assert.equal(await logs.getDoseLogByIdentity(fixture.db, first).then((item) => item.takenAt), takenAt);
    assert.deepEqual(snapshotV2(fixture.native).foreignKeyViolations, []);

    const desired = planner.planBaseReminders(time - 60_000, meds, []).desired;
    const sameMinute = desired.filter((item) => item.scheduledAt === time);
    assert.equal(sameMinute.length, 3);
    const scheduled = sameMinute.map((item) => ({
      identifier: constants.baseReminderIdentifier(item),
      data: constants.medicationNotificationPayload('dose', item),
    }));
    assert.deepEqual(planner.planBaseReconciliation(sameMinute, scheduled), {
      keep: scheduled.map((item) => item.identifier), cancel: [], schedule: [],
    });
    const wrong = { ...scheduled[0], identifier: constants.baseReminderIdentifier(second) };
    assert.deepEqual(planner.planBaseReconciliation(sameMinute, [wrong]).cancel, [wrong.identifier]);

    const currentLogs = await logs.getDoseLogsForRange(fixture.db,
      calendar.localDayStart(new Date(time)).getTime(),
      calendar.localDayOffset(new Date(time), 1).getTime());
    assert.equal(planner.planBaseReminders(time - 60_000, meds, currentLogs).desired.some((item) =>
      item.medicationId === first.medicationId && item.scheduledAt === time), false,
    'an early confirmed dose must not be planned again');

    const originalNow = Date.now;
    try {
      Date.now = () => time - 30 * 60_000;
      await medications.updateMedication(fixture.db, 1, {
        name: 'Sample A', dosage: 'one unit', instructions: null, photoPath: null,
        schedules: [{ hour: 12, minute: 0, weekdayMask: 127 }],
      });
      Date.now = () => time - 20 * 60_000;
      await medications.deactivateMedication(fixture.db, 3);
    } finally { Date.now = originalNow; }
    const afterEdit = await medications.getMedicationTimeline(fixture.db);
    const afterEditOccurrences = calendar.occurrencesForLocalDate(new Date(time), afterEdit, currentLogs);
    assert.equal(afterEditOccurrences.some((item) => item.medicationId === 1
      && item.scheduleId === 11 && item.scheduledAt === time), false);
    assert.equal(afterEditOccurrences.some((item) => item.medicationId === 3
      && item.scheduleId === 31 && item.scheduledAt === time), false);
    assert.equal((await logs.getDoseLogByIdentity(fixture.db, second)).status, 'snoozed',
      'editing/deactivation does not rewrite historical dose rows');
    assert.deepEqual(snapshotV2(fixture.native).foreignKeyViolations, []);
  } finally { fixture.close(); }
}

function calendarAndPayloadBoundaries() {
  const originalZone = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Istanbul';
    const march31 = new Date(2026, 2, 31, 23, 59);
    assert.equal(calendar.localDayOffset(calendar.localDayStart(march31), 1).getDate(), 1);
    assert.equal(calendar.localDayOffset(calendar.localDayStart(march31), 1).getMonth(), 3);
    const december31 = new Date(2026, 11, 31, 23, 59);
    assert.equal(calendar.localDayOffset(calendar.localDayStart(december31), 1).getFullYear(), 2027);
    process.env.TZ = 'America/New_York';
    const spring = calendar.localDayStart(new Date(2026, 2, 8));
    const fall = calendar.localDayStart(new Date(2026, 10, 1));
    assert.equal(calendar.localDayOffset(spring, 1).getTime() - spring.getTime(), 23 * 60 * 60_000);
    assert.equal(calendar.localDayOffset(fall, 1).getTime() - fall.getTime(), 25 * 60 * 60_000);
    assert.equal(calendar.weekdayBitForDate(new Date(2026, 2, 9)), 1);
    const missing = new Date(2026, 2, 8, 2, 30).getTime();
    assert.equal(calendar.isValidScheduledDose(
      { id: 1, createdAt: 1, updatedAt: 1, isActive: true },
      { medicationId: 1, hour: 2, minute: 30, weekdayMask: 127,
        createdAt: 1, updatedAt: 1, isActive: true }, missing), false,
    'a nonexistent DST wall time is not relabeled as 03:30');
    process.env.TZ = 'Europe/Istanbul';
    const monday = new Date(2026, 9, 12, 21, 30).getTime();
    const sunday = new Date(2026, 9, 11, 21, 30).getTime();
    const weekdays = { medicationId: 1, hour: 21, minute: 30, weekdayMask: 31,
      createdAt: 1, updatedAt: 1, isActive: true };
    const active = { id: 1, createdAt: 1, updatedAt: 1, isActive: true };
    assert.equal(calendar.isValidScheduledDose(active, weekdays, monday), true);
    assert.equal(calendar.isValidScheduledDose(active, weekdays, sunday), false);
    for (const invalid of [null, {}, { owner: 'other' },
      { ...constants.medicationNotificationPayload('dose',
        { medicationId: 1, scheduleId: 11, scheduledAt: localTime(11, 8) }), scheduleId: '11' }]) {
      assert.equal(constants.parseMedicationNotificationPayload(invalid), null);
    }
    assert.equal(constants.payloadFromNotificationContent({ dataString: '{invalid' }), null);
    assert.equal(constants.payloadFromNotificationContent({ dataString: '{}'}), null);
  } finally {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  }
}

async function failedNotificationOperation() {
  const fixture = openDatabase();
  try {
    await database.initializeDatabase(fixture.db);
    const { simultaneous } = seedPopulatedV2(fixture.native);
    const first = simultaneous[0];
    let failSchedule = true;
    const events = [];
    const actions = load('src/notifications/actions.ts', {
      'expo-notifications': {
        cancelScheduledNotificationAsync: async (id) => { events.push(`cancel:${id}`); },
        dismissNotificationAsync: async (id) => { events.push(`dismiss:${id}`); },
      },
      'expo-sqlite': {},
      '@/db/database': database,
      '@/db/doseLogs': logs,
      '@/db/medications': medications,
      '@/notifications/constants': constants,
      '@/notifications/events': { emitDoseStateChanged: () => events.push('state-changed') },
      '@/notifications/scheduler': {
        cancelDoseNotifications: async () => events.push('cancel-dose'),
        scheduleSnoozeReminder: async () => {
          events.push('schedule-snooze');
          if (failSchedule) throw new Error('Injected native scheduling failure');
        },
        syncMedicationReminders: async () => ({ status: 'scheduled' }),
      },
    });
    await assert.rejects(actions.performMedicationDoseAction(first, 'snooze', fixture.db),
      /Injected native scheduling failure/);
    assert.equal(await logs.getDoseLogByIdentity(fixture.db, first), null);
    assert.equal(events.some((event) => event.startsWith('dismiss:')), false);
    failSchedule = false;
    assert.equal(await actions.performMedicationDoseAction(first, 'snooze', fixture.db), 'snoozed');
    assert.equal((await logs.getDoseLogByIdentity(fixture.db, first)).status, 'snoozed');
    assert.equal(await logs.getDoseLogByIdentity(fixture.db, simultaneous[1]), null);
    assert.ok(events.indexOf('schedule-snooze') < events.indexOf('state-changed'));
  } finally { fixture.close(); }
}

async function main() {
  await schemaAndHistory();
  await persistenceRestart();
  console.log('PASS: fresh/populated v2 schema, real SQLite reopen, retained history, unanswered status, rollback');
  await actionsAndQueue();
  console.log('PASS: three independent doses, stable queue, idempotent Taken/snooze and request identity');
  calendarAndPayloadBoundaries();
  console.log('PASS: midnight/month/year/DST calendar boundaries and invalid payload rejection');
  await failedNotificationOperation();
  console.log('PASS: native scheduling failure leaves SQLite unchanged; retry isolates other doses');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
