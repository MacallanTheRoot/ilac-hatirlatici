import DadMedicineAlarm from '../../modules/dad-medicine-alarm/src/DadMedicineAlarmModule';

export type AlarmSound = ReturnType<typeof DadMedicineAlarm.getAlarmSound>;
export const getAlarmSound = (): AlarmSound => DadMedicineAlarm.getAlarmSound();
export const pickAlarmSound = (): Promise<AlarmSound | null> => DadMedicineAlarm.pickAlarmSoundAsync();
export const getAlarmChannelId = (): string => DadMedicineAlarm.getActiveAlarmChannel();
export const getDesiredAlarmChannelId = (): string => DadMedicineAlarm.getDesiredAlarmChannel();
export const ensureAlarmChannel = (id: string): void => DadMedicineAlarm.ensureAlarmChannel(id);
export const deleteAlarmChannel = (id: string): void => DadMedicineAlarm.deleteAlarmChannel(id);
export const setAlarmChannelId = (id: string): void => DadMedicineAlarm.setActiveAlarmChannel(id);
