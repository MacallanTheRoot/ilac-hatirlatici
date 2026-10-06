import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MedicationPhoto } from '@/components/MedicationPhoto';
import { Screen } from '@/components/Screen';
import { getDoseLogsForRange, markDoseTaken } from '@/db/doseLogs';
import { getMedicationTimeline } from '@/db/medications';
import {
  formatLocalDate, formatLocalTime, localDayOffset, localDayStart, occurrencesForLocalDate,
} from '@/services/doseOccurrences';
import { colors, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme/tokens';
import type { DoseOccurrence } from '@/types/medication';

function occurrenceKey(occurrence: DoseOccurrence): string {
  return `${occurrence.medicationId}:${occurrence.scheduleId}:${occurrence.scheduledAt}`;
}

export default function TodayScreen() {
  const db = useSQLiteContext();
  const [now, setNow] = useState<number | null>(null);
  const [occurrences, setOccurrences] = useState<DoseOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const loadingToken = useRef(0);
  const dayStartRef = useRef(0);
  const loggingRef = useRef(false);

  const loadToday = useCallback((timestamp: number) => {
    const token = ++loadingToken.current;
    const day = localDayStart(new Date(timestamp));
    setLoading(true);
    setLoadError(false);
    Promise.all([
      getMedicationTimeline(db),
      getDoseLogsForRange(db, day.getTime(), localDayOffset(day, 1).getTime()),
    ])
      .then(([medications, logs]) => {
        if (token === loadingToken.current) {
          setOccurrences(occurrencesForLocalDate(day, medications, logs, true));
          setActionErrorKey(null);
        }
      })
      .catch((cause: unknown) => {
        console.error('Could not load today doses:', cause);
        if (token === loadingToken.current) setLoadError(true);
      })
      .finally(() => {
        if (token === loadingToken.current) setLoading(false);
      });
  }, [db]);

  useFocusEffect(useCallback(() => {
    const current = Date.now();
    setNow(current);
    dayStartRef.current = localDayStart(new Date(current)).getTime();
    loadToday(current);
    const timer = setInterval(() => {
      const next = Date.now();
      setNow(next);
      const nextDayStart = localDayStart(new Date(next)).getTime();
      if (nextDayStart !== dayStartRef.current) {
        dayStartRef.current = nextDayStart;
        loadToday(next);
      }
    }, 60_000);
    return () => {
      clearInterval(timer);
      loadingToken.current++;
    };
  }, [loadToday]));

  async function confirmTaken(occurrence: DoseOccurrence) {
    if (loggingRef.current || occurrence.status === 'taken') return;
    loggingRef.current = true;
    const key = occurrenceKey(occurrence);
    setBusyKey(key);
    setActionErrorKey(null);
    try {
      const log = await markDoseTaken(db, {
        medicationId: occurrence.medicationId,
        scheduleId: occurrence.scheduleId,
        scheduledAt: occurrence.scheduledAt,
      });
      setOccurrences((current) => current.map((item) => occurrenceKey(item) === key
        ? { ...item, doseLogId: log.id, status: log.status, takenAt: log.takenAt }
        : item));
    } catch (cause) {
      console.error('Could not confirm dose:', cause);
      setActionErrorKey(key);
    } finally {
      loggingRef.current = false;
      setBusyKey(null);
    }
  }

  const takenCount = occurrences.filter((occurrence) => occurrence.status === 'taken').length;
  const pastUnconfirmed = occurrences.find((occurrence) =>
    now !== null && occurrence.status !== 'taken' && occurrence.scheduledAt < now);
  const nextOccurrence = occurrences.find((occurrence) =>
    now !== null && occurrence.status !== 'taken' && occurrence.scheduledAt >= now);
  const summary = pastUnconfirmed
    ? `${formatLocalTime(pastUnconfirmed.scheduledAt)} için alındığı doğrulanmadı`
    : nextOccurrence
      ? `Sıradaki: ${formatLocalTime(nextOccurrence.scheduledAt)}`
      : occurrences.length > 0
        ? 'Bugünkü ilaçlar tamamlandı.'
        : null;

  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>Bugün</Text>
        <Link href="/settings" asChild>
          <Pressable accessibilityRole="button" style={styles.settingsButton}>
            <Text style={styles.settingsText}>Ayarlar</Text>
          </Pressable>
        </Link>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.date}>
          {now === null ? 'Tarih yükleniyor…' : formatLocalDate(new Date(now))}
        </Text>
        {now !== null ? <Text style={styles.clock}>{formatLocalTime(now)}</Text> : null}
        {!loading && !loadError ? (
          <View style={styles.summaryCard}>
            <Text style={styles.progress}>{takenCount} / {occurrences.length} alındı</Text>
            {summary ? <Text style={styles.summary}>{summary}</Text> : null}
          </View>
        ) : null}

        {loading ? <Text style={styles.message}>Bugünkü ilaçlar yükleniyor…</Text> : null}
        {!loading && loadError ? (
          <View style={styles.card}>
            <Text style={styles.message}>Bugünkü ilaçlar yüklenemedi.</Text>
            <Pressable accessibilityRole="button" style={styles.retryButton}
              onPress={() => loadToday(Date.now())}>
              <Text style={styles.retryText}>Tekrar dene</Text>
            </Pressable>
          </View>
        ) : null}
        {!loading && !loadError && occurrences.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.message}>Bugün için kayıtlı ilaç yok.</Text>
          </View>
        ) : null}
        {!loading && !loadError && occurrences.map((occurrence) => {
          const key = occurrenceKey(occurrence);
          const taken = occurrence.status === 'taken';
          return (
            <View key={key} style={styles.card}>
              {occurrence.photoPath ? (
                <MedicationPhoto uri={occurrence.photoPath} size={88} />
              ) : null}
              <Text style={styles.medicationName}>{occurrence.medicationName}</Text>
              <Text style={styles.dosage}>{occurrence.dosage}</Text>
              <Text style={styles.scheduledTime}>{formatLocalTime(occurrence.scheduledAt)}</Text>
              {occurrence.instructions ? (
                <Text style={styles.instructions}>{occurrence.instructions}</Text>
              ) : null}
              {taken ? (
                <View style={styles.takenBlock}>
                  <Text style={styles.takenText}>✓ Alındı</Text>
                  {occurrence.takenAt !== null ? (
                    <Text style={styles.takenTime}>
                      {formatLocalTime(occurrence.takenAt)}&apos;te alındı
                    </Text>
                  ) : null}
                </View>
              ) : (
                <>
                  <Text style={styles.statusText}>
                    {now !== null && occurrence.scheduledAt < now
                      ? 'Alındığı doğrulanmadı' : 'Bekliyor'}
                  </Text>
                  <Pressable accessibilityRole="button" disabled={busyKey !== null}
                    style={[styles.takenButton, busyKey !== null && styles.disabled]}
                    onPress={() => { void confirmTaken(occurrence); }}>
                    <Text style={styles.buttonText}>
                      {busyKey === key ? 'Kaydediliyor…' : 'Aldım'}
                    </Text>
                  </Pressable>
                  {actionErrorKey === key ? (
                    <Text style={styles.error}>
                      İlaç alındı olarak kaydedilemedi. Lütfen tekrar deneyin.
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    justifyContent: 'space-between', gap: spacing.small,
  },
  title: { color: colors.text, fontSize: fontSize.title, fontWeight: fontWeight.bold },
  settingsButton: {
    minHeight: touchTarget.minimum, justifyContent: 'center',
    paddingHorizontal: spacing.medium, borderRadius: radius.button,
  },
  settingsText: { color: colors.accent, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  content: { paddingTop: spacing.medium, paddingBottom: spacing.xlarge, gap: spacing.medium },
  date: { color: colors.secondaryText, fontSize: fontSize.body, textTransform: 'capitalize' },
  clock: { color: colors.text, fontSize: 36, fontWeight: fontWeight.bold },
  summaryCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.card, padding: spacing.large, gap: spacing.small,
  },
  progress: { color: colors.text, fontSize: 22, fontWeight: fontWeight.bold },
  summary: { color: colors.text, fontSize: fontSize.body },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.card, padding: spacing.large, gap: spacing.small,
  },
  medicationName: { color: colors.text, fontSize: 24, fontWeight: fontWeight.bold },
  dosage: { color: colors.text, fontSize: fontSize.body },
  scheduledTime: { color: colors.text, fontSize: 32, fontWeight: fontWeight.bold },
  instructions: { color: colors.secondaryText, fontSize: fontSize.body },
  statusText: { color: colors.secondaryText, fontSize: fontSize.body, marginTop: spacing.small },
  takenBlock: { gap: spacing.small, marginTop: spacing.small },
  takenText: { color: colors.text, fontSize: 22, fontWeight: fontWeight.bold },
  takenTime: { color: colors.text, fontSize: fontSize.body },
  takenButton: {
    minHeight: touchTarget.primary, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.accent, borderRadius: radius.button,
    paddingHorizontal: spacing.medium, marginTop: spacing.small,
  },
  buttonText: { color: colors.surface, fontSize: fontSize.body, fontWeight: fontWeight.bold },
  disabled: { opacity: 0.6 },
  message: { color: colors.text, fontSize: fontSize.body },
  retryButton: { minHeight: touchTarget.minimum, justifyContent: 'center', alignSelf: 'flex-start' },
  retryText: { color: colors.accent, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  error: { color: colors.danger, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
});
