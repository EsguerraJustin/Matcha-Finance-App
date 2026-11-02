/**
 * Groceries.
 *
 * Lists, templates and store selectors (brief Section 6.5). The domain logic
 * and repository already exist in Phase 3 groundwork (`src/lib/groceries.ts`,
 * `src/db/repositories/groceriesRepo.ts`) — this screen wires them up with
 * live running totals against the remaining budget.
 *
 * One `BlurView` wraps each section; rows are plain translucent fills with
 * hairline dividers (brief performance budget).
 */

import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { router } from 'expo-router';

import { GlassSurface } from '../../src/components/glass/GlassSurface';
import { GlassButton } from '../../src/components/glass/GlassButton';
import { AppText, MoneyText } from '../../src/components/ui/AppText';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ScreenScaffold } from '../../src/components/ui/ScreenScaffold';
import { useDb, useDbQuery } from '../../src/state/dbStore';
import { showToast } from '../../src/state/toastStore';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { getCurrentBudget } from '../../src/db/repositories/budgetsRepo';
import {
  createGroceryList,
  deleteGroceryList,
  listGroceryItems,
  listGroceryLists,
  type GroceryListRow,
} from '../../src/db/repositories/groceriesRepo';
import {
  estimatedTotalCents,
  purchasedCount,
  purchasedTotalCents,
  toBuyCount,
} from '../../src/lib/groceries';
import { formatHumanDate, todayISO } from '../../src/lib/date';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/typography';

export default function GroceriesScreen() {
  const db = useDb();
  const { glass } = useAppTheme();
  const today = todayISO();

  const { data: lists } = useDbQuery<GroceryListRow[]>(
    (handle) => listGroceryLists(handle, { includeTemplates: true }),
    [],
    [],
  );
  const { data: itemsByList } = useDbQuery<Record<string, Awaited<ReturnType<typeof listGroceryItems>>>>(
    async (handle) => {
      const rows = await listGroceryLists(handle, { includeTemplates: true });
      const entries = await Promise.all(
        rows.map(async (row) => [row.id, await listGroceryItems(handle, row.id)] as const),
      );
      return Object.fromEntries(entries);
    },
    [],
    {},
  );

  const { data: budget } = useDbQuery(
    (handle) => getCurrentBudget(handle, today),
    [today],
    null,
  );

  const templates = useMemo(() => lists.filter((list) => list.is_template === 1), [lists]);
  const open = useMemo(
    () => lists.filter((list) => list.is_template === 0 && list.status === 'open'),
    [lists],
  );
  const completed = useMemo(
    () => lists.filter((list) => list.is_template === 0 && list.status === 'completed'),
    [lists],
  );

  const remainingBudget = budget?.remaining_cents ?? null;

  const handleNewList = useCallback(async () => {
    if (!db) return;
    const id = await createGroceryList(db, { name: 'Grocery trip' });
    router.push(`/grocery-list?id=${id}`);
  }, [db]);

  const handleStartFromTemplate = useCallback(
    async (template: GroceryListRow) => {
      if (!db) return;
      const id = await createGroceryList(db, {
        name: template.name,
        store: template.store,
        is_template: false,
      });
      const items = itemsByList[template.id] ?? [];
      for (const item of items) {
        const { addGroceryItem } = await import('../../src/db/repositories/groceriesRepo');
        await addGroceryItem(db, id, {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          est_price_cents: item.est_price_cents,
        });
      }
      router.push(`/grocery-list?id=${id}`);
    },
    [db, itemsByList],
  );

  const handleDelete = useCallback(
    (list: GroceryListRow) => {
      if (!db) return;
      void deleteGroceryList(db, list.id).then(() => showToast({ message: 'List deleted.', tone: 'warning' }));
    },
    [db],
  );

  return (
    <ScreenScaffold title="Groceries" subtitle="Plan the trip, then log it once">
      {templates.length ? (
        <Section title="Templates" hint="One tap to start a trip">
          <GlassSurface level="high" radius={20} padding={0}>
            {templates.map((list, index) => (
              <ListRow
                key={list.id}
                list={list}
                items={itemsByList[list.id] ?? []}
                onPress={() => void handleStartFromTemplate(list)}
                first={index === 0}
                last={index === templates.length - 1}
              />
            ))}
          </GlassSurface>
        </Section>
      ) : null}

      <Section title="Open lists" hint={remainingBudget !== null ? 'Estimates vs. what is left' : undefined}>
        {open.length ? (
          <GlassSurface level="high" radius={20} padding={0}>
            {open.map((list, index) => (
              <ListRow
                key={list.id}
                list={list}
                items={itemsByList[list.id] ?? []}
                onPress={() => router.push(`/grocery-list?id=${list.id}`)}
                remainingBudget={remainingBudget}
                onDelete={() => handleDelete(list)}
                first={index === 0}
                last={index === open.length - 1}
              />
            ))}
          </GlassSurface>
        ) : (
          <GlassSurface level="high" radius={20} padding={0}>
            <EmptyState
              compact
              title="No open trip"
              message="Start a list and the app remembers what you paid last time."
            />
          </GlassSurface>
        )}
      </Section>

      {completed.length ? (
        <Section title="Completed">
          <GlassSurface level="high" radius={20} padding={0}>
            {completed.slice(0, 10).map((list, index) => (
              <ListRow
                key={list.id}
                list={list}
                items={itemsByList[list.id] ?? []}
                onPress={() => router.push(`/grocery-list?id=${list.id}`)}
                onDelete={() => handleDelete(list)}
                first={index === 0}
                last={index === Math.min(completed.length, 10) - 1}
              />
            ))}
          </GlassSurface>
        </Section>
      ) : null}

      <GlassButton label="New grocery list" icon={<Plus size={20} strokeWidth={2} color={colors.matcha900} />} onPress={() => void handleNewList()} style={{ backgroundColor: glass.fillStrong }} />

      <AppText variant="footnote" color={colors.textMuted} center>
        Finishing a trip records exactly one Groceries expense.
      </AppText>
    </ScreenScaffold>
  );
}

