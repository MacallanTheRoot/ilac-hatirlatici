# Android medication alarm bridge

This local Expo module stores the user's explicit full-screen opt-in and chosen
alarm ringtone in Android SharedPreferences. It checks Android 14+ full-screen
intent access, opens `RingtoneManager.ACTION_RINGTONE_PICKER` for `TYPE_ALARM`,
and creates medication channels with `USAGE_ALARM`. The default is the symbolic
device alarm URI. It does not schedule alarms or change the device's global sound.

`plugins/withFullScreenMedicationAlarm.js` patches the installed
`expo-notifications` **57.0.22** notification builder during CNG prebuild. The
patch attaches a full-screen `PendingIntent` to the same notification Expo
delivers from its existing `AlarmManager` request. The plugin checks the exact
package version and insertion point, and fails native generation if either
changes. It also adds lock-screen Activity flags to the generated MainActivity.

The full-screen intent opens `dadmedicine:///alarm` with the dose identity and
kind. The Router screen verifies it against SQLite, orders simultaneous doses by
creation time and IDs, and advances only after a dose action succeeds. A native
process-local visible flag and short persistent lease prevent competing full-screen
launches; each dose retains its own notification and content/action intent.
Only the first notification in a same-time group sounds. Other notifications
remain in Android's notification tray.
Disabling the preference or losing Android full-screen access leaves the normal
high-priority notification and its existing actions in place.

Android channels cannot change their sound after creation, and recreating a
deleted ID restores its old settings. The active channel ID therefore derives
from the resolved ringtone URI. Existing scheduled requests migrate in place,
retaining identifiers and trigger times. Inactive channels are removed only
after no scheduled or presented medication reminder uses them. The old
`medication_reminders` channel is retained for already delivered reminders.
If a custom URI cannot be opened, the bridge reports the fallback and uses the
device's default alarm URI. The notification builder also redirects an in-flight
old-channel delivery to the selected alarm channel before JS migration runs.
On Android 7, where channels do not exist, the
notification builder sets the alarm sound on the individual notification.

Expo SDK 57 normally links a prebuilt Android artifact for `expo-notifications`.
`package.json` opts **only** `expo-notifications` into `buildFromSource`, so the
version-checked patch is compiled into the APK. The `postinstall` script applies
the patch before EAS runs Gradle; the config plugin also verifies it during
native generation. APK verification must find `dadmedicine:///alarm` in the
compiled DEX before installing a candidate for device acceptance.
