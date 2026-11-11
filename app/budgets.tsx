/**
 * Budgets — list, create (weekly / monthly / custom), per-category limits,
 * rollover and the derived summary for each period.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';

import { GlassCard } from '../src/components/glass/GlassCard';
import { GlassSurface } from '../src/components/glass/GlassSurface';
import { GlassButton } from '../src/components/glass/GlassButton';
import { GlassInput } from '../src/components/ui/GlassInput';
import { AppText, MoneyText } from '../src/components/ui/AppText';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ScreenScaffold } from '../src/components/ui/ScreenScaffold';
import { ProgressBar } from '../src/components/ui/ProgressBar';
import { GlassSegmented } from '../src/components/glass/GlassSegmented';
import { useAppTheme, usePalette } from '../src/hooks/useAppTheme';
import { useDb, useDbQuery } from '../src/state/dbStore';
import { showToast } from '../src/state/toastStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { budgetCopy, budgetSummary, isOverCategoryLimit, nextWeeklyBudget, rolloverAmount } from '../src/lib/budgets';
import { endOfWeekISO, formatShortDate, monthRangeISO, startOfWeekISO, todayISO, type WeekStart } from '../src/lib/date';
import { formatMoney, parseAmountToCents } from '../src/lib/money';
import {
  createBudget,
  deleteBudget,
  listBudgets,
  listCategoryBudgets,
  setCategoryLimit,
  type BudgetWithTotals,
  type CategoryBudgetRow,
} from '../src/db/repositories/budgetsRepo';
import { listCategories, type CategoryWithTypes } from '../src/db/repositories/categoriesRepo';
import { colors } from '../theme/colors';
import { spacing } from '../theme/typography';

type KindOption = 'weekly' | 'monthly' | 'custom';

const KIND_OPTIONS: ReadonlyArray<{ value: KindOption; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
];

export default function BudgetsScreen() {
  const db = useDb();
  const { glass, palette } = useAppTheme();
  const today = todayISO();
  const weekStartsOn = useSettingsStore((state) => state.weekStartsOn) as WeekStart;
  const monthStartsOn = useSettingsStore((state) => state.monthStartsOn);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [kind, setKind] = useState<KindOption>('weekly');
  const [amountText, setAmountText] = useState('');
  const [startText, setStartText] = useState(today);
  const [endText, setEndText] = useState(endOfWeekISO(today, weekStartsOn));
  const [limitText, setLimitText] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const { data: budgets } = useDbQuery<BudgetWithTotals[]>((handle) => listBudgets(handle), [], []);
  const { data: categories } = useDbQuery<CategoryWithTypes[]>((handle) => listCategories(handle), [], []);
  const { data: limits } = useDbQuery<CategoryBudgetRow[]>(
    (handle) => (expanded ? listCategoryBudgets(handle, expanded) : Promise.resolve([])),
    [expanded],
    [],
  );

  const range = useMemo(() => {
    if (kind === 'weekly') return { start: startOfWeekISO(startText, weekStartsOn), end: endOfWeekISO(startText, weekStartsOn) };
    if (kind === 'monthly') return monthRangeISO(startText, monthStartsOn);
    return { start: startText, end: endText };
  }, [endText, kind, monthStartsOn, startText, weekStartsOn]);

  const create = useCallback(() => {
    const cents = parseAmountToCents(amountText);
    if (!db || cents === null || cents <= 0) {
      showToast({ message: 'Enter a budget amount first.', tone: 'warning' });
      return;
    }
    const name =
      kind === 'weekly'
        ? `Week of ${formatShortDate(range.start)}`
        : kind === 'monthly'
          ? formatShortDate(range.start)
          : 'Custom budget';

    void createBudget(db, {
      kind,
      name,
      amount_cents: cents,
      start_date: range.start,
      end_date: range.end,
    }).then((id) => {
      setAmountText('');
      setExpanded(id);
      showToast({ message: `Budget set for ${name}.`, tone: 'success' });
    });
  }, [amountText, db, kind, range]);

  const setLimit = useCallback(() => {
    const cents = parseAmountToCents(limitText);
    if (!db || !expanded || !categoryId) return;
    void setCategoryLimit(db, expanded, categoryId, cents ?? 0).then(() => setLimitText(''));
  }, [categoryId, db, expanded, limitText]);

  const rollOver = useCallback(
    (budget: BudgetWithTotals) => {
      if (!db) return;
      const leftover = rolloverAmount(budget.total_cents, budget.spent_cents, true);
      const next = nextWeeklyBudget(budget, weekStartsOn);
      void createBudget(db, {
        kind: next.kind,
        name: next.name,
        amount_cents: budget.amount_cents,
        start_date: next.start_date,
        end_date: next.end_date,
        rollover_in_cents: leftover,
      }).then(() => showToast({ message: 'Next week is ready, with the leftover rolled in.', tone: 'success' }));
    },
    [db, weekStartsOn],
  );

  return (
    <ScreenScaffold title="Budgets" subtitle="Set it once, then just log">
      {budgets.length === 0 ? (
        <EmptyState
          title="No budgets yet"
          message="Start with a weekly amount you can live inside — you can always adjust it."
        />
      ) : (
        budgets.map((budget) => {
          const summary = budgetSummary({ budget, spentCents: budget.spent_cents, today });
          const isOpen = expanded === budget.id;

          return (
            <GlassCard key={budget.id} padding={14}>
              <Pressable
                onPress={() => setExpanded(isOpen ? null : budget.id)}
                accessibilityRole="button"
                accessibilityLabel={`${budget.name}, ${Math.round(summary.usage * 100)} percent used`}
                style={styles.budgetHeader}
              >
                <View style={styles.budgetTitle}>
                  <AppText variant="subhead">{budget.name}</AppText>
                  <AppText variant="caption" color={palette.textMuted}>
                    {formatShortDate(budget.start_date)} – {formatShortDate(budget.end_date)}
                    {budget.rollover_in_cents ? ` · +${formatMoney(budget.rollover_in_cents, { compactZeroDecimals: true })} rolled in` : ''}
                  </AppText>
                </View>
                <View style={styles.budgetAmounts}>
                  <MoneyText cents={budget.spent_cents} variant="subhead" />
                  <AppText variant="caption" color={palette.textMuted}>
                    of {formatMoney(budget.total_cents, { compactZeroDecimals: true })}
                  </AppText>
                </View>
              </Pressable>

              <ProgressBar
                progress={summary.usage}
                accessibilityLabel={`${budget.name} budget usage`}
                style={styles.budgetBar}
              />

              <AppText variant="caption" color={summary.threshold === 'ok' ? colors.textMuted : summary.threshold === 'warning' ? palette.warningText : palette.dangerText}>
                {budgetCopy(summary)}
              </AppText>

              {isOpen ? (
                <View style={styles.budgetBody}>
                  <View style={styles.statRow}>
                    <Stat label="Remaining" cents={summary.remaining_cents} />
                    <Stat label="Safe daily" cents={summary.safeDailyCents} />
                    <Stat label="Projected" cents={summary.projectedCents} />
                  </View>

                  <AppText variant="footnote" color={palette.textMuted}>
                    Per-category limits
                  </AppText>
                  {limits.length === 0 ? (
                    <AppText variant="caption" color={palette.textMuted}>
                      None set — the whole budget is shared.
                    </AppText>
                  ) : (
                    limits.map((limit) => (
                      <View key={limit.id} style={styles.limitRow}>
                        <AppText variant="caption" style={styles.limitLabel} numberOfLines={1}>
                          {limit.category_name}
                        </AppText>
                        <View style={styles.limitBar}>
                          <ProgressBar
                            progress={limit.limit_cents ? limit.spent_cents / limit.limit_cents : 0}
                            height={6}
                            accessibilityLabel={`${limit.category_name} limit`}
                          />
                        </View>
                        <MoneyText cents={limit.limit_cents} variant="caption" />
                        {isOverCategoryLimit(limit.limit_cents, limit.spent_cents) ? (
                          <AppText variant="caption" color={palette.dangerText}>
                            over
                          </AppText>
                        ) : null}
                      </View>
                    ))
                  )}

                  <View style={styles.limitPicker}>
                    <AppText variant="caption" color={palette.textMuted}>
                      Set a limit for
                    </AppText>
                    <ScrollableCategories
                      categories={categories}
                      selectedId={categoryId}
                      onSelect={setCategoryId}
                    />
                    <View style={styles.limitInputRow}>
                      <GlassInput
                        value={limitText}
                        onChangeText={setLimitText}
                        placeholder="₱500"
                        keyboardType="decimal-pad"
                        containerStyle={styles.limitInput}
                      />
                      <GlassButton label="Save" size="small" onPress={setLimit} disabled={!categoryId} />
                    </View>
                  </View>

                  <View style={styles.budgetActions}>
                    {budget.kind === 'weekly' ? (
                      <GlassButton
                        label="Roll over to next week"
                        variant="secondary"
                        size="small"
                        onPress={() => rollOver(budget)}
                        style={styles.action}
                      />
                    ) : null}
                    <GlassButton
                      label="Delete"
                      variant="destructive"
                      size="small"
                      icon={<Trash2 size={16} strokeWidth={1.75} color={palette.dangerText} />}
                      onPress={() => db && void deleteBudget(db, budget.id)}
                      style={styles.action}
                    />
                  </View>
                </View>
              ) : null}
            </GlassCard>
          );
        })
      )}

      {/* New budget --------------------------------------------------- */}
      <GlassSurface level="low" radius={20} padding={14} style={styles.createBlock}>
        <AppText variant="headline">New budget</AppText>
        <GlassSegmented options={KIND_OPTIONS} value={kind} onChange={setKind} />

        <GlassInput
          value={amountText}
          onChangeText={setAmountText}
          placeholder="₱1,000"
          keyboardType="decimal-pad"
          label="Amount"
        />

        <GlassInput value={startText} onChangeText={setStartText} placeholder="YYYY-MM-DD" label="Starts" autoCapitalize="none" />

        {kind === 'custom' ? (
          <GlassInput value={endText} onChangeText={setEndText} placeholder="YYYY-MM-DD" label="Ends" autoCapitalize="none" />
        ) : null}

        {kind === 'custom' && endText < range.start ? (
          <AppText variant="caption" color={palette.dangerText}>
            The end date must be on or after the start date.
          </AppText>
        ) : null}

        <AppText variant="caption" color={palette.textMuted}>
          {formatShortDate(range.start)} – {formatShortDate(range.end)}
        </AppText>

        <GlassButton
          label="Create budget"
          icon={<Plus size={18} strokeWidth={2} color={colors.matcha900} />}
          onPress={create}
          disabled={kind === 'custom' && endText < range.start}
        />
      </GlassSurface>

      <GlassSurface radius={20} padding={12} style={{ borderColor: glass.borderInner }}>
        <AppText variant="caption" color={palette.textMuted}>
          Tap any budget to see remaining, safe daily, projected spend and per-category limits.
        </AppText>
      </GlassSurface>
    </ScreenScaffold>
  );
}

