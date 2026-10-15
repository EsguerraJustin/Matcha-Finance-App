import {
  EMPTY_FILTERS,
  areAllSelected,
  countActiveFilters,
  groupExpensesByDay,
  hasActiveFilters,
  loggedMessage,
  numpadAppend,
  numpadBackspace,
  numpadCents,
  smartDefaultForHour,
  toggleInList,
  validateExpenseDraft,
  type ExpenseDraft,
} from '../src/lib/expenses';
import { formatMoney } from '../src/lib/money';

const TODAY = '2026-01-07';

function draft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    amountCents: 8550,
    spentOn: TODAY,
    categoryId: 'cat-food',
    typeId: 'type-lunch',
    paymentMethodId: 'pm-cash',
    note: '',
    ...overrides,
  };
}

describe('validateExpenseDraft', () => {
  it('accepts a complete draft', () => {
    const result = validateExpenseDraft(draft(), { today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('requires an amount above zero and below ₱10,000,000', () => {
    expect(validateExpenseDraft(draft({ amountCents: null }), { today: TODAY }).errors.amount).toBeTruthy();
    expect(validateExpenseDraft(draft({ amountCents: 0 }), { today: TODAY }).errors.amount).toBeTruthy();
    expect(validateExpenseDraft(draft({ amountCents: 1_000_000_001 }), { today: TODAY }).errors.amount).toBeTruthy();
    expect(validateExpenseDraft(draft({ amountCents: 1_000_000_000 }), { today: TODAY }).errors.amount).toBeUndefined();
  });

  it('requires a category', () => {
    expect(validateExpenseDraft(draft({ categoryId: null }), { today: TODAY }).errors.category).toBeTruthy();
  });

  it('requires a payment method unless a default exists', () => {
    expect(validateExpenseDraft(draft({ paymentMethodId: null }), { today: TODAY }).errors.payment).toBeTruthy();
    expect(
      validateExpenseDraft(draft({ paymentMethodId: null }), { today: TODAY, defaultPaymentMethodId: 'pm-cash' }).errors
        .payment,
    ).toBeUndefined();
  });

  it('warns — but does not block — on a future date', () => {
    const result = validateExpenseDraft(draft({ spentOn: '2026-02-01' }), { today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.warnings.date).toBeTruthy();
  });

  it('rejects over-long notes', () => {
    const result = validateExpenseDraft(draft({ note: 'x'.repeat(141) }), { today: TODAY });
    expect(result.ok).toBe(false);
  });
});

describe('smart defaults by hour', () => {
  it('matches the brief example: 11:00–14:00 → Food/Lunch', () => {
    expect(smartDefaultForHour(11)).toEqual({ categoryName: 'Food', typeName: 'Lunch' });
    expect(smartDefaultForHour(13)).toEqual({ categoryName: 'Food', typeName: 'Lunch' });
  });

  it('covers the other common student meals', () => {
    expect(smartDefaultForHour(7)).toEqual({ categoryName: 'Food', typeName: 'Breakfast' });
    expect(smartDefaultForHour(16)).toEqual({ categoryName: 'Food', typeName: 'Snacks' });
    expect(smartDefaultForHour(19)).toEqual({ categoryName: 'Food', typeName: 'Dinner' });
    expect(smartDefaultForHour(23)).toEqual({ categoryName: 'Others', typeName: 'General' });
  });

  it('returns nothing in the small hours', () => {
    expect(smartDefaultForHour(2)).toBeNull();
    expect(smartDefaultForHour(4)).toBeNull();
  });

  it('covers all 24 hours with at most one suggestion each', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const suggestion = smartDefaultForHour(hour);
      if (suggestion) {
        expect(suggestion.categoryName).toBeTruthy();
        expect(suggestion.typeName).toBeTruthy();
      }
    }
  });
});

describe('numpad', () => {
  it('treats digits as centavos', () => {
    let digits = '';
    for (const key of ['8', '5', '5', '0']) digits = numpadAppend(digits, key);
    expect(numpadCents(digits)).toBe(8550);
    expect(formatMoney(numpadCents(digits)!)).toBe('₱85.50');
  });

  it('replaces a lone zero on the first tap', () => {
    expect(numpadAppend('0', '5')).toBe('5');
  });

  it('backs out to empty and clears', () => {
    expect(numpadBackspace('855')).toBe('85');
    expect(numpadBackspace('8')).toBe('');
    expect(numpadBackspace('')).toBe('');
  });

  it('caps the digit count so the input can never exceed the limit', () => {
    let digits = '';
    for (let i = 0; i < 20; i += 1) digits = numpadAppend(digits, '9');
    expect(digits.length).toBeLessThanOrEqual(9);
  });

  it('has no value while empty', () => {
    expect(numpadCents('')).toBeNull();
  });
});

describe('grouping by day', () => {
  const rows = [
    { id: 'a', amount_cents: 12000, spent_on: '2026-01-07' },
    { id: 'b', amount_cents: 8500, spent_on: '2026-01-07' },
    { id: 'c', amount_cents: 1300, spent_on: '2026-01-06' },
    { id: 'd', amount_cents: 500, spent_on: '2026-01-05' },
  ];

  it('produces one group per day with a daily total, newest first', () => {
    const groups = groupExpensesByDay(rows);
    expect(groups.map((group) => group.date)).toEqual(['2026-01-07', '2026-01-06', '2026-01-05']);
    expect(groups[0].totalCents).toBe(20500);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[2].totalCents).toBe(500);
  });

  it('handles an empty list', () => {
    expect(groupExpensesByDay([])).toEqual([]);
  });
});

describe('filters', () => {
  it('treats the default state as no filtering', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it('counts each narrowing dimension', () => {
    const filters = {
      ...EMPTY_FILTERS,
      preset: 'week' as const,
      categoryIds: ['a', 'b'],
      groceryOnly: true,
    };
    expect(hasActiveFilters(filters)).toBe(true);
    expect(countActiveFilters(filters)).toBe(4);
  });

  it('counts an amount range as one filter', () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, minCents: 100 })).toBe(1);
    expect(countActiveFilters({ ...EMPTY_FILTERS, minCents: 100, maxCents: 200 })).toBe(1);
  });
});

describe('bulk selection', () => {
  it('toggles values in and out', () => {
    expect(toggleInList(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleInList(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('only reports "all selected" when the list is non-empty', () => {
    expect(areAllSelected([], [])).toBe(false);
    expect(areAllSelected(['a', 'b'], ['a'])).toBe(false);
    expect(areAllSelected(['a', 'b'], ['a', 'b'])).toBe(true);
  });
});

describe('microcopy', () => {
  it('is warm and short', () => {
    expect(loggedMessage('₱85', 'Lunch')).toBe('Nice! Logged ₱85 for lunch.');
    expect(loggedMessage('₱85')).toBe('Nice! Logged ₱85.');
  });
});