import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius } from '@/theme/tokens';

type Props = {
  uri: string | null;
  size: number;
  showEmptyMessage?: boolean;
};

export function MedicationPhoto({ uri, size, showEmptyMessage = false }: Props) {
  const [failedUri, setFailedUri] = useState<string | null>(null);

  if (!uri || failedUri === uri) {
    if (!showEmptyMessage) return null;
    return (
      <Text style={styles.message}>
        {uri ? 'Fotoğraf görüntülenemedi.' : 'Fotoğraf eklenmedi.'}
      </Text>
    );
  }

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit="cover"
        accessibilityLabel="İlaç fotoğrafı"
        onError={() => setFailedUri(uri)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.background },
  image: { width: '100%', height: '100%' },
  message: { color: colors.secondaryText, fontSize: fontSize.body },
});
