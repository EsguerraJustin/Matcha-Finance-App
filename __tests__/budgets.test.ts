import {
  budgetCopy,
  budgetSummary,
  categoryLimitUsage,
  computeBudgetTotals,
  isOverCategoryLimit,
  nextWeeklyBudget,
  pickBudgetForDate,
  rolloverAmount,
  shouldFireThreshold,
  specificity,
  type BudgetLike,
} from '../src/lib/budgets';

const TODAY = '2026-01-07';

function budget(overrides: Partial<BudgetLike> = {}): BudgetLike {
  return {
    id: 'b1',
    kind: 'weekly',
    name: 'Weekly',
    amount_cents: 100000,
    start_date: '2026-01-05',
    end_date: '2026-01-11',
    rollover_in_cents: 0,
    is_active: 1,
    ...overrides,
  };
}

describe('budget attachment (business rule 2)', () => {
  it('ranks custom above weekly above monthly', () => {
    expect(specificity('custom')).toBeLessThan(specificity('weekly'));
    expect(specificity('weekly')).toBeLessThan(specificity('monthly'));
  });

  it('picks the most specific budget containing the date', () => {
    const monthly = budget({ id: 'm', kind: 'monthly', start_date: '2026-01-01', end_date: '2026-01-31' });
    const weekly = budget({ id: 'w', kind: 'weekly' });
    const custom = budget({ id: 'c', kind: 'custom', start_date: '2026-01-06', end_date: '2026-01-08' });

    expect(pickBudgetForDate([monthly, weekly, custom], '2026-01-07', TODAY)?.id).toBe('c');
    expect(pickBudgetForDate([monthly, weekly], '2026-01-07', TODAY)?.id).toBe('w');
    expect(pickBudgetForDate([monthly], '2026-01-07', TODAY)?.id).toBe('m');
  });

  it('breaks a same-kind tie with the narrowest range', () => {
    const wide = budget({ id: 'wide', start_date: '2026-01-01', end_date: '2026-01-31' });
    const narrow = budget({ id: 'narrow', start_date: '2026-01-05', end_date: '2026-01-11' });
    expect(pickBudgetForDate([wide, narrow], '2026-01-07', TODAY)?.id).toBe('narrow');
  });

  it('leaves an expense unbudgeted when nothing covers the date', () => {
    expect(pickBudgetForDate([budget()], '2026-02-01', TODAY)).toBeNull();
    expect(pickBudgetForDate([], TODAY)).toBeNull();
  });

  it('ignores inactive and already-finished budgets', () => {
    expect(pickBudgetForDate([budget({ is_active: 0 })], TODAY, TODAY)).toBeNull();
    const old = budget({ id: 'old', start_date: '2025-12-01', end_date: '2025-12-31' });
    expect(pickBudgetForDate([old], TODAY, TODAY)).toBeNull();
  });
});

describe('derived totals (business rule 3)', () => {
  it('matches the acceptance example: ₱1,000 weekly − ₱120 lunch = ₱880', () => {
    const totals = computeBudgetTotals(budget(), 12000);
    expect(totals.remaining_cents).toBe(88000);
    expect(totals.total_cents).toBe(100000);
    expect(totals.threshold).toBe('ok');
  });

  it('adds rollover into the total', () => {
    const totals = computeBudgetTotals(budget({ rollover_in_cents: 15000 }), 12000);
    expect(totals.total_cents).toBe(115000);
    expect(totals.remaining_cents).toBe(103000);
  });

  it('goes negative rather than clamping, and flags exceeded', () => {
    const totals = computeBudgetTotals(budget(), 150000);
    expect(totals.remaining_cents).toBe(-50000);
    expect(totals.threshold).toBe('exceeded');
    expect(totals.usage).toBe(1);
  });

  it('never shows NaN for a zero budget', () => {
    const totals = computeBudgetTotals(budget({ amount_cents: 0 }), 0);
    expect(totals.usage).toBe(0);
    expect(totals.threshold).toBe('ok');
  });
});

