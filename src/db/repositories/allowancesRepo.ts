/**
 * Allowance repository — money in, compared against money out.
 */

import type { DB } from '../client';
import { execute, getDatabase, queryAll, queryOne } from '../client';
import { newId } from '../../lib/id';
import { nowTimestamp } from '../../lib/date';
import { notifyDbChanged } from '../../state/dbStore';

export interface AllowanceRow {
  id: string;
  amount_cents: number;
  received_on: string;
  source: string | null;
  notes: string | null;
  recurring_rule_id: string | null;
  created_at: string;
}

export interface AllowanceWithTotals extends AllowanceRow {
  spent_cents: number;
}

export async function listAllowances(db: DB, from?: string, to?: string): Promise<AllowanceWithTotals[]> {
  const clauses: string[] = [];
  const params: string[] = [];
  if (from) {
    clauses.push('a.received_on >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('a.received_on <= ?');
    params.push(to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  return queryAll<AllowanceWithTotals>(
    db,
    `SELECT a.*,
            COALESCE((
              SELECT SUM(e.amount_cents) FROM expenses e
              WHERE e.spent_on BETWEEN ? AND ? AND e.deleted_at IS NULL
            ), 0) AS spent_cents
       FROM allowances a
       ${where}
      ORDER BY a.received_on DESC, a.created_at DESC;`,
    [from ?? '0000-01-01', to ?? '9999-12-31', ...params],
  );
}

export async function getAllowance(db: DB, id: string): Promise<AllowanceRow | null> {
  return queryOne<AllowanceRow>(db, 'SELECT * FROM allowances WHERE id = ?;', [id]);
}

export interface AllowanceInput {
  amount_cents: number;
  received_on: string;
  source?: string | null;
  notes?: string | null;
  recurring_rule_id?: string | null;
}

export async function createAllowance(db: DB, input: AllowanceInput): Promise<string> {
  const id = newId();
  await execute(
    db,
    `INSERT INTO allowances (id, amount_cents, received_on, source, notes, recurring_rule_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      input.amount_cents,
      input.received_on,
      input.source?.trim() || null,
      input.notes?.trim() || null,
      input.recurring_rule_id ?? null,
      nowTimestamp(),
    ],
  );
  notifyDbChanged();
  return id;
}

export async function updateAllowance(db: DB, id: string, patch: Partial<AllowanceInput>): Promise<void> {
  const map: Record<string, string> = {
    amount_cents: 'amount_cents',
    received_on: 'received_on',
    source: 'source',
    notes: 'notes',
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
  await execute(db, `UPDATE allowances SET ${fields.join(', ')} WHERE id = ?;`, params);
  notifyDbChanged();
}

export async function deleteAllowance(db: DB, id: string): Promise<void> {
  await execute(db, 'DELETE FROM allowances WHERE id = ?;', [id]);
  notifyDbChanged();
}

export interface AllowanceTotals {
  allowance_cents: number;
  spent_cents: number;
  net_cents: number;
  /** How many days the money will last at the current daily average. */
  runwayDays: number | null;
}

/** Monthly overview: allowance in, expenses out, net remaining, runway. */
export async function allowanceOverview(from: string, to: string): Promise<AllowanceTotals> {
  const db = await getDatabase();
  const row = await queryOne<{ allowance_cents: number; spent_cents: number; days: number }>(
    db,
    `SELECT
       (SELECT COALESCE(SUM(amount_cents), 0) FROM allowances WHERE received_on BETWEEN ? AND ?) AS allowance_cents,
       (SELECT COALESCE(SUM(amount_cents), 0) FROM expenses  WHERE spent_on     BETWEEN ? AND ? AND deleted_at IS NULL) AS spent_cents,
       (julianday(?) - julianday(?) + 1) AS days;`,
    [from, to, from, to, to, from],
  );

  const allowanceCents = row?.allowance_cents ?? 0;
  const spentCents = row?.spent_cents ?? 0;
  const days = Math.max(1, row?.days ?? 1);
  const perDay = Math.floor(spentCents / days);

  return {
    allowance_cents: allowanceCents,
    spent_cents: spentCents,
    net_cents: allowanceCents - spentCents,
    runwayDays: perDay > 0 ? Math.floor(allowanceCents / perDay) : null,
  };
}