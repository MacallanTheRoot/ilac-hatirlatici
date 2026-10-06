import * as Notifications from 'expo-notifications';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { handleMedicationNotificationResponse } from '@/notifications/actions';
import { emitReminderStateChanged } from '@/notifications/events';
import {
  getReminderPermission,
  prepareReminderNotifications,
  requestReminderPermission,
  syncMedicationReminders,
} from '@/notifications/scheduler';

export function NotificationBootstrap() {
  const db = useSQLiteContext();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (AppState.currentState !== 'active') return;
      void handleMedicationNotificationResponse(response, db).catch((cause: unknown) => {
        console.error('Could not process foreground medication action:', cause);
      });
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void getReminderPermission()
        .then(async (permission) => {
          emitReminderStateChanged();
          if (permission.granted) {
            const result = await syncMedicationReminders(db);
            if (result.status === 'partialFailure') {
              console.warn('Resumed reminder synchronization incomplete:', result);
            }
          }
        })
        .catch((cause: unknown) => console.error('Could not refresh resumed reminders:', cause));
    });

    let active = true;
    void (async () => {
      try {
        await prepareReminderNotifications();
        let permission = await getReminderPermission();
        if (permission.undetermined) permission = await requestReminderPermission();
        if (active) emitReminderStateChanged();
        if (permission.granted) {
          const result = await syncMedicationReminders(db);
          if (result.status === 'partialFailure') {
            console.warn('Startup reminder synchronization incomplete:', result);
          }
        }
      } catch (cause) {
        console.error('Could not start medication reminders:', cause);
        if (active) emitReminderStateChanged();
      }
    })();

    return () => {
      active = false;
      subscription.remove();
      appStateSubscription.remove();
    };
  }, [db]);

  return null;
}
