const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

const constants = load('src/notifications/constants.ts', {});
const oldChannel = 'medication_alarm_0000000000000001';
const newChannel = 'medication_alarm_0000000000000002';
let activeChannel = oldChannel;
let presented = [];
let failNextSnooze = false;
const deleted = [];
const deliveries = [];
const fireTime = Date.now() + 60 * 60_000;
const first = { medicationId: 1, scheduleId: 11, scheduledAt: fireTime };
const second = { medicationId: 2, scheduleId: 22, scheduledAt: fireTime };
const near = { medicationId: 3, scheduleId: 33, scheduledAt: Date.now() + 30_000 };
const requests = [
  { identifier: constants.baseReminderIdentifier(first),
    content: { title: 'İlaç zamanı', body: 'TEST A', data: constants.medicationNotificationPayload('dose', first),
      categoryIdentifier: constants.REMINDER_CATEGORY_ID },
    trigger: { type: 'date', value: fireTime, channelId: oldChannel } },
  { identifier: constants.snoozeReminderIdentifier(second),
    content: { title: 'İlaç hatırlatması', body: 'TEST B', data: constants.medicationNotificationPayload('snooze', second),
      categoryIdentifier: constants.REMINDER_CATEGORY_ID },
    trigger: { type: 'date', value: fireTime + 5 * 60_000, channelId: oldChannel } },
  { identifier: constants.baseReminderIdentifier(near),
    content: { title: 'İlaç zamanı', body: 'DUE SOON', data: constants.medicationNotificationPayload('dose', near),
      categoryIdentifier: constants.REMINDER_CATEGORY_ID },
    trigger: { type: 'date', value: near.scheduledAt, channelId: oldChannel } },
];
const channels = [{ id: oldChannel }, { id: newChannel }];
const notifications = {
  AndroidImportance: { HIGH: 6, NONE: 2 },
  AndroidNotificationPriority: { HIGH: 'high' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationCategoryAsync: async () => {},
  getPermissionsAsync: async () => ({ granted: true, canAskAgain: false, status: 'granted' }),
  getNotificationChannelAsync: async () => ({ importance: 6 }),
  getAllScheduledNotificationsAsync: async () => requests.map((request) => ({
    ...request, trigger: { ...request.trigger }, content: { ...request.content },
  })),
  getPresentedNotificationsAsync: async () => presented,
  getNotificationChannelsAsync: async () => channels,
  scheduleNotificationAsync: async (request) => {
    if (failNextSnooze && request.identifier.startsWith('snooze_')) {
      failNextSnooze = false;
      throw new Error('transient native scheduling failure');
    }
    const existing = requests.find((item) => item.identifier === request.identifier);
    assert.ok(existing, 'migration keeps the same notification identifier');
    assert.equal(request.trigger.date, existing.trigger.value, 'migration keeps exact fire time');
    assert.deepEqual(request.content.data, existing.content.data, 'migration keeps dose-log identity');
    assert.equal(request.content.title, existing.content.title);
    assert.equal(request.content.body, existing.content.body);
    assert.equal(request.content.categoryIdentifier, existing.content.categoryIdentifier);
    existing.trigger = { type: 'date', value: request.trigger.date, channelId: request.trigger.channelId };
    deliveries.push(request.identifier);
    return request.identifier;
  },
  cancelScheduledNotificationAsync: async () => { throw new Error('migration must not cancel'); },
};
const schedulerImports = {
  'expo-notifications': notifications,
  'react-native': { Platform: { OS: 'android' } },
  '@/notifications/alarmSound': {
    getAlarmChannelId: () => activeChannel,
    getDesiredAlarmChannelId: () => newChannel,
    setAlarmChannelId: (id) => { activeChannel = id; },
    ensureAlarmChannel: (id) => { assert.equal(id, newChannel); },
    deleteAlarmChannel: (id) => { deleted.push(id); },
  },
  '@/db/doseLogs': { getDoseLogByIdentity: async () => ({ status: 'snoozed' }), getDoseLogsForRange: async () => [] },
  '@/db/medications': { getActiveMedications: async () => [
    { id: 1, isActive: true, schedules: [{ id: 11, isActive: true }] },
    { id: 2, isActive: true, schedules: [{ id: 22, isActive: true }] },
    { id: 3, isActive: true, schedules: [{ id: 33, isActive: true }] },
  ] },
  '@/notifications/constants': constants,
  '@/notifications/planner': {
    planBaseReminders: () => ({ desired: [], truncated: false }),
    planBaseReconciliation: () => ({ keep: [requests[0].identifier], cancel: [], schedule: [] }),
    ownedSnoozePayload: (request) => {
      const payload = constants.parseMedicationNotificationPayload(request.data);
      return payload?.kind === 'snooze' ? payload : null;
    },
    reminderHorizonEnd: (now) => now + 90 * 86_400_000,
  },
  '@/services/doseOccurrences': { localDayStart: (date) => date },
};
const loadScheduler = () => load('src/notifications/scheduler.ts', schedulerImports);
const scheduler = loadScheduler();

async function run() {
  presented = [{ request: { ...requests[0], trigger: { ...requests[0].trigger } } }];
  failNextSnooze = true;
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => { errors.push(args); };
  let incomplete;
  try { incomplete = await scheduler.syncMedicationReminders({}); }
  finally { console.error = originalError; }
  assert.equal(incomplete.status, 'partialFailure');
  assert.ok(errors.length >= 2, 'failure is logged for recovery');
  assert.equal(activeChannel, newChannel);
  assert.equal(requests[0].trigger.channelId, newChannel);
  assert.equal(requests[1].trigger.channelId, oldChannel);
  assert.equal(requests[2].trigger.channelId, oldChannel,
    'a due-soon request must remain untouched; the delivery patch selects the sound');
  assert.ok(!deliveries.includes(requests[2].identifier));
  assert.deepEqual(deleted, []);

  // Reloading the JS module drops setupPromise/syncTail as a process restart would.
  const restartedScheduler = loadScheduler();
  const recovered = await restartedScheduler.syncMedicationReminders({});
  assert.equal(recovered.status, 'scheduled');
  assert.equal(requests[1].trigger.channelId, newChannel);
  assert.deepEqual(deleted, [], 'presented old-channel notification protects channel');
  requests.pop(); // the due-soon one-shot has fired and left Expo's scheduled inventory
  presented = [{ request: { identifier: requests[0].identifier,
    content: requests[0].content, trigger: null } }];
  await restartedScheduler.syncMedicationReminders({});
  assert.deepEqual(deleted, [], 'unknown presented channel must block cleanup');
  presented = [];
  await restartedScheduler.syncMedicationReminders({});
  assert.deepEqual(deleted, [oldChannel]);
  assert.deepEqual(new Set(deliveries), new Set(requests.map((item) => item.identifier)));
  assert.equal(requests.length, 2);
  console.log('PASS: in-place channel migration preserves IDs/times, skips due-soon requests, retries failure, retains visible old channel, cleans only after safe');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
