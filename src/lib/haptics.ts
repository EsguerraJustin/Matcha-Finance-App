/**
 * Haptics — thin wrapper that respects the Settings toggle.
 *
 * Selection tick on chip/segment change, success on save, soft warning on
 * budget alerts (brief Section 4.3).
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { currentSettings } from '../state/settingsStore';

type HapticKind = 'tap' | 'selection' | 'success' | 'warning' | 'error';

function enabled(): boolean {
  try {
    return currentSettings().hapticsEnabled;
  } catch {
    return true;
  }
}

function map(kind: HapticKind) {
  switch (kind) {
    case 'selection':
      return Haptics.ImpactFeedbackStyle.Light;
    case 'tap':
      return Haptics.ImpactFeedbackStyle.Medium;
    default:
      return null;
  }
}

export function haptic(kind: HapticKind = 'tap'): void {
  if (!enabled()) return;
  try {
    const style = map(kind);
    if (style) {
      void Haptics.impactAsync(style);
      return;
    }
    if (kind === 'success') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (kind === 'warning') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  } catch {
    // Haptics are a nicety; a device without a taptic engine must not crash.
  }
}

export const selectionHaptic = () => haptic('selection');
export const tapHaptic = () => haptic('tap');
export const successHaptic = () => haptic('success');
export const warningHaptic = () => haptic('warning');

/** Android's soft keyboard "vibrate on key" equivalent for the numpad. */
export const supportsHaptics = Platform.OS === 'ios' || Platform.OS === 'android';