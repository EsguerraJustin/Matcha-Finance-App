/**
 * Quick templates ("favorites") — the one-tap add row on Home.
 */

import type { DB } from '../client';
import { execute, queryAll } from '../client';
import { newId } from '../../lib/id';
import { notifyDbChanged } from '../../state/dbStore';

export interface QuickTemplateRow {
  id: string;
  label: string;
  amount_cents: number;
  category_id: string;
  category_name: string;
  category_color: string;
  type_id: string | null;
  type_name: string | null;
  payment_method_id: string;
  payment_name: string;
  note: string | null;
  sort_order: number;
}

export async function listQuickTemplates(db: DB): Promise<QuickTemplateRow[]> {
  return queryAll<QuickTemplateRow>(
    db,
    `SELECT t.*,
            c.name AS category_name,
            c.color_key AS category_color,
            ty.name AS type_name,
            p.name AS payment_name
       FROM quick_templates t
       JOIN categories c      ON c.id = t.category_id
       JOIN payment_methods p ON p.id = t.payment_method_id
       LEFT JOIN expense_types ty ON ty.id = t.type_id
      ORDER BY t.sort_order ASC, t.label ASC;`,
  );
}

export interface QuickTemplateInput {
  label: string;
  amount_cents: number;
  category_id: string;
  type_id?: string | null;
  payment_method_id: string;
  note?: string | null;
}

export async function createQuickTemplate(db: DB, input: QuickTemplateInput): Promise<string> {
  const id = newId();
  const maxRow = await db.getFirstAsync<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM quick_templates;');
  await execute(
    db,
    `INSERT INTO quick_templates (id, label, amount_cents, category_id, type_id, payment_method_id, note, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      input.label.trim(),
      input.amount_cents,
      input.category_id,
      input.type_id ?? null,
      input.payment_method_id,
      input.note?.trim() || null,
      maxRow?.next ?? 0,
    ],
  );
  notifyDbChanged();
  return id;
}

export async function updateQuickTemplate(db: DB, id: string, input: Partial<QuickTemplateInput>): Promise<void> {
  const map: Record<string, string> = {
    label: 'label',
    amount_cents: 'amount_cents',
    category_id: 'category_id',
    type_id: 'type_id',
    payment_method_id: 'payment_method_id',
    note: 'note',
  };
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(map)) {
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined) continue;
    fields.push(`${column} = ?`);
    params.push((value ?? null) as string | number | null);
  }
  if (!fields.length) return;
  params.push(id);
  await execute(db, `UPDATE quick_templates SET ${fields.join(', ')} WHERE id = ?;`, params);
  notifyDbChanged();
}

export async function deleteQuickTemplate(db: DB, id: string): Promise<void> {
  await execute(db, 'DELETE FROM quick_templates WHERE id = ?;', [id]);
  notifyDbChanged();
}

/** Saves the last used combination from the Add sheet as a new favorite. */
export async function saveAsFavorite(db: DB, expenseId: string): Promise<void> {
  const row = await db.getFirstAsync<{
    amount_cents: number;
    category_id: string;
    type_id: string | null;
    payment_method_id: string;
    note: string | null;
  }>(
    `SELECT amount_cents, category_id, type_id, payment_method_id, note
       FROM expenses WHERE id = ?;`,
    [expenseId],
  );
  if (!row) return;
  const typeName = row.type_id
    ? (await db.getFirstAsync<{ name: string }>('SELECT name FROM expense_types WHERE id = ?;', [row.type_id]))?.name
    : null;

  await createQuickTemplate(db, {
    label: typeName ?? 'Favorite',
    amount_cents: row.amount_cents,
    category_id: row.category_id,
    type_id: row.type_id,
    payment_method_id: row.payment_method_id,
    note: row.note,
  });
}