import {
  addDaysISO,
  budgetThreshold,
  currentHour,
  dailyAverageCents,
  daysLeftInclusive,
  diffDaysISO,
  endOfMonthISO,
  endOfWeekISO,
  isValidISODate,
  monthRangeISO,
  projectedEndOfPeriodCents,
  relativeDayLabel,
  remainingBudgetCents,
  safeToSpendTodayCents,
  startOfWeekISO,
  todayISO,
  weekRangeISO,
} from '../src/lib/date';

describe('ISO date helpers', () => {
  it('validates calendar dates', () => {
    expect(isValidISODate('2026-01-31')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('26-01-31')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });

  it('adds and subtracts days across month boundaries', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysISO('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('counts days between dates', () => {
    expect(diffDaysISO('2026-01-01', '2026-01-08')).toBe(7);
    expect(diffDaysISO('2026-01-08', '2026-01-01')).toBe(-7);
  });

  it('reads Manila time, not the host timezone', () => {
    // 2026-01-01T17:30Z is already 2026-01-02 01:30 in Asia/Manila.
    expect(todayISO(new Date('2026-01-01T17:30:00Z'))).toBe('2026-01-02');
    expect(todayISO(new Date('2026-01-01T15:30:00Z'))).toBe('2026-01-01');
    expect(currentHour(new Date('2026-01-01T17:30:00Z'))).toBe(1);
  });

  it('labels relative days', () => {
    expect(relativeDayLabel('2026-01-02', '2026-01-02')).toBe('Today');
    expect(relativeDayLabel('2026-01-01', '2026-01-02')).toBe('Yesterday');
    expect(relativeDayLabel('2025-12-30', '2026-01-02')).toMatch(/Dec/);
  });
});

describe('week boundaries', () => {
  it('defaults to Monday start', () => {
    // 2026-01-01 is a Thursday.
    expect(startOfWeekISO('2026-01-01')).toBe('2025-12-29');
    expect(endOfWeekISO('2026-01-01')).toBe('2026-01-04');
  });

  it('honours the Sunday setting', () => {
    expect(startOfWeekISO('2026-01-01', 0)).toBe('2025-12-28');
    expect(endOfWeekISO('2026-01-01', 0)).toBe('2026-01-03');
  });

  it('keeps the week in one range', () => {
    expect(weekRangeISO('2026-01-01')).toEqual({ start: '2025-12-29', end: '2026-01-04' });
    expect(diffDaysISO(weekRangeISO('2026-03-15').start, weekRangeISO('2026-03-15').end)).toBe(6);
  });

  it('handles a week that starts on the same day', () => {
    // 2026-01-05 is a Monday.
    expect(startOfWeekISO('2026-01-05')).toBe('2026-01-05');
    expect(endOfWeekISO('2026-01-05')).toBe('2026-01-11');
  });
});

describe('month / allowance-cycle boundaries', () => {
  it('is the calendar month by default', () => {
    expect(monthRangeISO('2026-01-15')).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(monthRangeISO('2026-02-03')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('supports a custom cycle start day', () => {
    expect(monthRangeISO('2026-01-20', 15)).toEqual({ start: '2026-01-15', end: '2026-02-14' });
    expect(monthRangeISO('2026-01-10', 15)).toEqual({ start: '2025-12-15', end: '2026-01-14' });
  });

  it('clamps a start day that is longer than some months', () => {
    // "Start on the 31st" means "start on the last day" in short months.
    expect(endOfMonthISO('2026-02-10', 31)).toBe('2026-02-27');
  });

  it('always contains the date it was asked about', () => {
    for (const startDay of [1, 5, 15, 28, 29, 30, 31]) {
      for (const probe of ['2026-01-01', '2026-01-15', '2026-02-14', '2026-02-28', '2024-02-29', '2026-12-31']) {
        const range = monthRangeISO(probe, startDay);
        expect(range.start <= probe).toBe(true);
        expect(probe <= range.end).toBe(true);
      }
    }
  });
});

describe('budget math (brief Section 9)', () => {
  it('computes days left including today, never below 1', () => {
    expect(daysLeftInclusive('2026-01-01', '2026-01-07')).toBe(7);
    expect(daysLeftInclusive('2026-01-07', '2026-01-07')).toBe(1);
    expect(daysLeftInclusive('2026-01-08', '2026-01-07')).toBe(1);
  });

  it('matches the acceptance example: ₱1,000 weekly budget − ₱120 lunch = ₱880', () => {
    const remaining = remainingBudgetCents(100000, 0, 12000);
    expect(remaining).toBe(88000);
    expect(remaining).toBe(88000 / 100 * 100);
  });

  it('adds rollover into the remaining figure', () => {
    expect(remainingBudgetCents(100000, 15000, 12000)).toBe(103000);
  });

  it('fires warning at 80% and exceeded at 100%', () => {
    expect(budgetThreshold(79000, 100000)).toBe('ok');
    expect(budgetThreshold(80000, 100000)).toBe('warning');
    expect(budgetThreshold(99999, 100000)).toBe('warning');
    expect(budgetThreshold(100000, 100000)).toBe('exceeded');
    expect(budgetThreshold(120000, 100000)).toBe('exceeded');
  });

  it('treats a zero budget as ok rather than NaN', () => {
    expect(budgetThreshold(0, 0)).toBe('ok');
  });

  it('divides remaining by days left for safe-to-spend', () => {
    // ₱1,000 budget, ₱120 spent, 7 days left → ₱880 / 7 = ₱125.71 → ₱125
    expect(
      safeToSpendTodayCents({
        budgetCents: 100000,
        spentCents: 12000,
        today: '2026-01-01',
        endDate: '2026-01-07',
      }),
    ).toBe(12571);
  });

  it('never returns a negative safe-to-spend and subtracts set-aside', () => {
    expect(
      safeToSpendTodayCents({
        budgetCents: 1000,
        spentCents: 9000,
        today: '2026-01-01',
        endDate: '2026-01-07',
      }),
    ).toBe(0);

    expect(
      safeToSpendTodayCents({
        budgetCents: 100000,
        spentCents: 0,
        today: '2026-01-01',
        endDate: '2026-01-07',
        setAsideCents: 7000,
      }),
    ).toBe(13285);
  });

  it('divides by at least one day even on the last day', () => {
    expect(
      safeToSpendTodayCents({
        budgetCents: 100000,
        spentCents: 0,
        today: '2026-01-07',
        endDate: '2026-01-07',
      }),
    ).toBe(100000);
  });

  it('projects the end-of-period spend from the daily average', () => {
    // Jan 1–7 budget, ₱700 spent over 3 elapsed days = ₱233/day, 5 days left
    // → ₱700 + ₱1,166.65 → ₱1866.65.
    expect(
      projectedEndOfPeriodCents({
        budgetCents: 100000,
        spentCents: 70000,
        today: '2026-01-03',
        startDate: '2026-01-01',
        endDate: '2026-01-07',
      }),
    ).toBe(186665);
  });

  it('computes a daily average without dividing by zero', () => {
    expect(dailyAverageCents(70000, 2)).toBe(35000);
    expect(dailyAverageCents(70000, 0)).toBe(0);
  });
});