/* ------------------------------------------------------------------ */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <AppText variant="headline">{title}</AppText>
        {hint ? (
          <AppText variant="caption" color={colors.textMuted}>
            {hint}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

interface ListRowProps {
  list: GroceryListRow;
  items: Awaited<ReturnType<typeof listGroceryItems>>;
  onPress: () => void;
  onDelete?: () => void;
  remainingBudget?: number | null;
  first?: boolean;
  last?: boolean;
}

function ListRow({ list, items, onPress, onDelete, remainingBudget, first, last }: ListRowProps) {
  const estimated = estimatedTotalCents(items);
  const purchased = purchasedTotalCents(items);
  const bought = purchasedCount(items);
  const toBuy = toBuyCount(items);

  const overBudget =
    remainingBudget !== null && remainingBudget !== undefined && estimated - remainingBudget > 0 && items.length > 0;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onDelete}
      accessibilityRole="button"
      accessibilityLabel={`${list.name}${list.store ? `, ${list.store}` : ''}`}
      accessibilityHint={`${bought} bought, ${toBuy} to buy`}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowText}>
        <AppText variant="subhead" numberOfLines={1}>
          {list.name}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
          {list.store ? `${list.store} · ` : ''}
          {list.planned_for ? `${formatHumanDate(list.planned_for)} · ` : ''}
          {items.length} item{items.length === 1 ? '' : 's'} · {bought} bought
        </AppText>
      </View>

      <View style={styles.rowTrailing}>
        <MoneyText
          cents={list.status === 'completed' ? purchased : estimated}
          variant="subhead"
          color={overBudget ? colors.dangerText : colors.matcha900}
        />
        <AppText variant="caption" color={overBudget ? colors.dangerText : colors.textMuted}>
          {list.status === 'completed' ? 'spent' : overBudget ? 'over budget' : toBuy ? `${toBuy} to buy` : 'all done'}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
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
  rowPressed: {
    backgroundColor: 'rgba(232,243,221,0.6)',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowTrailing: {
    alignItems: 'flex-end',
    gap: 1,
  },
});
