/**
 * Bottom tab shell — the floating glass pill tab bar.
 *
 * Tabs: Home · History · Groceries · Reports, with the centre **Add** orb
 * rendered by `GlassTabBar` (it is not a route, so the orb always sits in the
 * middle even with four tabs).
 */

import { Tabs } from 'expo-router/js-tabs';

import { GlassTabBar } from '../../src/components/glass/GlassTabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="groceries" options={{ title: 'Groceries' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
    </Tabs>
  );
}