import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';

import { DATABASE_NAME, initializeDatabase } from '@/db/database';
import { colors, fontSize } from '@/theme/tokens';

function DatabaseLoading() {
  return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Uygulama hazırlanıyor…</Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <Suspense fallback={<DatabaseLoading />}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={initializeDatabase} useSuspense>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.text,
    fontSize: fontSize.body,
  },
});
