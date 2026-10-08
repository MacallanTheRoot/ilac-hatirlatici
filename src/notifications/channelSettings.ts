import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { REMINDER_CHANNEL_ID } from '@/notifications/constants';
import { prepareReminderNotifications } from '@/notifications/scheduler';

/** Opens Android's own sound selector for our single reminder channel. */
export async function openReminderSoundSettings(): Promise<'channel' | 'app'> {
  if (Platform.OS !== 'android') throw new Error('Android settings are unavailable.');
  await prepareReminderNotifications();
  const packageName = Constants.expoConfig?.android?.package;
  if (packageName) {
    try {
      await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
        { key: 'android.provider.extra.APP_PACKAGE', value: packageName },
        { key: 'android.provider.extra.CHANNEL_ID', value: REMINDER_CHANNEL_ID },
      ]);
      return 'channel';
    } catch (cause) {
      console.warn('Could not open medication channel settings:', cause);
    }
  }
  await Linking.openSettings();
  return 'app';
}
