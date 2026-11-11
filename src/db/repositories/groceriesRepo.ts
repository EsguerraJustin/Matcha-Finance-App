/**
 * Grocery repository — lists, items, price memory and the finish-trip flow.
 *
 * Business rules 8 and 9 live here:
 *   8. finishing a trip creates **exactly one** Groceries expense, links it,
 *      updates the price memory
 *   9. deleting that expense reopens the list instead of orphaning it
 */

import type { DB } from '../client';
import { execute, queryAll, queryOne, transaction } from '../client';
import { newId } from '../../lib/id';
import { nowTimestamp } from '../../lib/date';
import { notifyDbChanged } from '../../state/dbStore';
import { normalizeName } from '../../lib/id';
import { resolveBudgetId } from './budgetGlue';
import {
  buildItemisedNote,
  planFinishTrip,
  priceMemoryKey,
  resolveStoreTypeName,
  type GroceryItemLike,
} from '../../lib/groceries';

export interface GroceryListRow {
  id: string;
  name: string;
  store: string | null;
  planned_for: string | null;
  status: 'open' | 'completed';
  is_template: number;
  expense_id: string | null;
  created_at: string;
}

export interface GroceryItemRow extends GroceryItemLike {
  list_id: string;
}

export async function listGroceryLists(db: DB, options: { includeTemplates?: boolean } = {}): Promise<GroceryListRow[]> {
  const where = options.includeTemplates ? '' : 'WHERE is_template = 0';
  return queryAll<GroceryListRow>(
    db,
    `SELECT * FROM grocery_lists ${where} ORDER BY status ASC, created_at DESC;`,
  );
}

export async function getGroceryList(db: DB, id: string): Promise<GroceryListRow | null> {
  const row = await queryOne<GroceryListRow>(db, 'SELECT * FROM grocery_lists WHERE id = ?;', [id]);
  return row ?? null;
}

export async function listGroceryItems(db: DB, listId: string): Promise<GroceryItemRow[]> {
  return queryAll<GroceryItemRow>(
    db,
    `SELECT * FROM grocery_items WHERE list_id = ? ORDER BY status ASC, sort_order ASC, name ASC;`,
    [listId],
  );
}

export interface GroceryListInput {
  name: string;
  store?: string | null;
  planned_for?: string | null;
  is_template?: boolean;
}

export async function createGroceryList(db: DB, input: GroceryListInput): Promise<string> {
  const id = newId();
  await execute(
    db,
    `INSERT INTO grocery_lists (id, name, store, planned_for, status, is_template, expense_id, created_at)
     VALUES (?, ?, ?, ?, 'open', ?, NULL, ?);`,
    [
      id,
      input.name.trim() || 'Grocery trip',
      input.store ?? null,
      input.planned_for ?? null,
      input.is_template ? 1 : 0,
      nowTimestamp(),
    ],
  );
  notifyDbChanged();
  return id;
}

export async function updateGroceryList(db: DB, id: string, patch: Partial<GroceryListInput> & { status?: 'open' | 'completed' }): Promise<void> {
  const map: Record<string, string> = { name: 'name', store: 'store', planned_for: 'planned_for', status: 'status' };
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(map)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    fields.push(`${column} = ?`);
    params.push((value ?? null) as string | number | null);
  }
  if (!fields.length) return;
  params.push(id);
  await execute(db, `UPDATE grocery_lists SET ${fields.join(', ')} WHERE id = ?;`, params);
  notifyDbChanged();
}

export async function deleteGroceryList(db: DB, id: string): Promise<void> {
  await transaction(db, async () => {
    await execute(db, 'UPDATE expenses SET grocery_list_id = NULL WHERE grocery_list_id = ?;', [id]);
    await execute(db, 'DELETE FROM grocery_lists WHERE id = ?;', [id]);
  });
  notifyDbChanged();
}

export interface GroceryItemInput {
  name: string;
  quantity: number;
  unit: string | null;
  est_price_cents: number;
  actual_price_cents?: number | null;
  status?: 'to_buy' | 'purchased';
  sort_order?: number;
}

