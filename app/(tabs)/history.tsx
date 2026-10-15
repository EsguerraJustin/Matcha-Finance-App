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

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
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
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { useDb, useDbQuery } from '../../src/state/dbStore';
import { showToast } from '../../src/state/toastStore';
import { openAddExpense } from '../../src/state/addExpenseStore';
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
import { endOfMonthISO, relativeDayLabel, todayISO, weekRangeISO, type WeekStart } from '../../src/lib/date';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/typography';

export default function HistoryScreen() {
  const db = useDb();
  const { glass } = useAppTheme();
  const today = todayISO();
  const weekStartsOn = useSettingsStore((state) => state.weekStartsOn) as WeekStart;
  const monthStartsOn = useSettingsStore((state) => state.monthStartsOn);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const filterSheetRef = useRef<BottomSheet>(null);

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
            <SlidersHorizontal size={22} strokeWidth={1.75} color={colors.matcha700} />
            {activeFilterCount ? (
              <View style={styles.badge}>
                <AppText variant="caption" color={colors.matcha900}>
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
            <AppText variant="caption" color={colors.matcha700}>
              {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} on
            </AppText>
            <AppText
              variant="caption"
              color={colors.matcha700}
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
                  <AppText variant="footnote" color={colors.textMuted}>
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
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      leftThreshold={40}
      overshootRight={false}
      enableTrackpadTwoFingerGesture
      renderRightActions={(progress, translation, methods: SwipeableMethods) => (
        <SwipeAction
          side="right"
          icon={<CopyPlus size={22} strokeWidth={1.75} color={colors.matcha900} />}
          label="Copy"
          background={colors.matcha100}
          onPress={() => {
            methods.close();
            onDuplicate();
          }}
          translation={translation}
          progress={progress}
        />
      )}
      renderLeftActions={(progress, translation, methods: SwipeableMethods) => (
        <SwipeAction
          side="left"
          icon={<Trash2 size={20} strokeWidth={1.75} color={colors.dangerText} />}
          label="Delete"
          background={colors.dangerBg}
          onPress={() => {
            methods.close();
            onDelete();
          }}
          translation={translation}
          progress={progress}
        />
      )}
    >
      <ExpenseRow expense={expense} onPress={() => onOpen(expense)} onLongPress={onLongPress} />
    </ReanimatedSwipeable>
  );
}

function SwipeAction({
  side,
  icon,
  label,
  background,
  onPress,
  translation,
  progress,
}: {
  side: 'left' | 'right';
  icon: ReactNode;
  label: string;
  background: string;
  onPress: () => void;
  translation: SharedValue<number>;
  progress: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: side === 'left' ? translation.value : -translation.value }],
  }));

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.action, { backgroundColor: background }]}>
      <Animated.View style={animatedStyle}>
        {icon}
      </Animated.View>
      <AppText variant="caption" color={side === 'left' ? colors.dangerText : colors.matcha900}>
        {label}
      </AppText>
    </Pressable>
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
    backgroundColor: colors.matcha200,
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
});