/**
 * `<GlassSheet />`
 *
 * iOS-style bottom sheet: top corners radius 32, 36×5 grabber, `fillStrong`
 * glass, dimmed backdrop, drag to dismiss, medium/large detents.
 *
 * Built on `@gorhom/bottom-sheet`; the native BlurView is applied inside a
 * rounded container so the blur follows the sheet's top corners.
 */

import React, { forwardRef, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';

import { useAppTheme } from '../../hooks/useAppTheme';
import { colors } from '../../../theme/colors';
import { radius } from '../../../theme/typography';

export type GlassSheetDetent = 'medium' | 'large' | 'auto';

const DETENT_POINTS: Record<GlassSheetDetent, string> = {
  medium: '58%',
  large: '92%',
  auto: 'auto',
};

export interface GlassSheetProps {
  children: React.ReactNode;
  /** Detent shown when the sheet opens. */
  detent?: GlassSheetDetent;
  snapPoints?: Array<string | number>;
  index?: number;
  /** `true` lets the sheet grow to the keyboard height (forms, numpads). */
  scrollable?: boolean;
  onClose?: () => void;
  onChange?: (index: number) => void;
  /** Hide the dimmed backdrop — used for the quick "peek" sheets. */
  transparentBackdrop?: boolean;
  title?: string;
}

export const GlassSheet = forwardRef<BottomSheet, GlassSheetProps>(function GlassSheet(
  { children, detent = 'medium', snapPoints, index = 0, scrollable = false, onClose, onChange, transparentBackdrop = false, title },
  ref,
) {
  const { glass, palette } = useAppTheme();

  const points = useMemo(() => snapPoints ?? [DETENT_POINTS[detent]], [detent, snapPoints]);

  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...backdropProps}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={transparentBackdrop ? 0 : 0.28}
        style={[styles.backdrop, { backgroundColor: colors.matcha900 }]}
      />
    ),
    [transparentBackdrop],
  );

  const Body = scrollable ? BottomSheetScrollView : BottomSheetView;

  return (
    <BottomSheet
      ref={ref}
      index={index}
      snapPoints={points}
      enablePanDownToClose
      onClose={onClose}
      onChange={onChange}
      backgroundStyle={styles.transparentBackground}
      handleComponent={() => (
        <View style={styles.handleWrapper} accessibilityRole="adjustable" accessibilityLabel={title ?? 'Sheet'}>
          <View style={[styles.grabber, { backgroundColor: palette.textMuted }]} />
        </View>
      )}
      backdropComponent={renderBackdrop}
    >
      <View style={styles.sheet}>
        <BlurView
          intensity={glass.blurIntensity}
          tint={glass.tint}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.fill, { backgroundColor: glass.fillStrong }]} />
        <View style={[styles.border, { borderColor: glass.border }]} />

        <Body style={styles.body} contentContainerStyle={scrollable ? styles.bodyContent : undefined}>
          {children}
        </Body>
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  transparentBackground: {
    backgroundColor: 'transparent',
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFill,
  },
  border: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 4,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 40,
  },
  handleWrapper: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    opacity: 0.55,
  },
});

export default GlassSheet;