import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

import { MedicationPhoto } from '@/components/MedicationPhoto';
import { Screen } from '@/components/Screen';
import { getDoseLogByIdentity, getDoseLogsForRange } from '@/db/doseLogs';
import { getMedicationById, getMedicationTimeline } from '@/db/medications';
import { performMedicationDoseAction } from '@/notifications/actions';
import { alarmIdentityKey, isActiveAlarmOccurrence, simultaneousAlarmQueue, sortAlarmOccurrences } from '@/notifications/alarmQueue';
import { SNOOZE_MINUTES, parseMedicationNotificationPayload, type DoseNotificationIdentity } from '@/notifications/constants';
import { closeFullScreenAlarmActivity, releaseAlarmLaunch } from '@/notifications/fullScreenAlarm';
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
    kind?: string;
    source?: string;
  }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const medicationId = positiveInteger(params.medicationId);
  const scheduleId = positiveInteger(params.scheduleId);
  const scheduledAt = positiveInteger(params.scheduledAt);
  const invalidParams = medicationId === null || scheduleId === null || scheduledAt === null;
  const identityKey = `${medicationId}:${scheduleId}:${scheduledAt}:${params.kind ?? 'dose'}:${params.source ?? 'fullscreen'}`;
  const [queue, setQueue] = useState<DoseOccurrence[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const completed = useRef(new Set<string>());
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const visibleOccurrence = loadedKey === identityKey
    ? queue.find((item) => alarmIdentityKey(item) === selectedKey) ?? null : null;
  const progress = Math.max(1, queue.findIndex((item) => alarmIdentityKey(item) === selectedKey) + 1);
  const loading = !invalidParams && loadedKey !== identityKey;
  const visibleError = loadedKey === identityKey ? error : null;

  useEffect(() => () => { releaseAlarmLaunch(); }, []);

  useEffect(() => {
    if (invalidParams || (loadedKey === identityKey && error)) releaseAlarmLaunch();
  }, [invalidParams, loadedKey, identityKey, error]);

  async function closeAlarm() {
    try {
      if (await closeFullScreenAlarmActivity()) return;
    } catch (cause) {
      console.warn('Could not close full-screen alarm Activity:', cause);
    }
    releaseAlarmLaunch();
    router.dismissTo('/');
  }

  useEffect(() => {
    if (medicationId === null || scheduleId === null || scheduledAt === null) return;
    let active = true;
    const day = localDayStart(new Date(scheduledAt));
    void Promise.all([
      getMedicationTimeline(db),
      getDoseLogsForRange(db, day.getTime(), localDayOffset(day, 1).getTime()),
    ]).then(([medications, logs]) => {
      if (!active) return;
      const occurrences = occurrencesForLocalDate(day, medications, logs);
      const match = occurrences.find((item) =>
        item.medicationId === medicationId
        && item.scheduleId === scheduleId
        && item.scheduledAt === scheduledAt);
      if (!match || scheduledAt > Date.now() + 60_000
        || Date.now() - scheduledAt > 24 * 60 * 60_000) {
        setError('Hatırlatma bulunamadı.');
        return;
      }
      const group = simultaneousAlarmQueue(occurrences, medications,
        { medicationId, scheduleId, scheduledAt }, params.kind === 'snooze' ? 'snooze' : 'dose');
      if (!group.length) { setError('Hatırlatma bulunamadı.'); return; }
      completed.current.clear();
      setQueue(group);
      setSelectedKey(params.source === 'tap' ? alarmIdentityKey(match) : alarmIdentityKey(group[0]));
      setError(null);
    }).catch((cause: unknown) => {
      console.error('Could not load alarm dose:', cause);
      if (active) setError('Hatırlatma yüklenemedi.');
    }).finally(() => {
      if (active) setLoadedKey(identityKey);
    });
    return () => { active = false; };
  }, [db, identityKey, medicationId, scheduleId, scheduledAt, params.kind, params.source]);

  async function nextPresentedDose(): Promise<DoseOccurrence | null> {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const anchor = visibleOccurrence?.scheduledAt ?? scheduledAt ?? 0;
    const candidates = presented.flatMap((notification) => {
      const payload = parseMedicationNotificationPayload(notification.request.content.data);
      return payload ? [payload] : [];
    }).filter((payload) => payload.scheduledAt <= Date.now()
      && payload.scheduledAt >= Date.now() - 24 * 60 * 60_000
      && Math.abs(payload.scheduledAt - anchor) <= 2 * 60_000);
    if (!candidates.length) return null;
    const medications = await getMedicationTimeline(db);
    const days = [...new Set(candidates.map((item) => localDayStart(new Date(item.scheduledAt)).getTime()))];
    const all: DoseOccurrence[] = [];
    for (const start of days) {
      const day = new Date(start);
      const logs = await getDoseLogsForRange(db, start, localDayOffset(day, 1).getTime());
      all.push(...occurrencesForLocalDate(day, medications, logs));
    }
    return sortAlarmOccurrences(all.filter((item) => candidates.some((candidate) =>
      alarmIdentityKey(candidate) === alarmIdentityKey(item)
      && isActiveAlarmOccurrence(item, medications, candidate.kind))
      && !completed.current.has(alarmIdentityKey(item))), medications)[0] ?? null;
  }

  async function nextQueuedDose(): Promise<DoseOccurrence | null> {
    for (const item of queue) {
      if (completed.current.has(alarmIdentityKey(item))) continue;
      const [medication, log] = await Promise.all([
        getMedicationById(db, item.medicationId),
        getDoseLogByIdentity(db, item),
      ]);
      if (medication?.schedules.some((schedule) => schedule.id === item.scheduleId && schedule.isActive)
        && log?.status !== 'taken' && log?.status !== 'snoozed') return item;
      completed.current.add(alarmIdentityKey(item));
    }
    return null;
  }

  async function act(action: 'taken' | 'snooze') {
    if (!visibleOccurrence || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const identity: DoseNotificationIdentity = {
      medicationId: visibleOccurrence.medicationId,
      scheduleId: visibleOccurrence.scheduleId,
      scheduledAt: visibleOccurrence.scheduledAt,
    };
    try {
      const result = await performMedicationDoseAction(identity, action, db, undefined,
        params.kind === 'snooze' ? 'snooze' : 'dose');
      if (result === 'taken' || result === 'snoozed' || result === 'alreadyTaken') {
        completed.current.add(alarmIdentityKey(identity));
        const next = await nextQueuedDose();
        if (next) setSelectedKey(alarmIdentityKey(next));
        else {
          const adjacent = await nextPresentedDose().catch((cause: unknown) => {
            console.warn('Could not inspect adjacent reminders; notifications remain accessible:', cause);
            return null;
          });
          if (adjacent) {
            setQueue((existing) => [...existing, adjacent]);
            setSelectedKey(alarmIdentityKey(adjacent));
          } else await closeAlarm();
        }
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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>İlaç hatırlatması</Text>
        {queue.length > 1 && visibleOccurrence ? <Text style={styles.progress}>{progress} / {queue.length}</Text> : null}
        {loading && !invalidParams ? <Text style={styles.message}>Hatırlatma yükleniyor…</Text> : null}
        {visibleOccurrence ? (
          <View style={styles.dose}>
            {visibleOccurrence.photoPath ? <MedicationPhoto uri={visibleOccurrence.photoPath} size={220} /> : null}
            <Text style={styles.name}>{visibleOccurrence.medicationName}</Text>
            <Text style={styles.dosage}>{visibleOccurrence.dosage}</Text>
            <Text style={styles.time}>{formatLocalTime(visibleOccurrence.scheduledAt)}</Text>
            {visibleOccurrence.status === 'taken' ? <Text style={styles.taken}>✓ Alındı</Text> : null}
          </View>
        ) : null}
        {invalidParams || visibleError ? (
          <Text style={styles.error}>{visibleError ?? 'Hatırlatma açılamadı.'}</Text>
        ) : null}
        {(invalidParams || !loading) && (!visibleOccurrence || visibleOccurrence.status === 'taken' || visibleError) ? (
          <Pressable accessibilityRole="button" style={styles.closeButton} onPress={() => { void closeAlarm(); }}>
            <Text style={styles.closeText}>Kapat</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {visibleOccurrence && visibleOccurrence.status !== 'taken' ? (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy} style={[styles.takenButton, busy && styles.disabled]}
            onPress={() => { void act('taken'); }}>
            <Text style={styles.takenButtonText}>{busy ? 'Kaydediliyor…' : 'Aldım'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} style={[styles.snoozeButton, busy && styles.disabled]}
            onPress={() => { void act('snooze'); }}>
            <Text style={styles.snoozeButtonText}>{SNOOZE_MINUTES} dk ertele</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', gap: spacing.large, paddingBottom: spacing.large },
  title: { color: colors.text, fontSize: fontSize.title, fontWeight: fontWeight.bold, textAlign: 'center' },
  dose: { alignItems: 'center', gap: spacing.medium },
  name: { color: colors.text, fontSize: 28, fontWeight: fontWeight.bold, textAlign: 'center' },
  dosage: { color: colors.text, fontSize: 22, fontWeight: fontWeight.semibold, textAlign: 'center' },
  time: { color: colors.text, fontSize: 36, fontWeight: fontWeight.bold },
  actions: { gap: spacing.medium, paddingTop: spacing.small, paddingBottom: spacing.small },
  takenButton: { minHeight: 72, backgroundColor: colors.accent, borderRadius: radius.button,
    alignItems: 'center', justifyContent: 'center', padding: spacing.small },
  takenButtonText: { color: colors.surface, fontSize: 26, fontWeight: fontWeight.bold },
  snoozeButton: { minHeight: 72, backgroundColor: colors.surface, borderColor: colors.accent,
    borderWidth: 2, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', padding: spacing.small },
  snoozeButtonText: { color: colors.accent, fontSize: 24, fontWeight: fontWeight.bold },
  taken: { color: colors.text, fontSize: 24, fontWeight: fontWeight.bold },
  message: { color: colors.text, fontSize: fontSize.body, textAlign: 'center' },
  progress: { color: colors.secondaryText, fontSize: fontSize.body, fontWeight: fontWeight.semibold, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSize.body, fontWeight: fontWeight.semibold,
    textAlign: 'center' },
  closeButton: { minHeight: touchTarget.primary, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.accent, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  disabled: { opacity: 0.6 },
});
