import { Tabs } from 'expo-router';

import { colors, fontSize, fontWeight, touchTarget } from '@/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.secondaryText,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          minHeight: touchTarget.primary + 8,
        },
        tabBarItemStyle: { minHeight: touchTarget.primary },
        tabBarLabelStyle: {
          fontSize: fontSize.secondary,
          fontWeight: fontWeight.semibold,
        },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Bugün' }} />
      <Tabs.Screen name="medications" options={{ title: 'İlaçlar' }} />
      <Tabs.Screen name="history" options={{ title: 'Geçmiş' }} />
    </Tabs>
  );
}
