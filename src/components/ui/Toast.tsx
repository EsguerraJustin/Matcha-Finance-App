/**
 * `<Toast />` — the 5-second confirmation with **Undo**.
 *
 * Used after saving an expense, deleting one (soft delete), and bulk actions.
 * Rendered once at the root so any screen can raise one.
 */

import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '../glass/GlassSurface';
import { AppText } from '../ui/AppText';
import { usePalette } from '../../hooks/useAppTheme';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/typography';
import { TAB_BAR_INSET } from '../glass/GlassTabBar';

export const TOAST_DURATION_MS = 5000;

export interface ToastState {
  visible: boolean;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone: 'default' | 'success' | 'warning';
}

export const HIDDEN_TOAST: ToastState = { visible: false, message: '', tone: 'default' };

export interface ToastProps extends ToastState {
  onHide: () => void;
}

export function Toast({ visible, message, actionLabel, onAction, onHide, tone = 'default' }: ToastProps) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!visible) return;

    timer.current = setTimeout(() => {
      onHide();
    }, TOAST_DURATION_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onHide, visible]);

  if (!visible) return null;

  const toneColor =
    tone === 'warning' ? palette.warningText : tone === 'success' ? palette.successText : palette.text;

  return (
    <View pointerEvents="box-none" style={[styles.root, { bottom: insets.bottom + TAB_BAR_INSET + spacing.md }]}>
      <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(140)}>
        <GlassSurface level="high" radius={999} padding={0} style={styles.surface}>
          <View style={styles.content}>
            <AppText variant="subhead" color={toneColor} numberOfLines={2} style={styles.message}>
              {message}
            </AppText>

            {actionLabel && onAction ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.matcha200 }]} />
                <AppText
                  variant="subhead"
                  color={palette.emphasis}
                  accessibilityRole="button"
                  onPress={() => {
                    onAction();
                    onHide();
                  }}
                  style={styles.action}
                >
                  {actionLabel}
                </AppText>
              </>
            ) : null}
          </View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  surface: {
    maxWidth: 480,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  message: {
    flexShrink: 1,
    paddingVertical: spacing.xxs,
  },
  divider: {
    width: StyleSheet.hairlineWidth * 2,
    alignSelf: 'stretch',
    marginVertical: spacing.xs,
    marginHorizontal: spacing.sm,
  },
  action: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});

export default Toast;