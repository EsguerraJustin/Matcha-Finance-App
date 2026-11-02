/**
 * Reports & insights — pure functions only, unit tested.
 *
 * Everything here is derived from the expense list (brief Section 9, rule 1:
 * no stored totals) so the report can never drift from History.
 */

export type ReportPeriod = 'day' | 'week' | 'month' | 'custom';

export interface ReportableExpense {
  amount_cents: number;
  spent_on: string;
  category_name: string;
  category_color: string;
  type_name: string | null;
  payment_name: string;
  grocery_list_id?: string | null;
}

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Share of the total, 0–1. */
  share: number;
}

export interface DailyPoint {
  /** `YYYY-MM-DD`. */
  date: string;
  value: number;
  label: string;
}

export interface ReportTotals extends Record<string, unknown> {
  totalCents: number;
  count: number;
  averagePerDayCents: number;
  daysWithSpend: number;
  biggestCents: number;
  biggestLabel: string | null;
  mostSpentCategory: DonutSlice | null;
  mostFrequentType: { label: string; count: number } | null;
  paymentSplit: DonutSlice[];
  groceryCents: number;
  donut: DonutSlice[];
  daily: DailyPoint[];
}

/** Groups expenses by category, sorted by spend (biggest first). */
export function categoryDonut(expenses: readonly ReportableExpense[]): DonutSlice[] {
  const totals = new Map<string, { label: string; value: number; color: string }>();
  let total = 0;

  for (const expense of expenses) {
    const key = expense.category_name;
    const bucket = totals.get(key) ?? { label: key, value: 0, color: expense.category_color };
    bucket.value += expense.amount_cents;
    totals.set(key, bucket);
    total += expense.amount_cents;
  }

  return [...totals.values()]
    .map((slice) => ({ key: slice.label, ...slice, share: total > 0 ? slice.value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function paymentSplit(expenses: readonly ReportableExpense[]): DonutSlice[] {
  const totals = new Map<string, number>();
  let total = 0;

  for (const expense of expenses) {
    total += expense.amount_cents;
    totals.set(expense.payment_name, (totals.get(expense.payment_name) ?? 0) + expense.amount_cents);
  }

  const palette = ['#FFD9C7', '#CFE8F5', '#FFF3C4', '#E3DAF5', '#FAD4E1', '#CDEFE3', '#E9E4D8'];

  return [...totals.entries()]
    .map(([label, value], index) => ({ key: label, label, value, color: palette[index % palette.length], share: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

/** Sums groceries-linked spending — the finish-trip expenses. */
export function grocerySpendCents(expenses: readonly ReportableExpense[]): number {
  return expenses.reduce((total, expense) => (expense.grocery_list_id ? total + expense.amount_cents : total), 0);
}

/**
 * One bucket per calendar day in the range, including days with no spend, so
 * the bar chart has a gap rather than a lie (brief Section 6.9).
 */
export function dailySeries(expenses: readonly ReportableExpense[], from: string, to: string): DailyPoint[] {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    totals.set(expense.spent_on, (totals.get(expense.spent_on) ?? 0) + expense.amount_cents);
  }

  const points: DailyPoint[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const span = Math.round((end - start) / 86_400_000);

  for (let index = 0; index <= Math.min(span, 400); index += 1) {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    points.push({
      date,
      value: totals.get(date) ?? 0,
      label: date.slice(8).replace(/^0/, ''),
    });
  }

  return points;
}

export function mostFrequentType(expenses: readonly ReportableExpense[]): { label: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const expense of expenses) {
    if (!expense.type_name) continue;
    counts.set(expense.type_name, (counts.get(expense.type_name) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return { label: entries[0][0], count: entries[0][1] };
}

export function buildReportTotals(expenses: readonly ReportableExpense[], from: string, to: string): ReportTotals {
  const totalCents = expenses.reduce((sum, expense) => sum + expense.amount_cents, 0);
  const donut = categoryDonut(expenses);
  const days = dailySeries(expenses, from, to);
  const daysWithSpend = days.filter((point) => point.value > 0).length;

  const biggest = expenses.reduce<(ReportableExpense | null)>(
    (winner, expense) => (!winner || expense.amount_cents > winner.amount_cents ? expense : winner),
    null,
  );

  const topType = mostFrequentType(expenses);

  return {
    totalCents,
    count: expenses.length,
    averagePerDayCents: days.length > 0 ? Math.round(totalCents / days.length) : 0,
    daysWithSpend,
    biggestCents: biggest?.amount_cents ?? 0,
    biggestLabel: biggest ? `${biggest.category_name}${biggest.type_name ? ` · ${biggest.type_name}` : ''}` : null,
    mostSpentCategory: donut[0] ?? null,
    mostFrequentType: topType,
    paymentSplit: paymentSplit(expenses),
    groceryCents: grocerySpendCents(expenses),
    donut,
    daily: days,
  };
}

/**
 * Insight sentences — simple rules, never shaming (brief Sections 6.9 and 4.5).
 */
export function insightSentences(
  totals: ReportTotals,
  format: (cents: number) => string,
): string[] {
  if (totals.count === 0) return ['Nothing logged in this period — a clean start.'];

  const sentences: string[] = [];

  if (totals.mostSpentCategory) {
    const slice = totals.mostSpentCategory;
    sentences.push(
      `You spent the most on ${slice.label} — ${Math.round(slice.share * 100)}% of your ${format(totals.totalCents)}.`,
    );
  }

  const topPayment = totals.paymentSplit[0];
  if (topPayment && topPayment.share >= 0.5) {
    sentences.push(`About ${Math.round(topPayment.share * 100)}% goes through ${topPayment.label}.`);
  }

  if (totals.mostFrequentType) {
    sentences.push(`${totals.mostFrequentType.label} came up ${totals.mostFrequentType.count} times.`);
  }

  if (totals.groceryCents > 0) {
    sentences.push(`Grocery trips made up ${format(totals.groceryCents)}.`);
  }

  if (totals.daysWithSpend === 1) {
    sentences.push('Spending landed on a single day this period.');
  }

  if (totals.biggestCents > 0 && totals.biggestLabel) {
    sentences.push(`Biggest single expense: ${totals.biggestLabel} at ${format(totals.biggestCents)}.`);
  }

  return sentences.slice(0, 4);
}

/** Weekly comparison — how this period stacks against the previous one. */
export interface PeriodComparison {
  currentCents: number;
  previousCents: number;
  deltaCents: number;
  direction: 'up' | 'down' | 'same';
}

export function comparePeriods(current: readonly ReportableExpense[], previous: readonly ReportableExpense[]): PeriodComparison {
  const currentCents = current.reduce((sum, expense) => sum + expense.amount_cents, 0);
  const previousCents = previous.reduce((sum, expense) => sum + expense.amount_cents, 0);
  const deltaCents = currentCents - previousCents;

  return {
    currentCents,
    previousCents,
    deltaCents,
    direction: deltaCents > 0 ? 'up' : deltaCents < 0 ? 'down' : 'same',
  };
}

/** CSV export — plain text, shared through the OS share sheet (no network). */
export function expensesToCsv(
  expenses: readonly ReportableExpense[],
  symbol = '₱',
): string {
  const header = [`Date`, `Amount (${symbol})`, 'Category', 'Type', 'Payment method'];
  const rows = expenses.map((expense) => [
    expense.spent_on,
    (expense.amount_cents / 100).toFixed(2),
    csvCell(expense.category_name),
    csvCell(expense.type_name ?? ''),
    csvCell(expense.payment_name),
  ]);
  return [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
