import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme/tokens';

export default function TodayScreen() {
  const today = new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

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
      <Text style={styles.date}>{today}</Text>
      <View style={styles.card}>
        <Text style={styles.emptyText}>Bugünkü ilaçlar burada görünecek.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.small,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  settingsButton: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.medium,
    borderRadius: radius.button,
  },
  settingsText: {
    color: colors.accent,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  date: {
    color: colors.secondaryText,
    fontSize: fontSize.body,
    marginTop: spacing.small,
    textTransform: 'capitalize',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.large,
    marginTop: spacing.xlarge,
  },
  emptyText: {
    color: colors.text,
    fontSize: fontSize.body,
  },
});
