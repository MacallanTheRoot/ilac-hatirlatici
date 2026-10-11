import { NativeModule, requireNativeModule } from 'expo';

declare class DadMedicineAlarmModule extends NativeModule<{}> {
  isEnabled(): boolean;
  setEnabledAsync(enabled: boolean): Promise<void>;
  canUseFullScreenIntent(): boolean;
  openFullScreenSettingsAsync(): Promise<void>;
  closeFullScreenAlarmAsync(): Promise<boolean>;
  releaseAlarmLaunch(): void;
  getAlarmSound(): { uri: string; title: string; isDefault: boolean; fellBack: boolean };
  pickAlarmSoundAsync(): Promise<{ uri: string; title: string; isDefault: boolean; fellBack: boolean } | null>;
  ensureAlarmChannel(channelId: string): void;
  deleteAlarmChannel(channelId: string): void;
  getActiveAlarmChannel(): string;
  getDesiredAlarmChannel(): string;
  setActiveAlarmChannel(channelId: string): void;
}

export default requireNativeModule<DadMedicineAlarmModule>('DadMedicineAlarm');
