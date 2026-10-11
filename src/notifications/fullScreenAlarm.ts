import DadMedicineAlarm from '../../modules/dad-medicine-alarm/src/DadMedicineAlarmModule';

export function isFullScreenAlarmEnabled(): boolean {
  return DadMedicineAlarm.isEnabled();
}

export function canUseFullScreenAlarm(): boolean {
  return DadMedicineAlarm.canUseFullScreenIntent();
}

export function setFullScreenAlarmEnabled(enabled: boolean): Promise<void> {
  return DadMedicineAlarm.setEnabledAsync(enabled);
}

export function openFullScreenAlarmSettings(): Promise<void> {
  return DadMedicineAlarm.openFullScreenSettingsAsync();
}

/** Returns true only when this Activity was raised by Android's full-screen intent. */
export function closeFullScreenAlarmActivity(): Promise<boolean> {
  return DadMedicineAlarm.closeFullScreenAlarmAsync();
}

export function releaseAlarmLaunch(): void {
  DadMedicineAlarm.releaseAlarmLaunch();
}
