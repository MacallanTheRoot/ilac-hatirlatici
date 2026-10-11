const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
    throw new Error(`Unexpected runtime import: ${name}`);
  }, module, module.exports);
  return module.exports;
}

const { alarmIdentityKey, simultaneousAlarmQueue, sortAlarmOccurrences } =
  load('src/notifications/alarmQueue.ts');
const at = new Date(2026, 9, 11, 8, 0, 0, 0).getTime();
function medication(id, createdAt, active = true, scheduleActive = true) {
  return { id, createdAt, isActive: active, schedules: [{ id: id * 10, isActive: scheduleActive }] };
}
function occurrence(id, time = at, status = null) {
  return { medicationId: id, scheduleId: id * 10, scheduledAt: time,
    medicationName: `TEST ${id}`, dosage: `${id} tablet`, photoPath: `test-${id}.png`, status };
}
const meds = [medication(1, 200), medication(2, 100), medication(3, 100)];
const doses = [occurrence(1), occurrence(3), occurrence(2)];
const two = simultaneousAlarmQueue(doses.slice(0, 2), meds, doses[0], 'dose');
assert.deepEqual(two.map((item) => item.medicationId), [3, 1]);
const three = simultaneousAlarmQueue(doses, meds, doses[0], 'dose');
assert.deepEqual(three.map((item) => item.medicationId), [2, 3, 1]);
assert.deepEqual(three.map((item) => item.photoPath), ['test-2.png', 'test-3.png', 'test-1.png']);
assert.equal(new Set(three.map(alarmIdentityKey)).size, 3);
assert.deepEqual(simultaneousAlarmQueue(doses, meds, doses[2], 'dose').map(alarmIdentityKey),
  three.map(alarmIdentityKey)); // delivery order and restart do not reorder
assert.equal(simultaneousAlarmQueue(doses, meds, doses[0], 'snooze').length, 1);
assert.deepEqual(simultaneousAlarmQueue(doses, meds.map((item) => item.id === 2
  ? medication(2, 100, false) : item), doses[0], 'dose').map((item) => item.medicationId), [3, 1]);
assert.deepEqual(simultaneousAlarmQueue(doses, meds.map((item) => item.id === 3
  ? medication(3, 100, true, false) : item), doses[0], 'dose').map((item) => item.medicationId), [2, 1]);
assert.deepEqual(simultaneousAlarmQueue([occurrence(1, at, 'taken'), occurrence(2)], meds,
  occurrence(2), 'dose').map((item) => item.medicationId), [2]);
assert.deepEqual(simultaneousAlarmQueue([occurrence(1, at, 'snoozed'), occurrence(2)], meds,
  occurrence(2), 'dose').map((item) => item.medicationId), [2]);
assert.equal(simultaneousAlarmQueue([occurrence(1, at, 'snoozed')], meds,
  occurrence(1), 'snooze').length, 1);
assert.deepEqual(sortAlarmOccurrences([occurrence(1, at + 60_000), occurrence(2)], meds)
  .map((item) => item.medicationId), [2, 1]);
const sameMedicationSchedules = [
  { ...occurrence(2), scheduleId: 22 },
  { ...occurrence(2), scheduleId: 21 },
];
const medicationWithTwoSchedules = [{ ...meds[1], schedules: [
  { id: 22, isActive: true }, { id: 21, isActive: true },
] }];
assert.deepEqual(simultaneousAlarmQueue(sameMedicationSchedules, medicationWithTwoSchedules,
  sameMedicationSchedules[0], 'dose').map((item) => item.scheduleId), [21, 22]);
const midnight = new Date(2026, 9, 11, 23, 59).getTime();
assert.deepEqual(sortAlarmOccurrences([occurrence(1, midnight + 60_000), occurrence(2, midnight)], meds)
  .map((item) => item.scheduledAt), [midnight, midnight + 60_000]);
assert.equal(simultaneousAlarmQueue([occurrence(1, midnight), occurrence(2, midnight + 60_000)],
  meds, occurrence(1, midnight), 'dose').length, 1);
assert.deepEqual(simultaneousAlarmQueue([occurrence(1, at, 'snoozed'), occurrence(2), occurrence(3)],
  meds, occurrence(2), 'dose').map((item) => item.medicationId), [2, 3]);

