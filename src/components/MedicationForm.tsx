import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/components/Screen';
import {
  createMedication,
  deactivateMedication,
  getMedicationById,
  updateMedication,
} from '@/db/medications';
import { colors, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme/tokens';
import { EVERY_DAY, WEEKDAYS, type MedicationInput } from '@/types/medication';
import { MedicationValidationError, normalizeMedicationInput } from '@/utils/medication';

type ScheduleDraft = {
  key: number;
  hour: string;
  minute: string;
  recurrence: 'daily' | 'selected';
  selectedMask: number;
};

function emptySchedule(key: number): ScheduleDraft {
  return { key, hour: '', minute: '', recurrence: 'daily', selectedMask: 0 };
}

function parseTimePart(value: string): number {
  const trimmed = value.trim();
  return /^\d{1,2}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

export function MedicationForm({ medicationId }: { medicationId?: number }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [instructions, setInstructions] = useState('');
  const [schedules, setSchedules] = useState<ScheduleDraft[]>([emptySchedule(0)]);
  const [loading, setLoading] = useState(medicationId !== undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const nextScheduleKey = useRef(1);

  useEffect(() => {
    if (medicationId === undefined) return;
    let active = true;
    getMedicationById(db, medicationId)
      .then((medication) => {
        if (!active) return;
        if (!medication) {
          setLoadError('İlaç bulunamadı.');
          return;
        }
        setName(medication.name);
        setDosage(medication.dosage);
        setInstructions(medication.instructions ?? '');
        setSchedules(medication.schedules.map((schedule, index) => ({
          key: index,
          hour: String(schedule.hour).padStart(2, '0'),
          minute: String(schedule.minute).padStart(2, '0'),
          recurrence: schedule.weekdayMask === EVERY_DAY ? 'daily' : 'selected',
          selectedMask: schedule.weekdayMask === EVERY_DAY ? 0 : schedule.weekdayMask,
        })));
        nextScheduleKey.current = medication.schedules.length;
      })
      .catch((cause: unknown) => {
        console.error('Could not load medication:', cause);
        if (active) setLoadError('İlaç yüklenemedi. Lütfen tekrar deneyin.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [db, medicationId]);

  function updateSchedule(key: number, change: Partial<ScheduleDraft>) {
    setSchedules((current) => current.map((schedule) =>
      schedule.key === key ? { ...schedule, ...change } : schedule,
    ));
  }

  function toggleWeekday(key: number, bit: number) {
    setSchedules((current) => current.map((schedule) =>
      schedule.key === key
        ? { ...schedule, selectedMask: schedule.selectedMask ^ bit }
        : schedule,
    ));
  }

  function addSchedule() {
    const key = nextScheduleKey.current++;
    setSchedules((current) => [...current, emptySchedule(key)]);
  }

  function removeSchedule(key: number) {
    setSchedules((current) => current.length > 1
      ? current.filter((schedule) => schedule.key !== key)
      : current,
    );
  }

  function buildInput(): MedicationInput {
    return normalizeMedicationInput({
      name,
      dosage,
      instructions,
      schedules: schedules.map((schedule) => ({
        hour: parseTimePart(schedule.hour),
        minute: parseTimePart(schedule.minute),
        weekdayMask: schedule.recurrence === 'daily' ? EVERY_DAY : schedule.selectedMask,
      })),
    });
  }

  async function save() {
    if (savingRef.current) return;
    let input: MedicationInput;
    try {
      input = buildInput();
    } catch (cause) {
      if (cause instanceof MedicationValidationError) {
        setError(cause.message);
        return;
      }
      throw cause;
    }

    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      if (medicationId === undefined) {
        await createMedication(db, input);
      } else {
        await updateMedication(db, medicationId, input);
      }
      router.dismissTo('/medications');
    } catch (cause) {
      console.error('Could not save medication:', cause);
      setError('İlaç kaydedilemedi. Lütfen tekrar deneyin.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  async function removeMedication() {
    if (medicationId === undefined || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await deactivateMedication(db, medicationId);
      router.dismissTo('/medications');
    } catch (cause) {
      console.error('Could not deactivate medication:', cause);
      setError('İlaç kaldırılamadı. Lütfen tekrar deneyin.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  function confirmRemove() {
    if (isSaving || medicationId === undefined) return;
    Alert.alert(
      'İlacı kaldır',
      'Bu ilaç listeden kaldırılacak. Devam etmek istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Kaldır', style: 'destructive', onPress: () => { void removeMedication(); } },
      ],
    );
  }

  if (loading || loadError) {
    return (
      <Screen includeBottomInset>
        <Text style={styles.message}>{loadError ?? 'İlaç yükleniyor…'}</Text>
        {loadError ? (
          <Pressable accessibilityRole="button" style={styles.simpleButton}
            onPress={() => router.dismissTo('/medications')}>
            <Text style={styles.linkText}>İlaçlara dön</Text>
          </Pressable>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen includeBottomInset>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {medicationId === undefined ? 'İlaç Ekle' : 'İlacı Düzenle'}
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>İlaç adı</Text>
          <TextInput
            accessibilityLabel="İlaç adı"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="İlaç adını yazın"
            placeholderTextColor={colors.secondaryText}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Doz</Text>
          <TextInput
            accessibilityLabel="Doz"
            style={styles.input}
            value={dosage}
            onChangeText={setDosage}
            placeholder="Doz bilgisini yazın"
            placeholderTextColor={colors.secondaryText}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Not (isteğe bağlı)</Text>
          <TextInput
            accessibilityLabel="Not"
            style={[styles.input, styles.noteInput]}
            value={instructions}
            onChangeText={setInstructions}
            multiline
            textAlignVertical="top"
            placeholder="Ek not"
            placeholderTextColor={colors.secondaryText}
          />
        </View>

        <Text style={styles.sectionTitle}>Hatırlatma saatleri</Text>
        {schedules.map((schedule, index) => (
          <View key={schedule.key} style={styles.scheduleCard}>
            <View style={styles.scheduleHeader}>
              <Text style={styles.scheduleTitle}>Saat {index + 1}</Text>
              {schedules.length > 1 ? (
                <Pressable accessibilityRole="button" style={styles.removeTimeButton}
                  onPress={() => removeSchedule(schedule.key)}>
                  <Text style={styles.removeTimeText}>Saati kaldır</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.label}>Saat</Text>
                <TextInput
                  accessibilityLabel={`${index + 1}. hatırlatma saati`}
                  style={styles.timeInput}
                  keyboardType="number-pad"
                  value={schedule.hour}
                  onChangeText={(hour) => updateSchedule(schedule.key, { hour })}
                  placeholder="09"
                  placeholderTextColor={colors.secondaryText}
                />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.label}>Dakika</Text>
                <TextInput
                  accessibilityLabel={`${index + 1}. hatırlatma dakikası`}
                  style={styles.timeInput}
                  keyboardType="number-pad"
                  value={schedule.minute}
                  onChangeText={(minute) => updateSchedule(schedule.key, { minute })}
                  placeholder="00"
                  placeholderTextColor={colors.secondaryText}
                />
              </View>
            </View>

            <Text style={styles.label}>Tekrar</Text>
            <View style={styles.choiceRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: schedule.recurrence === 'daily' }}
                style={[styles.choice, schedule.recurrence === 'daily' && styles.choiceSelected]}
                onPress={() => updateSchedule(schedule.key, { recurrence: 'daily' })}>
                <Text style={[styles.choiceText, schedule.recurrence === 'daily' && styles.choiceTextSelected]}>
                  {schedule.recurrence === 'daily' ? '✓ ' : ''}Her gün
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: schedule.recurrence === 'selected' }}
                style={[styles.choice, schedule.recurrence === 'selected' && styles.choiceSelected]}
                onPress={() => updateSchedule(schedule.key, { recurrence: 'selected' })}>
                <Text style={[styles.choiceText, schedule.recurrence === 'selected' && styles.choiceTextSelected]}>
                  {schedule.recurrence === 'selected' ? '✓ ' : ''}Belirli günler
                </Text>
              </Pressable>
            </View>
            {schedule.recurrence === 'selected' ? (
              <View style={styles.weekdayRow}>
                {WEEKDAYS.map((weekday) => {
                  const selected = (schedule.selectedMask & weekday.bit) !== 0;
                  return (
                    <Pressable key={weekday.day} accessibilityRole="button"
                      accessibilityLabel={weekday.label}
                      accessibilityState={{ selected }}
                      style={[styles.weekday, selected && styles.choiceSelected]}
                      onPress={() => toggleWeekday(schedule.key, weekday.bit)}>
                      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                        {selected ? '✓ ' : ''}{weekday.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ))}

        <Pressable accessibilityRole="button" style={styles.addTimeButton} onPress={addSchedule}>
          <Text style={styles.linkText}>Saat ekle</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={isSaving}
          style={[styles.saveButton, isSaving && styles.disabled]} onPress={() => { void save(); }}>
          <Text style={styles.saveText}>{isSaving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={isSaving} style={styles.cancelButton}
          onPress={() => router.dismissTo('/medications')}>
          <Text style={styles.linkText}>İptal</Text>
        </Pressable>
        {medicationId !== undefined ? (
          <Pressable accessibilityRole="button" disabled={isSaving} style={styles.deactivateButton}
            onPress={confirmRemove}>
            <Text style={styles.deactivateText}>İlacı kaldır</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xlarge, gap: spacing.large },
  title: { color: colors.text, fontSize: fontSize.title, fontWeight: fontWeight.bold },
  field: { gap: spacing.small },
  label: { color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.button,
    color: colors.text,
    fontSize: fontSize.body,
    minHeight: touchTarget.primary,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  noteInput: { minHeight: 96 },
  sectionTitle: { color: colors.text, fontSize: 22, fontWeight: fontWeight.bold },
  scheduleCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.medium,
    gap: spacing.medium,
  },
  scheduleHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.small,
  },
  scheduleTitle: { color: colors.text, fontSize: 20, fontWeight: fontWeight.bold },
  removeTimeButton: { minHeight: touchTarget.minimum, justifyContent: 'center' },
  removeTimeText: { color: colors.danger, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.medium },
  timeField: { minWidth: 108, gap: spacing.small },
  timeInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.button,
    color: colors.text,
    fontSize: 24,
    minHeight: touchTarget.primary,
    minWidth: 108,
    paddingHorizontal: spacing.medium,
  },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
  choice: {
    minHeight: touchTarget.minimum,
    minWidth: 120,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.button,
    justifyContent: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  choiceSelected: { borderColor: colors.accent, borderWidth: 2, backgroundColor: '#EAF3FC' },
  choiceText: { color: colors.text, fontSize: fontSize.body },
  choiceTextSelected: { color: colors.accent, fontWeight: fontWeight.semibold },
  weekdayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
  weekday: {
    minHeight: touchTarget.minimum,
    minWidth: 72,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.button,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
  },
  addTimeButton: {
    minHeight: touchTarget.primary,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkText: { color: colors.accent, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  error: { color: colors.danger, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  saveButton: {
    minHeight: touchTarget.primary,
    backgroundColor: colors.accent,
    borderRadius: radius.button,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
  },
  saveText: { color: colors.surface, fontSize: fontSize.body, fontWeight: fontWeight.bold },
  disabled: { opacity: 0.6 },
  cancelButton: {
    minHeight: touchTarget.primary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deactivateButton: {
    minHeight: touchTarget.primary,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.button,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.large,
  },
  deactivateText: { color: colors.danger, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  message: { color: colors.text, fontSize: fontSize.body },
  simpleButton: { alignSelf: 'flex-start', minHeight: touchTarget.minimum, justifyContent: 'center' },
});
