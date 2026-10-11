import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { handleMedicationNotificationResponse } from '@/notifications/actions';
import {
  baseReminderIdentifier,
  payloadFromNotificationContent,
  snoozeReminderIdentifier,
} from '@/notifications/constants';
import { emitReminderStateChanged } from '@/notifications/events';
import {
  getReminderPermission,
  prepareReminderNotifications,
  requestReminderPermission,
  syncMedicationReminders,
} from '@/notifications/scheduler';

export function NotificationBootstrap() {
  const db = useSQLiteContext();
  const router = useRouter();
  const handledTap = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    function openAlarmFromTap(response: Notifications.NotificationResponse) {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const request = response.notification?.request;
      const payload = payloadFromNotificationContent(request?.content);
      if (!request || !payload) return;
      const expected = payload.kind === 'dose'
        ? baseReminderIdentifier(payload)
        : snoozeReminderIdentifier(payload);
      if (request.identifier !== expected) return;
      const tapKey = `${request.identifier}:${response.notification.date}`;
      const now = Date.now();
      if (handledTap.current?.key === tapKey && now - handledTap.current.at >= 0
        && now - handledTap.current.at < 1_000) return;
      handledTap.current = { key: tapKey, at: now };
      Notifications.clearLastNotificationResponse();
      router.push({
        pathname: '/alarm',
        params: {
          medicationId: String(payload.medicationId),
          scheduleId: String(payload.scheduleId),
          scheduledAt: String(payload.scheduledAt),
          kind: payload.kind,
          source: 'tap',
        },
      });
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        openAlarmFromTap(response);
        return;
      }
      // Expo SDK 57 runs the task only when native considers the app backgrounded.
      // The response listener owns custom actions while it is foregrounded.
      if (AppState.currentState !== 'active') return;
      void handleMedicationNotificationResponse(response, db).catch((cause: unknown) => {
        console.error('Could not process foreground medication action:', cause);
      });
    });

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) openAlarmFromTap(lastResponse);

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
  }, [db, router]);

  return null;
}
