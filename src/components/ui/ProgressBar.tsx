/**
 * `<ProgressBar />` — the thin matcha track used for budgets and category
 * limits. Plain View, no blur, no chart library.
 */

import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { withAlpha } from '../glass/GlassChip';
import { colors } from '../../../theme/colors';
import { radius } from '../../../theme/typography';

export interface ProgressBarProps {
  /** 0–1. Anything above 1 renders the over-budget tone. */
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

function ProgressBarImpl({
  progress,
  height = 10,
  trackColor = colors.matcha200,
  fillColor,
  style,
  accessibilityLabel,
}: ProgressBarProps) {
  const { reduceMotion, palette } = useAppTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const over = progress > 1;
  const tone = fillColor ?? (over ? palette.dangerBg : colors.matcha500);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }, style]}
    >
      <View
        style={[
          styles.fill,
          {
            width: reduceMotion ? `${clamped * 100}%` : `${clamped * 100}%`,
            borderRadius: height / 2,
            backgroundColor: over ? withAlpha(tone, 0.95) : tone,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.pill,
  },
  fill: {
    height: '100%',
  },
});

export const ProgressBar = memo(ProgressBarImpl);
export default ProgressBar;