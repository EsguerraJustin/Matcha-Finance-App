/**
 * `<LargeTitleHeader />`
 *
 * Large collapsing title (34 pt bold) that shrinks into a blurred translucent
 * nav bar as the screen scrolls. Replicated with Reanimated so it behaves the
 * same on Android as it does with `headerLargeTitle` on iOS.
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

import { useAppTheme } from '../../hooks/useAppTheme';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/typography';
import { AppText } from './AppText';

/** Scroll distance over which the title collapses. */
export const COLLAPSE_DISTANCE = 36;

export interface CollapsingTitle {
  scrollY: SharedValue<number>;
  /** Spread onto the screen's `Animated.ScrollView`. */
  scrollProps: { onScroll: ReturnType<typeof useAnimatedScrollHandler>; scrollEventThrottle: number };
}

/**
 * Creates the scroll value a `<LargeTitleHeader />` collapses against.
 * One hook call per screen; share it with both the header and the list.
 */
export function useCollapsingTitle(): CollapsingTitle {
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  return useMemo(() => ({ scrollY, scrollProps: { onScroll, scrollEventThrottle: 16 } }), [onScroll, scrollY]);
}

export interface LargeTitleHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional trailing accessory (e.g. a "More" profile button). */
  accessory?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

function LargeTitleHeaderImpl({ title, subtitle, accessory, style, scrollY }: LargeTitleHeaderProps & { scrollY: SharedValue<number> }) {
  const { glass, solidGlass } = useAppTheme();

  const expandedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, COLLAPSE_DISTANCE * 0.7, COLLAPSE_DISTANCE], [1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, COLLAPSE_DISTANCE], [0, -12], Extrapolation.CLAMP) }],
  }));

  const collapsedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [COLLAPSE_DISTANCE * 0.5, COLLAPSE_DISTANCE], [0, 1], Extrapolation.CLAMP),
  }));

  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [COLLAPSE_DISTANCE * 0.6, COLLAPSE_DISTANCE], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={[styles.root, style]} pointerEvents="box-none">
      {/* Translucent nav bar that fades in as the title collapses. */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.bar, barStyle]} pointerEvents="none">
        {solidGlass ? null : <BlurView intensity={glass.blurIntensity} tint={glass.tint} style={StyleSheet.absoluteFill} />}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.fillStrong }]} />
        <View style={[styles.hairline, { backgroundColor: glass.borderInner }]} />
      </Animated.View>

      <Animated.View style={[styles.collapsedTitle, collapsedStyle]} pointerEvents="none">
        <AppText variant="headline" numberOfLines={1}>
          {title}
        </AppText>
      </Animated.View>

      <Animated.View style={[styles.expanded, expandedStyle]} pointerEvents="box-none">
        <View style={styles.row}>
          <View style={styles.titles}>
            <AppText variant="largeTitle" accessibilityRole="header" numberOfLines={2}>
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="subhead" color={colors.textMuted} numberOfLines={1}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {accessory}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    minHeight: 56,
    justifyContent: 'center',
  },
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hairline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  collapsedTitle: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expanded: {
    paddingTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
});

export const LargeTitleHeader = memo(LargeTitleHeaderImpl);
export default LargeTitleHeader;