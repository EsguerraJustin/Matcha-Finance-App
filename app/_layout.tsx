/**
 * Root layout.
 *
 * Order of operations on boot:
 *   1. keep the splash up while fonts + the database are ready
 *   2. run migrations and seed the default categories/types/payment methods
 *   3. hydrate the settings store
 *   4. render the Aurora background once, then the navigator on top
 *
 * The optional app lock (Phase 5) sits above the navigator: until it is
 * unlocked, no screen and no amount is rendered, which is what keeps the
 * app-switcher preview private.
 *
 * There is no network call anywhere in this file — by design.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

import { AuroraBackground } from '../src/components/glass/AuroraBackground';
import { darkPalette, lightPalette } from '../theme/colors';
import { Toast } from '../src/components/ui/Toast';
import { useToastStore, hideToast } from '../src/state/toastStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { useAccessibilityPrefs } from '../src/hooks/useAppTheme';
import { getDatabase } from '../src/db/client';
import { seedDatabase } from '../src/db/seed';
import { runBootRoutine } from '../src/db/boot';
import AppLockScreen from '../src/components/AppLockScreen';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden — nothing to do.
});

export default function RootLayout() {
  const hydrate = useSettingsStore((state) => state.hydrate);
  const appLockEnabled = useSettingsStore((state) => state.appLockEnabled);
  const { isDark } = useAccessibilityPrefs();
  const toast = useToastStore();
  const [ready, setReady] = useState(false);
  // `null` until the hydrated setting has decided the initial state. Gating on
  // it means the navigator never flashes before the lock screen on a cold
  // start with the lock enabled.
  const [unlocked, setUnlocked] = useState<boolean | null>(null);

  const lockReady = ready && unlocked !== null;
  const needsLock = lockReady && appLockEnabled && !unlocked;

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const finishBoot = useCallback(async () => {
    try {
      const db = await getDatabase();
      await seedDatabase(db);
      await hydrate();
      // Purge old soft deletes, catch up recurring rules, re-arm thresholds.
      await runBootRoutine(db);
    } finally {
      // Read the freshly hydrated value directly: no stale closure, and the
      // initial lock state and `ready` land in the same React batch.
      setUnlocked(!useSettingsStore.getState().appLockEnabled);
      setReady(true);
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [hydrate]);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    void finishBoot();
  }, [fontError, finishBoot, fontsLoaded]);

  // Leaving the app (background) — or even being obscured (inactive, which is
  // when iOS takes the app-switcher snapshot) — hides every amount again.
  // Reading the store lazily keeps the listener from needing to re-subscribe.
  useEffect(() => {
    if (!ready) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') return;
      if (useSettingsStore.getState().appLockEnabled) setUnlocked(false);
    });
    return () => subscription.remove();
  }, [ready]);

  if (!lockReady) {
    return <View style={[styles.splash, { backgroundColor: isDark ? darkPalette.background : lightPalette.background }]} />;
  }

  if (needsLock) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <View style={styles.root}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <AppLockScreen onUnlock={() => setUnlocked(true)} />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          <AuroraBackground />
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
              animation: 'slide_from_right',
            }}
          />
        </View>

        <Toast
          visible={toast.visible}
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          tone={toast.tone}
          onHide={hideToast}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  splash: {
    flex: 1,
    backgroundColor: '#F5FAF0',
  },
});