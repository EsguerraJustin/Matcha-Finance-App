/**
 * Accessibility + glass preferences.
 *
 * Combines three sources:
 *   1. the user's in-app Settings switches (reduce motion / reduce transparency)
 *   2. the OS "Reduce Motion" and iOS "Reduce Transparency" settings
 *   3. a conservative platform blur-support check
 *
 * The app must stay fully readable and attractive with **zero blur**, so the
 * fallback path is a first-class rendering mode rather than an error case.
 */

import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';

import { useSettingsStore } from '../state/settingsStore';
import { glass, resolveGlass, type ResolvedGlass } from '../../theme/glass';
import { categoryColors, colors, darkPalette, lightPalette, type Palette } from '../../theme/colors';

/**
 * Android's RenderEffect-based blur is available from API 31. Below that we
 * render the solid fallback instead of a slow, ugly blur.
 */
const NATIVE_BLUR_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'macos' || Number(Platform.Version) >= 31;

export interface AccessibilityPrefs {
  reduceMotion: boolean;
  reduceTransparency: boolean;
  blurSupported: boolean;
  isDark: boolean;
}

export interface AppTheme extends AccessibilityPrefs {
  palette: Palette;
  glass: ResolvedGlass;
  /** True when glass is being painted with the solid fallback. */
  solidGlass: boolean;
}

export function useAccessibilityPrefs(): AccessibilityPrefs {
  const reduceMotionSetting = useSettingsStore((state) => state.reduceMotion);
  const reduceTransparencySetting = useSettingsStore((state) => state.reduceTransparency);
  const theme = useSettingsStore((state) => state.theme);

  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const [systemReduceTransparency, setSystemReduceTransparency] = useState(false);
  const systemColorScheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setSystemReduceMotion(enabled);
    });

    if (Platform.OS === 'ios' && AccessibilityInfo.isReduceTransparencyEnabled) {
      AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
        if (!cancelled) setSystemReduceTransparency(Boolean(enabled));
      });
    }

    const motionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduceMotion);
    let transparencySub: { remove: () => void } | null = null;
    if (Platform.OS === 'ios') {
      transparencySub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setSystemReduceTransparency);
    }

    return () => {
      cancelled = true;
      motionSub?.remove();
      transparencySub?.remove();
    };
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');

  return {
    reduceMotion: reduceMotionSetting || systemReduceMotion,
    reduceTransparency: reduceTransparencySetting || systemReduceTransparency,
    blurSupported: NATIVE_BLUR_SUPPORTED,
    isDark,
  };
}

export function useAppTheme(): AppTheme {
  const intensity = useSettingsStore((state) => state.glassIntensity);
  const prefs = useAccessibilityPrefs();

  return useMemo(() => {
    const variant = prefs.isDark ? glass.dark : glass.light;
    const resolved = resolveGlass(variant, {
      blurSupported: prefs.blurSupported,
      reduceTransparency: prefs.reduceTransparency,
      intensity,
    });

    return {
      ...prefs,
      palette: prefs.isDark ? darkPalette : lightPalette,
      glass: resolved,
      solidGlass: !resolved.blurEnabled,
    };
  }, [intensity, prefs]);
}

/** Just the semantic colours — handy for small components that only tint text/icons. */
export function usePalette(): Palette {
  return useAppTheme().palette;
}

/** Category pastel chip colour for a given category name. */
export function categoryTint(name: string | null | undefined): string {
  if (!name) return colors.divider;
  return (categoryColors as Record<string, string>)[name] ?? colors.divider;
}