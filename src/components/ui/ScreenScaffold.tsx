/**
 * `<ScreenScaffold />`
 *
 * Every screen is a large collapsing title over an `Animated.ScrollView` that
 * scrolls under the floating tab bar. This wires the scroll value that the
 * header collapses against, so no screen has to repeat the boilerplate.
 */

import { memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LargeTitleHeader, useCollapsingTitle } from './LargeTitleHeader';
import { BackdropLayers } from '../glass/AuroraBackground';
import { TAB_BAR_INSET } from '../glass/GlassTabBar';
import { darkPalette, lightPalette } from '../../../theme/colors';
import { useAppTheme } from '../../hooks/useAppTheme';
import { spacing } from '../../../theme/typography';

const AnimatedScrollView = Animated.ScrollView;

export interface ScreenScaffoldProps {
  title: string;
  subtitle?: string;
  accessory?: ReactNode;
  children: ReactNode;
  /** `false` for screens that own their own virtualised list. */
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

function ScreenScaffoldImpl({
  title,
  subtitle,
  accessory,
  children,
  scrollable = true,
  contentStyle,
  testID,
}: ScreenScaffoldProps) {
  const insets = useSafeAreaInsets();
  const { scrollY, scrollProps } = useCollapsingTitle();
  const { palette } = useAppTheme();

  const content = (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );

  return (
    // Opaque backdrop so this screen covers the previous (still-mounted) one,
    // with the aurora painted beneath the content.
    <View style={[styles.root, { backgroundColor: palette.isDark ? darkPalette.background : lightPalette.background }]} testID={testID}>
      <BackdropLayers />
      <View style={{ height: insets.top }} />
      <LargeTitleHeader title={title} subtitle={subtitle} accessory={accessory} scrollY={scrollY} />

      {scrollable ? (
        <AnimatedScrollView
          {...scrollProps}
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: TAB_BAR_INSET }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          {content}
        </AnimatedScrollView>
      ) : (
        <View style={[styles.scroll, { paddingBottom: TAB_BAR_INSET }]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
});

export const ScreenScaffold = memo(ScreenScaffoldImpl);
export default ScreenScaffold;