import {
  buildReportTotals,
  categoryDonut,
  comparePeriods,
  dailySeries,
  expensesToCsv,
  grocerySpendCents,
  insightSentences,
  mostFrequentType,
  paymentSplit,
  type ReportableExpense,
} from '../src/lib/reports';

function expense(overrides: Partial<ReportableExpense> = {}): ReportableExpense {
  return {
    amount_cents: 1000,
    spent_on: '2026-10-15',
    category_name: 'Food',
    category_color: '#FFD9C7',
    type_name: 'Lunch',
    payment_name: 'Cash',
    grocery_list_id: null,
    ...overrides,
  };
}

describe('categoryDonut', () => {
  it('groups by category and sorts biggest first with shares', () => {
    const slices = categoryDonut([
      expense({ amount_cents: 500, category_name: 'Food' }),
      expense({ amount_cents: 1500, category_name: 'Transportation', category_color: '#CFE8F5' }),
      expense({ amount_cents: 1000, category_name: 'Food' }),
    ]);

    expect(slices).toHaveLength(2);
    expect(slices[0]).toMatchObject({ label: 'Food', value: 1500 });
    expect(slices[1]).toMatchObject({ label: 'Transportation', value: 1500 });
    expect(slices[0].share).toBeCloseTo(0.5);
  });

  it('returns an empty list and no divide-by-zero for no expenses', () => {
    expect(categoryDonut([])).toEqual([]);
  });
});

describe('paymentSplit', () => {
  it('sums per payment method and sorts by spend', () => {
    const slices = paymentSplit([
      expense({ amount_cents: 2000, payment_name: 'GCash' }),
      expense({ amount_cents: 500, payment_name: 'Cash' }),
      expense({ amount_cents: 500, payment_name: 'Cash' }),
    ]);

    expect(slices[0]).toMatchObject({ label: 'GCash', value: 2000, share: 2000 / 3000 });
    expect(slices[1]).toMatchObject({ label: 'Cash', value: 1000 });
  });
});

describe('dailySeries', () => {
  it('fills every calendar day including zero-spend days', () => {
    const points = dailySeries(
      [expense({ spent_on: '2026-10-02', amount_cents: 450 }), expense({ spent_on: '2026-10-04', amount_cents: 100 })],
      '2026-10-01',
      '2026-10-05',
    );

    expect(points.map((point) => point.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
    ]);
    expect(points.map((point) => point.value)).toEqual([0, 450, 0, 100, 0]);
    expect(points[1].label).toBe('2');
  });

  it('ignores expenses outside the requested range', () => {
    const points = dailySeries([expense({ spent_on: '2026-09-30', amount_cents: 900 })], '2026-10-01', '2026-10-01');
    expect(points).toEqual([{ date: '2026-10-01', value: 0, label: '1' }]);
  });
});

describe('buildReportTotals', () => {
  it('derives totals, averages, biggest expense and grocery spend', () => {
    const totals = buildReportTotals(
      [
        expense({ amount_cents: 1000, category_name: 'Food', type_name: 'Lunch' }),
        expense({ amount_cents: 3000, category_name: 'Groceries', type_name: 'Market', grocery_list_id: 'list-1' }),
        expense({ amount_cents: 1000, category_name: 'Food', type_name: 'Lunch' }),
      ],
      '2026-10-14',
      '2026-10-16',
    );

    expect(totals.totalCents).toBe(5000);
    expect(totals.count).toBe(3);
    expect(totals.averagePerDayCents).toBe(Math.round(5000 / 3));
    expect(totals.biggestCents).toBe(3000);
    expect(totals.biggestLabel).toBe('Groceries · Market');
    expect(totals.mostSpentCategory?.label).toBe('Groceries');
    expect(totals.groceryCents).toBe(3000);
    expect(totals.mostFrequentType).toEqual({ label: 'Lunch', count: 2 });
  });

  it('returns safe zero values for an empty range', () => {
    const totals = buildReportTotals([], '2026-10-15', '2026-10-15');
    expect(totals).toMatchObject({
      totalCents: 0,
      count: 0,
      averagePerDayCents: 0,
      daysWithSpend: 0,
      biggestCents: 0,
      biggestLabel: null,
      mostSpentCategory: null,
      groceryCents: 0,
    });
  });
});

describe('mostFrequentType', () => {
  it('ignores entries without a type', () => {
    expect(
      mostFrequentType([
        expense({ type_name: null }),
        expense({ type_name: 'Coffee' }),
        expense({ type_name: 'Coffee' }),
      ]),
    ).toEqual({ label: 'Coffee', count: 2 });
    expect(mostFrequentType([])).toBeNull();
  });
});

describe('grocerySpendCents', () => {
  it('counts only grocery-linked expenses', () => {
    expect(
      grocerySpendCents([
        expense({ amount_cents: 1200, grocery_list_id: 'list-1' }),
        expense({ amount_cents: 800, grocery_list_id: null }),
      ]),
    ).toBe(1200);
  });
});

describe('insightSentences', () => {
  it('returns a gentle empty message when nothing was logged', () => {
    const totals = buildReportTotals([], '2026-10-15', '2026-10-15');
    expect(insightSentences(totals, (cents) => `₱${(cents / 100).toFixed(2)}`)).toEqual([
      'Nothing logged in this period — a clean start.',
    ]);
  });

  it('produces at most four actionable sentences', () => {
    const totals = buildReportTotals(
      [
        expense({ amount_cents: 1000, category_name: 'Food', type_name: 'Lunch' }),
        expense({ amount_cents: 2000, category_name: 'Food', type_name: 'Lunch', payment_name: 'GCash' }),
        expense({ amount_cents: 3000, category_name: 'Groceries', type_name: 'Market', grocery_list_id: 'list-1' }),
      ],
      '2026-10-15',
      '2026-10-15',
    );
    const sentences = insightSentences(totals, (cents) => `₱${(cents / 100).toFixed(2)}`);

    expect(sentences.length).toBeGreaterThan(0);
    expect(sentences.length).toBeLessThanOrEqual(4);
    expect(sentences[0]).toContain('Food');
  });
});

describe('comparePeriods', () => {
  it('reports direction and delta', () => {
    expect(comparePeriods([expense({ amount_cents: 1500 })], [expense({ amount_cents: 1000 })])).toEqual({
      currentCents: 1500,
      previousCents: 1000,
      deltaCents: 500,
      direction: 'up',
    });
    expect(comparePeriods([], [expense({ amount_cents: 1000 })]).direction).toBe('down');
    expect(comparePeriods([], []).direction).toBe('same');
  });
});

describe('expensesToCsv', () => {
  it('writes a header and one row per expense with cents as decimals', () => {
    const csv = expensesToCsv([expense({ amount_cents: 8550, spent_on: '2026-10-15' })], '₱');
    const [header, row] = csv.split('\n');

    expect(header).toBe('Date,Amount (₱),Category,Type,Payment method');
    expect(row).toBe('2026-10-15,85.50,Food,Lunch,Cash');
  });

  it('quotes cells containing commas, quotes or newlines', () => {
    const csv = expensesToCsv([
      expense({ category_name: 'Food, drinks', type_name: 'A "big" meal', payment_name: 'Cash\nGCash' }),
    ]);
    expect(csv.split('\n').slice(1).join('\n')).toBe(
      '2026-10-15,10.00,"Food, drinks","A ""big"" meal","Cash\nGCash"',
    );
  });
});
