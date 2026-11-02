/**
 * Expense <-> budget glue.
 *
 * Business rule 2: when an expense is saved it is attached to the active
 * budget whose date range contains `spent_on`, preferring the most specific
 * (custom → weekly → monthly). Business rule 7: editing the date re-runs it.
 */

import type { DB } from '../client';
import { computeBudgetTotals, pickBudgetForDate, shouldFireThreshold } from '../../lib/budgets';
import { listBudgetsCovering, readThresholdArm, writeThresholdArm, type BudgetWithTotals } from './budgetsRepo';
import { notifyBudgetThreshold } from '../../lib/notifications';

/** The budget id an expense should belong to, or `null` to leave it unbudgeted. */
export async function resolveBudgetId(db: DB, spentOn: string): Promise<string | null> {
  const candidates = await listBudgetsCovering(db, spentOn);
  if (!candidates.length) return null;
  return pickBudgetForDate(candidates, spentOn)?.id ?? null;
}

/**
 * Re-evaluates every active budget's threshold and fires the local
 * notification when it is crossed. Re-arms when an edit drops spend back
 * below the line (business rule 4).
 */
export async function evaluateBudgetThresholds(db: DB, today: string): Promise<void> {
  const budgets = await listBudgetsCovering(db, today);
  if (!budgets.length) return;

  for (const budget of budgets) {
    const totals = computeBudgetTotals(budget, budget.spent_cents);
    const previous = await readThresholdArm(budget.id);
    const { fire, arm } = shouldFireThreshold(previous, totals.threshold, totals.threshold);

    if (fire) {
      await notifyBudgetThreshold({
        budgetId: budget.id,
        budgetName: budget.name,
        threshold: totals.threshold === 'exceeded' ? 'exceeded' : 'warning',
        usage: totals.usage,
        spentCents: totals.spent_cents,
      });
    }

    if (arm.warning !== previous.warning || arm.exceeded !== previous.exceeded) {
      await writeThresholdArm(budget.id, arm);
    }
  }
}

/** Convenience for call sites that only have a budget row in hand. */
export async function refreshBudgetArm(budget: BudgetWithTotals): Promise<void> {
  const totals = computeBudgetTotals(budget, budget.spent_cents);
  const previous = await readThresholdArm(budget.id);
  const { fire, arm } = shouldFireThreshold(previous, totals.threshold, totals.threshold);

  if (fire) {
    await notifyBudgetThreshold({
      budgetId: budget.id,
      budgetName: budget.name,
      threshold: totals.threshold === 'exceeded' ? 'exceeded' : 'warning',
      usage: totals.usage,
      spentCents: totals.spent_cents,
    });
  }
  await writeThresholdArm(budget.id, arm);
}
