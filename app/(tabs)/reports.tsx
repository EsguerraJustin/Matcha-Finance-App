/**
 * Reports & insights.
 *
 * Period switcher (Day / Week / Month / Custom), a category donut, a daily
 * spending bar series, payment-method split, insight sentences, the weekly
 * comparison, and CSV export through the OS share sheet — all offline
 * (brief Section 6.9).
 *
 * Every number is derived from the expense list; nothing is stored.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

import { GlassSurface } from '../../src/components/glass/GlassSurface';
import { GlassButton } from '../../src/components/glass/GlassButton';
import { AppText, MoneyText } from '../../src/components/ui/AppText';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ScreenScaffold } from '../../src/components/ui/ScreenScaffold';
import { GlassSegmented } from '../../src/components/glass/GlassSegmented';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { useDbQuery } from '../../src/state/dbStore';
import { useSettingsStore } from '../../src/state/settingsStore';
import {
  addDaysISO,
  eachDayInRange,
  endOfMonthISO,
  formatHumanDate,
  startOfMonthISO,
  todayISO,
  weekRangeISO,
  type WeekStart,
} from '../../src/lib/date';
import { listExpenses, type ExpenseRow } from '../../src/db/repositories/expensesRepo';
import {
  buildReportTotals,
  comparePeriods,
  expensesToCsv,
  insightSentences,
  type ReportPeriod,
  type ReportableExpense,
} from '../../src/lib/reports';
import { formatMoney } from '../../src/lib/money';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/typography';

const PERIOD_OPTIONS: ReadonlyArray<{ value: ReportPeriod; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: '30 days' },
];

export default function ReportsScreen() {
  const today = todayISO();
  const weekStartsOn = useSettingsStore((state) => state.weekStartsOn) as WeekStart;
  const monthStartsOn = useSettingsStore((state) => state.monthStartsOn);
  const currencySymbol = useSettingsStore((state) => state.currencySymbol);
  const { glass, palette } = useAppTheme();

  const [period, setPeriod] = useState<ReportPeriod>('week');

  const range = useMemo(() => {
    switch (period) {
      case 'day':
        return { from: today, to: today };
      case 'month':
        return { from: startOfMonthISO(today, monthStartsOn), to: endOfMonthISO(today, monthStartsOn) };
      case 'custom':
        return { from: addDaysISO(today, -29), to: today };
      default: {
        const week = weekRangeISO(today, weekStartsOn);
        return { from: week.start, to: week.end };
      }
    }
  }, [monthStartsOn, period, today, weekStartsOn]);

  const { data: expenses } = useDbQuery<ExpenseRow[]>(
    (handle) => listExpenses(handle, { from: range.from, to: range.to }),
    [range.from, range.to],
    [],
  );

  /** The same-length window immediately before, for the week-over-week card. */
  const previousRange = useMemo(() => {
    const span = eachDayInRange({ start: range.from, end: range.to }).length;
    return { from: addDaysISO(range.from, -span), to: addDaysISO(range.from, -1) };
  }, [range]);

  const { data: previousExpenses } = useDbQuery<ExpenseRow[]>(
    (handle) => listExpenses(handle, { from: previousRange.from, to: previousRange.to }),
    [previousRange.from, previousRange.to],
    [],
  );

  const reportable = useMemo<ReportableExpense[]>(
    () =>
      expenses.map((expense) => ({
        amount_cents: expense.amount_cents,
        spent_on: expense.spent_on,
        category_name: expense.category_name,
        category_color: expense.category_color,
        type_name: expense.type_name,
        payment_name: expense.payment_name,
        grocery_list_id: expense.grocery_list_id,
      })),
    [expenses],
  );

  const previousReportable = useMemo<ReportableExpense[]>(
    () =>
      previousExpenses.map((expense) => ({
        amount_cents: expense.amount_cents,
        spent_on: expense.spent_on,
        category_name: expense.category_name,
        category_color: expense.category_color,
        type_name: expense.type_name,
        payment_name: expense.payment_name,
        grocery_list_id: expense.grocery_list_id,
      })),
    [previousExpenses],
  );

  const totals = useMemo(() => buildReportTotals(reportable, range.from, range.to), [reportable, range.from, range.to]);
  const comparison = useMemo(() => comparePeriods(reportable, previousReportable), [previousReportable, reportable]);

  const insights = useMemo(
    () => insightSentences(totals, (cents) => formatMoney(cents, { symbol: currencySymbol })),
    [currencySymbol, totals],
  );

  const maxDaily = useMemo(
    () => totals.daily.reduce((max, point) => Math.max(max, point.value), 0),
    [totals.daily],
  );

  const handleExport = useCallback(async () => {
    const csv = expensesToCsv(reportable, currencySymbol);
    const file = new FileSystem.File(FileSystem.Paths.cache, `matcha-expenses-${range.from}-to-${range.to}.csv`);
    file.write(csv);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Share expenses' });
  }, [currencySymbol, range.from, range.to, reportable]);

  const empty = reportable.length === 0;

  return (
    <ScreenScaffold
      title="Reports"
      subtitle={`${formatHumanDate(range.from)} – ${formatHumanDate(range.to)}`}
      accessory={
        <Pressable
          onPress={() => void handleExport()}
          accessibilityRole="button"
          accessibilityLabel="Export CSV"
          style={styles.iconButton}
          hitSlop={8}
        >
          <Share2 size={22} strokeWidth={1.75} color={palette.emphasis} />
        </Pressable>
      }
    >
      <GlassSegmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} style={{ backgroundColor: glass.fill }} />

      {empty ? (
        <EmptyState
          title="Nothing to report"
          message="Log a few expenses and the picture appears here — all computed on your phone."
          actionLabel="Add an expense"
          onAction={() => router.push('/add-expense-sheet')}
        />
      ) : (
        <>
          {/* Hero total ------------------------------------------------- */}
          <GlassSurface level="high" radius={20} padding={spacing.lg} style={{ backgroundColor: glass.fillTintGreen }}>
            <AppText variant="footnote" color={palette.textMuted}>
              Total spent
            </AppText>
            <MoneyText cents={totals.totalCents} variant="largeTitle" style={styles.heroAmount} />
            <View style={styles.heroMeta}>
              <AppText variant="caption" color={palette.textMuted}>
                {totals.count} {totals.count === 1 ? 'entry' : 'entries'} · {totals.daysWithSpend}{' '}
                {totals.daysWithSpend === 1 ? 'day' : 'days'} spending
              </AppText>
              <AppText variant="caption" color={palette.textMuted}>
                {formatMoney(totals.averagePerDayCents, { symbol: currencySymbol, compactZeroDecimals: true })} / day
              </AppText>
            </View>
          </GlassSurface>

          {/* Period-over-period ---------------------------------------- */}
          <GlassSurface radius={20} padding={14}>
            <View style={styles.compareRow}>
              <View style={styles.compareCell}>
                <AppText variant="caption" color={palette.textMuted}>
                  Previous period
                </AppText>
                <MoneyText cents={comparison.previousCents} variant="subhead" />
              </View>
              <View style={styles.compareCellRight}>
                <AppText variant="caption" color={palette.textMuted}>
                  Change
                </AppText>
                <AppText
                  variant="headline"
                  color={comparison.direction === 'up' ? palette.dangerText : comparison.direction === 'down' ? palette.successText : colors.textMuted}
                >
                  {comparison.direction === 'same'
                    ? 'no change'
                    : `${comparison.direction === 'up' ? '+' : '−'}${formatMoney(Math.abs(comparison.deltaCents), { symbol: currencySymbol, compactZeroDecimals: true })}`}
                </AppText>
              </View>
            </View>
          </GlassSurface>

          {/* Category donut -------------------------------------------- */}
          <View style={styles.section}>
            <AppText variant="headline">Where it goes</AppText>
            <GlassSurface level="high" radius={20} padding={0}>
              <View style={styles.donutLegend}>
                {totals.donut.slice(0, 6).map((slice, index) => (
                  <View key={slice.key} style={[styles.legendRow, index > 0 && styles.legendBorder]}>
                    <View style={[styles.dot, { backgroundColor: slice.color }]} />
                    <AppText variant="subhead" numberOfLines={1} style={styles.legendLabel}>
                      {slice.label}
                    </AppText>
                    <AppText variant="caption" color={palette.textMuted}>
                      {Math.round(slice.share * 100)}%
                    </AppText>
                    <MoneyText cents={slice.value} variant="subhead" />
                  </View>
                ))}
              </View>
            </GlassSurface>
          </View>

          {/* Daily bars ------------------------------------------------ */}
          <View style={styles.section}>
            <AppText variant="headline">Day by day</AppText>
            <GlassSurface level="high" radius={20} padding={spacing.md}>
              <View style={styles.chart}>
                {totals.daily.map((point) => (
                  <View key={point.date} style={styles.barColumn}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: point.value > 0 ? Math.max(4, (point.value / Math.max(1, maxDaily)) * 96) : 3,
                          backgroundColor: point.value > 0 ? colors.matcha500 : colors.matcha200,
                        },
                      ]}
                    />
                    {totals.daily.length <= 14 ? (
                      <AppText variant="caption" color={palette.textMuted}>
                        {point.label}
                      </AppText>
                    ) : null}
                  </View>
                ))}
              </View>
            </GlassSurface>
          </View>

          {/* Payment split --------------------------------------------- */}
          <View style={styles.section}>
            <AppText variant="headline">Paid with</AppText>
            <GlassSurface level="high" radius={20} padding={spacing.md} style={styles.splitCard}>
              {totals.paymentSplit.map((slice) => (
                <View key={slice.key} style={styles.splitRow}>
                  <View style={styles.splitLabel}>
                    <View style={[styles.dot, { backgroundColor: slice.color }]} />
                    <AppText variant="subhead" numberOfLines={1} style={styles.legendLabel}>
                      {slice.label}
                    </AppText>
                  </View>
                  <View style={styles.splitBar}>
                    <ProgressBar progress={slice.share} height={8} accessibilityLabel={`${slice.label} share`} />
                  </View>
                  <MoneyText cents={slice.value} variant="caption" />
                </View>
              ))}
            </GlassSurface>
          </View>

          {/* Insight sentences ----------------------------------------- */}
          <View style={styles.section}>
            <AppText variant="headline">Insights</AppText>
            <GlassSurface radius={20} padding={spacing.md}>
              <View style={styles.insightList}>
                {insights.map((sentence) => (
                  <View key={sentence} style={styles.insightRow}>
                    <View style={styles.leafDot} />
                    <AppText variant="callout" style={styles.insightText}>
                      {sentence}
                    </AppText>
                  </View>
                ))}
              </View>
            </GlassSurface>
          </View>

          {/* Grocery summary ------------------------------------------- */}
          {totals.groceryCents > 0 ? (
            <GlassSurface radius={20} padding={14}>
              <AppText variant="footnote" color={palette.textMuted}>
                Grocery trips
              </AppText>
              <MoneyText cents={totals.groceryCents} variant="title2" />
            </GlassSurface>
          ) : null}

          <GlassButton
            label="Export CSV"
            variant="secondary"
            icon={<Share2 size={18} strokeWidth={1.75} color={palette.emphasis} />}
            onPress={() => void handleExport()}
          />
        </>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAmount: {
    fontSize: 44,
    lineHeight: 52,
  },
  heroMeta: {
    gap: 2,
    marginTop: spacing.xs,
  },
  compareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  compareCell: {
    gap: 2,
  },
  compareCellRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  section: {
    gap: spacing.xs,
  },
  donutLegend: {
    paddingVertical: spacing.xxs,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  legendBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  legendLabel: {
    flex: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 2,
    height: 128,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  bar: {
    width: '100%',
    borderRadius: 4,
  },
  splitCard: {
    gap: spacing.sm,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  splitLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    width: 132,
  },
  splitBar: {
    flex: 1,
  },
  insightList: {
    gap: spacing.sm,
  },
  insightRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  leafDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.matcha500,
    marginTop: 7,
  },
  insightText: {
    flex: 1,
  },
});
