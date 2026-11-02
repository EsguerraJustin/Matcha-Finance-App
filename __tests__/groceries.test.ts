import {
  budgetWarningCopy,
  buildItemisedNote,
  carryOverTotalCents,
  compareToBudget,
  effectivePriceCents,
  estimatedTotalCents,
  formatQuantity,
  itemsToCarryOver,
  lineTotalCents,
  parseItemDraft,
  planFinishTrip,
  priceMemoryKey,
  purchasedCount,
  purchasedTotalCents,
  resolveStoreTypeName,
  sortForDisplay,
  suggestPriceFromMemory,
  toBuyCount,
  toBuyEstimatedCents,
  type GroceryItemLike,
} from '../src/lib/groceries';
import { formatMoney } from '../src/lib/money';

function item(overrides: Partial<GroceryItemLike> & { id: string }): GroceryItemLike {
  return {
    name: 'Item',
    quantity: 1,
    unit: 'pc',
    est_price_cents: 0,
    actual_price_cents: null,
    status: 'to_buy',
    sort_order: 0,
    ...overrides,
  };
}

/** The exact scenario from the acceptance checklist. */
const ACCEPTANCE: GroceryItemLike[] = [
  item({ id: 'rice', name: 'Rice', quantity: 2, unit: 'kg', est_price_cents: 5500, actual_price_cents: 5500, status: 'purchased' }),
  item({ id: 'milk', name: 'Milk', quantity: 1, unit: 'L', est_price_cents: 8500, actual_price_cents: 8500, status: 'purchased' }),
  item({ id: 'eggs', name: 'Eggs', quantity: 1, unit: 'tray', est_price_cents: 9500, status: 'to_buy' }),
];

describe('the acceptance example', () => {
  it('records ₱195 as one Groceries expense', () => {
    const plan = planFinishTrip(ACCEPTANCE);
    expect(plan.canFinish).toBe(true);
    expect(plan.amountCents).toBe(19500);
    expect(formatMoney(plan.amountCents)).toBe('₱195.00');
    expect(plan.purchasedCount).toBe(2);
  });

  it('carries the unbought eggs over', () => {
    const plan = planFinishTrip(ACCEPTANCE);
    expect(plan.carryOver.map((entry) => entry.name)).toEqual(['Eggs']);
    expect(carryOverTotalCents(ACCEPTANCE)).toBe(9500);
  });
});

describe('line totals', () => {
  it('multiplies quantity by the actual price when known', () => {
    expect(lineTotalCents(ACCEPTANCE[0])).toBe(11000);
    expect(effectivePriceCents(ACCEPTANCE[0])).toBe(5500);
  });

  it('falls back to the estimate when there is no actual price', () => {
    const pending = item({ id: 'x', est_price_cents: 3000, quantity: 3 });
    expect(lineTotalCents(pending)).toBe(9000);
    expect(effectivePriceCents(pending)).toBe(3000);
  });

  it('handles fractional quantities', () => {
    expect(lineTotalCents(item({ id: 'x', quantity: 0.5, est_price_cents: 8500 }))).toBe(4250);
    expect(lineTotalCents(item({ id: 'x', quantity: 1.5, est_price_cents: 5500 }))).toBe(8250);
  });

  it('never goes negative', () => {
    expect(lineTotalCents(item({ id: 'x', quantity: -2, est_price_cents: 500 }))).toBe(0);
  });
});

describe('totals', () => {
  it('counts only purchased items toward a finished trip', () => {
    expect(purchasedTotalCents(ACCEPTANCE)).toBe(19500);
    expect(purchasedCount(ACCEPTANCE)).toBe(2);
    expect(toBuyCount(ACCEPTANCE)).toBe(1);
  });

  it('estimates the whole list and the still-to-buy part', () => {
    expect(estimatedTotalCents(ACCEPTANCE)).toBe(29000);
    expect(toBuyEstimatedCents(ACCEPTANCE)).toBe(9500);
  });

  it('handles an empty list', () => {
    expect(estimatedTotalCents([])).toBe(0);
    expect(purchasedTotalCents([])).toBe(0);
  });
});

