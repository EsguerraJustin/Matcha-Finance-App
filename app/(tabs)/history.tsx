/**
 * History v2.
 *
 * Search over note/category/type, a filter sheet, grouping by day with a daily
 * total header, swipe left to delete (with undo), swipe right to duplicate,
 * tap to edit, long-press for bulk select.
 *
 * One `BlurView` wraps the whole list — rows are plain translucent fills with
 * hairline dividers, so 5,000+ rows stay smooth.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type BottomSheet from '@gorhom/bottom-sheet';
import { CopyPlus, SlidersHorizontal, Trash2 } from 'lucide-react-native';

import { GlassSurface } from '../../src/components/glass/GlassSurface';
import { AppText, MoneyText } from '../../src/components/ui/AppText';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ScreenScaffold } from '../../src/components/ui/ScreenScaffold';
import { GlassInput } from '../../src/components/ui/GlassInput';
import { ExpenseRow } from '../../src/components/expense/ExpenseRow';
import { FilterSheet } from '../../src/components/expense/FilterSheet';
import { BulkActionBar } from '../../src/components/expense/BulkActionBar';
import { useAppTheme, usePalette } from '../../src/hooks/useAppTheme';
import { useDb, useDbQuery } from '../../src/state/dbStore';
import { showToast } from '../../src/state/toastStore';
import { openAddExpense } from '../../src/state/addExpenseStore';
import { useSheetOverlayStore } from '../../src/state/sheetOverlayStore';
import { useSettingsStore } from '../../src/state/settingsStore';
import {
  listCategories,
  listPaymentMethods,
  type CategoryWithTypes,
  type PaymentMethod,
} from '../../src/db/repositories/categoriesRepo';
import {
  changeCategoryForMany,
  duplicateExpense,
  listExpenses,
  restoreExpense,
  softDeleteExpense,
  softDeleteExpenses,
  type ExpenseFilters,
  type ExpenseRow as ExpenseRowModel,
} from '../../src/db/repositories/expensesRepo';
import {
  EMPTY_FILTERS,
  EMPTY_HISTORY_MESSAGE,
  EMPTY_SEARCH_MESSAGE,
  areAllSelected,
  countActiveFilters,
  groupExpensesByDay,
  hasActiveFilters,
  toggleInList,
  type FilterState,
} from '../../src/lib/expenses';
import { resolveOverlayBack } from '../../src/lib/backPress';
import { endOfMonthISO, relativeDayLabel, todayISO, weekRangeISO, type WeekStart } from '../../src/lib/date';

import { spacing } from '../../theme/typography';


export default function HistoryScreen() {
  const db = useDb();
  const { glass, palette } = useAppTheme();
  const today = todayISO();
  const weekStartsOn = useSettingsStore((state) => state.weekStartsOn) as WeekStart;
  const monthStartsOn = useSettingsStore((state) => state.monthStartsOn);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const filterSheetRef = useRef<BottomSheet>(null);

  // The floating tab bar renders above tab scenes, so it would cover
  // in-scene overlays' controls: the filter sheet's Apply/Reset (flaw #13) and
  // the bulk action bar's Delete (flaw #14) — hide it while either is up.
  const setSheetOverlayOpen = useSheetOverlayStore((s) => s.setOpen);
  useEffect(() => {
    setSheetOverlayOpen(filterSheetOpen || selectedIds.length > 0);
    return () => setSheetOverlayOpen(false);
  }, [filterSheetOpen, selectedIds.length, setSheetOverlayOpen]);

  // Android back must close the topmost overlay instead of falling through
  // to the tab navigator: switching tabs left the sheet open in this
  // still-mounted scene, so the overlay flag stayed true and the floating
  // tab bar disappeared app-wide until restart (flaw #16).
  useEffect(() => {
    if (!filterSheetOpen && selectedIds.length === 0) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const action = resolveOverlayBack({ sheetOpen: filterSheetOpen, selectionCount: selectedIds.length });
      if (action === 'close-sheet') {
        setFilterSheetOpen(false);
        return true;
      }
      if (action === 'clear-selection') {
        setSelectedIds([]);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [filterSheetOpen, selectedIds.length]);

  // Belt and braces: leaving History always clears any in-scene overlay, so
  // a stale flag (e.g. a notification navigating away mid-sheet) can never
  // keep the tab bar hidden (flaw #16).
  useFocusEffect(
    useCallback(() => () => {
      setFilterSheetOpen(false);
      setSelectedIds([]);
    }, []),
  );

  const { data: categories } = useDbQuery<CategoryWithTypes[]>((handle) => listCategories(handle), [], []);
  const { data: paymentMethods } = useDbQuery<PaymentMethod[]>((handle) => listPaymentMethods(handle), [], []);

  const sqlFilters: ExpenseFilters = useMemo(() => {
    const range = resolveRange(filters, today, weekStartsOn, monthStartsOn);
    return {
      from: range.from,
      to: range.to,
      categoryIds: filters.categoryIds,
      typeIds: filters.typeIds,
      paymentMethodIds: filters.paymentMethodIds,
      groceryOnly: filters.groceryOnly,
      minCents: filters.minCents,
      maxCents: filters.maxCents,
      search,
    };
  }, [filters, monthStartsOn, search, today, weekStartsOn]);

  const filterKey = useMemo(() => JSON.stringify(sqlFilters), [sqlFilters]);

  const { data: expenses } = useDbQuery<ExpenseRowModel[]>((handle) => listExpenses(handle, sqlFilters), [filterKey], []);

  const sections = useMemo(
    () =>
      groupExpensesByDay(expenses).map((group) => ({
        key: group.date,
        title: relativeDayLabel(group.date, today),
        totalCents: group.totalCents,
        data: group.items,
      })),
    [expenses, today],
  );

  const allIds = useMemo(() => expenses.map((expense) => expense.id), [expenses]);
  const selectionMode = selectedIds.length > 0;
  const totalCents = useMemo(() => expenses.reduce((sum, expense) => sum + expense.amount_cents, 0), [expenses]);
  const activeFilterCount = countActiveFilters(filters);

  const handleDelete = useCallback(
    (expense: ExpenseRowModel) => {
      if (!db) return;
      const id = expense.id;
      void softDeleteExpense(db, id);
      showToast({
        message: 'Moved to Recently deleted.',
        tone: 'warning',
        actionLabel: 'Undo',
        onAction: () => void restoreExpense(db, id),
      });
    },
    [db],
  );

  const handleDuplicate = useCallback(
    (expense: ExpenseRowModel) => {
      if (!db) return;
      void duplicateExpense(db, expense.id, today).then((newId) => {
        if (newId) showToast({ message: 'Copied to today.', tone: 'success' });
      });
    },
    [db, today],
  );

  const handleLongPress = useCallback((expense: ExpenseRowModel) => {
    setSelectedIds((current) => toggleInList(current, expense.id));
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (!db || !selectedIds.length) return;
    const ids = [...selectedIds];
    void softDeleteExpenses(db, ids).then(() => {
      setSelectedIds([]);
      showToast({
        message: `${ids.length} expense${ids.length === 1 ? '' : 's'} moved to Recently deleted.`,
        tone: 'warning',
        actionLabel: 'Undo',
        onAction: () => ids.forEach((id) => void restoreExpense(db, id)),
      });
    });
  }, [db, selectedIds]);

  const handleBulkCategory = useCallback(
    (categoryId: string, typeId: string | null) => {
      if (!db || !selectedIds.length) return;
      const ids = [...selectedIds];
      void changeCategoryForMany(db, ids, categoryId, typeId).then(() => {
        setSelectedIds([]);
        showToast({ message: `Moved ${ids.length} expense${ids.length === 1 ? '' : 's'}.`, tone: 'success' });
      });
    },
    [db, selectedIds],
  );

  const filtering = Boolean(search) || hasActiveFilters(filters);

  return (
    <>
      <ScreenScaffold
        title="History"
        subtitle={expenses.length ? `${expenses.length} ${expenses.length === 1 ? 'entry' : 'entries'}` : undefined}
        accessory={
          <Pressable
            onPress={() => setFilterSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Filters"
            style={styles.iconButton}
            hitSlop={8}
          >
            <SlidersHorizontal size={22} strokeWidth={1.75} color={palette.emphasis} />
            {activeFilterCount ? (
              <View style={[styles.badge, { backgroundColor: palette.primary }]}>
                <AppText variant="caption" color={palette.onPrimary}>
                  {activeFilterCount}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        }
      >
        <GlassInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search notes, categories, types"
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search expenses"
        />

        {hasActiveFilters(filters) ? (
          <View style={styles.filterSummary}>
            <AppText variant="caption" color={palette.emphasis}>
              {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} on
            </AppText>
            <AppText
              variant="caption"
              color={palette.emphasis}
              accessibilityRole="button"
              onPress={() => setFilters(EMPTY_FILTERS)}
            >
              Clear
            </AppText>
          </View>
        ) : null}

        {sections.length === 0 ? (
          <EmptyState
            title={filtering ? 'Nothing matched' : 'No spending yet'}
            message={filtering ? EMPTY_SEARCH_MESSAGE : EMPTY_HISTORY_MESSAGE}
            actionLabel={filtering ? undefined : 'Add your first expense'}
            onAction={() => openAddExpense()}
          />
        ) : (
          <GlassSurface level="high" radius={20} padding={0}>
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              stickySectionHeadersEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={11}
              removeClippedSubviews
              renderSectionHeader={({ section }) => (
                <View style={[styles.dayHeader, { backgroundColor: glass.fillStrong }]}>
                  <AppText variant="footnote" color={palette.textMuted}>
                    {section.title}
                  </AppText>
                  <MoneyText cents={section.totalCents} variant="footnote" />
                </View>
              )}
              renderItem={({ item }) =>
                selectionMode ? (
                  <ExpenseRow
                    expense={item}
                    selectionMode
                    selected={selectedIds.includes(item.id)}
                    onPress={(expense) => setSelectedIds((current) => toggleInList(current, expense.id))}
                  />
                ) : (
                  <SwipeableRow
                    expense={item}
                    onOpen={(expense) => openAddExpense(expense.id)}
                    onDelete={() => handleDelete(item)}
                    onDuplicate={() => handleDuplicate(item)}
                    onLongPress={() => handleLongPress(item)}
                  />
                )
              }
            />

            <View style={[styles.totalFooter, { borderTopColor: glass.borderInner }]}>
              <AppText variant="subhead">Showing</AppText>
              <MoneyText cents={totalCents} variant="subhead" />
            </View>
          </GlassSurface>
        )}

        {selectionMode ? (
          <BulkActionBar
            count={selectedIds.length}
            categories={categories}
            onDelete={handleBulkDelete}
            onChangeCategory={handleBulkCategory}
            onSelectAll={() => setSelectedIds(areAllSelected(allIds, selectedIds) ? [] : allIds)}
            onClear={() => setSelectedIds([])}
          />
        ) : null}
      </ScreenScaffold>

      {filterSheetOpen ? (
        <FilterSheet
          ref={filterSheetRef}
          categories={categories}
          paymentMethods={paymentMethods}
          value={filters}
          onApply={(next) => {
            setFilters(next);
            setFilterSheetOpen(false);
          }}
          onClose={() => setFilterSheetOpen(false)}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Swipe actions                                                       */
