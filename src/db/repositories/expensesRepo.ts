/**
 * Expense repository.
 *
 * Totals are **always derived by querying** — nothing is cached in a running
 * total (brief Section 9, rule 1), so edits and deletes can never drift.
 * Deletion is soft (`deleted_at`); the hard purge runs in Phase 5.
 */

import type { DB } from '../client';
import { execute, queryAll, queryOne, transaction } from '../client';
import { newId } from '../../lib/id';
import { nowTimestamp } from '../../lib/date';
import { notifyDbChanged } from '../../state/dbStore';
import { relinkListForExpense, reopenListForExpense } from './groceriesRepo';

export interface ExpenseRow {
  id: string;
  amount_cents: number;
  spent_on: string;
  category_id: string;
  category_name: string;
  category_color: string;
  type_id: string | null;
  type_name: string | null;
  payment_method_id: string;
  payment_name: string;
  payment_icon: string | null;
  note: string | null;
  budget_id: string | null;
  receipt_path: string | null;
  grocery_list_id: string | null;
  recurring_rule_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ExpenseInput {
  amount_cents: number;
  spent_on: string;
  category_id: string;
  type_id?: string | null;
  payment_method_id: string;
  note?: string | null;
  budget_id?: string | null;
  receipt_path?: string | null;
  grocery_list_id?: string | null;
  recurring_rule_id?: string | null;
}

const EXPENSE_SELECT = `
  SELECT e.*,
         c.name  AS category_name,
         c.color_key AS category_color,
         t.name  AS type_name,
         p.name  AS payment_name,
         p.icon  AS payment_icon
  FROM expenses e
  JOIN categories c       ON c.id = e.category_id
  JOIN payment_methods p  ON p.id = e.payment_method_id
  LEFT JOIN expense_types t ON t.id = e.type_id`;

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export interface ExpenseFilters {
  from?: string;
  to?: string;
  categoryIds?: string[];
  typeIds?: string[];
  paymentMethodIds?: string[];
  budgetIds?: string[];
  groceryOnly?: boolean;
  minCents?: number;
  maxCents?: number;
  /** Free-text over note, category and type. */
  search?: string;
  includeDeleted?: boolean;
}

export function filtersToSql(filters: ExpenseFilters = {}): { where: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (!filters.includeDeleted) clauses.push('e.deleted_at IS NULL');
  if (filters.from) {
    clauses.push('e.spent_on >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('e.spent_on <= ?');
    params.push(filters.to);
  }
  if (filters.categoryIds?.length) {
    clauses.push(`e.category_id IN (${filters.categoryIds.map(() => '?').join(',')})`);
    params.push(...filters.categoryIds);
  }
  if (filters.typeIds?.length) {
    clauses.push(`e.type_id IN (${filters.typeIds.map(() => '?').join(',')})`);
    params.push(...filters.typeIds);
  }
  if (filters.paymentMethodIds?.length) {
    clauses.push(`e.payment_method_id IN (${filters.paymentMethodIds.map(() => '?').join(',')})`);
    params.push(...filters.paymentMethodIds);
  }
  if (filters.budgetIds?.length) {
    clauses.push(`e.budget_id IN (${filters.budgetIds.map(() => '?').join(',')})`);
    params.push(...filters.budgetIds);
  }
  if (filters.groceryOnly) clauses.push('e.grocery_list_id IS NOT NULL');
  if (filters.minCents !== undefined) {
    clauses.push('e.amount_cents >= ?');
    params.push(filters.minCents);
  }
  if (filters.maxCents !== undefined) {
    clauses.push('e.amount_cents <= ?');
    params.push(filters.maxCents);
  }
  if (filters.search?.trim()) {
    const needle = `%${filters.search.trim().toLowerCase()}%`;
    clauses.push(`(lower(COALESCE(e.note, '')) LIKE ?
       OR lower(c.name) LIKE ?
       OR lower(COALESCE(t.name, '')) LIKE ?
       OR lower(p.name) LIKE ?)`);
    params.push(needle, needle, needle, needle);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export async function listExpenses(db: DB, filters: ExpenseFilters = {}, limit?: number): Promise<ExpenseRow[]> {
  const { where, params } = filtersToSql(filters);
  const limitSql = limit ? `LIMIT ${Math.max(1, Math.trunc(limit))}` : '';
  return queryAll<ExpenseRow>(
    db,
    `${EXPENSE_SELECT} ${where} ORDER BY e.spent_on DESC, e.created_at DESC ${limitSql};`,
    params,
  );
}

export async function getExpense(db: DB, id: string): Promise<ExpenseRow | null> {
  return queryOne<ExpenseRow>(db, `${EXPENSE_SELECT} WHERE e.id = ?;`, [id]);
}

export async function listRecentExpenses(db: DB, limit = 5): Promise<ExpenseRow[]> {
  return listExpenses(db, {}, limit);
}

/** Sum of every non-deleted expense matching the filters — the daily total. */
export async function sumExpenses(db: DB, filters: ExpenseFilters = {}): Promise<number> {
  const { where, params } = filtersToSql(filters);
  const row = await queryOne<{ total: number | null }>(
    db,
    `SELECT COALESCE(SUM(e.amount_cents), 0) AS total FROM expenses e
     JOIN categories c ON c.id = e.category_id
     JOIN payment_methods p ON p.id = e.payment_method_id
     LEFT JOIN expense_types t ON t.id = e.type_id
     ${where};`,
    params,
  );
  return row?.total ?? 0;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export async function createExpense(db: DB, input: ExpenseInput): Promise<string> {
  const id = newId();
  const timestamp = nowTimestamp();

  await execute(
    db,
    `INSERT INTO expenses (
        id, amount_cents, spent_on, category_id, type_id, payment_method_id,
        note, budget_id, receipt_path, grocery_list_id, recurring_rule_id,
        created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
    [
      id,
      input.amount_cents,
      input.spent_on,
      input.category_id,
      input.type_id ?? null,
      input.payment_method_id,
      input.note?.trim() || null,
      input.budget_id ?? null,
      input.receipt_path ?? null,
      input.grocery_list_id ?? null,
      input.recurring_rule_id ?? null,
      timestamp,
      timestamp,
    ],
  );

  notifyDbChanged();
  return id;
}

export type ExpenseUpdate = Partial<Omit<ExpenseInput, 'category_id'>> & { category_id?: string };

export async function updateExpense(db: DB, id: string, patch: ExpenseUpdate): Promise<void> {
  const columns: Record<keyof ExpenseUpdate, string> = {
    amount_cents: 'amount_cents',
    spent_on: 'spent_on',
    category_id: 'category_id',
    type_id: 'type_id',
    payment_method_id: 'payment_method_id',
    note: 'note',
    budget_id: 'budget_id',
    receipt_path: 'receipt_path',
    grocery_list_id: 'grocery_list_id',
    recurring_rule_id: 'recurring_rule_id',
  };

  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  for (const [key, column] of Object.entries(columns) as Array<[keyof ExpenseUpdate, string]>) {
    if (patch[key] === undefined) continue;
    fields.push(`${column} = ?`);
    params.push((patch[key] ?? null) as string | number | null);
  }

  if (!fields.length) return;

  fields.push('updated_at = ?');
  params.push(nowTimestamp());
  params.push(id);

  await execute(db, `UPDATE expenses SET ${fields.join(', ')} WHERE id = ?;`, params);
  notifyDbChanged();
}

/** Soft delete — excluded from every total and report (business rule 10). */
export async function softDeleteExpense(db: DB, id: string): Promise<void> {
  await execute(db, 'UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?;', [
    nowTimestamp(),
    nowTimestamp(),
    id,
  ]);
  // Business rule 9: a grocery trip reopens so it can be fixed and finished again.
  await reopenListForExpense(db, id);
  notifyDbChanged();
}

export async function restoreExpense(db: DB, id: string): Promise<void> {
  await execute(db, 'UPDATE expenses SET deleted_at = NULL, updated_at = ? WHERE id = ?;', [nowTimestamp(), id]);
  // Undoing the delete re-completes the reopened list, when it is still free.
  await relinkListForExpense(db, id);
  notifyDbChanged();
}

export async function softDeleteExpenses(db: DB, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const timestamp = nowTimestamp();
  await transaction(db, async () => {
    for (const id of ids) {
      await execute(db, 'UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?;', [timestamp, timestamp, id]);
    }
  });
  for (const id of ids) await reopenListForExpense(db, id);
  notifyDbChanged();
}

/** Undo support for the 5-second toast. */
export async function hardDeleteExpense(db: DB, id: string): Promise<void> {
  await reopenListForExpense(db, id);
  await execute(db, 'DELETE FROM expenses WHERE id = ?;', [id]);
  notifyDbChanged();
}

/** Business rule 10: purge soft-deleted rows after 30 days. */
export async function purgeExpiredDeleted(db: DB, olderThanIso: string): Promise<number> {
  const rows = await queryAll<{ id: string }>(
    db,
    'SELECT id FROM expenses WHERE deleted_at IS NOT NULL AND deleted_at < ?;',
    [olderThanIso],
  );
  if (!rows.length) return 0;
  // A purged grocery expense must not leave its list pointing at a dead row.
  for (const row of rows) await reopenListForExpense(db, row.id);
  await transaction(db, async () => {
    for (const row of rows) {
      await execute(db, 'DELETE FROM expenses WHERE id = ?;', [row.id]);
    }
  });
  notifyDbChanged();
  return rows.length;
}

export async function changeCategoryForMany(
  db: DB,
  ids: string[],
  categoryId: string,
  typeId: string | null,
): Promise<void> {
  if (!ids.length) return;
  const timestamp = nowTimestamp();
  await transaction(db, async () => {
    for (const id of ids) {
      await execute(db, 'UPDATE expenses SET category_id = ?, type_id = ?, updated_at = ? WHERE id = ?;', [
        categoryId,
        typeId,
        timestamp,
        id,
      ]);
    }
  });
  notifyDbChanged();
}

/** Most recent note, category and payment method — smart defaults on the sheet. */
export async function getSmartDefaults(db: DB): Promise<{
  paymentMethodId: string | null;
  categoryId: string | null;
  typeId: string | null;
} | null> {
  const row = await queryOne<{
    payment_method_id: string;
    category_id: string;
    type_id: string | null;
  }>(
    db,
    `SELECT payment_method_id, category_id, type_id
       FROM expenses WHERE deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1;`,
  );
  if (!row) return null;
  return { paymentMethodId: row.payment_method_id, categoryId: row.category_id, typeId: row.type_id };
}

/** Duplicating an expense from History only copies the "what", never the date. */
export async function duplicateExpense(db: DB, id: string, spentOn: string): Promise<string | null> {
  const source = await getExpense(db, id);
  if (!source) return null;
  return createExpense(db, {
    amount_cents: source.amount_cents,
    spent_on: spentOn,
    category_id: source.category_id,
    type_id: source.type_id,
    payment_method_id: source.payment_method_id,
    note: source.note,
  });
}