/**
 * `<BulkActionBar />` — the floating bar that appears while rows are selected.
 *
 * "Change category" and "Delete" (brief Section 6.10). Sits above the tab bar
 * so the Add orb stays reachable until selection starts.
 */

import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GlassSurface } from '../glass/GlassSurface';
import { GlassButton } from '../glass/GlassButton';
import { AppText } from '../ui/AppText';
import { ChipRow, type ChipRowItem } from '../expense/ChipRow';
import { categoryTint, usePalette } from '../../hooks/useAppTheme';
import type { CategoryWithTypes } from '../../db/repositories/categoriesRepo';
import { spacing } from '../../../theme/typography';

export interface BulkActionBarProps {
  count: number;
  categories: readonly CategoryWithTypes[];
  onDelete: () => void;
  onChangeCategory: (categoryId: string, typeId: string | null) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export function BulkActionBar({ count, categories, onDelete, onChangeCategory, onSelectAll, onClear }: BulkActionBarProps) {
  const palette = usePalette();
  const [pickingCategory, setPickingCategory] = useState(false);

  const categoryChips: ChipRowItem[] = useMemo(
    () => categories.map((category) => ({ id: category.id, label: category.name, tint: categoryTint(category.name) })),
    [categories],
  );

  return (
    <GlassSurface level="high" fill="fillStrong" radius={24} padding={12} style={styles.bar}>
      <View style={styles.header}>
        <AppText variant="subhead">
          {count} selected
        </AppText>
        <View style={styles.headerActions}>
          <AppText variant="caption" color={palette.emphasis} accessibilityRole="button" onPress={onSelectAll}>
            Select all
          </AppText>
          <AppText variant="caption" color={palette.emphasis} accessibilityRole="button" onPress={onClear}>
            Done
          </AppText>
        </View>
      </View>

      {pickingCategory ? (
        <View style={styles.picker}>
          <ChipRow
            items={categoryChips}
            selectedIds={[]}
            onToggle={(id) => {
              const category = categories.find((entry) => entry.id === id);
              onChangeCategory(id, category?.types[0]?.id ?? null);
              setPickingCategory(false);
            }}
            size="small"
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <GlassButton
            label="Change category"
            variant="secondary"
            size="small"
            onPress={() => setPickingCategory(true)}
            style={styles.action}
          />
          <GlassButton label="Delete" variant="destructive" size="small" onPress={onDelete} style={styles.action} />
        </View>
      )}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginTop: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
  picker: {
    paddingBottom: spacing.xxs,
  },
});

export default BulkActionBar;