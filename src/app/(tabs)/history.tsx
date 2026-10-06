import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme/tokens';

export default function HistoryScreen() {
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>Geçmiş</Text>
      <View style={styles.card}>
        <Text style={styles.description}>İlaç kullanım geçmişi burada görünecek.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
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
