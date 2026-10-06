import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { MedicationForm } from '@/components/MedicationForm';
import { Screen } from '@/components/Screen';
import { colors, fontSize, fontWeight, spacing, touchTarget } from '@/theme/tokens';

export default function EditMedicationScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return (
      <Screen>
        <Text style={styles.message}>İlaç bulunamadı.</Text>
        <Link href="/medications" asChild>
          <Pressable accessibilityRole="button" style={styles.backButton}>
            <Text style={styles.backText}>İlaçlara dön</Text>
          </Pressable>
        </Link>
      </Screen>
    );
  }
  return <MedicationForm key={id} medicationId={id} />;
}

const styles = StyleSheet.create({
  message: { color: colors.text, fontSize: fontSize.body },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    marginTop: spacing.medium,
  },
  backText: {
    color: colors.accent,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
});
