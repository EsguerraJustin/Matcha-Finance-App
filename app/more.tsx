/**
 * More — the hub for everything outside the four tabs.
 *
 * Settings, Budgets, Allowance, Recurring, Savings goals, Categories, Backup
 * and Recently deleted all hang off this sheet (brief Section 7). Only the
 * destinations that exist so far are shown; the rest land with their phases.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Layers, Recycle, Repeat2, ShieldCheck, Target, Wallet } from 'lucide-react-native';
import { router } from 'expo-router';

import { GlassSurface } from '../src/components/glass/GlassSurface';
import { AppText } from '../src/components/ui/AppText';
import { ScreenScaffold } from '../src/components/ui/ScreenScaffold';
import { withAlpha } from '../src/components/glass/GlassChip';
import { colors } from '../theme/colors';
import { spacing } from '../theme/typography';

interface MenuItem {
  key: string;
  label: string;
  hint: string;
  icon: typeof Layers;
  tint: string;
  onPress: () => void;
}

const MENU: MenuItem[] = [
  {
    key: 'categories',
    label: 'Categories',
    hint: 'Rename, recolour, archive',
    icon: Layers,
    tint: '#E3DAF5',
    onPress: () => router.push('/settings/categories'),
  },
];

export default function MoreScreen() {
  return (
    <ScreenScaffold title="More" subtitle="Everything outside the tabs">
      <GlassSurface level="high" radius={20} padding={0}>
        <View style={styles.list}>
          {MENU.map((item, index) => (
            <MenuRow key={item.key} item={item} first={index === 0} last={index === MENU.length - 1} />
          ))}
        </View>
      </GlassSurface>

      <AppText variant="footnote" color={colors.textMuted} center>
        Budgets, allowance, recurring bills, goals and backup arrive as their phases land.
      </AppText>
    </ScreenScaffold>
  );
}

function MenuRow({ item, first, last }: { item: MenuItem; first: boolean; last: boolean }) {
  const Icon = item.icon;

  return (
    <Pressable
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint={item.hint}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.iconBubble, { backgroundColor: withAlpha(item.tint, 0.9) }]}>
        <Icon size={18} strokeWidth={1.75} color={colors.matcha900} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="subhead">{item.label}</AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {item.hint}
        </AppText>
      </View>
      <ChevronRight size={18} strokeWidth={1.75} color={colors.textMuted} />
    </Pressable>
  );
}

/** Icons reserved for the phases still to come — kept so the menu grows cleanly. */
export const UPCOMING_MENU_ICONS = { Recycle, Repeat2, ShieldCheck, Target, Wallet };

const styles = StyleSheet.create({
  list: {
    paddingVertical: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowFirst: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowPressed: {
    backgroundColor: withAlpha(colors.matcha100, 0.5),
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
});