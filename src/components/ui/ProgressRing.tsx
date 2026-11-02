/**
 * `<ProgressRing />`
 *
 * The matcha gradient ring on the safe-to-spend hero card. Drawn with SVG so
 * there is no extra blur layer, and it respects "reduce motion".
 */

import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { colors } from '../../../theme/colors';
import { useAppTheme } from '../../hooks/useAppTheme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  /** 0–1. Values above 1 render as a full ring plus an over-budget tint. */
  progress: number;
  size?: number;
  thickness?: number;
  trackColor?: string;
  children?: React.ReactNode;
  accessibilityLabel?: string;
}

function ProgressRingImpl({
  progress,
  size = 96,
  thickness = 10,
  trackColor = colors.matcha200,
  children,
  accessibilityLabel,
}: ProgressRingProps) {
  const { reduceMotion, palette } = useAppTheme();
  const animated = useSharedValue(0);

  useEffect(() => {
    const target = Math.max(0, Math.min(1, progress));
    animated.value = reduceMotion ? target : withTiming(target, { duration: 480, easing: Easing.out(Easing.cubic) });
  }, [animated, progress, reduceMotion]);

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animated.value),
  }));

  const overBudget = progress > 1;

  return (
    <View
      style={[styles.wrapper, { width: size, height: size }]}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={overBudget ? palette.dangerText : colors.matcha400} />
            <Stop offset="1" stopColor={overBudget ? palette.dangerBg : colors.matcha600} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={thickness} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGradient)"
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          // Start the arc at 12 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const ProgressRing = memo(ProgressRingImpl);
export default ProgressRing;