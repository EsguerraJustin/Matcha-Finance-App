/**
 * Savings goals repository.
 *
 * `saved_cents` is always derived from `savings_contributions` — never a
 * running total that could drift (brief Section 9, rule 1).
 */

import type { DB } from '../client';
import { execute, queryAll, transaction } from '../client';
import { newId } from '../../lib/id';
import { nowTimestamp } from '../../lib/date';
import { notifyDbChanged } from '../../state/dbStore';

export interface GoalRow {
  id: string;
  name: string;
  target_cents: number;
  target_date: string | null;
  color_key: string;
  reduce_safe_to_spend: number;
  archived: number;
  created_at: string;
}

export interface GoalWithTotals extends GoalRow {
  saved_cents: number;
}

const GOAL_WITH_TOTALS = `
  SELECT g.*,
         COALESCE((
           SELECT SUM(sc.amount_cents) FROM savings_contributions sc WHERE sc.goal_id = g.id
         ), 0) AS saved_cents
    FROM savings_goals g`;

export async function listGoals(db: DB, options: { includeArchived?: boolean } = {}): Promise<GoalWithTotals[]> {
  const where = options.includeArchived ? '' : 'WHERE g.archived = 0';
  return queryAll<GoalWithTotals>(db, `${GOAL_WITH_TOTALS} ${where} ORDER BY g.created_at DESC;`);
}

export async function getGoal(db: DB, id: string): Promise<GoalWithTotals | null> {
  const row = await db.getFirstAsync<GoalWithTotals>(`${GOAL_WITH_TOTALS} WHERE g.id = ?;`, [id]);
  return row ?? null;
}

export interface GoalInput {
  name: string;
  target_cents: number;
  target_date?: string | null;
  color_key: string;
  reduce_safe_to_spend?: boolean;
}

export async function createGoal(db: DB, input: GoalInput): Promise<string> {
  const id = newId();
  await execute(
    db,
    `INSERT INTO savings_goals (id, name, target_cents, target_date, color_key, reduce_safe_to_spend, archived, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?);`,
    [
      id,
      input.name.trim(),
      input.target_cents,
      input.target_date ?? null,
      input.color_key,
      input.reduce_safe_to_spend === false ? 0 : 1,
      nowTimestamp(),
    ],
  );
  notifyDbChanged();
  return id;
}

export async function updateGoal(db: DB, id: string, patch: Partial<GoalInput> & { archived?: boolean }): Promise<void> {
  const map: Record<string, string> = {
    name: 'name',
    target_cents: 'target_cents',
    target_date: 'target_date',
    color_key: 'color_key',
  };
  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  for (const [key, column] of Object.entries(map)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    fields.push(`${column} = ?`);
    params.push((value ?? null) as string | number | null);
  }
  if (patch.reduce_safe_to_spend !== undefined) {
    fields.push('reduce_safe_to_spend = ?');
    params.push(patch.reduce_safe_to_spend ? 1 : 0);
  }
  if (patch.archived !== undefined) {
    fields.push('archived = ?');
    params.push(patch.archived ? 1 : 0);
  }
  if (!fields.length) return;

  params.push(id);
  await execute(db, `UPDATE savings_goals SET ${fields.join(', ')} WHERE id = ?;`, params);
  notifyDbChanged();
}

export async function deleteGoal(db: DB, id: string): Promise<void> {
  await transaction(db, async () => {
    await execute(db, 'DELETE FROM savings_contributions WHERE goal_id = ?;', [id]);
    await execute(db, 'DELETE FROM savings_goals WHERE id = ?;', [id]);
  });
  notifyDbChanged();
}

export interface ContributionRow {
  id: string;
  goal_id: string;
  amount_cents: number;
  contributed_on: string;
}

export async function listContributions(db: DB, goalId: string): Promise<ContributionRow[]> {
  return queryAll<ContributionRow>(
    db,
    'SELECT * FROM savings_contributions WHERE goal_id = ? ORDER BY contributed_on DESC;',
    [goalId],
  );
}

export async function addContribution(db: DB, goalId: string, amountCents: number, on?: string): Promise<string> {
  const id = newId();
  await execute(
    db,
    'INSERT INTO savings_contributions (id, goal_id, amount_cents, contributed_on) VALUES (?, ?, ?, ?);',
    [id, goalId, amountCents, on ?? nowTimestamp().slice(0, 10)],
  );
  notifyDbChanged();
  return id;
}

export async function deleteContribution(db: DB, id: string): Promise<void> {
  await execute(db, 'DELETE FROM savings_contributions WHERE id = ?;', [id]);
  notifyDbChanged();
}

/**
 * Money already promised to a goal, for the goals that opt in. Subtracts it
 * from safe-to-spend (business rule 5).
 */
export async function totalSetAside(db: DB): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(sc.amount_cents), 0) AS total
       FROM savings_contributions sc
       JOIN savings_goals g ON g.id = sc.goal_id
      WHERE g.reduce_safe_to_spend = 1 AND g.archived = 0;`,
  );
  return row?.total ?? 0;
}