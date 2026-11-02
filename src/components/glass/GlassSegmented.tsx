/**
 * `<GlassSegmented />`
 *
 * iOS-style segmented control: glass track, sliding white thumb with a soft
 * shadow, used for Day/Week/Month and To buy/Purchased.
 */

import { memo, useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { radius, typeScale } from '../../../theme/typography';
import { selectionHaptic } from '../../lib/haptics';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface GlassSegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function GlassSegmentedImpl<T extends string>({ options, value, onChange, style, testID }: GlassSegmentedProps<T>) {
  const { glass, reduceMotion, palette } = useAppTheme();
  const trackWidth = useSharedValue(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const position = useSharedValue(index);

  useEffect(() => {
    position.value = index;
  }, [index, position]);

  const thumbStyle = useAnimatedStyle(() => {
    const count = Math.max(1, options.length);
    const segment = trackWidth.value / count;
    return {
      width: Math.max(0, segment - 6),
      transform: [
        {
          translateX: reduceMotion
            ? segment * position.value
            : withSpring(segment * position.value, { damping: 20, stiffness: 220 }),
        },
      ],
    };
  });

  const handlePress = useCallback(
    (next: T) => {
      selectionHaptic();
      onChange(next);
    },
    [onChange],
  );

  return (
    <View
      accessibilityRole="tablist"
      testID={testID}
      onLayout={(event) => {
        trackWidth.value = event.nativeEvent.layout.width;
      }}
      style={[
        styles.track,
        { backgroundColor: glass.fill, borderColor: glass.border, borderRadius: radius.control },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            backgroundColor: palette.cardFill,
            borderRadius: radius.control - 3,
            shadowColor: glass.shadow,
          },
          thumbStyle,
        ]}
      />

      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => handlePress(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            hitSlop={{ top: 4, bottom: 4 }}
            style={styles.segment}
          >
            <Text
              numberOfLines={1}
              style={[styles.label, { color: active ? palette.text : palette.textMuted, fontWeight: active ? '700' : '500' }]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: 40,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 3,
    position: 'relative',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: typeScale.subhead.fontSize,
    letterSpacing: 0.1,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
});

export const GlassSegmented = memo(GlassSegmentedImpl) as typeof GlassSegmentedImpl;
export default GlassSegmented;