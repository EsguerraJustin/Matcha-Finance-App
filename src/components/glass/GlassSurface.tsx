/**
 * `<GlassSurface />` — the single blurred primitive every other glass
 * component builds on. Keep the blur count low: the brief budgets roughly four
 * visible `BlurView`s, and never one per list row.
 */

import { memo, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { useAppTheme } from '../../hooks/useAppTheme';
import { radius } from '../../../theme/typography';

export type GlassFill = 'fill' | 'fillStrong' | 'fillTintGreen' | 'none';
export type GlassLevel = 'low' | 'medium' | 'high';

export interface GlassSurfaceProps {
  children?: ReactNode;
  /** Which of the three fills to paint. `none` = plain translucent overlay. */
  fill?: GlassFill;
  /** Blur intensity bucket; only the first ~4 surfaces on screen should blur. */
  level?: GlassLevel;
  radius?: number;
  /** Extra inset padding inside the surface. */
  padding?: number;
  /** 1 px outer edge using `glass.border`. */
  bordered?: boolean;
  /** The iPhone "glass shine": white fading to nothing over the top 40%. */
  sheen?: boolean;
  shadow?: boolean;
  /** Custom background colour overrides the token fill (e.g. a category pastel). */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: ViewStyle['pointerEvents'];
}

function GlassSurfaceImpl({
  children,
  fill = 'fill',
  level = 'medium',
  radius: cornerRadius = radius.card,
  padding = 16,
  bordered = true,
  sheen = true,
  shadow = true,
  backgroundColor,
  style,
}: GlassSurfaceProps) {
  const { glass: tokens, solidGlass } = useAppTheme();
  const showsBlur = !solidGlass && fill !== 'none';
  const levelBlur = level === 'low' ? tokens.blurIntensity * 0.6 : level === 'high' ? tokens.blurIntensity * 1.2 : tokens.blurIntensity;

  const background = backgroundColor ?? (fill === 'none' ? 'transparent' : tokens[fill]);

  return (
    <View
      style={[
        styles.clip,
        {
          borderRadius: cornerRadius,
          shadowColor: tokens.shadow,
          shadowOpacity: shadow && !solidGlass ? 1 : 0.85,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: Platform.OS === 'android' && solidGlass ? 2 : 0,
        },
        style,
      ]}
    >
      {showsBlur ? (
        <BlurView
          intensity={levelBlur}
          tint={tokens.tint}
          style={StyleSheet.absoluteFill}
          // Android renders `blurAmount` separately from iOS `intensity`.
        />
      ) : null}

      <View style={[styles.fill, { backgroundColor: background }]} />

      {bordered ? <View style={[styles.border, { borderColor: tokens.border, borderRadius: cornerRadius }]} /> : null}

      {sheen && !solidGlass ? (
        <LinearGradient
          colors={['rgba(255,255,255,0.50)', 'rgba(255,255,255,0.0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.6, y: 1 }}
          style={[styles.sheen, { borderTopLeftRadius: cornerRadius, borderTopRightRadius: cornerRadius }]}
          pointerEvents="none"
        />
      ) : null}

      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFill,
  },
  border: {
    ...StyleSheet.absoluteFill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
  },
});

export const GlassSurface = memo(GlassSurfaceImpl);
export default GlassSurface;