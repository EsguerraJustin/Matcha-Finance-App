/**
 * Recurring rules repository, plus the catch-up runner.
 *
 * Catch-up is idempotent by construction: `last_created_on` records the last
 * occurrence materialised, so a second run on the same day is a no-op even if
 * the rule's `next_due_on` somehow drifted.
 */

import type { DB } from '../client';
import { execute, queryAll, transaction } from '../client';
import { newId } from '../../lib/id';
import { nowTimestamp } from '../../lib/date';
import { notifyDbChanged } from '../../state/dbStore';
import {
  advanceNextDue,
  dueOccurrences,
  MAX_CATCH_UP_OCCURRENCES,
  type Frequency,
  type RuleKind,
  type RuleMode,
} from '../../lib/recurring';
import { createExpense } from './expensesRepo';
import { createAllowance } from './allowancesRepo';

export interface RecurringRuleRow {
  id: string;
  kind: RuleKind;
  amount_cents: number;
  category_id: string | null;
  type_id: string | null;
  payment_method_id: string | null;
  label: string;
  note: string | null;
  frequency: Frequency;
  interval_n: number;
  day_of_week: number | null;
  day_of_month: number | null;
  next_due_on: string;
  end_on: string | null;
  mode: RuleMode;
  active: number;
  last_created_on: string | null;
  created_at: string;
}

export async function listRecurringRules(db: DB, options: { includeInactive?: boolean } = {}): Promise<RecurringRuleRow[]> {
  const where = options.includeInactive ? '' : 'WHERE active = 1';
  return queryAll<RecurringRuleRow>(db, `SELECT * FROM recurring_rules ${where} ORDER BY next_due_on ASC;`);
}

export interface RecurringRuleInput {
  kind: RuleKind;
  amount_cents: number;
  category_id?: string | null;
  type_id?: string | null;
  payment_method_id?: string | null;
  label: string;
  note?: string | null;
  frequency: Frequency;
  interval_n?: number;
  day_of_week?: number | null;
  day_of_month?: number | null;
  next_due_on: string;
  end_on?: string | null;
  mode?: RuleMode;
  active?: boolean;
}

