import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { getActiveMedications } from '@/db/medications';
import { colors, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme/tokens';
import type { MedicationWithSchedules } from '@/types/medication';
import { formatTime, formatWeekdays } from '@/utils/medication';

export default function MedicationsScreen() {
  const db = useSQLiteContext();
  const [medications, setMedications] = useState<MedicationWithSchedules[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestToken = useRef(0);

  const loadMedications = useCallback(() => {
    const token = ++requestToken.current;
    setLoading(true);
    setError(false);
    getActiveMedications(db)
      .then((items) => {
        if (token === requestToken.current) setMedications(items);
      })
      .catch((cause: unknown) => {
        console.error('Could not load medications:', cause);
        if (token === requestToken.current) setError(true);
      })
      .finally(() => {
        if (token === requestToken.current) setLoading(false);
      });
    return () => { requestToken.current++; };
  }, [db]);

  useFocusEffect(loadMedications);

  return (
    <Screen>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>İlaçlar</Text>
        <Link href="/medication/new" asChild>
          <Pressable accessibilityRole="button" style={styles.addButton}>
            <Text style={styles.addButtonText}>İlaç Ekle</Text>
          </Pressable>
        </Link>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <Text style={styles.message}>İlaçlar yükleniyor…</Text> : null}
        {!loading && error ? (
          <View style={styles.card}>
            <Text style={styles.message}>İlaçlar yüklenemedi. Lütfen tekrar deneyin.</Text>
            <Pressable
              accessibilityRole="button"
              style={styles.retryButton}
              onPress={() => { loadMedications(); }}>
              <Text style={styles.actionText}>Tekrar dene</Text>
            </Pressable>
          </View>
        ) : null}
        {!loading && !error && medications.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.message}>Henüz ilaç eklenmedi.</Text>
          </View>
        ) : null}
        {!loading && !error && medications.map((medication) => (
          <View key={medication.id} style={styles.card}>
            <Text style={styles.medicationName}>{medication.name}</Text>
            <Text style={styles.dosage}>{medication.dosage}</Text>
            <View style={styles.schedules}>
              {medication.schedules.map((schedule) => (
                <Text key={schedule.id} style={styles.scheduleText}>
                  {formatTime(schedule)} · {formatWeekdays(schedule.weekdayMask)}
                </Text>
              ))}
            </View>
            <Link
              href={{ pathname: '/medication/[id]', params: { id: String(medication.id) } }}
              asChild>
              <Pressable accessibilityRole="button" style={styles.editButton}>
                <Text style={styles.actionText}>Düzenle</Text>
              </Pressable>
            </Link>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.medium,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  addButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.button,
    minHeight: touchTarget.primary,
    justifyContent: 'center',
    paddingHorizontal: spacing.medium,
  },
  addButtonText: {
    color: colors.surface,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  content: {
    paddingTop: spacing.large,
    paddingBottom: spacing.xlarge,
    gap: spacing.medium,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.large,
    gap: spacing.small,
  },
  medicationName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: fontWeight.bold,
  },
  dosage: {
    color: colors.text,
    fontSize: fontSize.body,
  },
  schedules: {
    gap: spacing.small,
    marginTop: spacing.small,
  },
  scheduleText: {
    color: colors.secondaryText,
    fontSize: fontSize.body,
  },
  message: {
    color: colors.text,
    fontSize: fontSize.body,
  },
  editButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.medium,
    marginLeft: -spacing.medium,
    marginTop: spacing.small,
  },
  retryButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.medium,
    marginLeft: -spacing.medium,
  },
  actionText: {
    color: colors.accent,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
});
