/**
 * History filter sheet — date range, category, type, payment, grocery-only and
 * an amount range (brief Section 6.10). Presented as an iOS-style glass sheet.
 */

import { forwardRef, memo, useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type BottomSheet from '@gorhom/bottom-sheet';

import { GlassSheet } from '../glass/GlassSheet';
import { GlassButton } from '../glass/GlassButton';
import { GlassSegmented } from '../glass/GlassSegmented';
import { GlassInput } from '../ui/GlassInput';
import { AppText } from '../ui/AppText';
import { ChipRow, type ChipRowItem } from '../expense/ChipRow';
import { GlassSurface } from '../glass/GlassSurface';
import { categoryTint, usePalette } from '../../hooks/useAppTheme';
import { withAlpha } from '../glass/GlassChip';
import { EMPTY_FILTERS, toggleInList, type DateRangePreset, type FilterState } from '../../lib/expenses';
import { parseAmountToCents } from '../../lib/money';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/typography';
import type { CategoryWithTypes, PaymentMethod } from '../../db/repositories/categoriesRepo';

const RANGE_OPTIONS: ReadonlyArray<{ value: DateRangePreset; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: 'Custom' },
];

export interface FilterSheetProps {
  categories: readonly CategoryWithTypes[];
  paymentMethods: readonly PaymentMethod[];
  value: FilterState;
  onApply: (next: FilterState) => void;
  onClose: () => void;
}

function FilterSheetImpl(
  { categories, paymentMethods, value, onApply, onClose }: FilterSheetProps,
  ref: React.Ref<BottomSheet>,
) {
  const palette = usePalette();
  const [draft, setDraft] = useState<FilterState>(value);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');

  const categoryChips: ChipRowItem[] = useMemo(
    () => categories.map((category) => ({ id: category.id, label: category.name, tint: categoryTint(category.name) })),
    [categories],
  );

  const paymentChips: ChipRowItem[] = useMemo(
    () => paymentMethods.map((method) => ({ id: method.id, label: method.name })),
    [paymentMethods],
  );

  const selectedCategory = categories.find((category) => category.id === draft.categoryIds[0]);

  const typeChips: ChipRowItem[] = useMemo(
    () =>
      (selectedCategory?.types ?? []).map((type) => ({
        id: type.id,
        label: type.name,
        tint: categoryTint(selectedCategory?.name),
      })),
    [selectedCategory],
  );

  const apply = useCallback(() => {
    onApply({
      ...draft,
      minCents: minText.trim() ? (parseAmountToCents(minText) ?? undefined) : undefined,
      maxCents: maxText.trim() ? (parseAmountToCents(maxText) ?? undefined) : undefined,
    });
  }, [draft, maxText, minText, onApply]);

  const reset = useCallback(() => {
    setDraft(EMPTY_FILTERS);
    setMinText('');
    setMaxText('');
  }, []);

  return (
    <GlassSheet ref={ref} index={0} snapPoints={['80%']} scrollable onClose={onClose} title="Filters">
      <ScrollView style={styles.body} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <AppText variant="footnote" color={palette.textMuted}>
            When
          </AppText>
          <GlassSegmented
            options={RANGE_OPTIONS as ReadonlyArray<{ value: DateRangePreset; label: string }>}
            value={draft.preset}
            onChange={(preset) => setDraft((current) => ({ ...current, preset }))}
          />
        </View>

        <View style={styles.section}>
          <AppText variant="footnote" color={palette.textMuted}>
            Category
          </AppText>
          <ChipRow
            items={categoryChips}
            selectedIds={draft.categoryIds}
            onToggle={(id) =>
              setDraft((current) => {
                const next = { ...current, categoryIds: toggleInList(current.categoryIds, id), typeIds: [] };
                // Picking more than one category would make the type list ambiguous.
                if (next.categoryIds.length > 1) next.categoryIds = [id];
                return next;
              })
            }
            wrap
            size="small"
          />
        </View>

        {selectedCategory && typeChips.length ? (
          <View style={styles.section}>
            <AppText variant="footnote" color={palette.textMuted}>
              Type
            </AppText>
            <ChipRow items={typeChips} selectedIds={draft.typeIds} onToggle={(id) => setDraft((current) => ({ ...current, typeIds: toggleInList(current.typeIds, id) }))} wrap size="small" />
          </View>
        ) : null}

        <View style={styles.section}>
          <AppText variant="footnote" color={palette.textMuted}>
            Paid with
          </AppText>
          <ChipRow
            items={paymentChips}
            selectedIds={draft.paymentMethodIds}
            onToggle={(id) => setDraft((current) => ({ ...current, paymentMethodIds: toggleInList(current.paymentMethodIds, id) }))}
            wrap
            size="small"
          />
        </View>

        <View style={styles.section}>
          <AppText variant="footnote" color={palette.textMuted}>
            Amount (₱)
          </AppText>
          <View style={styles.amountRow}>
            <GlassInput
              value={minText}
              onChangeText={setMinText}
              placeholder="Min"
              keyboardType="decimal-pad"
              containerStyle={styles.amountField}
            />
            <GlassInput
              value={maxText}
              onChangeText={setMaxText}
              placeholder="Max"
              keyboardType="decimal-pad"
              containerStyle={styles.amountField}
            />
          </View>
        </View>

        <PressableRow
          label="Groceries only"
          hint="Hide everything that didn't come from a grocery trip"
          tint={colors.matcha100}
          onPress={() => setDraft((current) => ({ ...current, groceryOnly: !current.groceryOnly }))}
          selected={draft.groceryOnly}
        />

        <View style={styles.actions}>
          <GlassButton label="Reset" variant="secondary" onPress={reset} />
          <GlassButton label="Apply" onPress={apply} style={styles.applyButton} />
        </View>
      </ScrollView>
    </GlassSheet>
  );
}

function PressableRow({
  label,
  hint,
  tint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  tint: string;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: selected }}>
      <GlassSurface radius={20} padding={14} style={{ backgroundColor: selected ? tint : undefined }}>
        <View style={styles.rowBetween}>
          <View style={styles.rowText}>
            <AppText variant="subhead">{label}</AppText>
            {hint ? (
              <AppText variant="caption" color={palette.textMuted}>
                {hint}
              </AppText>
            ) : null}
          </View>
          <View style={[styles.checkbox, selected && styles.checkboxOn, { borderColor: colors.matcha200 }]}>
            {selected ? <AppText variant="caption" color={colors.matcha900}>✓</AppText> : null}
          </View>
        </View>
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.xs,
  },
  amountRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  amountField: {
    flex: 1,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  applyButton: {
    flex: 1,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: withAlpha(colors.matcha500, 0.4),
  },
});

export const FilterSheet = memo(forwardRef(FilterSheetImpl));
export default FilterSheet;