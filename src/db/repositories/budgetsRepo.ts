/**
 * Budget repository.
 *
 * A budget row only stores the *plan*. Every number shown to the user —
 * spent, remaining, usage, projection — is derived by a query at read time.
 */

import type { DB } from '../client';
import { execute, getDatabase, queryAll, queryOne, transaction } from '../client';
import { newId } from '../../lib/id';
import { nowTimestamp } from '../../lib/date';
import { notifyDbChanged } from '../../state/dbStore';
import type { BudgetKind } from '../../lib/budgets';

export interface BudgetRow {
  id: string;
  kind: BudgetKind;
  name: string;
  amount_cents: number;
  start_date: string;
  end_date: string;
  rollover_in_cents: number;
  is_active: number;
  created_at: string;
}

export interface BudgetWithTotals extends BudgetRow {
  spent_cents: number;
  total_cents: number;
  remaining_cents: number;
  set_aside_cents: number;
}

/** Every derived number comes from this single aggregate query. */
const BUDGET_WITH_TOTALS = `
  SELECT b.*,
         b.amount_cents + b.rollover_in_cents AS total_cents,
         COALESCE((
           SELECT SUM(e.amount_cents) FROM expenses e
           WHERE e.budget_id = b.id AND e.deleted_at IS NULL
         ), 0) AS spent_cents,
         COALESCE((
           SELECT SUM(e.amount_cents) FROM expenses e
           WHERE e.budget_id = b.id AND e.deleted_at IS NULL
             AND e.recurring_rule_id IS NULL
         ), 0) AS set_aside_cents
    FROM budgets b`;

export async function listBudgets(db: DB, options: { includeInactive?: boolean } = {}): Promise<BudgetWithTotals[]> {
  const where = options.includeInactive ? '' : 'WHERE b.is_active = 1';
  return queryAll<BudgetWithTotals>(
    db,
    `${BUDGET_WITH_TOTALS} ${where} ORDER BY b.start_date DESC, b.is_active DESC, b.created_at DESC;`,
  );
}

export async function getBudget(db: DB, id: string): Promise<BudgetWithTotals | null> {
  return queryOne<BudgetWithTotals>(db, `${BUDGET_WITH_TOTALS} WHERE b.id = ?;`, [id]);
}

/**
 * Budgets whose period contains `spentOn` — the candidates for attachment.
 * Includes inactive ones only when asked, so back-dated entries can still find
 * a retired period explicitly.
 */
export async function listBudgetsCovering(db: DB, spentOn: string): Promise<BudgetWithTotals[]> {
  return queryAll<BudgetWithTotals>(
    db,
    `${BUDGET_WITH_TOTALS} WHERE b.is_active = 1 AND b.start_date <= ? AND b.end_date >= ?;`,
    [spentOn, spentOn],
  );
}

export interface BudgetInput {
  kind: BudgetKind;
  name: string;
  amount_cents: number;
  start_date: string;
  end_date: string;
  rollover_in_cents?: number;
  is_active?: boolean;
}

