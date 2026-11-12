/**
 * Taxonomy repository — categories, expense types and payment methods.
 *
 * One repository per table group; every default row can be **archived** but
 * never hard-deleted, so history stays intact (brief Section 6.2).
 */

import type { DB } from '../client';
import { execute, queryAll, transaction } from '../client';
import { newId } from '../../lib/id';
import { notifyDbChanged } from '../../state/dbStore';

export interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  color_key: string;
  sort_order: number;
  is_default: number;
  archived: number;
}

export interface ExpenseTypeRow {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  is_default: number;
  archived: number;
}

export interface PaymentMethodRow {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  is_default: number;
  archived: number;
}

export type CategoryWithTypes = CategoryRow & { types: ExpenseTypeRow[] };
export type PaymentMethod = PaymentMethodRow;

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

const CATEGORY_SELECT = `
  SELECT c.*,
         t.id          AS t_id,
         t.name        AS t_name,
         t.sort_order  AS t_sort_order,
         t.is_default  AS t_is_default,
         t.archived    AS t_archived
  FROM categories c
  LEFT JOIN expense_types t ON t.category_id = c.id
  ORDER BY c.sort_order ASC, c.name ASC, t.sort_order ASC, t.name ASC;`;

interface FlatCategoryRow extends CategoryRow {
  t_id: string | null;
  t_name: string | null;
  t_sort_order: number | null;
  t_is_default: number | null;
  t_archived: number | null;
}

/** Categories with their types nested and archived entries filtered out. */
export async function listCategories(db: DB, options: { includeArchived?: boolean } = {}): Promise<CategoryWithTypes[]> {
  const rows = await queryAll<FlatCategoryRow>(db, CATEGORY_SELECT);
  const byCategory = new Map<string, CategoryWithTypes>();

  for (const row of rows) {
    if (!options.includeArchived && row.archived === 1) continue;

    let category = byCategory.get(row.id);
    if (!category) {
      category = { ...row, types: [] };
      byCategory.set(row.id, category);
    }

    // With `includeArchived`, show every type (archived ones muted by the UI);
    // otherwise skip archived types — the old `!includeArchived && …` gate
    // dropped *all* types whenever archived entries were requested.
    if (row.t_id && (options.includeArchived || row.t_archived !== 1)) {
      category.types.push({
        id: row.t_id,
        category_id: row.id,
        name: row.t_name ?? '',
        sort_order: row.t_sort_order ?? 0,
        is_default: row.t_is_default ?? 0,
        archived: row.t_archived ?? 0,
      });
    }
  }

  return [...byCategory.values()];
}

export async function listPaymentMethods(db: DB, options: { includeArchived?: boolean } = {}): Promise<PaymentMethod[]> {
  const rows = await queryAll<PaymentMethodRow>(
    db,
    `SELECT * FROM payment_methods ORDER BY sort_order ASC, name ASC;`,
  );
  return options.includeArchived ? rows : rows.filter((row) => row.archived === 0);
}

/** Types for one category, for the second row of chips on the Add sheet. */
export async function listTypesForCategory(db: DB, categoryId: string): Promise<ExpenseTypeRow[]> {
  return queryAll<ExpenseTypeRow>(
    db,
    `SELECT * FROM expense_types
      WHERE category_id = ? AND archived = 0
      ORDER BY sort_order ASC, name ASC;`,
    [categoryId],
  );
}

