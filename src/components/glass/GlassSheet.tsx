/**
 * `<GlassSheet />`
 *
 * iOS-style bottom sheet: top corners radius 32, 36×5 grabber, `fillStrong`
 * glass, dimmed backdrop, drag to dismiss, medium/large detents.
 *
 * Built on `@gorhom/bottom-sheet`; the native BlurView is applied inside a
 * rounded container so the blur follows the sheet's top corners.
 */

import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
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
import { SheetFieldContext } from './sheetContext';

export type GlassSheetDetent = 'medium' | 'large' | 'auto';

const DETENT_POINTS: Record<GlassSheetDetent, string> = {
  medium: '58%',
  large: '92%',
  auto: 'auto',
};

/**
 * `height` shrinks a scrollable sheet's viewport above the Android keyboard
 * (the window never resizes under edge-to-edge); iOS relies on the sheet's own
 * `interactive` keyboard lift, so the wrapper becomes a pass-through there.
 */
const avoidingBehavior = Platform.OS === 'android' ? ('height' as const) : undefined;

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

  // Whether the sheet is actually on screen. `@gorhom/bottom-sheet` does not
  // handle the Android hardware back button, so without this the back press
  // fell through to whatever sat underneath the sheet (the tab navigator on
  // History — flaw #16) or popped the whole route (flaw #16 class).
  const [open, setOpen] = useState(index >= 0);
  useEffect(() => setOpen(index >= 0), [index]);

  // Keep the latest onClose without re-subscribing the back listener on every
  // parent render (parents pass inline arrows).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // A single close path shared by the backdrop/pan gestures and Android back:
  // flip local state, then hand the close request to the parent (unmounting,
  // animating the index to -1, or popping the route — whatever `onClose`
  // does today).
  const handleSheetClose = useCallback(() => {
    setOpen(false);
    onCloseRef.current?.();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleSheetClose();
      return true;
    });
    return () => subscription.remove();
  }, [open, handleSheetClose]);

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

  // Scrollable sheets shrink their viewport above the keyboard so the focused
  // field scrolls into the visible area (the OS window itself never resizes
  // under edge-to-edge). Non-scrollable sheets are short and top-aligned, so
  // they just ride the sheet's own keyboard lift.
  const body = scrollable ? (
    <KeyboardAvoidingView style={styles.body} behavior={avoidingBehavior}>
      <Body style={styles.bodyFill} contentContainerStyle={styles.bodyContent}>
        {children}
      </Body>
    </KeyboardAvoidingView>
  ) : (
    <Body style={styles.body}>{children}</Body>
  );

  return (
    <BottomSheet
      ref={ref}
      index={index}
      snapPoints={points}
      enablePanDownToClose
      onClose={handleSheetClose}
      onChange={onChange}
      // Lift the sheet above the keyboard when a field inside it is focused,
      // and drop it back to the snap point when the keyboard closes. The lift
      // only fires for inputs registered through `BottomSheetTextInput`
      // (see SheetFieldContext in GlassInput).
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      // A horizontal drag now fails the sheet's own pan gesture, so chip rows
      // and other horizontal ScrollViews inside the sheet receive the swipe
      // instead of being swallowed. `activeOffsetY` must accompany it: RNGH's
      // PanGestureHandler treats any fail/active offset as a *custom*
      // activation criterion and resets its default `minDist` to MAX, so with
      // failOffsetX alone the pan never activates and the sheet could not be
      // dragged vertically at all. The pair reads: fail past ±10 px of
      // horizontal travel, activate past ±10 px of vertical travel.
      failOffsetX={[-10, 10]}
      activeOffsetY={[-10, 10]}
      backgroundStyle={styles.transparentBackground}
      handleComponent={() => (
        <View style={styles.handleWrapper} accessibilityRole="adjustable" accessibilityLabel={title ?? 'Sheet'}>
          <View style={[styles.grabber, { backgroundColor: palette.textMuted }]} />
        </View>
      )}
      backdropComponent={renderBackdrop}
    >
      <SheetFieldContext.Provider value={true}>
        <View style={styles.sheet}>
          <BlurView
            intensity={glass.blurIntensity}
            tint={glass.tint}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.fill, { backgroundColor: glass.fillStrong }]} />
          <View style={[styles.border, { borderColor: glass.border }]} />

          {body}
        </View>
      </SheetFieldContext.Provider>
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
  bodyFill: {
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