import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { getDoseLogsForRange } from '@/db/doseLogs';
import { getMedicationTimeline } from '@/db/medications';
import {
  formatLocalDate, formatLocalTime, localDayOffset, localDayStart, occurrencesForLocalDate,
} from '@/services/doseOccurrences';
import { colors, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme/tokens';
import type { DoseOccurrence } from '@/types/medication';

type HistoryDay = { date: Date; occurrences: DoseOccurrence[] };

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const [days, setDays] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestToken = useRef(0);

  const loadHistory = useCallback(() => {
    const token = ++requestToken.current;
    const now = Date.now();
    const today = localDayStart(new Date(now));
    const firstDay = localDayOffset(today, -6);
    setLoading(true);
    setError(false);
    Promise.all([
      getMedicationTimeline(db),
      getDoseLogsForRange(db, firstDay.getTime(), localDayOffset(today, 1).getTime()),
    ])
      .then(([medications, logs]) => {
        if (token !== requestToken.current) return;
        const reconstructed: HistoryDay[] = [];
        for (let offset = 0; offset < 7; offset++) {
          const date = localDayOffset(today, -offset);
          const occurrences = occurrencesForLocalDate(date, medications, logs)
            .filter((occurrence) => offset !== 0 || occurrence.scheduledAt <= now);
          if (occurrences.length > 0) reconstructed.push({ date, occurrences });
        }
        setDays(reconstructed);
      })
      .catch((cause: unknown) => {
        console.error('Could not load dose history:', cause);
        if (token === requestToken.current) setError(true);
      })
      .finally(() => {
        if (token === requestToken.current) setLoading(false);
      });
  }, [db]);

  useFocusEffect(useCallback(() => {
    loadHistory();
    return () => { requestToken.current++; };
  }, [loadHistory]));

  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>Geçmiş</Text>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <Text style={styles.message}>Geçmiş yükleniyor…</Text> : null}
        {!loading && error ? (
          <View style={styles.card}>
            <Text style={styles.message}>Geçmiş yüklenemedi.</Text>
            <Pressable accessibilityRole="button" style={styles.retryButton} onPress={loadHistory}>
              <Text style={styles.retryText}>Tekrar dene</Text>
            </Pressable>
          </View>
        ) : null}
        {!loading && !error && days.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.message}>Son yedi gün için kayıtlı ilaç saati yok.</Text>
          </View>
        ) : null}
        {!loading && !error && days.map((day) => (
          <View key={day.date.getTime()} style={styles.dayGroup}>
            <Text style={styles.dayTitle}>{formatLocalDate(day.date)}</Text>
            {day.occurrences.map((occurrence) => (
              <View
                key={`${occurrence.medicationId}:${occurrence.scheduleId}:${occurrence.scheduledAt}`}
                style={styles.card}>
                <Text style={styles.entryTitle}>
                  {formatLocalTime(occurrence.scheduledAt)}  {occurrence.medicationName}
                </Text>
                <Text style={styles.dosage}>{occurrence.dosage}</Text>
                {occurrence.status === 'taken' ? (
                  <Text style={styles.status}>
                    ✓ {occurrence.takenAt !== null
                      ? `${formatLocalTime(occurrence.takenAt)}'te alındı`
                      : 'Alındı'}
                  </Text>
                ) : (
                  <Text style={styles.status}>Alındığı doğrulanmadı</Text>
                )}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSize.title, fontWeight: fontWeight.bold },
  content: { paddingTop: spacing.large, paddingBottom: spacing.xlarge, gap: spacing.large },
  dayGroup: { gap: spacing.medium },
  dayTitle: { color: colors.text, fontSize: 22, fontWeight: fontWeight.bold },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.card, padding: spacing.large, gap: spacing.small,
  },
  entryTitle: { color: colors.text, fontSize: 22, fontWeight: fontWeight.bold },
  dosage: { color: colors.text, fontSize: fontSize.body },
  status: { color: colors.secondaryText, fontSize: fontSize.body },
  message: { color: colors.text, fontSize: fontSize.body },
  retryButton: { minHeight: touchTarget.minimum, justifyContent: 'center', alignSelf: 'flex-start' },
  retryText: { color: colors.accent, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
});
