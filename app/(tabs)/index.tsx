/**
 * Home.
 *
 * Layout order is fixed by brief Section 7:
 *   greeting · safe-to-spend hero · allowance + budget minis · quick-add
 *   favourites · warning banner · upcoming bills · recent expenses · insight
 *
 * Everything shown is derived from SQLite at read time — nothing is cached.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MoreHorizontal, Plus } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';

import { GlassCard } from '../../src/components/glass/GlassCard';
import { GlassSurface } from '../../src/components/glass/GlassSurface';
import { ScreenScaffold } from '../../src/components/ui/ScreenScaffold';
import { AppText, MoneyText } from '../../src/components/ui/AppText';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ProgressRing } from '../../src/components/ui/ProgressRing';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { ExpenseRow } from '../../src/components/expense/ExpenseRow';
import { QuickTemplateSheet } from '../../src/components/QuickTemplateSheet';
import { withAlpha } from '../../src/components/glass/GlassChip';
import { useDb, useDbQuery } from '../../src/state/dbStore';
import { openAddExpense } from '../../src/state/addExpenseStore';
import { showToast } from '../../src/state/toastStore';
import { useSettingsStore } from '../../src/state/settingsStore';
import { useSheetOverlayStore } from '../../src/state/sheetOverlayStore';
import { budgetCopy, budgetSummary } from '../../src/lib/budgets';
import { formatMonthLabel, monthRangeISO, relativeDayLabel, todayISO } from '../../src/lib/date';
import { ratio } from '../../src/lib/money';
import { selectionHaptic } from '../../src/lib/haptics';
import { getCurrentBudget, type BudgetWithTotals } from '../../src/db/repositories/budgetsRepo';
import { allowanceOverview } from '../../src/db/repositories/allowancesRepo';
import { createExpense, listRecentExpenses, type ExpenseRow as ExpenseRowModel } from '../../src/db/repositories/expensesRepo';
import { listQuickTemplates, type QuickTemplateRow } from '../../src/db/repositories/quickTemplatesRepo';
import { upcomingBills } from '../../src/lib/recurring';
import { listRecurringRules } from '../../src/db/repositories/recurringRepo';
import { totalSetAside } from '../../src/db/repositories/goalsRepo';
import { categoryTint, usePalette } from '../../src/hooks/useAppTheme';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/typography';

export default function HomeScreen() {
  const palette = usePalette();
  const db = useDb();
  const monthStartsOn = useSettingsStore((state) => state.monthStartsOn);
  const today = todayISO();
  const cycle = useMemo(() => monthRangeISO(today, monthStartsOn), [monthStartsOn, today]);

  const { data: budget } = useDbQuery<BudgetWithTotals | null>((handle) => getCurrentBudget(handle, today), [today], null);
  const { data: allowance } = useDbQuery(() => allowanceOverview(cycle.start, cycle.end), [cycle.start, cycle.end], {
    allowance_cents: 0,
    spent_cents: 0,
    net_cents: 0,
    runwayDays: null,
  });
  const { data: recent } = useDbQuery<ExpenseRowModel[]>((handle) => listRecentExpenses(handle, 5), [], []);
  const { data: favorites } = useDbQuery<QuickTemplateRow[]>((handle) => listQuickTemplates(handle), [], []);
  const { data: rules } = useDbQuery((handle) => listRecurringRules(handle), [], []);
  const { data: setAside } = useDbQuery((handle) => totalSetAside(handle), [], 0);

  // The one-tap add sheet is an in-scene overlay: the floating tab bar renders
  // above tab scenes, so it must hide while the sheet is up (P6-35 rule, same
  // as History's filter sheet) and close if Home ever loses focus (P6-38).
  const [templateSheet, setTemplateSheet] = useState<QuickTemplateRow | 'new' | null>(null);
  const setSheetOverlayOpen = useSheetOverlayStore((s) => s.setOpen);
  useEffect(() => {
    setSheetOverlayOpen(templateSheet !== null);
    return () => setSheetOverlayOpen(false);
  }, [templateSheet, setSheetOverlayOpen]);
  useFocusEffect(
    useCallback(() => () => setTemplateSheet(null), []),
  );

  const bills = useMemo(() => upcomingBills(rules, today, 7).slice(0, 4), [rules, today]);

  const summary = useMemo(() => {
    if (!budget) return null;
    return budgetSummary({
      budget,
      spentCents: budget.spent_cents,
      today,
      setAsideCents: setAside,
    });
  }, [budget, setAside, today]);

  const allowanceUsage = ratio(allowance.spent_cents, allowance.allowance_cents);

  const addFavorite = useCallback(
    async (template: QuickTemplateRow) => {
      if (!db) return;
      await createExpense(db, {
        amount_cents: template.amount_cents,
        spent_on: today,
        category_id: template.category_id,
        type_id: template.type_id,
        payment_method_id: template.payment_method_id,
        note: template.note,
      });
      showToast({ message: `Logged ${template.label}.`, tone: 'success' });
    },
    [db, today],
  );

  return (
    <ScreenScaffold
      title={greeting()}
      subtitle={relativeDayLabel(today, today) === 'Today' ? formatMonthLabel(today) : formatMonthLabel(today)}
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          onPress={() => router.push('/more')}
          style={styles.moreButton}
          hitSlop={8}
        >
          <MoreHorizontal size={24} strokeWidth={1.75} color={palette.emphasis} />
        </Pressable>
      }
    >
      {/* 1 — safe to spend today ------------------------------------- */}
      <GlassCard fill="fillTintGreen" level="high" padding={12}>
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <AppText variant="footnote" color={palette.textMuted}>
              Safe to spend today
            </AppText>
            <MoneyText cents={summary?.safeDailyCents ?? 0} variant="largeTitle" style={styles.heroAmount} />
            <AppText variant="caption" color={palette.textMuted}>
              {summary
                ? `${summary.daysLeft} day${summary.daysLeft === 1 ? '' : 's'} left · ${budget?.name ?? 'No budget'}`
                : 'Set a budget to unlock this'}
            </AppText>
          </View>

          <ProgressRing
            progress={summary?.usage ?? 0}
            size={92}
            thickness={10}
            accessibilityLabel={summary ? `${Math.round(summary.usage * 100)}% of budget used` : 'No budget yet'}
          >
            <AppText variant="footnote" color={colors.matcha900}>
              {summary ? `${Math.round(summary.usage * 100)}%` : '—'}
            </AppText>
          </ProgressRing>
        </View>
      </GlassCard>

      {/* 2 — allowance + budget minis -------------------------------- */}
      <View style={styles.row}>
        <GlassCard style={styles.half} padding={12}>
          <AppText variant="caption" color={palette.textMuted}>
            Allowance left
          </AppText>
          <MoneyText cents={allowance.net_cents} variant="title2" />
          <ProgressBar progress={allowanceUsage} height={6} style={styles.miniBar} accessibilityLabel="Allowance used" />
          <AppText variant="caption" color={palette.textMuted}>
            {allowance.runwayDays === null ? 'Nothing spent yet' : `${allowance.runwayDays} days of runway`}
          </AppText>
        </GlassCard>

        <GlassCard style={styles.half} padding={12}>
          <AppText variant="caption" color={palette.textMuted}>
            {budget?.kind === 'weekly' ? 'Budget left' : budget ? 'Budget left' : 'No budget'}
          </AppText>
          <MoneyText cents={summary?.remaining_cents ?? 0} variant="title2" />
          <ProgressBar progress={summary?.usage ?? 0} height={6} style={styles.miniBar} accessibilityLabel="Budget used" />
          <AppText variant="caption" color={palette.textMuted}>
            {summary ? budgetCopy(summary) : 'Tap More to set one'}
          </AppText>
        </GlassCard>
      </View>

      {/* 3 — quick-add favourites ------------------------------------ */}
      <View style={styles.section}>
        <AppText variant="headline">One-tap adds</AppText>
        <View style={styles.favoriteRow}>
          {favorites.map((template) => (
            <Pressable
              key={template.id}
              onPress={() => void addFavorite(template)}
              onLongPress={() => {
                selectionHaptic();
                setTemplateSheet(template);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Add ${template.label}`}
              accessibilityHint="Long press to edit or remove this one-tap add"
              style={({ pressed }) => [styles.favorite, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            >
              <GlassSurface radius={20} padding={8} style={styles.favoriteSurface}>
                <View style={[styles.favoriteDot, { backgroundColor: withAlpha(categoryTint(template.category_name), 0.9) }]} />
                <AppText variant="caption" color={colors.matcha900} numberOfLines={1}>
                  {template.label}
                </AppText>
                <MoneyText cents={template.amount_cents} variant="caption" />
              </GlassSurface>
            </Pressable>
          ))}

          {/* Create tile — dashed so it reads as "add your own". */}
          <Pressable
            onPress={() => setTemplateSheet('new')}
            accessibilityRole="button"
            accessibilityLabel="New one-tap add"
            accessibilityHint="Saves a new quick chip to this row"
            style={({ pressed }) => [styles.favorite, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
          >
            <View style={[styles.addTile, { borderColor: withAlpha(palette.emphasis, 0.35) }]}>
              <Plus size={20} strokeWidth={2} color={palette.textMuted} />
              <AppText variant="caption" color={palette.textMuted}>
                Add
              </AppText>
            </View>
          </Pressable>
        </View>
        <AppText variant="caption" color={palette.textMuted}>
          {favorites.length
            ? 'Long-press a chip to edit or remove.'
            : 'Save your usual spends — one tap logs them.'}
        </AppText>
      </View>

      {/* 4 — warning / alert banner ---------------------------------- */}
      {summary && summary.threshold !== 'ok' ? (
        <GlassSurface
          radius={20}
          padding={14}
          style={{ backgroundColor: summary.threshold === 'exceeded' ? palette.dangerBg : palette.warningBg }}
        >
          <AppText variant="subhead" color={summary.threshold === 'exceeded' ? palette.dangerText : palette.warningText}>
            {budgetCopy(summary)}
          </AppText>
        </GlassSurface>
      ) : null}

      {/* 5 — upcoming bills ------------------------------------------ */}
      {bills.length ? (
        <View style={styles.section}>
          <AppText variant="headline">Next 7 days</AppText>
          <GlassSurface radius={20} padding={0}>
            {bills.map((bill, index) => (
              <View key={`${bill.ruleId}-${bill.dueOn}`} style={[styles.billRow, index > 0 && [styles.billRowBorder, { borderTopColor: palette.divider }]]}>
                <AppText variant="subhead" numberOfLines={1} style={styles.billLabel}>
                  {bill.kind === 'allowance' ? 'Allowance' : 'Bill'}
                </AppText>
                <AppText variant="caption" color={palette.textMuted}>
                  {relativeDayLabel(bill.dueOn, today)}
                </AppText>
                <MoneyText cents={bill.amount_cents} variant="subhead" />
              </View>
            ))}
          </GlassSurface>
        </View>
      ) : null}

      {/* 6 — recent expenses ----------------------------------------- */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <AppText variant="headline">Recent</AppText>
          <Pressable
            onPress={() => router.push('/(tabs)/history')}
            accessibilityRole="button"
            accessibilityLabel="See all expenses"
            hitSlop={8}
          >
            <AppText variant="caption" color={palette.emphasis}>
              See all
            </AppText>
          </Pressable>
        </View>

        {recent.length === 0 ? (
          <GlassSurface radius={20} padding={0}>
            <EmptyState
              compact
              title="Nothing logged yet"
              message="Tap the + orb to log your first expense."
              actionLabel="Add an expense"
              onAction={() => openAddExpense()}
            />
          </GlassSurface>
        ) : (
          <GlassSurface radius={20} padding={0}>
            {recent.map((expense, index) => (
              <View key={expense.id} style={index > 0 ? [styles.rowBorder, { borderTopColor: palette.divider }] : undefined}>
                <ExpenseRow expense={expense} onPress={(row) => openAddExpense(row.id)} />
              </View>
            ))}
          </GlassSurface>
        )}
      </View>

      {/* 7 — weekly insight ------------------------------------------ */}
      {summary && budget ? (
        <AppText variant="footnote" color={palette.textMuted} center>
          {budgetCopy(summary)}
        </AppText>
      ) : (
        <AppText variant="footnote" color={palette.textMuted} center>
          Set an allowance and a budget to see safe-to-spend.
        </AppText>
      )}

      {templateSheet ? <QuickTemplateSheet mode={templateSheet} onClose={() => setTemplateSheet(null)} /> : null}
    </ScreenScaffold>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  moreButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroText: {
    flex: 1,
    gap: 2,
  },
  heroAmount: {
    fontSize: 36,
    lineHeight: 44,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  half: {
    flex: 1,
  },
  miniBar: {
    marginTop: 4,
    marginBottom: 0,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  favoriteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  favorite: {
    flexGrow: 1,
    // 80 dp keeps four chips + the dashed Add tile on a single row (353 dp
    // content width), so the extra wrapped row can't push the empty-state CTA
    // and footnote under the tab bar (P6-22).
    minWidth: 80,
  },
  favoriteSurface: {
    alignItems: 'flex-start',
    gap: 4,
  },
  addTile: {
    minHeight: 70,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  favoriteDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    marginBottom: 2,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  billRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  billLabel: {
    flex: 1,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});