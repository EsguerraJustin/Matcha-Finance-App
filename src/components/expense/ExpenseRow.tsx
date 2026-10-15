/**
 * `<ExpenseRow />` — one line in History.
 *
 * Rows are **plain translucent fills with hairline dividers**, never a
 * `BlurView` each: the whole list is wrapped in a single glass container
 * (brief Section 4.2 performance rule).
 */

import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText, MoneyText } from '../ui/AppText';
import { categoryTint, useAppTheme } from '../../hooks/useAppTheme';
import { withAlpha } from '../glass/GlassChip';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/typography';
import { receiptFile } from '../../lib/receipts';
import type { ExpenseRow as ExpenseRowModel } from '../../db/repositories/expensesRepo';
import { tapHaptic } from '../../lib/haptics';

export interface ExpenseRowProps {
  expense: ExpenseRowModel;
  onPress?: (expense: ExpenseRowModel) => void;
  onLongPress?: (expense: ExpenseRowModel) => void;
  /** Renders a checkbox and the row's selection state (bulk mode). */
  selected?: boolean;
  selectionMode?: boolean;
  currencySymbol?: string;
}

function ExpenseRowImpl({
  expense,
  onPress,
  onLongPress,
  selected = false,
  selectionMode = false,
}: ExpenseRowProps) {
  const { glass, palette } = useAppTheme();
  const tint = categoryTint(expense.category_name);

  const title = expense.type_name ?? expense.category_name;

  return (
    <Pressable
      onPress={() => {
        tapHaptic();
        onPress?.(expense);
      }}
      onLongPress={() => {
        tapHaptic();
        onLongPress?.(expense);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${expense.payment_name}${expense.note ? `, ${expense.note}` : ''}`}
      accessibilityState={{ selected: selectionMode ? selected : undefined }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? withAlpha(colors.matcha500, 0.22) : pressed ? withAlpha(tint, 0.32) : 'transparent',
        },
      ]}
    >
      <View style={[styles.iconBubble, { backgroundColor: withAlpha(tint, 0.85) }]}>
        <AppText variant="caption" color={palette.isDark ? '#16211A' : colors.matcha900} numberOfLines={1}>
          {expense.category_name.slice(0, 2).toUpperCase()}
        </AppText>
      </View>

      <View style={styles.body}>
        <AppText variant="subhead" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
          {[expense.category_name !== title ? expense.category_name : null, expense.payment_name, expense.note]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      </View>

      {expense.receipt_path ? (
        <Image source={{ uri: receiptFile(expense.receipt_path).uri }} style={styles.thumb} accessibilityLabel="Receipt photo" />
      ) : null}

      <View style={styles.amount}>
        <MoneyText cents={expense.amount_cents} variant="subhead" />
        <View style={[styles.hairline, { backgroundColor: glass.borderInner }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  amount: {
    alignItems: 'flex-end',
    minWidth: 76,
  },
  hairline: {
    position: 'absolute',
    bottom: -spacing.xs,
    right: 0,
    left: spacing.md,
    height: StyleSheet.hairlineWidth,
  },
});

export const ExpenseRow = memo(ExpenseRowImpl);
export default ExpenseRow;