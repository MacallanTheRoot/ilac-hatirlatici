import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme/tokens';

export default function SettingsScreen() {
  return (
    <Screen>
      <Link href="/" asChild>
        <Pressable accessibilityRole="button" style={styles.backButton}>
          <Text style={styles.backText}>Geri</Text>
        </Pressable>
      </Link>
      <Text accessibilityRole="header" style={styles.title}>Ayarlar</Text>
      <View style={styles.card}>
        <Text style={styles.description}>Hatırlatıcı ayarları burada görünecek.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.medium,
    marginLeft: -spacing.medium,
    borderRadius: radius.button,
  },
  backText: {
    color: colors.accent,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginTop: spacing.small,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.large,
    marginTop: spacing.xlarge,
  },
  description: {
    color: colors.text,
    fontSize: fontSize.body,
  },
});
