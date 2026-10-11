const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
const { extractExpoPathFromURL } = require('expo-router/build/fork/extractPathFromURL');
const { patchExpoNotificationBuilder } = require('../plugins/withFullScreenMedicationAlarm');

patchExpoNotificationBuilder(process.cwd());

function load(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

const constants = load('src/notifications/constants.ts', {});
const doseOccurrences = load('src/services/doseOccurrences.ts', {});
const builder = fs.readFileSync(
  'node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/notifications/presentation/builders/ExpoNotificationBuilder.kt',
  'utf8',
);
const scheduling = fs.readFileSync(
  'node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/service/delegates/ExpoSchedulingDelegate.kt',
  'utf8',
);
const nativeModule = fs.readFileSync(
  'modules/dad-medicine-alarm/android/src/main/java/com/macallan/dadmedicine/alarm/DadMedicineAlarmModule.kt',
  'utf8',
);
const configPlugin = fs.readFileSync('plugins/withFullScreenMedicationAlarm.js', 'utf8');
assert.equal(require('../package.json').scripts.postinstall, 'node scripts/apply-full-screen-patch.cjs');
assert.deepEqual(require('../package.json').expo.autolinking.android.buildFromSource, ['expo-notifications']);
assert.equal(require('expo-notifications/package.json').version, '57.0.22');
assert.equal(builder.split('DAD_MEDICINE_FULL_SCREEN_INTENT_V1').length, 2);
assert.equal(builder.split('builder.setFullScreenIntent(').length, 2);
assert.match(builder, /notification\.notificationRequest\.identifier == expectedIdentifier/);
assert.match(builder, /fullScreenEnabled && fullScreenAllowed/);
assert.match(builder, /getSharedPreferences\("dad_medicine_alarm"/);
assert.match(nativeModule, /getBoolean\("enabled", false\)/);
assert.match(nativeModule, /canUseFullScreenIntent\(\)/);
assert.match(nativeModule, /ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT/);
assert.match(configPlugin, /setShowWhenLocked\(alarm\)/);
assert.match(configPlugin, /setTurnScreenOn\(true\)/);
assert.equal(scheduling.split('setupAlarm(').length, 3); // call plus definition, unchanged Expo scheduling

const first = { medicationId: 1, scheduleId: 2, scheduledAt: 1791494700000 };
const second = { medicationId: 1, scheduleId: 3, scheduledAt: 1791494700000 };
assert.notEqual(constants.baseReminderIdentifier(first), constants.baseReminderIdentifier(second));
assert.notEqual(constants.baseReminderIdentifier(first), constants.snoozeReminderIdentifier(first));
const alarmUrl = (identity) => `dadmedicine:///alarm?medicationId=${identity.medicationId}&scheduleId=${identity.scheduleId}&scheduledAt=${identity.scheduledAt}`;
assert.notEqual(alarmUrl(first), alarmUrl(second));
assert.equal(extractExpoPathFromURL([], alarmUrl(first)),
  'alarm?medicationId=1&scheduleId=2&scheduledAt=1791494700000');
assert.equal(extractExpoPathFromURL([], `${alarmUrl(first)}&kind=dose&source=fullscreen`),
  'alarm?medicationId=1&scheduleId=2&scheduledAt=1791494700000&kind=dose&source=fullscreen');
assert.equal(constants.parseMedicationNotificationPayload({ ...constants.medicationNotificationPayload('dose', first), scheduleId: '2' }), null);

async function testActions() {
  const events = [];
  let saveSnooze = async () => ({ status: 'snoozed' });
  let eligibility = 'allowed';
  let existingStatus = null;
  const backgroundDb = { closeAsync: async () => { events.push('close-background-db'); } };
  const notifications = {
    cancelScheduledNotificationAsync: async (id) => { events.push(`cancel:${id}`); },
    dismissNotificationAsync: async (id) => { events.push(`dismiss:${id}`); },
  };
  const actions = load('src/notifications/actions.ts', {
    'expo-notifications': notifications,
    'expo-sqlite': { openDatabaseAsync: async (name, options) => {
      assert.equal(name, 'dad-medicine.db');
      assert.deepEqual(options, { useNewConnection: true });
      events.push('open-background-db');
      return backgroundDb;
    } },
    '@/db/database': { DATABASE_NAME: 'dad-medicine.db', initializeDatabase: async (db) => {
      assert.equal(db, backgroundDb);
      events.push('init-background-db');
    } },
    '@/db/doseLogs': {
      getDoseLogByIdentity: async () => existingStatus ? { status: existingStatus } : null,
      getDoseSnoozeEligibility: async () => eligibility,
      markDoseSnoozed: async () => saveSnooze(),
      markDoseTaken: async (db) => { events.push('taken-write'); assert.ok(db); },
    },
    '@/db/medications': { getMedicationById: async () => ({ name: 'TEST', dosage: '1', schedules: [{ id: 2 }] }) },
    '@/notifications/constants': constants,
    '@/notifications/events': { emitDoseStateChanged: () => events.push('state-changed') },
    '@/notifications/scheduler': {
      cancelDoseNotifications: async () => { events.push('cancel-dose'); },
      scheduleSnoozeReminder: async () => { events.push('schedule-snooze'); },
      syncMedicationReminders: async () => { events.push('sync'); return { status: 'scheduled' }; },
    },
  });
  const db = {};
  saveSnooze = async () => { events.push('failed-db-write'); throw new Error('SQLite failure'); };
  await assert.rejects(actions.performMedicationDoseAction(first, 'snooze', db), /SQLite failure/);
  assert.ok(events.indexOf('schedule-snooze') < events.indexOf('failed-db-write'));
  assert.ok(events.includes(`cancel:${constants.snoozeReminderIdentifier(first)}`));
  assert.ok(!events.some((event) => event.startsWith('dismiss:')));

  events.length = 0;
  eligibility = 'alreadyTaken';
  assert.equal(await actions.performMedicationDoseAction(first, 'snooze', db), 'alreadyTaken');
  assert.ok(!events.includes('schedule-snooze'));

  events.length = 0;
  eligibility = 'allowed';
  existingStatus = 'snoozed';
  assert.equal(await actions.performMedicationDoseAction(first, 'snooze', db, constants.baseReminderIdentifier(first), 'dose'), 'snoozed');
  assert.ok(!events.includes('schedule-snooze'), 'duplicate base action must not move the snooze');
  events.length = 0;
  saveSnooze = async () => ({ status: 'snoozed' });
  assert.equal(await actions.performMedicationDoseAction(first, 'snooze', db, constants.snoozeReminderIdentifier(first), 'snooze'), 'snoozed');
  assert.ok(events.includes('schedule-snooze'), 'a delivered snooze can be snoozed again');

  const malformed = {
    actionIdentifier: constants.ACTION_TAKEN,
    notification: { request: { identifier: constants.baseReminderIdentifier(first), content: { data: { owner: 'other' } } }, date: 1 },
  };
  assert.equal(await actions.handleMedicationNotificationResponse(malformed, db), 'ignored');
  assert.ok(!events.includes('taken-write'));
  events.length = 0;
  const headlessResponse = {
    actionIdentifier: constants.ACTION_TAKEN,
    notification: { request: {
      identifier: constants.baseReminderIdentifier(first),
      content: { dataString: JSON.stringify(constants.medicationNotificationPayload('dose', first)) },
    }, date: 2 },
  };
  assert.equal(await actions.handleMedicationNotificationResponse(headlessResponse), 'taken');
  assert.deepEqual(events.filter((event) => event === 'open-background-db'
    || event === 'init-background-db' || event === 'taken-write' || event === 'close-background-db'),
  ['open-background-db', 'init-background-db', 'taken-write', 'close-background-db']);
  assert.equal(events.filter((event) => event === 'taken-write').length, 1);
  console.log('PASS: native hook, opt-in and OS capability gates, unique route identity, Expo single schedule');
  console.log('PASS: snooze failure cleanup, re-snooze, malformed rejection, headless dataString and separate SQLite handle');
}

async function testDoseLogs() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE medications (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, is_active INTEGER NOT NULL);
    CREATE TABLE medication_schedules (id INTEGER PRIMARY KEY, medication_id INTEGER NOT NULL REFERENCES medications(id), hour INTEGER NOT NULL, minute INTEGER NOT NULL, weekday_mask INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, is_active INTEGER NOT NULL);
    CREATE TABLE dose_logs (id INTEGER PRIMARY KEY, medication_id INTEGER NOT NULL REFERENCES medications(id), schedule_id INTEGER NOT NULL REFERENCES medication_schedules(id), scheduled_at INTEGER NOT NULL, taken_at INTEGER, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(medication_id, schedule_id, scheduled_at));`);
  const db = {
    getFirstAsync: async (sql, ...params) => sqlite.prepare(sql).get(...params) ?? null,
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...params),
    withExclusiveTransactionAsync: async (callback) => {
      sqlite.exec('BEGIN EXCLUSIVE');
      try {
        const value = await callback(db);
        sqlite.exec('COMMIT');
        return value;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const doseLogs = load('src/db/doseLogs.ts', {
    '@/db/database': { assertForeignKeysValid: async () => {} },
    '@/services/doseOccurrences': doseOccurrences,
  });
  const scheduledAt = new Date(2026, 9, 10, 9, 0, 0, 0).getTime();
  const createdAt = scheduledAt - 86_400_000;
  sqlite.prepare('INSERT INTO medications VALUES (?, ?, ?, ?)').run(1, createdAt, createdAt, 1);
  sqlite.prepare('INSERT INTO medications VALUES (?, ?, ?, ?)').run(2, createdAt, createdAt, 1);
  sqlite.prepare('INSERT INTO medication_schedules VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(2, 1, 9, 0, 127, createdAt, createdAt, 1);
  sqlite.prepare('INSERT INTO medication_schedules VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(4, 2, 9, 0, 127, createdAt, createdAt, 1);
  const identity = { medicationId: 1, scheduleId: 2, scheduledAt };
  const simultaneous = { medicationId: 2, scheduleId: 4, scheduledAt };
  const first = await doseLogs.markDoseTaken(db, { ...identity, takenAt: scheduledAt + 60_000 });
  const repeated = await doseLogs.markDoseTaken(db, { ...identity, takenAt: scheduledAt + 120_000 });
  assert.equal(first.takenAt, scheduledAt + 60_000);
  assert.equal(repeated.takenAt, first.takenAt);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM dose_logs').get().count, 1);
  assert.equal(await doseLogs.getDoseLogByIdentity(db, simultaneous), null);
  assert.equal((await doseLogs.markDoseSnoozed(db, simultaneous)).status, 'snoozed');
  assert.equal((await doseLogs.getDoseLogByIdentity(db, identity)).status, 'taken');
  assert.equal((await doseLogs.getDoseLogByIdentity(db, simultaneous)).takenAt, null);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM dose_logs').get().count, 2);
  assert.equal((await doseLogs.markDoseSnoozed(db, identity)).status, 'taken');
  assert.equal((await doseLogs.getDoseLogByIdentity(db, identity)).takenAt, first.takenAt);
  await assert.rejects(doseLogs.markDoseTaken(db, { ...identity, medicationId: 2 }), /does not belong/);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM dose_logs').get().count, 2);
  sqlite.prepare('INSERT INTO medication_schedules VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(3, 1, 14, 0, 127, createdAt, createdAt, 1);
  const later = { medicationId: 1, scheduleId: 3, scheduledAt: scheduledAt + 5 * 60 * 60_000 };
  assert.equal((await doseLogs.markDoseSnoozed(db, later)).status, 'snoozed');
  assert.equal((await doseLogs.markDoseSnoozed(db, later)).takenAt, null);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM dose_logs').get().count, 3);
  assert.equal((await doseLogs.markDoseTaken(db, { ...later, takenAt: later.scheduledAt + 60_000 })).status, 'taken');
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM dose_logs').get().count, 3);
  sqlite.close();
  console.log('PASS: SQLite independent simultaneous doses, duplicate taken/snooze, preserved first takenAt, snoozed-to-taken, taken guard, wrong medication rejection');
}

async function testInvalidFullScreenRouteRelease() {
  const params = { medicationId: '1', scheduleId: '2', scheduledAt: String(Date.now() - 1_000),
    kind: 'dose', source: 'fullscreen' };
  const db = {};
  const state = [];
  const effects = [];
  const priorDeps = [];
  let stateIndex = 0;
  let effectIndex = 0;
  let releases = 0;
  const AlarmScreen = load('src/app/alarm.tsx', {
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    'expo-router': { useLocalSearchParams: () => params, useRouter: () => ({ dismissTo() {} }) },
    'expo-notifications': {},
    'expo-sqlite': { useSQLiteContext: () => db },
    react: {
      useRef: (value) => ({ current: value }),
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (next) => { state[index] = next; }];
      },
      useEffect: (effect, deps) => {
        const index = effectIndex++;
        const previous = priorDeps[index];
        if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) effects.push(effect);
        priorDeps[index] = deps;
      },
    },
    'react-native': { StyleSheet: { create: (styles) => styles } },
    '@/components/MedicationPhoto': {},
    '@/components/Screen': {},
    '@/db/doseLogs': { getDoseLogsForRange: async () => [] },
    '@/db/medications': { getMedicationTimeline: async () => [] },
    '@/notifications/actions': {},
    '@/notifications/alarmQueue': {},
    '@/notifications/constants': constants,
    '@/notifications/fullScreenAlarm': { releaseAlarmLaunch: () => { releases++; } },
    '@/services/doseOccurrences': doseOccurrences,
    '@/theme/tokens': { colors: {}, fontSize: {}, fontWeight: {}, radius: {}, spacing: {}, touchTarget: {} },
  }).default;
  function render() {
    stateIndex = 0;
    effectIndex = 0;
    AlarmScreen();
    for (const effect of effects.splice(0)) effect();
  }
  render();
  await new Promise((resolve) => setImmediate(resolve));
  render();
  assert.equal(releases, 1, 'an invalid full-screen dose must release the visible-screen guard');
  console.log('PASS: invalid full-screen dose releases launch guard for later alarms');
}

async function testSnoozeTrigger() {
  const events = [];
  let request;
  const channel = 'medication_alarm_0000000000000001';
  const scheduler = load('src/notifications/scheduler.ts', {
    'expo-notifications': {
      AndroidNotificationPriority: { HIGH: 'high' },
      SchedulableTriggerInputTypes: { DATE: 'date' },
      setNotificationCategoryAsync: async () => {},
      cancelScheduledNotificationAsync: async (identifier) => { events.push(`cancel:${identifier}`); },
      scheduleNotificationAsync: async (next) => {
        request = next;
        events.push(`schedule:${next.identifier}`);
        return next.identifier;
      },
    },
    'react-native': { Platform: { OS: 'android' } },
    '@/notifications/alarmSound': {
      getDesiredAlarmChannelId: () => channel,
      getAlarmChannelId: () => channel,
      ensureAlarmChannel: () => {},
      setAlarmChannelId: () => {},
    },
    '@/db/doseLogs': {}, '@/db/medications': {},
    '@/notifications/constants': constants,
    '@/notifications/planner': {}, '@/services/doseOccurrences': {},
  });
  const now = 1791494700000;
  await scheduler.scheduleSnoozeReminder(first, 'TEST', '1 tablet', now);
  const identifier = constants.snoozeReminderIdentifier(first);
  assert.deepEqual(events, [`cancel:${identifier}`, `schedule:${identifier}`]);
  assert.equal(request.trigger.date, now + 5 * 60_000);
  assert.equal(request.trigger.channelId, channel);
  assert.deepEqual(request.content.data, constants.medicationNotificationPayload('snooze', first));
  console.log('PASS: one snooze request with independent ID, original dose identity, exact five-minute trigger');
}

Promise.resolve().then(testActions).then(testDoseLogs).then(testInvalidFullScreenRouteRelease)
  .then(testSnoozeTrigger).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