export async function addGroceryItem(db: DB, listId: string, input: GroceryItemInput): Promise<string> {
  const id = newId();
  const nextRow = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM grocery_items WHERE list_id = ?;',
    [listId],
  );
  await execute(
    db,
    `INSERT INTO grocery_items (id, list_id, name, quantity, unit, est_price_cents, actual_price_cents, status, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      listId,
      input.name.trim(),
      input.quantity,
      input.unit,
      input.est_price_cents,
      input.actual_price_cents ?? null,
      input.status ?? 'to_buy',
      input.sort_order ?? nextRow?.next ?? 0,
    ],
  );
  notifyDbChanged();
  return id;
}

export async function updateGroceryItem(
  db: DB,
  id: string,
  patch: Partial<GroceryItemInput>,
): Promise<void> {
  const map: Record<string, string> = {
    name: 'name',
    quantity: 'quantity',
    unit: 'unit',
    est_price_cents: 'est_price_cents',
    actual_price_cents: 'actual_price_cents',
    status: 'status',
    sort_order: 'sort_order',
  };
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(map)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    fields.push(`${column} = ?`);
    params.push((value ?? null) as string | number | null);
  }
  if (!fields.length) return;
  params.push(id);
  await execute(db, `UPDATE grocery_items SET ${fields.join(', ')} WHERE id = ?;`, params);
  notifyDbChanged();
}

/** The satisfying matcha tick. */
export async function setItemPurchased(db: DB, id: string, purchased: boolean): Promise<void> {
  await execute(db, 'UPDATE grocery_items SET status = ? WHERE id = ?;', [purchased ? 'purchased' : 'to_buy', id]);
  notifyDbChanged();
}

export async function deleteGroceryItem(db: DB, id: string): Promise<void> {
  await execute(db, 'DELETE FROM grocery_items WHERE id = ?;', [id]);
  notifyDbChanged();
}

/* ------------------------------------------------------------------ */
/* Price memory                                                        */
/* ------------------------------------------------------------------ */

export interface PriceMemoryRow {
  name_normalized: string;
  store: string;
  unit: string | null;
  last_price_cents: number;
  updated_at: string;
}

export async function rememberPrice(
  db: DB,
  name: string,
  store: string | null,
  unit: string | null,
  priceCents: number,
): Promise<void> {
  if (priceCents <= 0) return;
  await db.runAsync(
    `INSERT INTO grocery_price_memory (name_normalized, store, unit, last_price_cents, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name_normalized, store) DO UPDATE SET
       last_price_cents = excluded.last_price_cents,
       unit = excluded.unit,
       updated_at = excluded.updated_at;`,
    [normalizeName(name), store ?? '', unit, priceCents, nowTimestamp()],
  );
}

export async function listPriceMemory(db: DB, store?: string | null): Promise<PriceMemoryRow[]> {
  if (store) {
    return queryAll<PriceMemoryRow>(
      db,
      'SELECT * FROM grocery_price_memory WHERE store = ? ORDER BY updated_at DESC;',
      [store],
    );
  }
  return queryAll<PriceMemoryRow>(db, 'SELECT * FROM grocery_price_memory ORDER BY updated_at DESC LIMIT 200;');
}

export async function findRememberedPrice(db: DB, name: string, store: string | null): Promise<number | null> {
  const row = await queryOne<{ last_price_cents: number }>(
    db,
    'SELECT last_price_cents FROM grocery_price_memory WHERE name_normalized = ? AND store = ?;',
    [normalizeName(name), store ?? ''],
  );
  return row?.last_price_cents ?? null;
}

export async function findRememberedPriceAnyStore(db: DB, name: string): Promise<PriceMemoryRow | null> {
  const normalized = normalizeName(name);
  const row = await queryOne<PriceMemoryRow>(
    db,
    'SELECT * FROM grocery_price_memory WHERE name_normalized = ? OR name_normalized = ? ORDER BY updated_at DESC LIMIT 1;',
    [normalized, normalized.replace(/s$/, '')],
  );
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Finish trip                                                         */
/* ------------------------------------------------------------------ */

export interface FinishTripInput {
  listId: string;
  paymentMethodId: string;
  spentOn: string;
  groceryCategoryId: string;
  /** Groceries expense types, so the store can become the expense's type. */
  groceryTypeNames?: readonly string[];
  /** The store's matching Groceries type, when it exists (rule 8: "type = store"). */
  groceryTypeId?: string | null;
}

export interface FinishTripResult {
  expenseId: string;
  amountCents: number;
  carriedOver: number;
  note: string;
}

/**
 * Creates **exactly one** Groceries expense for the purchased items, links
 * `grocery_lists.expense_id`, marks the list completed, remembers the real
 * prices, and carries the unbought items to a fresh list.
 */
export async function finishTrip(db: DB, input: FinishTripInput): Promise<FinishTripResult | null> {
  const items = await listGroceryItems(db, input.listId);
  const plan = planFinishTrip(items);
  if (!plan.canFinish) return null;

  const list = await getGroceryList(db, input.listId);
  const note = buildItemisedNote(items);

  // Business rule 2, same as every other creation path: the trip's expense
  // belongs to the budget that owns its date.
  const budgetId = await resolveBudgetId(db, input.spentOn);

  const result = await transaction(db, async () => {
    const expenseId = newId();
    const timestamp = nowTimestamp();

    await db.runAsync(
      `INSERT INTO expenses (
         id, amount_cents, spent_on, category_id, type_id, payment_method_id,
         note, budget_id, receipt_path, grocery_list_id, recurring_rule_id,
         created_at, updated_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, NULL);`,
      [
        expenseId,
        plan.amountCents,
        input.spentOn,
        input.groceryCategoryId,
        input.groceryTypeId ?? null,
        input.paymentMethodId,
        note,
        budgetId,
        input.listId,
        timestamp,
        timestamp,
      ],
    );

    await db.runAsync(
      `UPDATE grocery_lists SET status = 'completed', expense_id = ? WHERE id = ?;`,
      [expenseId, input.listId],
    );

    // Real prices teach the memory for next time.
    for (const item of items) {
      if (item.status === 'purchased' && item.actual_price_cents) {
        await rememberPrice(db, item.name, list?.store ?? null, item.unit, item.actual_price_cents);
      }
    }

    // Unpurchased items move to a fresh list (brief Section 6.5).
    if (plan.carryOver.length) {
      const carriedId = newId();
      await db.runAsync(
        `INSERT INTO grocery_lists (id, name, store, planned_for, status, is_template, expense_id, created_at)
         VALUES (?, ?, ?, NULL, 'open', 0, NULL, ?);`,
        [carriedId, `Carried from ${list?.name ?? 'grocery trip'}`, list?.store ?? null, nowTimestamp()],
      );
      let order = 0;
      for (const item of plan.carryOver) {
        await db.runAsync(
          `INSERT INTO grocery_items (id, list_id, name, quantity, unit, est_price_cents, actual_price_cents, status, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, NULL, 'to_buy', ?);`,
          [newId(), carriedId, item.name, item.quantity, item.unit, item.est_price_cents, order],
        );
        order += 1;
      }
    }

    return { expenseId, amountCents: plan.amountCents, carriedOver: plan.carryOver.length, note };
  });

  notifyDbChanged();
  return result;
}

/** Attaches a store name to a Groceries expense type when one matches. */
export async function resolveGroceryTypeId(db: DB, categoryId: string, store: string | null): Promise<string | null> {
  const names = await queryAll<{ id: string; name: string }>(
    db,
    'SELECT id, name FROM expense_types WHERE category_id = ? AND archived = 0;',
    [categoryId],
  );
  const match = resolveStoreTypeName(store, names.map((row) => row.name));
  return match ? (names.find((row) => row.name === match)?.id ?? null) : null;
}

/** Business rule 9: deleting the linked expense reopens the list. */
export async function reopenListForExpense(db: DB, expenseId: string): Promise<void> {
  const rows = await queryAll<{ id: string }>(db, 'SELECT id FROM grocery_lists WHERE expense_id = ?;', [expenseId]);
  if (!rows.length) return;
  await transaction(db, async () => {
    for (const row of rows) {
      await execute(db, "UPDATE grocery_lists SET status = 'open', expense_id = NULL WHERE id = ?;", [row.id]);
    }
  });
  notifyDbChanged();
}

/**
 * Undo of a grocery-expense delete: if the list reopened by
 * `reopenListForExpense` is still untouched, link it back and complete it.
 * If the user has since changed or re-finished the list, leave it alone.
 */
export async function relinkListForExpense(db: DB, expenseId: string): Promise<void> {
  const row = await queryOne<{ id: string }>(
    db,
    `SELECT l.id
       FROM grocery_lists l
       JOIN expenses e ON e.grocery_list_id = l.id
      WHERE e.id = ? AND l.expense_id IS NULL AND l.status = 'open'
      LIMIT 1;`,
    [expenseId],
  );
  if (!row) return;
  await execute(db, "UPDATE grocery_lists SET status = 'completed', expense_id = ? WHERE id = ?;", [
    expenseId,
    row.id,
  ]);
  notifyDbChanged();
}

/** The itemised breakdown shown when a grocery expense is opened from History. */
export async function listItemsForExpense(db: DB, listId: string): Promise<GroceryItemRow[]> {
  return listGroceryItems(db, listId);
}

export { priceMemoryKey };