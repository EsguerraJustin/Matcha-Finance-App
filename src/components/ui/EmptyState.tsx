/**
 * `<EmptyState />`
 *
 * Friendly matcha-leaf illustration (drawn locally as SVG — no remote images)
 * plus one short encouraging sentence and a primary action.
 *
 * Microcopy tone (brief Section 4.5): warm and short, never shaming.
 */

import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { GlassButton } from '../glass/GlassButton';
import { AppText } from './AppText';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/typography';

/** A simple two-tone matcha leaf — drawn locally, no image assets needed. */
export const MatchaLeaf = memo(function MatchaLeaf({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityRole="image" accessibilityLabel="Matcha leaf">
      <Defs>
        <LinearGradient id="leafGradient" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.matcha300} />
          <Stop offset="1" stopColor={colors.matcha500} />
        </LinearGradient>
      </Defs>
      <Path
        d="M60 8C34 26 20 50 20 74c0 22 18 38 40 38s40-16 40-38C100 50 86 26 60 8Z"
        fill="url(#leafGradient)"
        opacity={0.9}
      />
      <Path d="M60 24v82" stroke={colors.matcha900} strokeWidth={3} strokeLinecap="round" opacity={0.35} />
      <Path d="M60 46l16-12M60 66l-18-12M60 66l18-12M60 86l-14-10" stroke={colors.matcha900} strokeWidth={2.5} strokeLinecap="round" opacity={0.3} />
    </Svg>
  );
});

export interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

function EmptyStateImpl({ title, message, actionLabel, onAction, compact = false }: EmptyStateProps) {
  return (
    <View style={[styles.root, compact && styles.compact]} accessibilityRole="summary">
      <MatchaLeaf size={compact ? 64 : 96} />
      <AppText variant="title2" center>
        {title}
      </AppText>
      {message ? (
        <AppText variant="callout" color={colors.textMuted} center style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <GlassButton label={actionLabel} onPress={onAction} fullWidth={false} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  compact: {
    paddingVertical: spacing.lg,
  },
  message: {
    maxWidth: 280,
  },
  action: {
    marginTop: spacing.xs,
    minWidth: 180,
  },
});

export const EmptyState = memo(EmptyStateImpl);
export default EmptyState;