/**
 * `<GlassButton />`
 *
 * Capsule, 52 pt tall. Primary = matcha500 with matcha900 text (white text on
 * pastel green fails contrast — brief Section 4.4). Secondary = glass fill with
 * matcha700 text. Destructive = dangerBg with dangerText.
 */

import React, { memo, useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BlurView } from 'expo-blur';

import { useAppTheme } from '../../hooks/useAppTheme';
import { colors } from '../../../theme/colors';
import { radius, typeScale } from '../../../theme/typography';
import { tapHaptic, successHaptic } from '../../lib/haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'regular' | 'large' | 'small';

export interface GlassButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Leading element (icon). Kept out of the text node so colours stay correct. */
  icon?: React.ReactNode;
  hapticFeedback?: 'tap' | 'success' | 'none';
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

const HEIGHTS: Record<ButtonSize, number> = { small: 40, regular: 52, large: 58 };

function GlassButtonImpl({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  disabled = false,
  loading = false,
  icon,
  hapticFeedback = 'tap',
  fullWidth = true,
  style,
  accessibilityHint,
  testID,
}: GlassButtonProps) {
  const { glass, solidGlass, palette: themePalette } = useAppTheme();

  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    if (hapticFeedback === 'success') successHaptic();
    else if (hapticFeedback === 'tap') tapHaptic();
    onPress();
  }, [disabled, hapticFeedback, loading, onPress]);

  const palette = {
    primary: { background: colors.matcha500, pressed: colors.matcha600, text: colors.matcha900, blur: false },
    secondary: { background: glass.fillStrong, pressed: colors.matcha100, text: colors.matcha700, blur: true },
    ghost: { background: 'transparent', pressed: colors.matcha100, text: colors.matcha700, blur: false },
    destructive: { background: themePalette.dangerBg, pressed: '#F2B9B1', text: themePalette.dangerText, blur: false },
  }[variant];

  const height = HEIGHTS[size];
  const fontSize = size === 'small' ? typeScale.subhead.fontSize : typeScale.headline.fontSize;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      testID={testID}
      hitSlop={size === 'small' ? { top: 4, bottom: 4, left: 2, right: 2 } : undefined}
      style={({ pressed }) => [
        styles.pressable,
        fullWidth && styles.fullWidth,
        {
          height,
          borderRadius: radius.button,
          backgroundColor: pressed ? palette.pressed : palette.background,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {palette.blur && !solidGlass ? (
        <BlurView intensity={glass.blurIntensity} tint={glass.tint} style={StyleSheet.absoluteFill} />
      ) : null}

      {variant === 'primary' ? (
        <LinearGradient
          colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.6, y: 1 }}
          style={styles.sheen}
          pointerEvents="none"
        />
      ) : null}

      <View style={styles.content}>
        {loading ? <ActivityIndicator color={palette.text} style={styles.spinner} /> : icon}
        <Text style={[styles.label, { color: palette.text, fontSize }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
  },
  spinner: {
    marginRight: 2,
  },
});

export const GlassButton = memo(GlassButtonImpl);
export default GlassButton;