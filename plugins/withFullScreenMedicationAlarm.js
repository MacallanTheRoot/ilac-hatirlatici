const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withMainActivity } = require('expo/config-plugins');

const EXPO_NOTIFICATIONS_VERSION = '57.0.22';
const PATCH_MARKER = '// DAD_MEDICINE_FULL_SCREEN_INTENT_V1';
const PATCH_END = '// DAD_MEDICINE_FULL_SCREEN_INTENT_END';
const STATE_MARKER = '// DAD_MEDICINE_ALARM_VISIBLE_STATE';
const BUILDER_PATH = 'android/src/main/java/expo/modules/notifications/notifications/presentation/builders/ExpoNotificationBuilder.kt';

const CONTENT_INTENT_ANCHOR = `    builder.setContentIntent(
      createNotificationResponseIntent(
        context,
        notification,
        defaultAction
      )
    )`;

const FULL_SCREEN_BUILDER_CODE = `
    ${PATCH_MARKER}
    // This is the SAME delivered notification. Expo still owns its one AlarmManager
    // request, its content action, notification actions, cancellation, and reboot.
    val alarmData = content.body
    val medicationIdValue = alarmData?.opt("medicationId")
    val scheduleIdValue = alarmData?.opt("scheduleId")
    val scheduledAtValue = alarmData?.opt("scheduledAt")
    val alarmKind = alarmData?.optString("kind")
    val medicationId = (medicationIdValue as? Number)?.toLong() ?: -1L
    val scheduleId = (scheduleIdValue as? Number)?.toLong() ?: -1L
    val scheduledAt = (scheduledAtValue as? Number)?.toLong() ?: -1L
    val expectedIdentifier = when (alarmKind) {
      "dose" -> "dose_m" + medicationId + "_s" + scheduleId + "_t" + scheduledAt
      "snooze" -> "snooze_m" + medicationId + "_s" + scheduleId + "_t" + scheduledAt
      else -> ""
    }
    val fullScreenEnabled = context.getSharedPreferences("dad_medicine_alarm", Context.MODE_PRIVATE)
      .getBoolean("enabled", false)
    val fullScreenAllowed = if (Build.VERSION.SDK_INT >= 34) {
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager)
        .canUseFullScreenIntent()
    } else true
    if ((channelId == "medication_reminders" || channelId?.startsWith("medication_alarm_") == true) &&
      alarmData?.optString("owner") == "dad-medicine" && alarmData?.optInt("version") == 1 &&
      medicationId > 0 && scheduleId > 0 && scheduledAt > 0 &&
      notification.notificationRequest.identifier == expectedIdentifier) {
      builder.setCategory(NotificationCompat.CATEGORY_ALARM)
      val launchPreferences = context.getSharedPreferences("dad_medicine_alarm", Context.MODE_PRIVATE)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val configured = channelId?.let { manager.getNotificationChannel(it) }
        val symbolicDefault = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM)
        val selected = launchPreferences.getString("sound_uri", null)?.let(android.net.Uri::parse)
        val desiredSound = if (selected == null || selected == symbolicDefault) symbolicDefault else {
          val readable = try {
            context.contentResolver.openAssetFileDescriptor(selected, "r")?.use { true } ?: false
          } catch (_: Exception) { false }
          if (readable) selected else symbolicDefault
        }
        val digest = java.security.MessageDigest.getInstance("SHA-256")
          .digest(desiredSound.toString().toByteArray(Charsets.UTF_8))
        val desiredChannelId = "medication_alarm_" + digest.take(8)
          .joinToString("") { "%02x".format(it.toInt() and 0xff) }
        if (channelId != desiredChannelId) {
          if (manager.getNotificationChannel(desiredChannelId) == null) {
            val desiredChannel = android.app.NotificationChannel(desiredChannelId, "İlaç alarmları",
              configured?.importance ?: android.app.NotificationManager.IMPORTANCE_HIGH).apply {
                enableVibration(configured?.shouldVibrate() ?: true)
                vibrationPattern = configured?.vibrationPattern ?: longArrayOf(0, 250, 250, 250)
                setSound(desiredSound, android.media.AudioAttributes.Builder()
                  .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                  .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            }
            manager.createNotificationChannel(desiredChannel)
            }
          builder.setChannelId(desiredChannelId)
        }
      }
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        val fallback = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM)
        val requested = launchPreferences.getString("sound_uri", null)?.let(android.net.Uri::parse)
        val alarmSound = if (requested == null || requested == fallback) fallback else try {
          val readable = context.contentResolver.openAssetFileDescriptor(requested, "r")?.use { true } ?: false
          if (readable) requested else fallback
        } catch (_: Exception) { fallback }
        builder.setDefaults(0)
        builder.setSound(alarmSound, android.media.AudioManager.STREAM_ALARM)
        builder.setVibrate(longArrayOf(0, 250, 250, 250))
      }
      val soundGroup = alarmKind + ":" + scheduledAt
      val playSound = synchronized(ExpoNotificationBuilder::class.java) {
        val lastGroup = launchPreferences.getString("sound_group_key", null)
        val lastAt = launchPreferences.getLong("sound_group_at", 0L)
        val now = System.currentTimeMillis()
        if (lastGroup == soundGroup && now - lastAt in 0L..120000L) false
        else launchPreferences.edit().putString("sound_group_key", soundGroup)
          .putLong("sound_group_at", now).commit()
      }
      if (!playSound) builder.setSilent(true)
      if (fullScreenEnabled && fullScreenAllowed) {
        // A durable lease covers startup; the process-local flag protects a
        // visible screen for longer without blocking recovery after process death.
        val claimLaunch = synchronized(ExpoNotificationBuilder::class.java) {
          val last = launchPreferences.getLong("full_screen_launch_at", 0L)
          val now = System.currentTimeMillis()
          if (alarmScreenVisible || now - last in 0L..120000L) false
          else launchPreferences.edit().putLong("full_screen_launch_at", now).commit()
        }
        if (claimLaunch) {
          context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { alarmIntent ->
            alarmIntent.action = android.content.Intent.ACTION_VIEW
            alarmIntent.data = android.net.Uri.parse(
              "dadmedicine:///alarm?medicationId=" + medicationId +
                "&scheduleId=" + scheduleId + "&scheduledAt=" + scheduledAt +
                "&kind=" + alarmKind + "&source=fullscreen"
            )
            alarmIntent.putExtra("dad_medicine_full_screen_alarm", true)
            alarmIntent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
              android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP or android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP)
            val alarmPendingIntent = android.app.PendingIntent.getActivity(
              context,
              notification.notificationRequest.identifier.hashCode(),
              alarmIntent,
              android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
            builder.setFullScreenIntent(alarmPendingIntent, true)
          }
        }
      }
    }
    ${PATCH_END}
`;

