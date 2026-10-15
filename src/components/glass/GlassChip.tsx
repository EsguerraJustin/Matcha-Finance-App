/**
 * `<GlassChip />`
 *
 * Category chips are glass capsules tinted with the category pastel at ~60 %
 * over the blur. Selected state uses the matcha-tinted glass fill.
 */

import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { colors } from '../../../theme/colors';
import { radius, typeScale } from '../../../theme/typography';
import { selectionHaptic } from '../../lib/haptics';

export interface GlassChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Pastel tint (e.g. `categoryColors.Food`) applied at ~60 %. */
  tint?: string;
  icon?: React.ReactNode;
  size?: 'small' | 'regular';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Overlays `hex` at `alpha` — used for the ~60 % pastel capsule. */
export function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function GlassChipImpl({
  label,
  selected = false,
  onPress,
  tint,
  icon,
  size = 'regular',
  disabled = false,
  style,
  testID,
}: GlassChipProps) {
  const { glass } = useAppTheme();

  const handlePress = useCallback(() => {
    selectionHaptic();
    onPress?.();
  }, [onPress]);

  const height = size === 'small' ? 30 : 38;
  const background = selected
    ? glass.fillTintGreen
    : tint
      ? withAlpha(tint, 0.6)
      : glass.fill;

  return (
    <Pressable
      onPress={onPress ? handlePress : undefined}
      disabled={disabled}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        {
          height,
          paddingHorizontal: size === 'small' ? 12 : 16,
          borderRadius: radius.chip,
          backgroundColor: selected ? background : pressed ? colors.matcha300 : background,
          borderColor: selected ? withAlpha(colors.matcha500, 0.55) : glass.border,
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {icon}
        <Text
          style={[
            styles.label,
            {
              color: colors.matcha900,
              fontSize: size === 'small' ? typeScale.footnote.fontSize : typeScale.subhead.fontSize,
              fontWeight: selected ? '700' : '600',
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    letterSpacing: 0.1,
  },
});

export const GlassChip = memo(GlassChipImpl);
export default GlassChip;