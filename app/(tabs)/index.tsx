/**
 * Home — shell placeholder for Phase 0.
 *
 * The layout order is fixed by brief Section 7; each block arrives in its own
 * phase. Phase 2 fills in the real safe-to-spend hero, allowance/budget minis,
 * quick-add favourites, alerts, upcoming bills, recent expenses and the weekly
 * insight sentence.
 */

import { StyleSheet, View } from 'react-native';
import { MoreHorizontal } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { GlassCard } from '../../src/components/glass/GlassCard';
import { ScreenScaffold } from '../../src/components/ui/ScreenScaffold';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { AppText } from '../../src/components/ui/AppText';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/typography';

export default function HomeScreen() {
  return (
    <ScreenScaffold
      title="Matcha Wallet"
      subtitle="Your calm money space"
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          style={styles.moreButton}
          hitSlop={8}
        >
          <MoreHorizontal size={24} strokeWidth={1.75} color={colors.matcha700} />
        </Pressable>
      }
    >
      <GlassCard fill="fillTintGreen" level="high" padding={spacing.lg}>
        <AppText variant="largeTitle" numeric accessibilityLabel="Safe to spend today">
          ₱0
        </AppText>
        <AppText variant="subhead" color={colors.textMuted}>
          safe to spend today
        </AppText>
      </GlassCard>

      <View style={styles.row}>
        <GlassCard style={styles.half}>
          <AppText variant="footnote" color={colors.textMuted}>
            Allowance left
          </AppText>
          <AppText variant="title2" numeric>
            ₱0
          </AppText>
        </GlassCard>
        <GlassCard style={styles.half}>
          <AppText variant="footnote" color={colors.textMuted}>
            Budget left
          </AppText>
          <AppText variant="title2" numeric>
            ₱0
          </AppText>
        </GlassCard>
      </View>

      <EmptyState
        compact
        title="Ready when you are"
        message="Set your allowance and first weekly budget, then log a coffee in under ten seconds."
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  half: {
    flex: 1,
  },
  moreButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});