function Stat({ label, cents }: { label: string; cents: number }) {
  const palette = usePalette();
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color={palette.textMuted}>
        {label}
      </AppText>
      <MoneyText cents={cents} variant="subhead" />
    </View>
  );
}

function ScrollableCategories({
  categories,
  selectedId,
  onSelect,
}: {
  categories: readonly CategoryWithTypes[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.categoryRow}>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => onSelect(category.id === selectedId ? null : category.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: category.id === selectedId }}
            style={[styles.categoryChip, category.id === selectedId && styles.categoryChipActive]}
          >
            <AppText variant="caption" color={colors.matcha900}>
              {category.name}
            </AppText>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  budgetTitle: {
    flex: 1,
    gap: 2,
  },
  budgetAmounts: {
    alignItems: 'flex-end',
  },
  budgetBar: {
    marginTop: spacing.xs,
    marginBottom: spacing.xxs,
  },
  budgetBody: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 28,
  },
  limitLabel: {
    width: 92,
  },
  limitBar: {
    flex: 1,
  },
  limitPicker: {
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.matcha100,
  },
  categoryChipActive: {
    backgroundColor: colors.matcha300,
  },
  limitInputRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-end',
  },
  limitInput: {
    flex: 1,
  },
  budgetActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  action: {
    flex: 1,
  },
  createBlock: {
    gap: spacing.sm,
  },
});