/* ------------------------------------------------------------------ */

interface SwipeRowProps {
  expense: ExpenseRowModel;
  onOpen: (expense: ExpenseRowModel) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onLongPress: () => void;
}

function SwipeableRow({ expense, onOpen, onDelete, onDuplicate, onLongPress }: SwipeRowProps) {
  const palette = usePalette();
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      leftThreshold={40}
      overshootRight={false}
      enableTrackpadTwoFingerGesture
      renderRightActions={(progress, _translation, methods: SwipeableMethods) => (
        <>
          <SwipeAction
            icon={<Trash2 size={20} strokeWidth={1.75} color={palette.dangerText} />}
            label="Delete"
            labelColor={palette.dangerText}
            background={palette.dangerBg}
            progress={progress}
          />
          {/*
            Press targets live in this (top) container on purpose: on Android
            the hidden opposite container sits above in z-order and swallows
            taps meant for revealed actions (react-native-gesture-handler
            #3223). Both targets are absolute so they do not affect the width
            RNGH measures for the swipe distance.
          */}
          <Pressable
            onPress={() => {
              methods.close();
              onDuplicate();
            }}
            style={[styles.actionTarget, styles.actionTargetLeft]}
            accessibilityRole="button"
            accessibilityLabel="Copy"
          />
          <Pressable
            onPress={() => {
              methods.close();
              onDelete();
            }}
            style={[styles.actionTarget, styles.actionTargetRight]}
            accessibilityRole="button"
            accessibilityLabel="Delete"
          />
        </>
      )}
      renderLeftActions={(progress) => (
        <SwipeAction
          icon={<CopyPlus size={22} strokeWidth={1.75} color={palette.emphasis} />}
          label="Copy"
          labelColor={palette.text}
          background={palette.cardFill}
          progress={progress}
        />
      )}
    >
      <ExpenseRow expense={expense} onPress={() => onOpen(expense)} onLongPress={onLongPress} />
    </ReanimatedSwipeable>
  );
}

function SwipeAction({
  icon,
  label,
  labelColor,
  background,
  progress,
}: {
  icon: ReactNode;
  label: string;
  labelColor: string;
  background: string;
  progress: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <View
      style={[styles.action, { backgroundColor: background }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={animatedStyle}>
        {icon}
      </Animated.View>
      <AppText variant="caption" color={labelColor}>
        {label}
      </AppText>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function resolveRange(
  filters: FilterState,
  today: string,
  weekStartsOn: WeekStart,
  monthStartsOn: number,
): { from?: string; to?: string } {
  switch (filters.preset) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const range = weekRangeISO(today, weekStartsOn);
      return { from: range.start, to: range.end };
    }
    case 'month':
      // "This month" = the current allowance cycle, up to its end date.
      return { to: endOfMonthISO(today, monthStartsOn) };
    case 'custom':
      return { from: filters.from, to: filters.to };
    default:
      return {};
  }
}

const styles = StyleSheet.create({
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.md,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  totalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.xs,
  },
  actionTarget: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTargetLeft: {
    left: 0,
  },
  actionTargetRight: {
    right: 0,
  },
});
