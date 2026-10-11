const { patchExpoNotificationBuilder } = require('../plugins/withFullScreenMedicationAlarm');

patchExpoNotificationBuilder(process.cwd());
console.log('Verified Expo Notifications full-screen alarm patch.');
