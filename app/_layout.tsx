/**
 * Root layout.
 *
 * Order of operations on boot:
 *   1. keep the splash up while fonts + the database are ready
 *   2. run migrations and seed the default categories/types/payment methods
 *   3. hydrate the settings store
 *   4. render the Aurora background once, then the navigator on top
 *
 * There is no network call anywhere in this file — by design.
 */

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

import { AuroraBackground } from '../src/components/glass/AuroraBackground';
import { Toast } from '../src/components/ui/Toast';
import { useToastStore, hideToast } from '../src/state/toastStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { getDatabase } from '../src/db/client';
import { seedDatabase } from '../src/db/seed';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden — nothing to do.
});

export default function RootLayout() {
  const hydrate = useSettingsStore((state) => state.hydrate);
  const theme = useSettingsStore((state) => state.theme);
  const toast = useToastStore();
  const [ready, setReady] = useState(false);

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
    } finally {
      setReady(true);
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [hydrate]);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    void finishBoot();
  }, [fontError, finishBoot, fontsLoaded]);

  if (!ready) {
    return <View style={styles.splash} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          <AuroraBackground />
          <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
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