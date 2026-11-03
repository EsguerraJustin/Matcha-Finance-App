/**
 * Grocery list detail.
 *
 * Everything from brief Section 6.5 lives here: the store selector, quantity +
 * unit, estimated vs. actual price, price memory suggestions, live running
 * totals against the remaining budget, the matcha tick, and the finish-trip
 * flow that creates exactly one Groceries expense (business rules 8 and 9).
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Check, Plus, Store, Trash2 } from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { useRef } from 'react';

import { GlassSheet } from '../src/components/glass/GlassSheet';
import { GlassSurface } from '../src/components/glass/GlassSurface';
import { GlassButton } from '../src/components/glass/GlassButton';
import { AppText, MoneyText } from '../src/components/ui/AppText';
import { GlassInput } from '../src/components/ui/GlassInput';
import { ScreenScaffold } from '../src/components/ui/ScreenScaffold';
import { ChipRow, type ChipRowItem } from '../src/components/expense/ChipRow';
import { useDb, useDbQuery } from '../src/state/dbStore';
import { showToast } from '../src/state/toastStore';
import { useSettingsStore } from '../src/state/settingsStore';
import { listPaymentMethods } from '../src/db/repositories/categoriesRepo';
import { getCurrentBudget } from '../src/db/repositories/budgetsRepo';
import {
  addGroceryItem,
  createGroceryList,
  deleteGroceryItem,
  finishTrip,
  getGroceryList,
  listGroceryItems,
  setItemPurchased,
  updateGroceryList,
  resolveGroceryTypeId,
  type GroceryItemRow,
} from '../src/db/repositories/groceriesRepo';
import {
  GROCERY_UNITS,
  budgetWarningCopy,
  compareToBudget,
  lineTotalCents,
  parseItemDraft,
  purchasedTotalCents,
  sortForDisplay,
  suggestPriceFromMemory,
} from '../src/lib/groceries';
import { listPriceMemory } from '../src/db/repositories/groceriesRepo';
import { todayISO } from '../src/lib/date';
import { tapHaptic } from '../src/lib/haptics';
import { useAppTheme, usePalette } from '../src/hooks/useAppTheme';
import { colors } from '../theme/colors';
import { spacing } from '../theme/typography';

export default function GroceryListScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useDb();
  const stores = useSettingsStore((state) => state.defaultGroceryStores);
  const today = todayISO();
  const { glass, palette } = useAppTheme();

  const [itemSheetOpen, setItemSheetOpen] = useState(false);
  const itemSheetRef = useRef<BottomSheet>(null);

  const { data: list } = useDbQuery((handle) => (id ? getGroceryList(handle, id) : Promise.resolve(null)), [id], null);
  const { data: items } = useDbQuery<GroceryItemRow[]>(
    (handle) => (id ? listGroceryItems(handle, id) : Promise.resolve([])),
    [id],
    [],
  );
  const { data: memory } = useDbQuery((handle) => listPriceMemory(handle, list?.store ?? null), [list?.store, id], []);
  const { data: paymentMethods } = useDbQuery((handle) => listPaymentMethods(handle), [], []);
  const { data: budget } = useDbQuery((handle) => getCurrentBudget(handle, today), [today], null);

  const remainingBudget = budget?.remaining_cents ?? 0;
  // `sortForDisplay` is typed against the domain shape, so join the sorted rows
  // back onto the DB rows to keep `list_id` for the handlers.
  const ordered = useMemo<GroceryItemRow[]>(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return sortForDisplay(items).map((sorted) => {
      const row = byId.get(sorted.id);
      return row ?? ({ ...sorted, list_id: id ?? '' } as GroceryItemRow);
    });
  }, [id, items]);
  const purchased = purchasedTotalCents(items);
  const comparison = useMemo(() => compareToBudget(items, remainingBudget), [items, remainingBudget]);

  const storeChips: ChipRowItem[] = useMemo(
    () => [...stores, 'Other'].map((store) => ({ id: store, label: store })),
    [stores],
  );

  const handleTogglePurchased = useCallback(
    (item: GroceryItemRow) => {
      if (!db) return;
      tapHaptic();
      void setItemPurchased(db, item.id, item.status !== 'purchased');
    },
    [db],
  );

  const handleDeleteItem = useCallback(
    (item: GroceryItemRow) => {
      if (!db) return;
      void deleteGroceryItem(db, item.id);
    },
    [db],
  );

  const handleFinishTrip = useCallback(async () => {
    if (!db || !id) return;
    const groceryCategory = await resolveGroceryCategory(db);
    if (!groceryCategory) {
      showToast({ message: 'No Groceries category found — restore the defaults.', tone: 'warning' });
      return;
    }
    const typeId = await resolveGroceryTypeId(db, groceryCategory, list?.store ?? null);
    const result = await finishTrip(db, {
      listId: id,
      paymentMethodId: paymentMethods[0]?.id ?? '',
      spentOn: today,
      groceryCategoryId: groceryCategory,
      groceryTypeId: typeId,
    });
    if (!result) {
      showToast({ message: 'Tick at least one item first.', tone: 'warning' });
      return;
    }
    if (result.carriedOver > 0) {
      showToast({ message: `Trip logged — ${result.carriedOver} item${result.carriedOver === 1 ? '' : 's'} carried over.`, tone: 'success' });
    } else {
      showToast({ message: 'Trip logged. One Groceries expense added.', tone: 'success' });
    }
    router.back();
  }, [db, id, list, paymentMethods, today]);

  // Brief 6.5: templates let a weekly trip start with one tap.
  const handleSaveAsTemplate = useCallback(async () => {
    if (!db || !id) return;
    const templateId = await createGroceryList(db, {
      name: `${list?.name ?? 'Weekly'} staples`,
      store: list?.store ?? null,
      is_template: true,
    });
    for (const item of items) {
      await addGroceryItem(db, templateId, {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        est_price_cents: item.est_price_cents,
      });
    }
    showToast({ message: 'Saved as a template.', tone: 'success' });
  }, [db, id, items, list?.name, list?.store]);

  if (!list) {
    return (
      <ScreenScaffold title="Grocery list">
        <EmptyList onBack={() => router.back()} />
      </ScreenScaffold>
    );
  }

  return (
    <>
      <ScreenScaffold
        title={list.name}
        subtitle={list.status === 'completed' ? 'Completed trip' : `${ordered.length} item${ordered.length === 1 ? '' : 's'}`}
        accessory={
          <Pressable onPress={() => setItemSheetOpen(true)} accessibilityRole="button" accessibilityLabel="Add item" hitSlop={8}>
            <Plus size={24} strokeWidth={2} color={palette.emphasis} />
          </Pressable>
        }
      >
        {/* Live running totals (brief 6.5) ---------------------------- */}
        <GlassSurface level="high" radius={20} padding={0} style={{ backgroundColor: glass.fillTintGreen }}>
          <View style={styles.totalsRow}>
            <TotalCell label="In cart" cents={purchased} />
            <View style={[styles.totalDivider, { backgroundColor: palette.divider }]} />
            <TotalCell label="Still to buy" cents={comparison.estimateCents - purchased} />
            <View style={[styles.totalDivider, { backgroundColor: palette.divider }]} />
            <TotalCell label="List total" cents={comparison.estimateCents} strong />
          </View>
        </GlassSurface>

        <GlassSurface
          radius={20}
          padding={14}
          style={{ backgroundColor: comparison.overBudget ? palette.dangerBg : glass.fill }}
        >
          <AppText variant="subhead" color={comparison.overBudget ? palette.dangerText : colors.matcha900}>
            {budgetWarningCopy({ ...comparison, remainingCents: remainingBudget })}
          </AppText>
        </GlassSurface>

        {/* Store selector ---------------------------------------------- */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Store size={16} strokeWidth={1.75} color={palette.emphasis} />
            <AppText variant="footnote" color={palette.textMuted}>
              Store
            </AppText>
          </View>
          <ChipRow
            items={storeChips}
            selectedIds={list.store ? [list.store] : []}
            onToggle={(store) => {
              if (!db) return;
              void updateGroceryList(db, list.id, { store: store === 'Other' ? null : store });
            }}
            size="small"
          />
        </View>

        {/* Items -------------------------------------------------------- */}
        <View style={styles.section}>
          <AppText variant="headline">Items</AppText>
          {ordered.length === 0 ? (
            <GlassSurface level="high" radius={20} padding={0}>
              <View style={styles.emptyItems}>
                <AppText variant="callout" color={palette.textMuted} center>
                  Nothing on the list yet. Add an item and the last price pops up.
                </AppText>
              </View>
            </GlassSurface>
          ) : (
            <GlassSurface level="high" radius={20} padding={0}>
              {ordered.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={() => handleTogglePurchased(item)}
                  onDelete={() => handleDeleteItem(item)}
                  first={index === 0}
                  last={index === ordered.length - 1}
                />
              ))}
            </GlassSurface>
          )}
        </View>

        {/* Actions ------------------------------------------------------ */}
        <GlassButton label="Add item" variant="secondary" onPress={() => setItemSheetOpen(true)} icon={<Plus size={18} strokeWidth={2} color={palette.emphasis} />} />
        {list.status === 'open' ? (
          <GlassButton
            label="Finish trip"
            onPress={() => void handleFinishTrip()}
            disabled={purchased <= 0}
            hapticFeedback="success"
            accessibilityHint="Creates one Groceries expense for the purchased items"
          />
        ) : (
          <AppText variant="footnote" color={palette.textMuted} center>
            This trip was already logged as an expense.
          </AppText>
        )}
        <GlassButton label="Save as template" variant="ghost" onPress={() => void handleSaveAsTemplate()} />
      </ScreenScaffold>

      <ItemSheet
        ref={itemSheetRef}
        open={itemSheetOpen}
        onClose={() => setItemSheetOpen(false)}
        memory={memory}
        activeStore={list.store}
        onSave={async (draft) => {
          if (!db || !id) return;
          const parsed = parseItemDraft(draft);
          if (!parsed.ok) {
            showToast({ message: parsed.error, tone: 'warning' });
            return;
          }
          await addGroceryItem(db, id, parsed.value);
          setItemSheetOpen(false);
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

function EmptyList({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  return (
    <View style={styles.emptyItems}>
      <AppText variant="callout" color={palette.textMuted} center>
        This list is gone.
      </AppText>
      <GlassButton label="Back to groceries" variant="secondary" onPress={onBack} fullWidth={false} />
    </View>
  );
}

function TotalCell({ label, cents, strong = false }: { label: string; cents: number; strong?: boolean }) {
  const palette = usePalette();
  return (
    <View style={styles.totalCell}>
      <AppText variant="caption" color={palette.textMuted}>
        {label}
      </AppText>
      <MoneyText cents={cents} variant={strong ? 'title2' : 'subhead'} />
    </View>
  );
}

interface ItemRowProps {
  item: GroceryItemRow;
  onToggle: () => void;
  onDelete: () => void;
  first?: boolean;
  last?: boolean;
}

function ItemRow({ item, onToggle, onDelete, first, last }: ItemRowProps) {
  const palette = usePalette();
  const purchased = item.status === 'purchased';
  const price = item.actual_price_cents ?? item.est_price_cents;

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: purchased }}
      accessibilityLabel={`${item.name}${item.unit ? `, ${item.quantity} ${item.unit}` : ''}`}
      style={({ pressed }) => [
        styles.itemRow,
        { borderBottomColor: palette.divider },
        first && [styles.rowFirst, { borderTopColor: palette.divider }],
        last && styles.rowLast,
        pressed && { backgroundColor: palette.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(232,243,221,0.5)' },
      ]}
    >
      <View style={[styles.checkbox, purchased && styles.checkboxOn]}>
        {purchased ? <Check size={14} strokeWidth={3} color={colors.matcha900} /> : null}
      </View>

      <View style={styles.itemText}>
        <AppText
          variant="subhead"
          numberOfLines={1}
          color={purchased ? palette.textMuted : undefined}
          style={purchased ? styles.itemDone : undefined}
        >
          {item.name}
        </AppText>
        <AppText variant="caption" color={palette.textMuted}>
          {item.quantity}
          {item.unit ? ` ${item.unit}` : ''} @ {price / 100 > 0 ? `${price / 100}` : '—'}
        </AppText>
      </View>

      <MoneyText cents={lineTotalCents(item)} variant="subhead" color={purchased ? colors.matcha700 : colors.matcha900} />

      <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`} hitSlop={10} style={styles.deleteButton}>
        <Trash2 size={16} strokeWidth={1.75} color={palette.dangerText} />
      </Pressable>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Add / edit item sheet                                               */
/* ------------------------------------------------------------------ */

interface ItemSheetProps {
  ref: React.Ref<BottomSheet>;
  open: boolean;
  onClose: () => void;
  memory: ReadonlyArray<{ name_normalized: string; last_price_cents: number }>;
  activeStore: string | null;
  onSave: (draft: { name: string; quantity: string; unit: string; estPriceText: string; actualPriceText: string }) => void;
}

function ItemSheet({ ref, open, onClose, memory, activeStore, onSave }: ItemSheetProps) {
  const palette = usePalette();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pc');
  const [estPriceText, setEstPriceText] = useState('');
  const [actualPriceText, setActualPriceText] = useState('');

  const suggested = suggestPriceFromMemory(memory, name);

  const unitChips: ChipRowItem[] = [
    { id: 'none', label: 'none' },
    ...GROCERY_UNITS.map((u) => ({ id: u, label: u })),
  ];

  return (
    <GlassSheet ref={ref} index={open ? 0 : -1} snapPoints={['62%']} onClose={onClose} title="Add item">
      <View style={styles.sheet}>
        <GlassInput
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (!estPriceText && suggested) setEstPriceText(String(suggested / 100));
          }}
          placeholder="Item name"
          returnKeyType="done"
        />

        <View style={styles.formRow}>
          <View style={styles.quantityBox}>
            <AppText variant="caption" color={palette.textMuted}>
              Quantity
            </AppText>
            <GlassInput value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
          </View>
          <View style={styles.priceBox}>
            <AppText variant="caption" color={palette.textMuted}>
              Est. price
            </AppText>
            <GlassInput value={estPriceText} onChangeText={setEstPriceText} keyboardType="decimal-pad" placeholder="0.00" />
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.priceBox}>
            <AppText variant="caption" color={palette.textMuted}>
              Actual price (optional)
            </AppText>
            <GlassInput value={actualPriceText} onChangeText={setActualPriceText} keyboardType="decimal-pad" placeholder="0.00" />
          </View>
        </View>

        <AppText variant="caption" color={palette.textMuted}>
          Unit
        </AppText>
        <ChipRow items={unitChips} selectedIds={[unit]} onToggle={setUnit} size="small" />

        {suggested ? (
          <AppText variant="caption" color={palette.emphasis}>
            Last price remembered: {suggested / 100} per unit
            {activeStore ? ` at ${activeStore}` : ''}.
          </AppText>
        ) : null}

        <GlassButton
          label="Add to list"
          onPress={() => {
            onSave({ name, quantity, unit, estPriceText, actualPriceText });
            setName('');
            setQuantity('1');
            setEstPriceText('');
            setActualPriceText('');
          }}
          hapticFeedback="success"
        />
      </View>
    </GlassSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function resolveGroceryCategory(db: import('../src/db/client').DB): Promise<string | null> {
  const { queryOne } = await import('../src/db/client');
  const row = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM categories WHERE name = 'Groceries' AND archived = 0 LIMIT 1;",
  );
  return row?.id ?? null;
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  totalsRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  totalCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  totalDivider: {
    width: StyleSheet.hairlineWidth,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowFirst: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.matcha400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.matcha300,
    borderColor: colors.matcha500,
  },
  itemText: {
    flex: 1,
    gap: 1,
  },
  itemDone: {
    textDecorationLine: 'line-through',
  },
  deleteButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyItems: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  sheet: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quantityBox: {
    width: 96,
    gap: spacing.xs,
  },
  priceBox: {
    flex: 1,
    gap: spacing.xs,
  },
});
