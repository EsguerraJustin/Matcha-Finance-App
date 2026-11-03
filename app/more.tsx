/**
 * More — the hub for everything outside the four tabs.
 *
 * Settings, Budgets, Allowance, Recurring, Savings goals, Categories,
 * Backup and Recently deleted all hang off this sheet (brief Section 7).
 */

import { Pressable, StyleSheet, View } from 'react-native';
import {
  ChevronRight,
  Layers,
  PiggyBank,
  Repeat2,
  Settings,
  ShieldCheck,
  Target,
  Trash2,
  Wallet,
} from 'lucide-react-native';
import { router } from 'expo-router';

import { GlassSurface } from '../src/components/glass/GlassSurface';
import { AppText } from '../src/components/ui/AppText';
import { ScreenScaffold } from '../src/components/ui/ScreenScaffold';
import { withAlpha } from '../src/components/glass/GlassChip';
import { usePalette } from '../src/hooks/useAppTheme';
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
    key: 'allowance',
    label: 'Allowance',
    hint: 'Money in, and the monthly overview',
    icon: Wallet,
    tint: '#CDEFE3',
    onPress: () => router.push('/allowance'),
  },
  {
    key: 'budgets',
    label: 'Budgets',
    hint: 'Weekly, monthly, custom and category limits',
    icon: PiggyBank,
    tint: '#FFF3C4',
    onPress: () => router.push('/budgets'),
  },
  {
    key: 'recurring',
    label: 'Recurring',
    hint: 'Phone load, boarding house, weekly allowance',
    icon: Repeat2,
    tint: '#CFE8F5',
    onPress: () => router.push('/recurring'),
  },
  {
    key: 'goals',
    label: 'Savings goals',
    hint: 'Small targets, big motivation',
    icon: Target,
    tint: '#FAD4E1',
    onPress: () => router.push('/goals'),
  },
  {
    key: 'categories',
    label: 'Categories',
    hint: 'Rename, recolour, archive',
    icon: Layers,
    tint: '#E3DAF5',
    onPress: () => router.push('/settings/categories'),
  },
  {
    key: 'backup',
    label: 'Backup',
    hint: 'Export, restore and erase',
    icon: ShieldCheck,
    tint: '#CDEFE3',
    onPress: () => router.push('/settings/backup'),
  },
  {
    key: 'deleted',
    label: 'Recently deleted',
    hint: 'Recover a mistaken swipe',
    icon: Trash2,
    tint: '#F8CFCA',
    onPress: () => router.push('/recently-deleted'),
  },
  {
    key: 'settings',
    label: 'Settings',
    hint: 'Theme, week start, reminders, app lock',
    icon: Settings,
    tint: '#E9E4D8',
    onPress: () => router.push('/settings'),
  },
];

export default function MoreScreen() {
  const palette = usePalette();
  return (
    <ScreenScaffold title="More" subtitle="Everything outside the tabs">
      <GlassSurface level="high" radius={20} padding={0}>
        <View style={styles.list}>
          {MENU.map((item, index) => (
            <MenuRow key={item.key} item={item} first={index === 0} last={index === MENU.length - 1} />
          ))}
        </View>
      </GlassSurface>

      <AppText variant="footnote" color={palette.textMuted} center>
        Matcha Wallet is offline by design. Nothing here leaves your phone.
      </AppText>
    </ScreenScaffold>
  );
}

function MenuRow({ item, first, last }: { item: MenuItem; first: boolean; last: boolean }) {
  const palette = usePalette();
  const Icon = item.icon;

  return (
    <Pressable
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint={item.hint}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: palette.divider },
        first && [styles.rowFirst, { borderTopColor: palette.divider }],
        last && styles.rowLast,
        pressed && { backgroundColor: palette.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(232,243,221,0.5)' },
      ]}
    >
      <View style={[styles.iconBubble, { backgroundColor: withAlpha(item.tint, 0.9) }]}>
        <Icon size={18} strokeWidth={1.75} color={colors.matcha900} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="subhead">{item.label}</AppText>
        <AppText variant="caption" color={palette.textMuted}>
          {item.hint}
        </AppText>
      </View>
      <ChevronRight size={18} strokeWidth={1.75} color={palette.textMuted} />
    </Pressable>
  );
}

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
  },
  rowFirst: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLast: {
    borderBottomWidth: 0,
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