function patchExpoNotificationBuilder(projectRoot) {
  const appPackage = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const sourceModules = appPackage.expo?.autolinking?.android?.buildFromSource;
  if (!Array.isArray(sourceModules) || !sourceModules.includes('expo-notifications')) {
    throw new Error('Full-screen alarm requires expo-notifications in expo.autolinking.android.buildFromSource.');
  }
  const packagePath = require.resolve('expo-notifications/package.json', { paths: [projectRoot] });
  const packageRoot = path.dirname(packagePath);
  const version = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
  if (version !== EXPO_NOTIFICATIONS_VERSION) {
    throw new Error(`Full-screen notification patch expects expo-notifications ${EXPO_NOTIFICATIONS_VERSION}; found ${version}`);
  }
  const sourcePath = path.join(packageRoot, BUILDER_PATH);
  const source = fs.readFileSync(sourcePath, 'utf8');
  let updated = source;
  if (updated.includes(PATCH_MARKER)) {
    const start = updated.indexOf(`    ${PATCH_MARKER}`);
    const end = updated.indexOf(`    ${PATCH_END}`, start);
    const installed = end >= 0 ? updated.slice(start, end + `    ${PATCH_END}`.length).trim() : '';
    if (installed !== FULL_SCREEN_BUILDER_CODE.trim() || !updated.includes('return builder.build()')) {
      throw new Error('Installed Expo full-screen patch is outdated; reinstall dependencies from the lockfile.');
    }
  } else {
    const first = updated.indexOf(CONTENT_INTENT_ANCHOR);
    if (first < 0 || updated.indexOf(CONTENT_INTENT_ANCHOR, first + 1) >= 0) {
      throw new Error('Expo notification builder insertion point changed; full-screen patch was not applied.');
    }
    updated = updated.replace(CONTENT_INTENT_ANCHOR,
      `${CONTENT_INTENT_ANCHOR}\n${FULL_SCREEN_BUILDER_CODE}`);
  }
  if (!updated.includes(STATE_MARKER)) {
    const anchor = '  companion object {';
    if (updated.indexOf(anchor) < 0 || updated.indexOf(anchor) !== updated.lastIndexOf(anchor)) {
      throw new Error('Expo notification builder companion object changed.');
    }
    updated = updated.replace(anchor, `${anchor}\n    ${STATE_MARKER}\n    @Volatile var alarmScreenVisible = false`);
  }
  if (updated !== source) fs.writeFileSync(sourcePath, updated);
}

function patchMainActivity(config) {
  const source = config.modResults.contents;
  if (config.modResults.language !== 'kt' || !source.includes('    super.onCreate(null)')) {
    throw new Error('Generated Kotlin MainActivity insertion point changed.');
  }
  if (source.includes('DAD_MEDICINE_ALARM_WINDOW_V1')) return config;
  config.modResults.contents = source.replace('    super.onCreate(null)', `    super.onCreate(null)
    updateAlarmWindowFlags(intent)`).replace(
    '  override fun getMainComponentName(): String = "main"',
    `  // DAD_MEDICINE_ALARM_WINDOW_V1
  private fun updateAlarmWindowFlags(nextIntent: android.content.Intent?) {
    val alarm = nextIntent?.getBooleanExtra("dad_medicine_full_screen_alarm", false) == true
    expo.modules.notifications.notifications.presentation.builders.ExpoNotificationBuilder.alarmScreenVisible = alarm
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(alarm)
      if (alarm) setTurnScreenOn(true)
    }
  }

  override fun onNewIntent(nextIntent: android.content.Intent) {
    super.onNewIntent(nextIntent)
    setIntent(nextIntent)
    updateAlarmWindowFlags(nextIntent)
  }

  override fun onDestroy() {
    expo.modules.notifications.notifications.presentation.builders.ExpoNotificationBuilder.alarmScreenVisible = false
    getSharedPreferences("dad_medicine_alarm", android.content.Context.MODE_PRIVATE)
      .edit().remove("full_screen_launch_at").apply()
    super.onDestroy()
  }

  override fun getMainComponentName(): String = "main"`);
  if (!config.modResults.contents.includes('DAD_MEDICINE_ALARM_WINDOW_V1')) {
    throw new Error('Generated Kotlin MainActivity method insertion point changed.');
  }
  return config;
}

function withFullScreenMedicationAlarm(config) {
  config = withMainActivity(config, patchMainActivity);
  return withDangerousMod(config, ['android', async (mod) => {
    patchExpoNotificationBuilder(mod.modRequest.projectRoot);
    return mod;
  }]);
}

module.exports = withFullScreenMedicationAlarm;
module.exports.patchExpoNotificationBuilder = patchExpoNotificationBuilder;
