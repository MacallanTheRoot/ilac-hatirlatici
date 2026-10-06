import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

import { handleMedicationNotificationResponse } from '@/notifications/actions';
import { BACKGROUND_NOTIFICATION_TASK } from '@/notifications/constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

if (!TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    BACKGROUND_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error) {
        console.error('Medication notification task failed:', error);
        return Notifications.BackgroundNotificationTaskResult.Failed;
      }
      if (!data || typeof data !== 'object' || !('actionIdentifier' in data)) {
        return Notifications.BackgroundNotificationTaskResult.NoData;
      }
      // The mounted app's listener owns responses while it is active.
      if (AppState.currentState === 'active') {
        return Notifications.BackgroundNotificationTaskResult.NoData;
      }
      try {
        const result = await handleMedicationNotificationResponse(data);
        return result === 'ignored'
          ? Notifications.BackgroundNotificationTaskResult.NoData
          : Notifications.BackgroundNotificationTaskResult.NewData;
      } catch (cause) {
        console.error('Could not process medication notification action:', cause);
        return Notifications.BackgroundNotificationTaskResult.Failed;
      }
    },
  );
}

void TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK)
  .then((registered) => registered ? undefined : Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK))
  .catch((cause: unknown) => {
    console.error('Could not register medication notification task:', cause);
  });
