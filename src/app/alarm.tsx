import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

import { MedicationPhoto } from '@/components/MedicationPhoto';
import { Screen } from '@/components/Screen';
import { getDoseLogsForRange } from '@/db/doseLogs';
import { getMedicationTimeline } from '@/db/medications';
import { performMedicationDoseAction } from '@/notifications/actions';
import { SNOOZE_MINUTES, type DoseNotificationIdentity } from '@/notifications/constants';
import { formatLocalTime, localDayOffset, localDayStart, occurrencesForLocalDate } from '@/services/doseOccurrences';
import { colors, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme/tokens';
import type { DoseOccurrence } from '@/types/medication';

function positiveInteger(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export default function AlarmScreen() {
  const params = useLocalSearchParams<{
    medicationId: string;
    scheduleId: string;
    scheduledAt: string;
  }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const medicationId = positiveInteger(params.medicationId);
  const scheduleId = positiveInteger(params.scheduleId);
  const scheduledAt = positiveInteger(params.scheduledAt);
  const invalidParams = medicationId === null || scheduleId === null || scheduledAt === null;
  const [occurrence, setOccurrence] = useState<DoseOccurrence | null>(null);
  const [canSnooze, setCanSnooze] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (medicationId === null || scheduleId === null || scheduledAt === null) return;
    let active = true;
    const day = localDayStart(new Date(scheduledAt));
    void Promise.all([
      getMedicationTimeline(db),
      getDoseLogsForRange(db, day.getTime(), localDayOffset(day, 1).getTime()),
    ]).then(([medications, logs]) => {
      if (!active) return;
      const match = occurrencesForLocalDate(day, medications, logs).find((item) =>
        item.medicationId === medicationId
        && item.scheduleId === scheduleId
        && item.scheduledAt === scheduledAt);
      if (!match) {
        setError('Hatırlatma bulunamadı.');
        return;
      }
      const medication = medications.find((item) => item.id === medicationId);
      setCanSnooze(Boolean(medication?.isActive
        && medication.schedules.some((item) => item.id === scheduleId && item.isActive)));
      setOccurrence(match);
    }).catch((cause: unknown) => {
      console.error('Could not load alarm dose:', cause);
      if (active) setError('Hatırlatma yüklenemedi.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [db, medicationId, scheduleId, scheduledAt]);

  async function act(action: 'taken' | 'snooze') {
    if (!occurrence || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const identity: DoseNotificationIdentity = {
      medicationId: occurrence.medicationId,
      scheduleId: occurrence.scheduleId,
      scheduledAt: occurrence.scheduledAt,
    };
    try {
      const result = await performMedicationDoseAction(identity, action, db);
      if (result === 'taken' || result === 'snoozed' || result === 'alreadyTaken') {
        router.dismissTo('/');
      } else {
        setError('Bu hatırlatma artık kullanılamıyor.');
      }
    } catch (cause) {
      console.error('Could not save alarm action:', cause);
      setError(action === 'taken'
        ? 'İlaç alındı olarak kaydedilemedi. Lütfen tekrar deneyin.'
        : 'Hatırlatma ertelenemedi. Lütfen tekrar deneyin.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen includeBottomInset>
      <StatusBar hidden />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>İlaç hatırlatması</Text>
        {loading && !invalidParams ? <Text style={styles.message}>Hatırlatma yükleniyor…</Text> : null}
        {occurrence ? (
          <View style={styles.dose}>
            {occurrence.photoPath ? <MedicationPhoto uri={occurrence.photoPath} size={220} /> : null}
            <Text style={styles.name}>{occurrence.medicationName}</Text>
            <Text style={styles.dosage}>{occurrence.dosage}</Text>
            <Text style={styles.time}>{formatLocalTime(occurrence.scheduledAt)}</Text>
            {occurrence.status === 'taken' ? (
              <Text style={styles.taken}>✓ Alındı</Text>
            ) : (
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={busy} style={[styles.takenButton, busy && styles.disabled]}
                  onPress={() => { void act('taken'); }}>
                  <Text style={styles.takenButtonText}>{busy ? 'Kaydediliyor…' : 'Aldım'}</Text>
                </Pressable>
                {canSnooze ? (
                  <Pressable accessibilityRole="button" disabled={busy} style={[styles.snoozeButton, busy && styles.disabled]}
                    onPress={() => { void act('snooze'); }}>
                    <Text style={styles.snoozeButtonText}>{SNOOZE_MINUTES} dk ertele</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        ) : null}
        {invalidParams || error ? (
          <Text style={styles.error}>{error ?? 'Hatırlatma açılamadı.'}</Text>
        ) : null}
        {(invalidParams || !loading) && (!occurrence || occurrence.status === 'taken') ? (
          <Pressable accessibilityRole="button" style={styles.closeButton} onPress={() => router.dismissTo('/')}>
            <Text style={styles.closeText}>Kapat</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: spacing.large, paddingBottom: spacing.large },
  title: { color: colors.text, fontSize: fontSize.title, fontWeight: fontWeight.bold, textAlign: 'center' },
  dose: { alignItems: 'center', gap: spacing.medium },
  name: { color: colors.text, fontSize: 28, fontWeight: fontWeight.bold, textAlign: 'center' },
  dosage: { color: colors.text, fontSize: 22, fontWeight: fontWeight.semibold, textAlign: 'center' },
  time: { color: colors.text, fontSize: 36, fontWeight: fontWeight.bold },
  actions: { alignSelf: 'stretch', gap: spacing.medium, marginTop: spacing.medium },
  takenButton: { minHeight: 72, backgroundColor: colors.accent, borderRadius: radius.button,
    alignItems: 'center', justifyContent: 'center', padding: spacing.small },
  takenButtonText: { color: colors.surface, fontSize: 26, fontWeight: fontWeight.bold },
  snoozeButton: { minHeight: 72, backgroundColor: colors.surface, borderColor: colors.accent,
    borderWidth: 2, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', padding: spacing.small },
  snoozeButtonText: { color: colors.accent, fontSize: 24, fontWeight: fontWeight.bold },
  taken: { color: colors.text, fontSize: 24, fontWeight: fontWeight.bold },
  message: { color: colors.text, fontSize: fontSize.body, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSize.body, fontWeight: fontWeight.semibold,
    textAlign: 'center' },
  closeButton: { minHeight: touchTarget.primary, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.accent, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  disabled: { opacity: 0.6 },
});
