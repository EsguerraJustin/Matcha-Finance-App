/**
 * Category / type / payment-method manager.
 *
 * Defaults can be **renamed, recoloured, reordered and archived** but never
 * hard-deleted, so history stays intact (brief Section 6.2).
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Plus } from 'lucide-react-native';

import { GlassSurface } from '../../src/components/glass/GlassSurface';
import { GlassCard } from '../../src/components/glass/GlassCard';
import { GlassButton } from '../../src/components/glass/GlassButton';
import { GlassInput } from '../../src/components/ui/GlassInput';
import { AppText } from '../../src/components/ui/AppText';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ScreenScaffold } from '../../src/components/ui/ScreenScaffold';
import { ChipRow, type ChipRowItem } from '../../src/components/expense/ChipRow';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { useDb, useDbQuery } from '../../src/state/dbStore';
import { showToast } from '../../src/state/toastStore';
import {
  createCategory,
  createPaymentMethod,
  createType,
  listCategories,
  listPaymentMethods,
  setCategoryArchived,
  setPaymentMethodArchived,
  updateCategory,
  updateType,
  type CategoryWithTypes,
  type PaymentMethod,
} from '../../src/db/repositories/categoriesRepo';
import { categoryColorList, colors } from '../../theme/colors';
import { spacing } from '../../theme/typography';
import { withAlpha } from '../../src/components/glass/GlassChip';

export default function CategoryManagerScreen() {
  const db = useDb();
  const { glass } = useAppTheme();

  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renamingTypeId, setRenamingTypeId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('Food');
  const [newTypeName, setNewTypeName] = useState('');
  const [newPaymentName, setNewPaymentName] = useState('');

  const { data: categories } = useDbQuery<CategoryWithTypes[]>(
    (handle) => listCategories(handle, { includeArchived: showArchived }),
    [showArchived],
    [],
  );
  const { data: paymentMethods } = useDbQuery<PaymentMethod[]>(
    (handle) => listPaymentMethods(handle, { includeArchived: showArchived }),
    [showArchived],
    [],
  );

  const colorChips: ChipRowItem[] = useMemo(
    () => categoryColorList.map((value) => ({ id: value, label: ' ', tint: value })),
    [],
  );

  const addCategory = useCallback(() => {
    const name = newCategoryName.trim();
    if (!db || !name) return;
    void createCategory(db, { name, icon: 'shapes', colorKey: newCategoryColor }).then(() => {
      setNewCategoryName('');
      showToast({ message: `Added ${name}.`, tone: 'success' });
    });
  }, [db, newCategoryColor, newCategoryName]);

  const addType = useCallback(() => {
    const name = newTypeName.trim();
    if (!db || !expanded || !name) return;
    void createType(db, expanded, name).then(() => setNewTypeName(''));
  }, [db, expanded, newTypeName]);

  const addPaymentMethod = useCallback(() => {
    const name = newPaymentName.trim();
    if (!db || !name) return;
    void createPaymentMethod(db, { name, icon: 'wallet' }).then(() => setNewPaymentName(''));
  }, [db, newPaymentName]);

  const commitRename = useCallback(() => {
    const name = renamingValue.trim();
    if (!db || !renamingTypeId || !name) {
      setRenamingTypeId(null);
      return;
    }
    void updateType(db, renamingTypeId, name).then(() => setRenamingTypeId(null));
  }, [db, renamingTypeId, renamingValue]);

  return (
    <ScreenScaffold title="Categories" subtitle="Rename, recolour, reorder or archive">
      <View style={styles.section}>
        <AppText variant="headline">Categories</AppText>

        {categories.length === 0 ? (
          <EmptyState compact title="No categories yet" message="Add your first one below." />
        ) : (
          categories.map((category) => (
            <GlassCard key={category.id} padding={12} style={styles.card}>
              <Pressable
                onPress={() => setExpanded((current) => (current === category.id ? null : category.id))}
                accessibilityRole="button"
                accessibilityLabel={`${category.name}, ${category.types.length} types`}
                style={styles.cardHeader}
              >
                <View style={[styles.swatch, { backgroundColor: withAlpha(category.color_key, 0.9) }]} />
                <View style={styles.cardTitle}>
                  <AppText variant="subhead" numberOfLines={1} color={category.archived ? colors.textMuted : colors.matcha900}>
                    {category.name}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    {category.types.length} type{category.types.length === 1 ? '' : 's'}
                    {category.is_default ? ' · default' : ''}
                    {category.archived ? ' · archived' : ''}
                  </AppText>
                </View>
                {expanded === category.id ? (
                  <ChevronUp size={20} strokeWidth={1.75} color={colors.matcha700} />
                ) : (
                  <ChevronDown size={20} strokeWidth={1.75} color={colors.matcha700} />
                )}
              </Pressable>

              {expanded === category.id ? (
                <View style={styles.cardBody}>
                  {category.types.map((type) => (
                    <View key={type.id} style={styles.typeRow}>
                      {renamingTypeId === type.id ? (
                        <GlassInput
                          value={renamingValue}
                          onChangeText={setRenamingValue}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={commitRename}
                          onBlur={commitRename}
                          containerStyle={styles.renameField}
                        />
                      ) : (
                        <>
                          <AppText variant="subhead" numberOfLines={1} color={type.archived ? colors.textMuted : colors.matcha900}>
                            {type.name}
                          </AppText>
                          <Pressable
                            onPress={() => {
                              setRenamingTypeId(type.id);
                              setRenamingValue(type.name);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Rename ${type.name}`}
                            hitSlop={8}
                          >
                            <AppText variant="caption" color={colors.matcha700}>
                              rename
                            </AppText>
                          </Pressable>
                        </>
                      )}
                    </View>
                  ))}

                  <GlassInput
                    value={newTypeName}
                    onChangeText={setNewTypeName}
                    placeholder="New type"
                    returnKeyType="done"
                    onSubmitEditing={addType}
                  />
                  <GlassButton label="Add type" variant="secondary" size="small" onPress={addType} disabled={!newTypeName.trim()} />

                  <View style={styles.inlineActions}>
                    {COLOR_KEYS.map((key) => (
                      <Pressable
                        key={key}
                        onPress={() => db && void updateCategory(db, category.id, { colorKey: key })}
                        accessibilityRole="button"
                        accessibilityLabel={`Recolour ${category.name} ${key}`}
                        style={[
                          styles.colorDot,
                          { backgroundColor: withAlpha(categoryColorList[COLOR_KEYS.indexOf(key)], 0.95) },
                          category.color_key === key && styles.colorDotActive,
                        ]}
                      />
                    ))}
                  </View>

                  <Pressable
                    onPress={() => db && void setCategoryArchived(db, category.id, category.archived === 0)}
                    accessibilityRole="button"
                    style={styles.archiveRow}
                  >
                    {category.archived ? (
                      <ArchiveRestore size={18} strokeWidth={1.75} color={colors.matcha700} />
                    ) : (
                      <Archive size={18} strokeWidth={1.75} color={colors.matcha700} />
                    )}
                    <AppText variant="caption" color={colors.matcha700}>
                      {category.archived ? 'Restore category' : 'Archive category (keeps history)'}
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
            </GlassCard>
          ))
        )}

        <GlassSurface level="low" radius={20} padding={14} style={styles.addBlock}>
          <AppText variant="footnote" color={colors.textMuted}>
            New category — pick a pastel, then name it
          </AppText>
          <ChipRow items={colorChips} selectedIds={[newCategoryColor]} onToggle={setNewCategoryColor} size="small" />
          <GlassInput
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            placeholder="e.g. Gaming"
            returnKeyType="done"
            onSubmitEditing={addCategory}
          />
          <GlassButton label="Add category" size="small" onPress={addCategory} disabled={!newCategoryName.trim()} />
        </GlassSurface>
      </View>

      <View style={styles.section}>
        <AppText variant="headline">Payment methods</AppText>
        {paymentMethods.map((method) => (
          <GlassCard key={method.id} padding={12}>
            <View style={styles.paymentRow}>
              <View style={styles.cardTitle}>
                <AppText variant="subhead" color={method.archived ? colors.textMuted : colors.matcha900}>
                  {method.name}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {method.is_default ? 'default' : 'custom'}
                  {method.archived ? ' · archived' : ''}
                </AppText>
              </View>
              <Pressable
                onPress={() => db && void setPaymentMethodArchived(db, method.id, method.archived === 0)}
                accessibilityRole="button"
                accessibilityLabel={method.archived ? `Restore ${method.name}` : `Archive ${method.name}`}
                hitSlop={8}
              >
                {method.archived ? (
                  <ArchiveRestore size={20} strokeWidth={1.75} color={colors.matcha700} />
                ) : (
                  <Archive size={20} strokeWidth={1.75} color={colors.matcha700} />
                )}
              </Pressable>
            </View>
          </GlassCard>
        ))}

        <GlassSurface level="low" radius={20} padding={14} style={styles.addBlock}>
          <GlassInput
            value={newPaymentName}
            onChangeText={setNewPaymentName}
            placeholder="e.g. Sunlight card"
            returnKeyType="done"
            onSubmitEditing={addPaymentMethod}
          />
          <GlassButton
            label="Add payment method"
            size="small"
            icon={<Plus size={18} strokeWidth={2} color={colors.matcha900} />}
            onPress={addPaymentMethod}
            disabled={!newPaymentName.trim()}
          />
        </GlassSurface>
      </View>

      <Pressable
        onPress={() => setShowArchived((current) => !current)}
        accessibilityRole="switch"
        accessibilityState={{ checked: showArchived }}
        style={[styles.showArchived, { borderColor: glass.borderInner }]}
      >
        <AppText variant="caption" color={colors.matcha700}>
          {showArchived ? 'Hide archived items' : 'Show archived items'}
        </AppText>
      </Pressable>
    </ScreenScaffold>
  );
}

/** The pastel keys stored in `categories.color_key`, in the seed order. */
const COLOR_KEYS = ['Food', 'Transportation', 'Groceries', 'School supplies', 'Shopping', 'Bills', 'Others'] as const;

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 999,
  },
  cardTitle: {
    flex: 1,
    gap: 2,
  },
  cardBody: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 44,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  renameField: {
    flex: 1,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingTop: spacing.xxs,
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 999,
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: colors.matcha700,
  },
  archiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    minHeight: 44,
  },
  addBlock: {
    gap: spacing.xs,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  showArchived: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});