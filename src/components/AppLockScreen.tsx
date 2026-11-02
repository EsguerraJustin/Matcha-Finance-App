/**
 * App lock screen â€” optional PIN + biometrics (brief Section 6.12).
 *
 * Rendered above the whole app when the user switches back with the lock
 * enabled, and immediately on boot when the setting is on. Amounts are hidden
 * while the screen is covered, so the app-switcher preview never leaks.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Fingerprint } from 'lucide-react-native';

import { AuroraBackground } from './glass/AuroraBackground';
import { GlassSurface } from './glass/GlassSurface';
import { GlassButton } from './glass/GlassButton';
import { AppText, MoneyText } from './ui/AppText';
import { useSettingsStore } from '../state/settingsStore';
import { MatchaLeaf } from './ui/EmptyState';
import { authenticateBiometric, biometricAvailable, validPin, verifyPin } from '../lib/appLock';
import { warningHaptic } from '../lib/haptics';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/typography';
import { useAppTheme } from '../hooks/useAppTheme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const;

export interface AppLockScreenProps {
  onUnlock: () => void;
}

export default function AppLockScreen({ onUnlock }: AppLockScreenProps) {
  const { palette } = useAppTheme();
  const appLockEnabled = useSettingsStore((state) => state.appLockEnabled);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometricReady, setBiometricReady] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void biometricAvailable().then(setBiometricReady);
  }, []);

  const tryUnlock = useCallback(
    async (candidate: string) => {
      if (checking) return;
      setChecking(true);
      try {
        const ok = await verifyPin(candidate);
        if (ok) {
          onUnlock();
          return;
        }
        setError('That PIN did not match. Try again.');
        setPin('');
        warningHaptic();
      } finally {
        setChecking(false);
      }
    },
    [checking, onUnlock],
  );

  const handleKey = useCallback((key: (typeof KEYS)[number]) => {
    if (key === 'back') {
      setPin((current) => current.slice(0, -1));
    } else if (key !== '') {
      setPin((current) => (current.length >= 6 ? current : current + key));
    }
    setError(null);
  }, []);

  const handleUnlock = useCallback(() => {
    if (validPin(pin)) void tryUnlock(pin);
    else setError('Enter your full PIN.');
  }, [pin, tryUnlock]);

  const handleBiometric = useCallback(async () => {
    const ok = await authenticateBiometric();
    if (ok) onUnlock();
    else setError('Biometrics did not match.');
  }, [onUnlock]);

  // If the lock was turned off while this screen was mounted, step aside.
  useEffect(() => {
    if (!appLockEnabled) onUnlock();
  }, [appLockEnabled, onUnlock]);

  return (
    <View style={styles.root}>
      <AuroraBackground />

      <View style={styles.content}>
        <View style={styles.hero}>
          <MatchaLeaf size={72} />
          <AppText variant="title" center>
            Welcome back
          </AppText>
          <AppText variant="callout" color={palette.textMuted} center>
            {appLockEnabled ? 'Enter your PIN to open your wallet.' : 'Unlockingâ€¦'}
          </AppText>
        </View>

        {/* PIN dots ------------------------------------------------- */}
        <View style={styles.dots} accessibilityRole="summary" accessibilityLabel={`${pin.length} of digits entered`}>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <View key={index} style={[styles.dot, pin.length > index && styles.dotOn, { borderColor: palette.primary }, pin.length > index && { backgroundColor: palette.primary }]} />
          ))}
        </View>

        {error ? (
          <AppText variant="footnote" color={palette.dangerText} center>
            {error}
          </AppText>
        ) : null}

        {/* Blur is hidden on the app-switcher preview anyway: the surface sits
            above the data, and amounts are not rendered until unlocked. */}
        <GlassSurface level="high" radius={28} padding={spacing.sm} style={styles.keypad}>
          <View style={styles.keypadGrid}>
            {KEYS.map((key, index) =>
              key === '' ? (
                <View key={`blank-${index}`} style={styles.keyBlank} />
              ) : key === 'back' ? (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel="Backspace"
                  onPress={() => handleKey(key)}
                  style={styles.keyWide}
                >
                  <AppText variant="headline" color={palette.emphasis}>
                    âŒ«
                  </AppText>
                </Pressable>
              ) : (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={key}
                  onPress={() => handleKey(key)}
                    style={({ pressed }) => [styles.key, key === '0' && styles.keyWide, pressed && { backgroundColor: palette.cardFill }]}
                >
                  <AppText variant="largeTitle" color={palette.text}>
                    {key}
                  </AppText>
                </Pressable>
              ),
            )}
          </View>
        </GlassSurface>

        <GlassButton label="Unlock" onPress={handleUnlock} disabled={!validPin(pin)} style={styles.unlock} />

        {biometricReady ? (
          <GlassButton
            label="Use biometrics"
            variant="secondary"
            icon={<Fingerprint size={18} strokeWidth={1.75} color={palette.emphasis} />}
            onPress={() => void handleBiometric()}
          />
        ) : null}

        {/* Decorative â€” never visible pre-unlock in the switcher. */}
        <MoneyText cents={0} variant="caption" style={styles.hiddenAmount} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.matcha400,
  },
  dotOn: {
    backgroundColor: colors.matcha500,
  },
  keypad: {
    alignSelf: 'center',
    width: 276,
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  key: {
    width: 84,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  keyWide: {
    width: 84,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  keyBlank: {
    width: 84,
    height: 68,
  },
  keyPressed: {
    backgroundColor: colors.matcha100,
  },
  unlock: {
    marginTop: spacing.xs,
  },
  hiddenAmount: {
    opacity: 0,
  },
});