export async function createRecurringRule(db: DB, input: RecurringRuleInput): Promise<string> {
  const id = newId();
  await execute(
    db,
    `INSERT INTO recurring_rules (
       id, kind, amount_cents, category_id, type_id, payment_method_id, label, note,
       frequency, interval_n, day_of_week, day_of_month, next_due_on, end_on, mode, active, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      input.kind,
      input.amount_cents,
      input.category_id ?? null,
      input.type_id ?? null,
      input.payment_method_id ?? null,
      input.label.trim(),
      input.note?.trim() || null,
      input.frequency,
      Math.max(1, input.interval_n ?? 1),
      input.day_of_week ?? null,
      input.day_of_month ?? null,
      input.next_due_on,
      input.end_on ?? null,
      input.mode ?? 'auto',
      input.active === false ? 0 : 1,
      nowTimestamp(),
    ],
  );
  notifyDbChanged();
  return id;
}

export async function updateRecurringRule(db: DB, id: string, patch: Partial<RecurringRuleInput>): Promise<void> {
  const map: Record<string, string> = {
    amount_cents: 'amount_cents',
    category_id: 'category_id',
    type_id: 'type_id',
    payment_method_id: 'payment_method_id',
    label: 'label',
    note: 'note',
    frequency: 'frequency',
    interval_n: 'interval_n',
    day_of_week: 'day_of_week',
    day_of_month: 'day_of_month',
    next_due_on: 'next_due_on',
    end_on: 'end_on',
    mode: 'mode',
  };
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, column] of Object.entries(map)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    fields.push(`${column} = ?`);
    params.push((value ?? null) as string | number | null);
  }
  if (patch.active !== undefined) {
    fields.push('active = ?');
    params.push(patch.active ? 1 : 0);
  }
  if (!fields.length) return;
  params.push(id);
  await execute(db, `UPDATE recurring_rules SET ${fields.join(', ')} WHERE id = ?;`, params);
  notifyDbChanged();
}

export async function deleteRecurringRule(db: DB, id: string): Promise<void> {
  await execute(db, 'DELETE FROM recurring_rules WHERE id = ?;', [id]);
  notifyDbChanged();
}

export async function setRuleActive(db: DB, id: string, active: boolean): Promise<void> {
  await execute(db, 'UPDATE recurring_rules SET active = ? WHERE id = ?;', [active ? 1 : 0, id]);
  notifyDbChanged();
}

/* ------------------------------------------------------------------ */
/* Catch-up runner                                                     */
/* ------------------------------------------------------------------ */

export interface CatchUpResult {
  created: number;
  rulesProcessed: number;
}

/**
 * Materialises every occurrence that is due, capped at
 * `MAX_CATCH_UP_OCCURRENCES` per rule (business rule 11).
 *
 * `mode = 'remind'` rules are never auto-created — they only raise a local
 * notification and wait for the user to confirm.
 */
export async function runCatchUp(
  db: DB,
  today: string,
  options: { categoryId: string | null; paymentMethodId: string | null } = { categoryId: null, paymentMethodId: null },
): Promise<CatchUpResult> {
  const rules = await listRecurringRules(db);

  let created = 0;
  let rulesProcessed = 0;

  for (const rule of rules) {
    if (rule.kind !== 'expense' || rule.mode !== 'auto') continue;
    const due = dueOccurrences(rule, today);
    if (!due.length) continue;

    rulesProcessed += 1;

    await transaction(db, async () => {
      for (const dueOn of due.slice(0, MAX_CATCH_UP_OCCURRENCES)) {
        // Guard against a rule that somehow re-offered the same date.
        if (rule.last_created_on && dueOn <= rule.last_created_on) continue;
        // Fall back to the user's defaults when a rule has none set.
        const categoryId = rule.category_id ?? options.categoryId;
        const paymentMethodId = rule.payment_method_id ?? options.paymentMethodId;
        if (!categoryId || !paymentMethodId) continue;

        await createExpense(db, {
          amount_cents: rule.amount_cents,
          spent_on: dueOn,
          category_id: categoryId,
          type_id: rule.type_id,
          payment_method_id: paymentMethodId,
          note: rule.note,
          recurring_rule_id: rule.id,
        });
        created += 1;
      }

      const advanced = advanceNextDue(rule, today);
      const lastCreated = due[Math.min(due.length, MAX_CATCH_UP_OCCURRENCES) - 1];
      await db.runAsync('UPDATE recurring_rules SET next_due_on = ?, last_created_on = ? WHERE id = ?;', [
        advanced,
        lastCreated,
        rule.id,
      ]);
    });
  }

  if (rulesProcessed) notifyDbChanged();
  return { created, rulesProcessed };
}

/** Same contract for recurring allowance (Section 6.4). */
export async function runAllowanceCatchUp(db: DB, today: string): Promise<number> {
  const rules = (await listRecurringRules(db)).filter((rule) => rule.kind === 'allowance' && rule.mode === 'auto');
  let created = 0;

  for (const rule of rules) {
    const due = dueOccurrences(rule, today).slice(0, MAX_CATCH_UP_OCCURRENCES);
    if (!due.length) continue;

    await transaction(db, async () => {
      for (const dueOn of due) {
        if (rule.last_created_on && dueOn <= rule.last_created_on) continue;
        await createAllowance(db, {
          amount_cents: rule.amount_cents,
          received_on: dueOn,
          source: rule.label,
                    recurring_rule_id: rule.id,
        });
        created += 1;
      }
      await db.runAsync('UPDATE recurring_rules SET next_due_on = ?, last_created_on = ? WHERE id = ?;', [
        advanceNextDue(rule, today),
        due[due.length - 1],
        rule.id,
      ]);
    });
  }

  if (created) notifyDbChanged();
  return created;
}

