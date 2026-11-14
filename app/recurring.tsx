/**
 * Recurring expenses & bill reminders.
 *
 * Each rule either **auto-adds** the expense when its due date passes, or
 * **reminds** with one local notification and waits for a manual "Log now".
 * The catch-up runs on app open.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Bell, Plus, Trash2 } from 'lucide-react-native';

import { GlassCard } from '../src/components/glass/GlassCard';
import { GlassSurface } from '../src/components/glass/GlassSurface';
import { GlassButton } from '../src/components/glass/GlassButton';
import { GlassInput } from '../src/components/ui/GlassInput';
import { GlassDatePickerField } from '../src/components/ui/GlassDatePickerField';
import { AppText, MoneyText } from '../src/components/ui/AppText';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ScreenScaffold } from '../src/components/ui/ScreenScaffold';
import { GlassSegmented } from '../src/components/glass/GlassSegmented';
import { ChipRow, type ChipRowItem } from '../src/components/expense/ChipRow';
import { categoryTint, useAppTheme } from '../src/hooks/useAppTheme';
import { useDb, useDbQuery } from '../src/state/dbStore';
import { showToast } from '../src/state/toastStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { humanFrequency, type Frequency, type RuleMode } from '../src/lib/recurring';
import { relativeDayLabel, todayISO, type WeekStart } from '../src/lib/date';
import { parseAmountToCents } from '../src/lib/money';
import { cancelBillReminder } from '../src/lib/notifications';
import {
  createRecurringRule,
  deleteRecurringRule,
  listRecurringRules,
  logRecurringOccurrence,
  setRuleActive,
  type RecurringRuleRow,
} from '../src/db/repositories/recurringRepo';
import { categoryId as seedCategoryId, paymentMethodId as seedPaymentMethodId } from '../src/db/seed';
import { listCategories, listPaymentMethods, type CategoryWithTypes, type PaymentMethod } from '../src/db/repositories/categoriesRepo';
import { colors } from '../theme/colors';
import { spacing } from '../theme/typography';

const FREQUENCIES: ReadonlyArray<{ value: Frequency; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const MODES: ReadonlyArray<{ value: RuleMode; label: string }> = [
  { value: 'auto', label: 'Auto-add' },
  { value: 'remind', label: 'Remind me' },
];

export default function RecurringScreen() {
  const db = useDb();
  const { glass, palette } = useAppTheme();
  const today = todayISO();
  const weekStartsOn = useSettingsStore((state) => state.weekStartsOn) as WeekStart;

  const [label, setLabel] = useState('');
  const [amountText, setAmountText] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [mode, setMode] = useState<RuleMode>('auto');
  const [nextDueOn, setNextDueOn] = useState(today);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);

  const { data: rules } = useDbQuery((handle) => listRecurringRules(handle, { includeInactive: true }), [], []);
  const { data: categories } = useDbQuery<CategoryWithTypes[]>((handle) => listCategories(handle), [], []);
  const { data: paymentMethods } = useDbQuery<PaymentMethod[]>((handle) => listPaymentMethods(handle), [], []);

  const activeCategory = useMemo(() => categories.find((entry) => entry.id === categoryId) ?? null, [categories, categoryId]);

  const categoryChips: ChipRowItem[] = useMemo(
    () => categories.map((category) => ({ id: category.id, label: category.name, tint: categoryTint(category.name) })),
    [categories],
  );
  const typeChips: ChipRowItem[] = useMemo(
    () => (activeCategory?.types ?? []).map((type) => ({ id: type.id, label: type.name, tint: categoryTint(activeCategory?.name) })),
    [activeCategory],
  );
  const paymentChips: ChipRowItem[] = useMemo(
    () => paymentMethods.map((method) => ({ id: method.id, label: method.name })),
    [paymentMethods],
  );

  const add = useCallback(() => {
    const cents = parseAmountToCents(amountText);
    if (!db || !label.trim() || cents === null || cents <= 0) {
      showToast({ message: 'Give it a label and an amount.', tone: 'warning' });
      return;
    }

    void createRecurringRule(db, {
      kind: 'expense',
      amount_cents: cents,
      label: label.trim(),
      category_id: categoryId,
      type_id: typeId,
      payment_method_id: paymentMethodId,
      frequency,
      interval_n: 1,
      next_due_on: nextDueOn,
      day_of_week: frequency === 'weekly' ? weekStartsOn : null,
      day_of_month: frequency === 'monthly' ? Number(nextDueOn.slice(8, 10)) : null,
      mode,
    }).then(() => {
      setLabel('');
      setAmountText('');
      showToast({ message: `${mode === 'auto' ? 'Recurring expense' : 'Reminder'} set for ${label.trim()}.`, tone: 'success' });
    });
  }, [amountText, categoryId, db, frequency, label, mode, nextDueOn, paymentMethodId, typeId, weekStartsOn]);

  const logNow = useCallback(
    async (rule: RecurringRuleRow) => {
      if (!db) return;
      const loggedOn = await logRecurringOccurrence(db, rule.id, today, {
        categoryId: categoryId ?? seedCategoryId('others'),
        paymentMethodId: paymentMethodId ?? seedPaymentMethodId('cash'),
      });

      if (!loggedOn) {
        showToast({ message: 'Nothing is due on this one right now.', tone: 'warning' });
        return;
      }

      // The in-app log answers the pending notification, so drop it.
      void cancelBillReminder(rule.id, loggedOn);
      showToast({
        message: `${rule.label} logged for ${relativeDayLabel(loggedOn, today) === 'Today' ? 'today' : loggedOn}.`,
        tone: 'success',
      });
    },
    [categoryId, db, paymentMethodId, today],
  );

  return (
    <ScreenScaffold title="Recurring" subtitle="Bills that arrive on their own">
      {rules.length === 0 ? (
        <EmptyState title="Nothing recurring yet" message="Phone load, boarding house, weekly allowance — add them once." />
      ) : (
        rules.map((rule) => (
          <GlassCard key={rule.id} padding={12}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <AppText variant="subhead" color={rule.active ? colors.matcha900 : colors.textMuted}>
                  {rule.label}
                </AppText>
                <AppText variant="caption" color={palette.textMuted}>
                  {humanFrequency(rule)} · next {relativeDayLabel(rule.next_due_on, today)} ·{' '}
                  {rule.mode === 'auto' ? 'auto-add' : 'remind me'}
                </AppText>
              </View>
              <MoneyText cents={rule.amount_cents} variant="subhead" color={rule.active ? colors.matcha900 : colors.textMuted} />
            </View>

            <View style={styles.rowActions}>
              <GlassButton
                label={rule.active ? 'Pause' : 'Resume'}
                variant="secondary"
                size="small"
                onPress={() => db && void setRuleActive(db, rule.id, !rule.active)}
                style={styles.action}
              />
              <GlassButton
                label="Log now"
                variant="secondary"
                size="small"
                icon={<Bell size={15} strokeWidth={1.75} color={palette.emphasis} />}
                onPress={() => void logNow(rule)}
                style={styles.action}
              />
              <Pressable
                onPress={() => db && void deleteRecurringRule(db, rule.id)}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${rule.label}`}
                hitSlop={8}
                style={styles.deleteButton}
              >
                <Trash2 size={18} strokeWidth={1.75} color={palette.dangerText} />
              </Pressable>
            </View>
          </GlassCard>
        ))
      )}

      <GlassSurface level="low" radius={20} padding={14} style={styles.createBlock}>
        <AppText variant="headline">New recurring expense</AppText>
        <GlassInput value={label} onChangeText={setLabel} placeholder="Phone load" label="Label" />
        <GlassInput value={amountText} onChangeText={setAmountText} placeholder="₱100" keyboardType="decimal-pad" label="Amount" />
        <GlassSegmented options={FREQUENCIES} value={frequency} onChange={setFrequency} />
        <AppText variant="footnote" color={palette.textMuted}>
          When it is due
        </AppText>
        <GlassSegmented options={MODES} value={mode} onChange={setMode} />
        <GlassDatePickerField value={nextDueOn} onChange={setNextDueOn} label="Next due" />

        <AppText variant="footnote" color={palette.textMuted}>
          Category
        </AppText>
        <ChipRow
          items={categoryChips}
          selectedIds={categoryId ? [categoryId] : []}
          onToggle={(id) => {
            setCategoryId(id);
            setTypeId(null);
          }}
          size="small"
        />

        {activeCategory && typeChips.length ? (
          <>
            <AppText variant="footnote" color={palette.textMuted}>
              Type
            </AppText>
            <ChipRow items={typeChips} selectedIds={typeId ? [typeId] : []} onToggle={setTypeId} size="small" />
          </>
        ) : null}

        <AppText variant="footnote" color={palette.textMuted}>
          Paid with
        </AppText>
        <ChipRow items={paymentChips} selectedIds={paymentMethodId ? [paymentMethodId] : []} onToggle={setPaymentMethodId} size="small" />

        <GlassButton
          label="Add recurring expense"
          icon={<Plus size={18} strokeWidth={2} color={colors.matcha900} />}
          onPress={add}
        />

        <AppText variant="caption" color={palette.textMuted}>
          Auto-add posts the expense when it comes due. Remind me sends one notification and waits for you to tap Log now. Anything missed while the app was closed is caught up on the next open.
        </AppText>
      </GlassSurface>

      <GlassSurface radius={20} padding={12} style={{ borderColor: glass.borderInner }}>
        <AppText variant="caption" color={palette.textMuted}>
          Everything here runs entirely on your phone — no server, no sync.
        </AppText>
      </GlassSurface>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
    alignItems: 'center',
  },
  action: {
    flex: 1,
  },
  deleteButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBlock: {
    gap: spacing.sm,
  },
});