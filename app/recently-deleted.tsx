/**
 * Recently deleted — soft-deleted expenses, purged after 30 days.
 *
 * Deleted expenses are excluded from every total and report (business rule 10)
 * but stay here for 30 days so a mistaken swipe is never fatal.
 */

import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { RotateCcw, Trash2 } from 'lucide-react-native';

import { GlassSurface } from '../src/components/glass/GlassSurface';
import { AppText, MoneyText } from '../src/components/ui/AppText';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ScreenScaffold } from '../src/components/ui/ScreenScaffold';
import { useDb, useDbQuery } from '../src/state/dbStore';
import { showToast } from '../src/state/toastStore';
import { categoryTint } from '../src/hooks/useAppTheme';
import {
  hardDeleteExpense,
  listExpenses,
  restoreExpense,
  type ExpenseRow as ExpenseRowModel,
} from '../src/db/repositories/expensesRepo';
import { diffDaysISO, todayISO } from '../src/lib/date';
import { colors } from '../theme/colors';
import { spacing } from '../theme/typography';

export default function RecentlyDeletedScreen() {
  const db = useDb();
  const today = todayISO();

  const { data: deleted } = useDbQuery<ExpenseRowModel[]>(
    (handle) => listExpenses(handle, { includeDeleted: true }).then((rows) => rows.filter((row) => row.deleted_at)),
    [],
    [],
  );

  const rows = useMemo(
    () =>
      [...deleted].sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? '')),
    [deleted],
  );

  const handleRestore = useCallback(
    (expense: ExpenseRowModel) => {
      if (!db) return;
      void restoreExpense(db, expense.id).then(() => showToast({ message: 'Restored.', tone: 'success' }));
    },
    [db],
  );

  const handlePurge = useCallback(
    (expense: ExpenseRowModel) => {
      if (!db) return;
      void hardDeleteExpense(db, expense.id).then(() => {
        showToast({ message: 'Gone for good.', tone: 'warning' });
      });
    },
    [db],
  );

  return (
    <ScreenScaffold title="Recently deleted" subtitle={rows.length ? 'Purged after 30 days' : undefined}>
      {rows.length === 0 ? (
        <EmptyState title="Nothing here" message="Deleted expenses rest here for 30 days, then disappear." />
      ) : (
        <GlassSurface level="high" radius={20} padding={0}>
          {rows.map((expense, index) => {
            const age = expense.deleted_at ? diffDaysISO(expense.deleted_at.slice(0, 10), today) : 0;
            return (
              <Pressable
                key={expense.id}
                accessibilityRole="button"
                accessibilityLabel={`${expense.category_name}, ${expense.amount_cents / 100}`}
                style={({ pressed }) => [
                  styles.row,
                  index === 0 && styles.rowFirst,
                  index === rows.length - 1 && styles.rowLast,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.dot, { backgroundColor: categoryTint(expense.category_name) }]} />
                <View style={styles.rowText}>
                  <AppText variant="subhead" numberOfLines={1}>
                    {expense.type_name ?? expense.category_name}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                    {expense.note || expense.payment_name} · deleted {age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}
                  </AppText>
                </View>
                <MoneyText cents={expense.amount_cents} variant="subhead" />

                <Pressable onPress={() => handleRestore(expense)} accessibilityRole="button" accessibilityLabel="Restore" hitSlop={8} style={styles.action}>
                  <RotateCcw size={18} strokeWidth={1.75} color={colors.matcha700} />
                </Pressable>
                <Pressable onPress={() => handlePurge(expense)} accessibilityRole="button" accessibilityLabel="Delete forever" hitSlop={8} style={styles.action}>
                  <Trash2 size={18} strokeWidth={1.75} color={colors.dangerText} />
                </Pressable>
              </Pressable>
            );
          })}
        </GlassSurface>
      )}

      <AppText variant="footnote" color={colors.textMuted} center>
        Deleting forever also removes the receipt photo.
      </AppText>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
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
  pressed: {
    backgroundColor: 'rgba(232,243,221,0.5)',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  action: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});