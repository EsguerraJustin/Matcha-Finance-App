/**
 * `<AuroraBackground />`
 *
 * One fixed, full-screen, non-scrolling layer that sits BEHIND every glass
 * surface so the blur has colour to frost. Rendered exactly once, at the root.
 *
 * Layer 1 of the stack from brief Section 4.2:
 *   1. AuroraBackground
 *   2. glass surfaces
 *   3. content
 */

import { memo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { night } from '../../../theme/colors';
import { backdrop } from '../../../theme/glass';
import { useAppTheme } from '../../hooks/useAppTheme';

interface Orb {
  color: string;
  opacity: number;
  size: number;
  x: number;
  y: number;
}

function OrbsLayer({ orbs, height }: { orbs: readonly Orb[]; height: number }) {
  // A little overscan so the glows never show a hard edge at the screen border.
  const width = 420;
  const layerHeight = Math.max(height, 900);

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={width} height={layerHeight}>
      <Defs>
        {orbs.map((orb, index) => (
          <RadialGradient id={`orb-${index}`} key={orb.color + index} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={orb.color} stopOpacity={orb.opacity} />
            <Stop offset="0.55" stopColor={orb.color} stopOpacity={orb.opacity * 0.45} />
            <Stop offset="1" stopColor={orb.color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {orbs.map((orb, index) => (
        <Rect key={orb.color + index} x={orb.x} y={orb.y} width={orb.size} height={orb.size} fill={`url(#orb-${index})`} />
      ))}
    </Svg>
  );
}

function AuroraBackgroundImpl() {
  const { width, height } = useWindowDimensions();
  const { isDark } = useAppTheme();

  const gradient: readonly [string, string, string] = isDark ? night.gradient : backdrop.gradient;
  const orbs: readonly Orb[] = isDark ? night.orbs : backdrop.orbs;

  // The orbs are authored for a 390 pt wide screen; scale x to the real width
  // so the composition holds together on tablets too.
  const scale = width / 390;

  return (
    <View pointerEvents="none" style={styles.root}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <OrbsLayer
        orbs={orbs.map((orb) => ({ ...orb, x: orb.x * scale }))}
        height={height * 1.4}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
});

export const AuroraBackground = memo(AuroraBackgroundImpl);
export default AuroraBackground;