describe('category limits', () => {
  it('measures usage against the limit', () => {
    expect(categoryLimitUsage(50000, 25000)).toBeCloseTo(0.5);
    expect(categoryLimitUsage(50000, 60000)).toBeCloseTo(1.2);
    expect(categoryLimitUsage(0, 100)).toBe(0);
  });

  it('flags overspend only when a limit exists', () => {
    expect(isOverCategoryLimit(50000, 50000)).toBe(true);
    expect(isOverCategoryLimit(50000, 49999)).toBe(false);
    expect(isOverCategoryLimit(0, 99999)).toBe(false);
  });
});

describe('rollover', () => {
  it('rolls only the positive leftover, and only when enabled', () => {
    expect(rolloverAmount(100000, 12000, true)).toBe(88000);
    expect(rolloverAmount(100000, 12000, false)).toBe(0);
    expect(rolloverAmount(100000, 150000, true)).toBe(0);
  });
});

describe('next weekly budget', () => {
  it('starts the Monday after the current week ends', () => {
    const next = nextWeeklyBudget(budget(), 1);
    expect(next.start_date).toBe('2026-01-12');
    expect(next.end_date).toBe('2026-01-18');
  });

  it('honours a Sunday week start', () => {
    const next = nextWeeklyBudget(budget(), 0);
    expect(next.start_date).toBe('2026-01-11');
    expect(next.end_date).toBe('2026-01-17');
  });
});

describe('threshold notifications (business rule 4)', () => {
  it('fires warning once at 80%', () => {
    const first = shouldFireThreshold({ warning: false, exceeded: false }, 'warning', 'ok');
    expect(first.fire).toBe(true);
    const second = shouldFireThreshold(first.arm, 'warning', 'warning');
    expect(second.fire).toBe(false);
  });

  it('fires exceeded once at 100%', () => {
    const arm = { warning: true, exceeded: false };
    const result = shouldFireThreshold(arm, 'exceeded', 'warning');
    expect(result.fire).toBe(true);
    expect(result.arm.exceeded).toBe(true);
    expect(shouldFireThreshold(result.arm, 'exceeded', 'exceeded').fire).toBe(false);
  });

  it('re-arms when an edit drops the spend back below the threshold', () => {
    const armed = { warning: true, exceeded: false };
    const dropped = shouldFireThreshold(armed, 'ok', 'warning');
    expect(dropped.arm.warning).toBe(false);
    expect(shouldFireThreshold(dropped.arm, 'warning', 'ok').fire).toBe(true);
  });

  it('keeps the warning armed while still exceeded', () => {
    const armed = { warning: true, exceeded: true };
    const result = shouldFireThreshold(armed, 'exceeded', 'exceeded');
    expect(result.arm).toEqual(armed);
  });
});

describe('budget summary', () => {
  it('reports days left, safe daily and projected spend', () => {
    const summary = budgetSummary({ budget: budget(), spentCents: 12000, today: '2026-01-05' });
    expect(summary.daysLeft).toBe(7);
    expect(summary.safeDailyCents).toBe(12571);
    expect(summary.actualDailyCents).toBe(12000);
    expect(summary.projectedCents).toBe(12000 + 12000 * 7);
  });

  it('subtracts savings set-aside from safe-to-spend', () => {
    const withGoal = budgetSummary({ budget: budget(), spentCents: 0, today: '2026-01-05', setAsideCents: 7000 });
    expect(withGoal.safeDailyCents).toBe(13285);
  });

  it('writes warm, never-shaming copy', () => {
    expect(budgetCopy(budgetSummary({ budget: budget(), spentCents: 12000, today: '2026-01-05' }))).toMatch(/doing great/);
    expect(
      budgetCopy(budgetSummary({ budget: budget(), spentCents: 80000, today: '2026-01-05' })),
    ).toBe("You're at 80% of this budget — easy does it.");
    expect(
      budgetCopy(budgetSummary({ budget: budget(), spentCents: 120000, today: '2026-01-05' })),
    ).toMatch(/reset next one/);
    expect(budgetCopy(budgetSummary({ budget: budget(), spentCents: 0, today: '2026-01-05' }))).toBe(
      'Nothing spent yet. Nice and easy.',
    );
  });

  it('uses the singular for a single day left', () => {
    expect(budgetCopy(budgetSummary({ budget: budget(), spentCents: 1000, today: '2026-01-11' }))).toMatch(
      '1 day left',
    );
  });
});