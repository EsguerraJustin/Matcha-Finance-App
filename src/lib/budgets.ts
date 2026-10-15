/**
 * Budget domain logic — pure functions only, unit tested.
 *
 * Totals are **derived**, never stored (brief Section 9, rule 1).
 */

import type { WeekStart } from './date';
import {
  addDaysISO,
  budgetThreshold,
  dailyAverageCents,
  daysLeftInclusive,
  endOfWeekISO,
  safeToSpendTodayCents,
  startOfWeekISO,
  todayISO,
} from './date';
import { ratio, usageRatio } from './money';

export type BudgetKind = 'weekly' | 'monthly' | 'custom';

export interface BudgetLike {
  id: string;
  kind: BudgetKind;
  name: string;
  amount_cents: number;
  start_date: string;
  end_date: string;
  rollover_in_cents: number;
  is_active: number;
}

export interface BudgetTotals {
  spent_cents: number;
  total_cents: number;
  remaining_cents: number;
  usage: number;
  threshold: 'ok' | 'warning' | 'exceeded';
}

/**
 * Business rule 2: when several budgets cover the same date, prefer the most
 * specific — custom beats weekly beats monthly.
 */
export function specificity(kind: BudgetKind): number {
  switch (kind) {
    case 'custom':
      return 0;
    case 'weekly':
      return 1;
    default:
      return 2;
  }
}

/**
 * The active budget that should own an expense spent on `spentOn`.
 * Returns `null` when nothing covers that date, so the expense is simply
 * unbudgeted (which is allowed).
 */
export function pickBudgetForDate<T extends BudgetLike>(budgets: readonly T[], spentOn: string, today = todayISO()): T | null {
  const candidates = budgets.filter(
    (budget) =>
      budget.is_active === 1 &&
      budget.start_date <= spentOn &&
      budget.end_date >= spentOn &&
      // A budget whose period ended long ago should not silently swallow a
      // back-dated entry once a newer one exists.
      budget.end_date >= today,
  );

  if (!candidates.length) return null;

  return candidates.sort((a, b) => {
    const byKind = specificity(a.kind) - specificity(b.kind);
    if (byKind !== 0) return byKind;
    // Same specificity: the narrowest date range wins.
    const spanA = diffDays(a.start_date, a.end_date);
    const spanB = diffDays(b.start_date, b.end_date);
    if (spanA !== spanB) return spanA - spanB;
    return a.start_date < b.start_date ? 1 : -1;
  })[0];
}

function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Business rule 3, plus the usage ratio and threshold. */
export function computeBudgetTotals(budget: BudgetLike, spentCents: number): BudgetTotals {
  const totalCents = budget.amount_cents + budget.rollover_in_cents;
  return {
    spent_cents: spentCents,
    total_cents: totalCents,
    remaining_cents: totalCents - spentCents,
    usage: ratio(spentCents, totalCents),
    threshold: budgetThreshold(spentCents, totalCents),
  };
}

/** Per-category limit progress (brief Section 6.3). */
export interface CategoryLimitLike {
  id: string;
  category_id: string;
  limit_cents: number;
}

export function categoryLimitUsage(limitCents: number, spentCents: number): number {
  return usageRatio(spentCents, limitCents);
}

export function isOverCategoryLimit(limitCents: number, spentCents: number): boolean {
  return limitCents > 0 && spentCents >= limitCents;
}

/**
 * Leftover to roll into the next period. Only positive amounts roll; a
 * overspend never becomes next week's problem.
 */
export function rolloverAmount(totalCents: number, spentCents: number, enabled: boolean): number {
  if (!enabled) return 0;
  return Math.max(0, totalCents - spentCents);
}

export function nextWeeklyBudget(budget: BudgetLike, weekStartsOn: WeekStart = 1) {
  const nextStart = addDaysISO(budget.end_date, 1);
  const normalisedStart = startOfWeekISO(nextStart, weekStartsOn);
  return {
    kind: 'weekly' as const,
    name: budget.name,
    start_date: normalisedStart,
    end_date: endOfWeekISO(normalisedStart, weekStartsOn),
  };
}

/**
 * Threshold notifications fire **once per threshold per budget** and re-arm
 * when the spend drops back below the line (business rule 4).
 */
export type ThresholdArm = { warning: boolean; exceeded: boolean };

export function shouldFireThreshold(previousArm: ThresholdArm, threshold: 'ok' | 'warning' | 'exceeded', previousThreshold: 'ok' | 'warning' | 'exceeded'): { fire: boolean; arm: ThresholdArm } {
  const arm = { ...previousArm };

  if (threshold === 'exceeded' && !arm.exceeded) {
    arm.exceeded = true;
    return { fire: true, arm };
  }
  if (threshold === 'warning' && !arm.warning) {
    arm.warning = true;
    return { fire: true, arm };
  }
  // Re-arm whenever the budget drops back below a threshold.
  if (previousThreshold === 'exceeded' && threshold !== 'exceeded') arm.exceeded = false;
  if (previousThreshold === 'warning' && threshold === 'ok') arm.warning = false;

  return { fire: false, arm };
}

/** Everything the budget summary card shows (brief Section 6.3). */
export interface BudgetSummary extends BudgetTotals {
  daysLeft: number;
  safeDailyCents: number;
  actualDailyCents: number;
  projectedCents: number;
}

export function budgetSummary(params: {
  budget: BudgetLike;
  spentCents: number;
  today: string;
  setAsideCents?: number;
}): BudgetSummary {
  const { budget, spentCents, today } = params;
  const totals = computeBudgetTotals(budget, spentCents);
  const daysLeft = daysLeftInclusive(today, budget.end_date);
  const elapsed = Math.max(1, diffDays(budget.start_date, today) + 1);
  const actualDailyCents = dailyAverageCents(spentCents, elapsed);

  return {
    ...totals,
    daysLeft,
    safeDailyCents: safeToSpendTodayCents({
      budgetCents: budget.amount_cents,
      rolloverCents: budget.rollover_in_cents,
      spentCents,
      today,
      endDate: budget.end_date,
      setAsideCents: params.setAsideCents,
    }),
    actualDailyCents,
    projectedCents: spentCents + actualDailyCents * daysLeft,
  };
}

/** Localised, never-shaming budget copy (brief Section 4.5). */
export function budgetCopy(summary: BudgetSummary): string {
  if (summary.threshold === 'exceeded') {
    return "This period is over — let's reset next one and keep it kinder.";
  }
  if (summary.threshold === 'warning') {
    return `You're at ${Math.round(summary.usage * 100)}% of this budget — easy does it.`;
  }
  if (summary.remaining_cents === summary.total_cents) {
    return 'Nothing spent yet. Nice and easy.';
  }
  return `${summary.daysLeft} day${summary.daysLeft === 1 ? '' : 's'} left and you're doing great.`;
}