const builder = fs.readFileSync('node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/notifications/presentation/builders/ExpoNotificationBuilder.kt', 'utf8');
const nativeModule = fs.readFileSync('modules/dad-medicine-alarm/android/src/main/java/com/macallan/dadmedicine/alarm/DadMedicineAlarmModule.kt', 'utf8');
assert.match(builder, /sound_group_key/);
assert.match(builder, /if \(!playSound\) builder\.setSilent\(true\)/);
assert.match(builder, /alarmScreenVisible \|\|/);
assert.match(builder, /setFullScreenIntent\(alarmPendingIntent, true\)/);
assert.match(builder, /getDefaultUri\(android\.media\.RingtoneManager\.TYPE_ALARM\)/);
assert.match(builder, /STREAM_ALARM/);
assert.match(builder, /builder\.setChannelId\(desiredChannelId\)/);
assert.match(nativeModule, /ACTION_RINGTONE_PICKER/);
assert.match(nativeModule, /EXTRA_RINGTONE_TYPE, RingtoneManager\.TYPE_ALARM/);
assert.match(nativeModule, /getDefaultUri\(RingtoneManager\.TYPE_ALARM\)/);
assert.match(nativeModule, /AudioAttributes\.USAGE_ALARM/);
assert.match(nativeModule, /openAssetFileDescriptor/);
assert.match(nativeModule, /MessageDigest\.getInstance\("SHA-256"\)/);
assert.doesNotMatch(nativeModule, /TYPE_NOTIFICATION/);
console.log('PASS: two/three dose ordering, stable ties, separate data, inactive/taken/snoozed guards, midnight boundary');
console.log('PASS: native alarm picker/default/usage, sound group suppression, single visible full-screen Activity');

// A delivered notification keeps its request ID and delivery date when a user
// closes the screen and taps that still-present notification again.
const constants = load('src/notifications/constants.ts');
const pushed = [];
let tapListener;
let cleared = 0;
const originalNow = Date.now;
let clock = at;
Date.now = () => clock;
try {
  const { NotificationBootstrap } = load('src/notifications/NotificationBootstrap.tsx', {
    'expo-notifications': {
      DEFAULT_ACTION_IDENTIFIER: 'DEFAULT',
      addNotificationResponseReceivedListener: (callback) => {
        tapListener = callback;
        return { remove() {} };
      },
      getLastNotificationResponse: () => null,
      clearLastNotificationResponse: () => { cleared++; },
    },
    'expo-router': { useRouter: () => ({ push: (route) => pushed.push(route) }) },
    'expo-sqlite': { useSQLiteContext: () => ({}) },
    react: { useEffect: (effect) => { effect(); }, useRef: (current) => ({ current }) },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '@/notifications/actions': { handleMedicationNotificationResponse: async () => 'ignored' },
    '@/notifications/constants': constants,
    '@/notifications/events': { emitReminderStateChanged() {} },
    '@/notifications/scheduler': {
      getReminderPermission: async () => ({ granted: false, undetermined: false }),
      prepareReminderNotifications: async () => {},
      requestReminderPermission: async () => ({ granted: false }),
      syncMedicationReminders: async () => ({ status: 'scheduled' }),
    },
  });
  NotificationBootstrap();
  const response = (item) => ({
    actionIdentifier: 'DEFAULT',
    notification: {
      date: at,
      request: {
        identifier: constants.baseReminderIdentifier(item),
        content: { data: constants.medicationNotificationPayload('dose', item) },
      },
    },
  });
  tapListener(response(doses[0]));
  tapListener(response(doses[0])); // duplicate callback for one tap
  assert.equal(pushed.length, 1);
  clock += 2_000; // screen closed; same delivered notification tapped again
  tapListener(response(doses[0]));
  assert.equal(pushed.length, 2, 'a still-present unanswered dose must reopen after a later tap');
  tapListener(response(doses[1])); // other unanswered dose is independently reachable
  assert.equal(pushed.length, 3);
  assert.equal(cleared, 3);
  console.log('PASS: duplicate tap callback suppressed; separate and repeat unanswered taps routed');
} finally {
  Date.now = originalNow;
}
