package com.macallan.dadmedicine.alarm

import android.app.NotificationManager
import android.app.NotificationChannel
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.notifications.notifications.presentation.builders.ExpoNotificationBuilder
import java.security.MessageDigest

class DadMedicineAlarmModule : Module() {
  private var ringtonePromise: Promise? = null
  private val pickerRequest = 7306

  override fun definition() = ModuleDefinition {
    Name("DadMedicineAlarm")

    Function("isEnabled") {
      preferences().getBoolean("enabled", false)
    }

    AsyncFunction("setEnabledAsync") { enabled: Boolean ->
      if (!preferences().edit().putBoolean("enabled", enabled).commit()) {
        throw IllegalStateException("Could not save full-screen alarm preference")
      }
    }

    Function("canUseFullScreenIntent") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        true
      } else {
        val manager = context().getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.canUseFullScreenIntent()
      }
    }

    AsyncFunction("openFullScreenSettingsAsync") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
          data = Uri.parse("package:${context().packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context().startActivity(intent)
      }
    }

    AsyncFunction("closeFullScreenAlarmAsync") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity?.intent?.getBooleanExtra("dad_medicine_full_screen_alarm", false) == true) {
        activity.runOnUiThread {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            activity.setShowWhenLocked(false)
            activity.setTurnScreenOn(false)
          }
          activity.finish()
          promise.resolve(true)
        }
      } else {
        promise.resolve(false)
      }
    }

    Function("releaseAlarmLaunch") {
      if (appContext.currentActivity?.isFinishing != true) {
        ExpoNotificationBuilder.alarmScreenVisible = false
        preferences().edit().remove("full_screen_launch_at").commit()
      }
    }

    Function("getAlarmSound") { soundDetails() }

    AsyncFunction("pickAlarmSoundAsync") { promise: Promise ->
      if (ringtonePromise != null) {
        promise.reject("PICKER_BUSY", "Alarm sound picker is already open", null)
      } else {
        val activity = appContext.currentActivity
        if (activity == null) {
          promise.reject("NO_ACTIVITY", "No Android Activity for ringtone picker", null)
        } else {
          ringtonePromise = promise
          val current = preferences().getString("sound_uri", null)?.let(Uri::parse)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
          val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
            putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
            putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
            putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, current)
            putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "İlaç alarmı sesi")
          }
          try { activity.startActivityForResult(intent, pickerRequest) }
          catch (error: Exception) {
            ringtonePromise = null
            promise.reject("PICKER_FAILED", error.message ?: "Picker unavailable", error)
          }
        }
      }
    }

    OnActivityResult { _, (requestCode, resultCode, data) ->
      if (requestCode == pickerRequest) {
        val promise = ringtonePromise
        ringtonePromise = null
        if (resultCode != Activity.RESULT_OK) {
          promise?.resolve(null)
        } else {
          val selected = if (Build.VERSION.SDK_INT >= 33)
            data?.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri::class.java)
          else data?.getParcelableExtra<Uri>(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
          if (selected == null) promise?.reject("NO_SOUND", "No alarm sound selected", null)
          else if (!preferences().edit().putString("sound_uri", selected.toString()).commit())
            promise?.reject("SAVE_FAILED", "Could not save alarm sound", null)
          else promise?.resolve(soundDetails())
        }
      }
    }

    Function("ensureAlarmChannel") { channelId: String ->
      require(channelId == desiredChannelId())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val manager = context().getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(channelId) == null) {
          val previousId = preferences().getString("active_channel", null) ?: "medication_reminders"
          val previous = manager.getNotificationChannel(previousId)
          val sound = resolvedSound()
          val channel = NotificationChannel(channelId, "İlaç alarmları",
            previous?.importance ?: NotificationManager.IMPORTANCE_HIGH).apply {
            description = "İlaç saatleri ve ertelemeler"
            enableVibration(previous?.shouldVibrate() ?: true)
            vibrationPattern = previous?.vibrationPattern ?: longArrayOf(0, 250, 250, 250)
            setSound(sound, AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ALARM)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
          }
          manager.createNotificationChannel(channel)
        }
      }
    }

    Function("deleteAlarmChannel") { channelId: String ->
      require(isOwnedChannelId(channelId))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        (context().getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
          .deleteNotificationChannel(channelId)
      }
    }

    Function("getActiveAlarmChannel") {
      preferences().getString("active_channel", null) ?: desiredChannelId()
    }

    Function("getDesiredAlarmChannel") {
      desiredChannelId()
    }

    Function("setActiveAlarmChannel") { channelId: String ->
      require(channelId == desiredChannelId())
      if (!preferences().edit().putString("active_channel", channelId).commit())
        throw IllegalStateException("Could not save alarm channel")
    }
  }

  private fun desiredChannelId(): String {
    val digest = MessageDigest.getInstance("SHA-256")
      .digest(resolvedSound().toString().toByteArray(Charsets.UTF_8))
    return "medication_alarm_" + digest.take(8).joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }

  private fun isOwnedChannelId(id: String): Boolean =
    id.matches(Regex("medication_alarm_[0-9a-f]{16}"))

  private fun resolvedSound(): Uri {
    val fallback = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    val selected = preferences().getString("sound_uri", null)?.let(Uri::parse) ?: return fallback
    if (selected == fallback) return fallback
    return try {
      val readable = context().contentResolver.openAssetFileDescriptor(selected, "r")?.use { true } ?: false
      if (readable) selected else fallback
    } catch (_: Exception) { fallback }
  }

  private fun soundDetails(): Map<String, Any> {
    val requested = preferences().getString("sound_uri", null)
    val resolved = resolvedSound()
    val fallback = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    val title = try { RingtoneManager.getRingtone(context(), resolved)?.getTitle(context()) }
      catch (_: Exception) { null }
    return mapOf(
      "uri" to resolved.toString(),
      "title" to (title ?: if (resolved == fallback) "Varsayılan alarm sesi" else "Seçilen alarm sesi"),
      "isDefault" to (resolved == fallback),
      "fellBack" to (requested != null && Uri.parse(requested) != fallback && resolved == fallback)
    )
  }

  private fun context(): Context = appContext.reactContext
    ?: throw IllegalStateException("Android context is unavailable")

  private fun preferences() = context().getSharedPreferences("dad_medicine_alarm", Context.MODE_PRIVATE)
}
