/**
 * Allowance — money in.
 *
 * Multiple entries per month (allowance, side income, gift), a monthly
 * overview with net remaining and a simple runway, plus the recurring rule
 * that auto-adds an allowance on its due date.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';

import { GlassCard } from '../src/components/glass/GlassCard';
import { GlassSurface } from '../src/components/glass/GlassSurface';
import { GlassButton } from '../src/components/glass/GlassButton';
import { GlassInput } from '../src/components/ui/GlassInput';
import { GlassDatePickerField } from '../src/components/ui/GlassDatePickerField';
import { AppText, MoneyText } from '../src/components/ui/AppText';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ScreenScaffold } from '../src/components/ui/ScreenScaffold';
import { ProgressBar } from '../src/components/ui/ProgressBar';
import { GlassSegmented } from '../src/components/glass/GlassSegmented';
import { useDb, useDbQuery } from '../src/state/dbStore';
import { usePalette } from '../src/hooks/useAppTheme';
import { showToast } from '../src/state/toastStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { formatMonthLabel, monthRangeISO, relativeDayLabel, todayISO } from '../src/lib/date';
import { parseAmountToCents, ratio } from '../src/lib/money';
import { firstMonthlyDue, firstWeeklyDue } from '../src/lib/recurring';
import {
  allowanceOverview,
  createAllowance,
  deleteAllowance,
  listAllowances,
  type AllowanceWithTotals,
} from '../src/db/repositories/allowancesRepo';
import { createRecurringRule } from '../src/db/repositories/recurringRepo';
import { spacing } from '../theme/typography';

type RecurOption = 'none' | 'weekly' | 'monthly';

const RECUR_OPTIONS: ReadonlyArray<{ value: RecurOption; label: string }> = [
  { value: 'none', label: 'One-off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function AllowanceScreen() {
  const palette = usePalette();
  const db = useDb();
  const today = todayISO();
  const monthStartsOn = useSettingsStore((state) => state.monthStartsOn);
  const weekStartsOn = useSettingsStore((state) => state.weekStartsOn);
  const cycle = useMemo(() => monthRangeISO(today, monthStartsOn), [monthStartsOn, today]);

  const [amountText, setAmountText] = useState('');
  const [source, setSource] = useState('');
  const [receivedOn, setReceivedOn] = useState(today);
  const [notes, setNotes] = useState('');
  const [recur, setRecur] = useState<RecurOption>('none');

  const { data: allowances } = useDbQuery<AllowanceWithTotals[]>(
    (handle) => listAllowances(handle),
    [],
    [],
  );
  const overview = useDbQuery(() => allowanceOverview(cycle.start, cycle.end), [cycle.start, cycle.end], {
    allowance_cents: 0,
    spent_cents: 0,
    net_cents: 0,
    runwayDays: null,
  });

  const add = useCallback(() => {
    const cents = parseAmountToCents(amountText);
    if (!db || cents === null || cents <= 0) {
      showToast({ message: 'Enter an amount first.', tone: 'warning' });
      return;
    }

    void createAllowance(db, {
      amount_cents: cents,
      received_on: receivedOn,
      source: source || 'Allowance',
      notes,
    })
      .then(() => {
        if (recur !== 'none') {
          const nextDue = recur === 'weekly' ? firstWeeklyDue(receivedOn, weekStartsOn) : firstMonthlyDue(receivedOn, Number(receivedOn.slice(8, 10)));
          return createRecurringRule(db, {
            kind: 'allowance',
            amount_cents: cents,
            label: source || 'Allowance',
            note: notes || null,
            frequency: recur === 'weekly' ? 'weekly' : 'monthly',
            interval_n: 1,
            next_due_on: nextDue,
            day_of_week: recur === 'weekly' ? weekStartsOn : null,
            day_of_month: recur === 'monthly' ? Number(receivedOn.slice(8, 10)) : null,
            mode: 'auto',
          });
        }
        return undefined;
      })
      .then(() => {
        setAmountText('');
        setNotes('');
        showToast({ message: 'Allowance added.', tone: 'success' });
      });
  }, [amountText, db, notes, receivedOn, recur, source, weekStartsOn]);

  return (
    <ScreenScaffold title="Allowance" subtitle={formatMonthLabel(cycle.start)}>
      <GlassCard fill="fillTintGreen" padding={16}>
        <AppText variant="footnote" color={palette.textMuted}>
          This month
        </AppText>
        <MoneyText cents={overview.data.net_cents} variant="largeTitle" style={styles.heroAmount} />
        <ProgressBar
          progress={ratio(overview.data.spent_cents, overview.data.allowance_cents)}
          height={8}
          accessibilityLabel="Allowance used"
        />
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <AppText variant="caption" color={palette.textMuted}>
              In
            </AppText>
            <MoneyText cents={overview.data.allowance_cents} variant="subhead" />
          </View>
          <View style={styles.stat}>
            <AppText variant="caption" color={palette.textMuted}>
              Out
            </AppText>
            <MoneyText cents={overview.data.spent_cents} variant="subhead" />
          </View>
          <View style={styles.stat}>
            <AppText variant="caption" color={palette.textMuted}>
              Runway
            </AppText>
            <AppText variant="subhead">
              {overview.data.runwayDays === null ? '—' : `${overview.data.runwayDays}d`}
            </AppText>
          </View>
        </View>
        <AppText variant="caption" color={palette.textMuted}>
          {runwayCopy(overview.data.runwayDays, overview.data.net_cents, overview.data.allowance_cents)}
        </AppText>
      </GlassCard>

      <GlassSurface level="low" radius={20} padding={14} style={styles.createBlock}>
        <AppText variant="headline">Add allowance</AppText>
        <GlassInput value={amountText} onChangeText={setAmountText} placeholder="₱3,000" keyboardType="decimal-pad" label="Amount" />
        <GlassInput value={source} onChangeText={setSource} placeholder="Parents, scholarship, side gig…" label="Source" />
        <GlassDatePickerField value={receivedOn} onChange={setReceivedOn} label="Received on" />
        <GlassInput value={notes} onChangeText={setNotes} placeholder="Optional note" label="Notes" />
        <GlassSegmented options={RECUR_OPTIONS} value={recur} onChange={setRecur} />
        <GlassButton label="Add" onPress={add} />
      </GlassSurface>

      <View style={styles.section}>
        <AppText variant="headline">All entries</AppText>
        {allowances.length === 0 ? (
          <EmptyState compact title="No allowance yet" message="Add what you receive so the numbers mean something." />
        ) : (
          allowances.map((allowance) => (
            <GlassCard key={allowance.id} padding={12}>
              <View style={styles.entryRow}>
                <View style={styles.entryText}>
                  <AppText variant="subhead">{allowance.source ?? 'Allowance'}</AppText>
                  <AppText variant="caption" color={palette.textMuted}>
                    {relativeDayLabel(allowance.received_on, today)}
                    {allowance.recurring_rule_id ? ' · recurring' : ''}
                    {allowance.notes ? ` · ${allowance.notes}` : ''}
                  </AppText>
                </View>
                <MoneyText cents={allowance.amount_cents} variant="subhead" />
                <Pressable
                  onPress={() => db && void deleteAllowance(db, allowance.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${allowance.source ?? 'allowance'}`}
                  hitSlop={8}
                >
                  <Trash2 size={18} strokeWidth={1.75} color={palette.dangerText} />
                </Pressable>
              </View>
            </GlassCard>
          ))
        )}
      </View>
    </ScreenScaffold>
  );
}

function runwayCopy(runwayDays: number | null, netCents: number, allowanceCents: number): string {
  if (runwayDays === null) return 'Nothing spent this cycle yet.';
  if (allowanceCents <= 0) return 'No allowance logged for this cycle yet.';
  if (netCents < 0) return "You've spent more than this cycle's allowance.";
  if (netCents === 0) return "Used up this cycle's allowance exactly.";
  if (runwayDays >= 31) return 'Comfortably covered for the whole cycle.';
  if (runwayDays < 1) return "At this pace, the allowance won't last the cycle.";
  return `At this pace, your money lasts about ${runwayDays} days.`;
}

const styles = StyleSheet.create({
  heroAmount: {
    fontSize: 40,
    lineHeight: 48,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  createBlock: {
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  entryText: {
    flex: 1,
    gap: 2,
  },
});