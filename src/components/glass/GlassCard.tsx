/**
 * `<GlassCard />` — the everyday frosted surface.
 *
 * Recipe from brief Section 4.2: blur clipped to the radius → fill overlay →
 * 1 px border → top-edge sheen → soft matcha-tinted shadow.
 */

import React, { memo } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { GlassSurface, type GlassFill, type GlassLevel } from './GlassSurface';
import { radius } from '../../../theme/typography';

export interface GlassCardProps {
  children: React.ReactNode;
  fill?: GlassFill;
  level?: GlassLevel;
  padding?: number;
  radius?: number;
  bordered?: boolean;
  sheen?: boolean;
  shadow?: boolean;
  /** Makes the card tappable with a 0.97 press scale. */
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'summary' | 'none';
}

function GlassCardImpl({
  children,
  fill = 'fill',
  level = 'medium',
  padding = 16,
  radius: cornerRadius = radius.card,
  bordered = true,
  sheen = true,
  shadow = true,
  onPress,
  onLongPress,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
}: GlassCardProps) {
  const content = (
    <GlassSurface
      fill={fill}
      level={level}
      radius={cornerRadius}
      padding={padding}
      bordered={bordered}
      sheen={sheen}
      shadow={shadow}
      style={style}
    >
      {children}
    </GlassSurface>
  );

  if (!onPress && !onLongPress) return content;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.985 : 1 }] }]}
    >
      {content}
    </Pressable>
  );
}

export const GlassCard = memo(GlassCardImpl);
export default GlassCard;