describe('budget comparison', () => {
  it('is comfortable when the list fits', () => {
    const comparison = compareToBudget(ACCEPTANCE, 50000);
    expect(comparison.overBudget).toBe(false);
    expect(comparison.shortfallCents).toBe(0);
    expect(budgetWarningCopy(comparison)).toMatch(/comfortable/);
  });

  it('warns — kindly — when the list busts the remainder', () => {
    const comparison = compareToBudget(ACCEPTANCE, 10000);
    expect(comparison.overBudget).toBe(true);
    expect(comparison.shortfallCents).toBe(19000);
    expect(budgetWarningCopy(comparison)).toContain('₱190');
  });
});

describe('finish trip', () => {
  it('refuses to finish when nothing was bought', () => {
    const plan = planFinishTrip([item({ id: 'eggs', est_price_cents: 9500 })]);
    expect(plan.canFinish).toBe(false);
    expect(plan.reason).toBeTruthy();
  });

  it('keeps every to-buy item when nothing was purchased', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })];
    expect(itemsToCarryOver(items)).toHaveLength(2);
  });

  it('prefers the actual price over the estimate', () => {
    const plan = planFinishTrip([
      item({ id: 'rice', quantity: 2, est_price_cents: 5500, actual_price_cents: 6000, status: 'purchased' }),
    ]);
    expect(plan.amountCents).toBe(12000);
  });

  it('matches the store to a Groceries type when possible', () => {
    expect(resolveStoreTypeName('Dali', ['Market', 'Dali', 'SM'])).toBe('Dali');
    expect(resolveStoreTypeName('dali', ['Market', 'Dali'])).toBe('Dali');
    expect(resolveStoreTypeName('Paluto', ['Market', 'Dali'])).toBeNull();
    expect(resolveStoreTypeName(null, ['Market'])).toBeNull();
  });
});

describe('itemised note', () => {
  it('lists every purchased line', () => {
    expect(buildItemisedNote(ACCEPTANCE)).toBe('Rice 2 kg @ ₱55.00 · Milk 1 L @ ₱85.00');
  });

  it('is empty when nothing was bought', () => {
    expect(buildItemisedNote([item({ id: 'eggs' })])).toBe('');
  });

  it('formats quantities without trailing zeros', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(0.5)).toBe('0.5');
    expect(formatQuantity(1.25)).toBe('1.25');
  });
});

describe('display order', () => {
  it('drops purchased items to the bottom', () => {
    const ordered = sortForDisplay(ACCEPTANCE);
    expect(ordered.map((entry) => entry.name)).toEqual(['Eggs', 'Milk', 'Rice']);
  });
});

describe('price memory', () => {
  it('keys on the normalised name and store', () => {
    expect(priceMemoryKey('Fresh  Eggs!', 'Dali')).toBe(priceMemoryKey('fresh eggs', 'dali'));
  });

  it('suggests the last known price, ignoring singular/plural', () => {
    const memory = [{ name_normalized: 'egg', last_price_cents: 9500 }];
    expect(suggestPriceFromMemory(memory, 'Eggs')).toBe(9500);
    expect(suggestPriceFromMemory(memory, 'egg')).toBe(9500);
    expect(suggestPriceFromMemory(memory, 'Bread')).toBeNull();
    expect(suggestPriceFromMemory([], 'Eggs')).toBeNull();
  });
});

describe('item drafts', () => {
  it('parses a valid draft', () => {
    const result = parseItemDraft({
      name: 'Eggs',
      quantity: '1',
      unit: 'tray',
      estPriceText: '95',
      actualPriceText: '',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ name: 'Eggs', quantity: 1, unit: 'tray', est_price_cents: 9500, actual_price_cents: null });
    }
  });

  it('rejects missing names, zero quantity and bad prices', () => {
    expect(parseItemDraft({ name: ' ', quantity: '1', unit: 'pc', estPriceText: '10', actualPriceText: '' }).ok).toBe(false);
    expect(parseItemDraft({ name: 'Eggs', quantity: '0', unit: 'pc', estPriceText: '10', actualPriceText: '' }).ok).toBe(false);
    expect(parseItemDraft({ name: 'Eggs', quantity: '1', unit: 'pc', estPriceText: '', actualPriceText: '' }).ok).toBe(false);
    expect(parseItemDraft({ name: 'Eggs', quantity: '1', unit: 'pc', estPriceText: '10', actualPriceText: 'abc' }).ok).toBe(false);
  });

  it('treats "none" as no unit', () => {
    const result = parseItemDraft({ name: 'Eggs', quantity: '1', unit: 'none', estPriceText: '10', actualPriceText: '' });
    expect(result.ok && result.value.unit).toBeNull();
  });
});