export async function createBudget(db: DB, input: BudgetInput): Promise<string> {
  const id = newId();
  await execute(
    db,
    `INSERT INTO budgets (id, kind, name, amount_cents, start_date, end_date, rollover_in_cents, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      input.kind,
      input.name.trim(),
      input.amount_cents,
      input.start_date,
      input.end_date,
      input.rollover_in_cents ?? 0,
      input.is_active === false ? 0 : 1,
      nowTimestamp(),
    ],
  );
  notifyDbChanged();
  return id;
}

export async function updateBudget(db: DB, id: string, patch: Partial<BudgetInput>): Promise<void> {
  const map: Record<string, string> = {
    kind: 'kind',
    name: 'name',
    amount_cents: 'amount_cents',
    start_date: 'start_date',
    end_date: 'end_date',
    rollover_in_cents: 'rollover_in_cents',
  };
  const fields: string[] = [];
  const params: (string | number)[] = [];

  for (const [key, column] of Object.entries(map)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    fields.push(`${column} = ?`);
    params.push(value as string | number);
  }
  if (patch.is_active !== undefined) {
    fields.push('is_active = ?');
    params.push(patch.is_active ? 1 : 0);
  }
  if (!fields.length) return;

  params.push(id);
  await execute(db, `UPDATE budgets SET ${fields.join(', ')} WHERE id = ?;`, params);
  notifyDbChanged();
}

export async function deleteBudget(db: DB, id: string): Promise<void> {
  await transaction(db, async () => {
    // Expenses survive; they simply become unbudgeted.
    await execute(db, 'UPDATE expenses SET budget_id = NULL WHERE budget_id = ?;', [id]);
    await execute(db, 'DELETE FROM budgets WHERE id = ?;', [id]);
  });
  notifyDbChanged();
}

/* ------------------------------------------------------------------ */
/* Per-category limits                                                 */
/* ------------------------------------------------------------------ */

export interface CategoryBudgetRow {
  id: string;
  budget_id: string;
  category_id: string;
  category_name: string;
  limit_cents: number;
  spent_cents: number;
}

export async function listCategoryBudgets(db: DB, budgetId: string): Promise<CategoryBudgetRow[]> {
  return queryAll<CategoryBudgetRow>(
    db,
    `SELECT cb.*,
            c.name AS category_name,
            COALESCE((
              SELECT SUM(e.amount_cents) FROM expenses e
              WHERE e.budget_id = cb.budget_id
                AND e.category_id = cb.category_id
                AND e.deleted_at IS NULL
            ), 0) AS spent_cents
       FROM category_budgets cb
       JOIN categories c ON c.id = cb.category_id
      WHERE cb.budget_id = ?
      ORDER BY c.sort_order ASC;`,
    [budgetId],
  );
}

export async function setCategoryLimit(db: DB, budgetId: string, categoryId: string, limitCents: number): Promise<void> {
  if (limitCents <= 0) {
    await execute(db, 'DELETE FROM category_budgets WHERE budget_id = ? AND category_id = ?;', [budgetId, categoryId]);
  } else {
    await execute(
      db,
      `INSERT INTO category_budgets (id, budget_id, category_id, limit_cents) VALUES (?, ?, ?, ?)
       ON CONFLICT(budget_id, category_id) DO UPDATE SET limit_cents = excluded.limit_cents;`,
      [newId(), budgetId, categoryId, limitCents],
    );
  }
  notifyDbChanged();
}

/* ------------------------------------------------------------------ */
/* Threshold notification arming                                       */
/* ------------------------------------------------------------------ */

const THRESHOLD_KEY_PREFIX = 'budget_threshold:';

export interface ThresholdArm {
  warning: boolean;
  exceeded: boolean;
}

export async function readThresholdArm(budgetId: string): Promise<ThresholdArm> {
  const db = await getDatabase();
  const row = await queryOne<{ value: string | null }>(
    db,
    'SELECT value FROM settings WHERE key = ?;',
    [`${THRESHOLD_KEY_PREFIX}${budgetId}`],
  );
  if (!row?.value) return { warning: false, exceeded: false };
  try {
    const parsed = JSON.parse(row.value) as Partial<ThresholdArm>;
    return { warning: Boolean(parsed.warning), exceeded: Boolean(parsed.exceeded) };
  } catch {
    return { warning: false, exceeded: false };
  }
}

export async function writeThresholdArm(budgetId: string, arm: ThresholdArm): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [`${THRESHOLD_KEY_PREFIX}${budgetId}`, JSON.stringify(arm)],
  );
  notifyDbChanged();
}

/** The budget that owns "today" for the Home hero card. */
export async function getCurrentBudget(db: DB, today: string): Promise<BudgetWithTotals | null> {
  return queryOne<BudgetWithTotals>(
    db,
    `${BUDGET_WITH_TOTALS} WHERE b.is_active = 1 AND b.start_date <= ? AND b.end_date >= ?
     ORDER BY CASE b.kind WHEN 'custom' THEN 0 WHEN 'weekly' THEN 1 ELSE 2 END, (julianday(b.end_date) - julianday(b.start_date)) ASC
     LIMIT 1;`,
    [today, today],
  );
}