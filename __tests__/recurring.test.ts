import {
  MAX_CATCH_UP_OCCURRENCES,
  advanceNextDue,
  dueOccurrences,
  firstMonthlyDue,
  firstWeeklyDue,
  humanFrequency,
  nextOccurrence,
  toOccurrences,
  upcomingBills,
  type RecurringRule,
} from '../src/lib/recurring';

const TODAY = '2026-03-15';

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'r1',
    kind: 'expense',
    amount_cents: 10000,
    label: 'Phone load',
    frequency: 'weekly',
    interval_n: 1,
    day_of_week: null,
    day_of_month: null,
    next_due_on: '2026-03-01',
    end_on: null,
    mode: 'auto',
    active: 1,
    ...overrides,
  };
}

describe('next occurrence', () => {
  it('steps daily by the interval', () => {
    expect(nextOccurrence(rule({ frequency: 'daily', interval_n: 1 }), '2026-03-01')).toBe('2026-03-02');
    expect(nextOccurrence(rule({ frequency: 'daily', interval_n: 3 }), '2026-03-01')).toBe('2026-03-04');
  });

  it('steps weekly by whole weeks', () => {
    expect(nextOccurrence(rule({ frequency: 'weekly' }), '2026-03-01')).toBe('2026-03-08');
    expect(nextOccurrence(rule({ frequency: 'weekly', interval_n: 2 }), '2026-03-01')).toBe('2026-03-15');
  });

  it('honours a fixed weekday', () => {
    // 2026-03-01 is a Sunday; day_of_week 1 (Monday) must align forward.
    expect(nextOccurrence(rule({ day_of_week: 1 }), '2026-03-01')).toBe('2026-03-02');
  });

  it('steps monthly and clamps a day-of-month longer than the month', () => {
    expect(nextOccurrence(rule({ frequency: 'monthly', day_of_month: 28 }), '2026-01-28')).toBe('2026-02-28');
    expect(nextOccurrence(rule({ frequency: 'monthly', day_of_month: 31 }), '2026-01-31')).toBe('2026-02-28');
    expect(nextOccurrence(rule({ frequency: 'monthly', day_of_month: 15 }), '2026-01-15')).toBe('2026-02-15');
  });
});

describe('due occurrences (business rule 11)', () => {
  it('lists every missed occurrence up to today', () => {
    expect(dueOccurrences(rule(), TODAY)).toEqual(['2026-03-01', '2026-03-08', '2026-03-15']);
  });

  it('returns nothing when the next due date is in the future', () => {
    expect(dueOccurrences(rule({ next_due_on: '2026-03-20' }), TODAY)).toEqual([]);
  });

  it('caps the catch-up flood', () => {
    const due = dueOccurrences(rule({ next_due_on: '2000-01-01' }), TODAY);
    expect(due).toHaveLength(MAX_CATCH_UP_OCCURRENCES);
    expect(due[due.length - 1] < TODAY).toBe(true);
  });

  it('stops at end_on', () => {
    expect(dueOccurrences(rule({ end_on: '2026-03-08' }), TODAY)).toEqual(['2026-03-01', '2026-03-08']);
    expect(dueOccurrences(rule({ next_due_on: '2026-03-20', end_on: '2026-03-19' }), TODAY)).toEqual([]);
  });

  it('ignores paused rules', () => {
    expect(dueOccurrences(rule({ active: 0 }), TODAY)).toEqual([]);
  });

  it('maps to materialisable occurrences', () => {
    const result = toOccurrences(rule(), TODAY);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ ruleId: 'r1', dueOn: '2026-03-01', amount_cents: 10000, kind: 'expense' });
  });
});

describe('idempotency', () => {
  it('advances next_due_on past today, so a second run creates nothing', () => {
    const advanced = advanceNextDue(rule(), TODAY);
    expect(advanced).toBe('2026-03-22');

    const secondRun = dueOccurrences(rule({ next_due_on: advanced }), TODAY);
    expect(secondRun).toEqual([]);
  });

  it('produces the same result when run twice from the same state', () => {
    const first = advanceNextDue(rule(), TODAY);
    const second = advanceNextDue(rule(), TODAY);
    expect(first).toBe(second);
  });

  it('leaves a finished rule parked', () => {
    const finished = rule({ next_due_on: '2026-03-20', end_on: '2026-03-19' });
    expect(advanceNextDue(finished, TODAY)).toBe('2026-03-20');
  });
});

describe('upcoming bills', () => {
  it('lists the next seven days in date order', () => {
    const bills = upcomingBills([rule({ next_due_on: TODAY })], TODAY, 7);
    expect(bills.map((bill) => bill.dueOn)).toEqual(['2026-03-15', '2026-03-22']);
  });

  it('skips paused rules', () => {
    expect(upcomingBills([rule({ active: 0, next_due_on: TODAY })], TODAY, 7)).toEqual([]);
  });

  it('does not list anything beyond the horizon', () => {
    expect(upcomingBills([rule({ next_due_on: TODAY })], TODAY, 3)).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('aligns the first weekly due date to the week start', () => {
    expect(firstWeeklyDue('2026-03-18', 1)).toBe('2026-03-16');
    expect(firstWeeklyDue('2026-03-18', 0)).toBe('2026-03-15');
  });

  it('clamps the first monthly due date', () => {
    expect(firstMonthlyDue('2026-02-10', 31)).toBe('2026-02-28');
    expect(firstMonthlyDue('2026-02-10', 5)).toBe('2026-02-05');
  });

  it('describes the frequency in plain language', () => {
    expect(humanFrequency(rule())).toBe('Every week');
    expect(humanFrequency(rule({ frequency: 'monthly', interval_n: 3 }))).toBe('Every 3 months');
  });
});