/** Distinct notes the user has written before — local autocomplete only. */
export async function listNoteSuggestions(db: DB, prefix: string, limit = 6): Promise<string[]> {
  if (!prefix.trim()) return [];
  const like = `${prefix.trim().toLowerCase()}%`;
  return queryAll<{ note: string }>(
    db,
    `SELECT note FROM expenses
      WHERE deleted_at IS NULL AND note IS NOT NULL AND lower(note) LIKE ?
      GROUP BY lower(note)
      ORDER BY MAX(created_at) DESC
      LIMIT ?;`,
    [like, limit],
  ).then((rows) => rows.map((row) => row.note).filter((note): note is string => Boolean(note)));
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface CategoryInput {
  name: string;
  icon: string;
  colorKey: string;
  sortOrder?: number;
}

export async function createCategory(db: DB, input: CategoryInput): Promise<string> {
  const id = newId();
  const maxRow = await db.getFirstAsync<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM categories;');
  await execute(
    db,
    `INSERT INTO categories (id, name, icon, color_key, sort_order, is_default, archived)
     VALUES (?, ?, ?, ?, ?, 0, 0);`,
    [id, input.name.trim(), input.icon, input.colorKey, input.sortOrder ?? maxRow?.next ?? 0],
  );
  notifyDbChanged();
  return id;
}

export async function updateCategory(db: DB, id: string, input: Partial<CategoryInput>): Promise<void> {
  const fields: string[] = [];
  const params: (string | number)[] = [];
  if (input.name !== undefined) {
    fields.push('name = ?');
    params.push(input.name.trim());
  }
  if (input.icon !== undefined) {
    fields.push('icon = ?');
    params.push(input.icon);
  }
  if (input.colorKey !== undefined) {
    fields.push('color_key = ?');
    params.push(input.colorKey);
  }
  if (input.sortOrder !== undefined) {
    fields.push('sort_order = ?');
    params.push(input.sortOrder);
  }
  if (!fields.length) return;
  params.push(id);
  await execute(db, `UPDATE categories SET ${fields.join(', ')} WHERE id = ?;`, params);
  notifyDbChanged();
}

export async function setCategoryArchived(db: DB, id: string, archived: boolean): Promise<void> {
  await execute(db, 'UPDATE categories SET archived = ? WHERE id = ?;', [archived ? 1 : 0, id]);
  // Archiving a category archives its types too, so the Add sheet stays tidy.
  await execute(db, 'UPDATE expense_types SET archived = ? WHERE category_id = ?;', [archived ? 1 : 0, id]);
  notifyDbChanged();
}

export async function reorderCategories(db: DB, orderedIds: string[]): Promise<void> {
  await transaction(db, async () => {
    for (const [index, id] of orderedIds.entries()) {
      await execute(db, 'UPDATE categories SET sort_order = ? WHERE id = ?;', [index, id]);
    }
  });
  notifyDbChanged();
}

export async function createType(db: DB, categoryId: string, name: string): Promise<string> {
  const id = newId();
  const maxRow = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM expense_types WHERE category_id = ?;',
    [categoryId],
  );
  await execute(
    db,
    `INSERT INTO expense_types (id, category_id, name, sort_order, is_default, archived)
     VALUES (?, ?, ?, ?, 0, 0);`,
    [id, categoryId, name.trim(), maxRow?.next ?? 0],
  );
  notifyDbChanged();
  return id;
}

export async function updateType(db: DB, id: string, name: string): Promise<void> {
  await execute(db, 'UPDATE expense_types SET name = ? WHERE id = ?;', [name.trim(), id]);
  notifyDbChanged();
}

export async function setTypeArchived(db: DB, id: string, archived: boolean): Promise<void> {
  await execute(db, 'UPDATE expense_types SET archived = ? WHERE id = ?;', [archived ? 1 : 0, id]);
  notifyDbChanged();
}

export interface PaymentMethodInput {
  name: string;
  icon: string;
  sortOrder?: number;
}

export async function createPaymentMethod(db: DB, input: PaymentMethodInput): Promise<string> {
  const id = newId();
  const maxRow = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM payment_methods;',
  );
  await execute(
    db,
    `INSERT INTO payment_methods (id, name, icon, sort_order, is_default, archived)
     VALUES (?, ?, ?, ?, 0, 0);`,
    [id, input.name.trim(), input.icon, input.sortOrder ?? maxRow?.next ?? 0],
  );
  notifyDbChanged();
  return id;
}

export async function updatePaymentMethod(db: DB, id: string, input: Partial<PaymentMethodInput>): Promise<void> {
  const fields: string[] = [];
  const params: (string | number)[] = [];
  if (input.name !== undefined) {
    fields.push('name = ?');
    params.push(input.name.trim());
  }
  if (input.icon !== undefined) {
    fields.push('icon = ?');
    params.push(input.icon);
  }
  if (fields.length) {
    params.push(id);
    await execute(db, `UPDATE payment_methods SET ${fields.join(', ')} WHERE id = ?;`, params);
    notifyDbChanged();
  }
}

export async function setPaymentMethodArchived(db: DB, id: string, archived: boolean): Promise<void> {
  await execute(db, 'UPDATE payment_methods SET archived = ? WHERE id = ?;', [archived ? 1 : 0, id]);
  notifyDbChanged();
}