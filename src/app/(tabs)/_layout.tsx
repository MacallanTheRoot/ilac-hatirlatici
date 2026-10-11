import { Tabs } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View } from 'react-native';

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
          minHeight: 78,
        },
        tabBarItemStyle: { minHeight: touchTarget.primary, paddingTop: 4 },
        tabBarLabelStyle: {
          fontSize: fontSize.secondary,
          fontWeight: fontWeight.semibold,
        },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Bugün', tabBarAccessibilityLabel: 'Bugün, takvim',
        tabBarIcon: ({ focused, color }) => <View style={{ borderBottomWidth: focused ? 2 : 0, borderBottomColor: colors.accent, paddingBottom: 2 }}>
          <MaterialCommunityIcons name={focused ? 'calendar-today' : 'calendar-blank-outline'} size={25} color={color} accessibilityLabel="Takvim" />
        </View> }} />
      <Tabs.Screen name="medications" options={{ title: 'İlaçlar', tabBarAccessibilityLabel: 'İlaçlar',
        tabBarIcon: ({ focused, color }) => <View style={{ borderBottomWidth: focused ? 2 : 0, borderBottomColor: colors.accent, paddingBottom: 2 }}>
          <MaterialCommunityIcons name={focused ? 'pill' : 'pill'} size={25} color={color} accessibilityLabel="İlaç" />
        </View> }} />
      <Tabs.Screen name="history" options={{ title: 'Geçmiş', tabBarAccessibilityLabel: 'Geçmiş, saat',
        tabBarIcon: ({ focused, color }) => <View style={{ borderBottomWidth: focused ? 2 : 0, borderBottomColor: colors.accent, paddingBottom: 2 }}>
          <MaterialCommunityIcons name="history" size={25} color={color} accessibilityLabel="Geçmiş" />
        </View> }} />
    </Tabs>
  );
}
