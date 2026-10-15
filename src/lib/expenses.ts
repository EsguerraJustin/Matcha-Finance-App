/**
 * Expense domain logic — pure functions only, so it can be unit tested
 * without a database.
 */

import { validateAmount } from './money';
import { currentHour } from './date';

export interface ExpenseDraft {
  amountCents: number | null;
  spentOn: string;
  categoryId: string | null;
  typeId: string | null;
  paymentMethodId: string | null;
  note: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

const MAX_NOTE_LENGTH = 140;

/** Business rule 14, plus the sheet's own field-level rules. */
export function validateExpenseDraft(
  draft: ExpenseDraft,
  options: { today: string; defaultPaymentMethodId?: string | null },
): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  if (draft.amountCents === null) {
    errors.amount = 'Enter an amount first.';
  } else {
    const check = validateAmount(draft.amountCents);
    if (!check.ok) errors.amount = check.reason;
  }

  if (!draft.spentOn) {
    errors.date = 'Pick a date.';
  } else if (draft.spentOn > options.today) {
    // Not an error — logging a planned expense is legitimate — but worth a nudge.
    warnings.date = 'That date is in the future.';
  }

  if (!draft.categoryId) errors.category = 'Choose a category.';
  if (!draft.paymentMethodId && !options.defaultPaymentMethodId) errors.payment = 'Choose how you paid.';

  if (draft.note.length > MAX_NOTE_LENGTH) {
    errors.note = `Keep notes under ${MAX_NOTE_LENGTH} characters.`;
  }

  return { ok: Object.keys(errors).length === 0, errors, warnings };
}

/* ------------------------------------------------------------------ */
/* Smart defaults                                                      */
/* ------------------------------------------------------------------ */

export interface SmartDefault {
  categoryName: string;
  typeName: string;
}

/**
 * Time-of-day pre-selection (brief Section 6.1): "11:00–14:00 → Food/Lunch".
 * The windows do not overlap, so exactly one suggestion (or none) applies.
 * Small hours are left unclaimed — the user picks deliberately at 2 am.
 */
export function smartDefaultForHour(hour: number): SmartDefault | null {
  if (hour >= 5 && hour < 10) return { categoryName: 'Food', typeName: 'Breakfast' };
  if (hour >= 10 && hour < 15) return { categoryName: 'Food', typeName: 'Lunch' };
  if (hour >= 15 && hour < 17) return { categoryName: 'Food', typeName: 'Snacks' };
  if (hour >= 17 && hour < 22) return { categoryName: 'Food', typeName: 'Dinner' };
  if (hour >= 22) return { categoryName: 'Others', typeName: 'General' };
  return null;
}

export function smartDefaultNow(now: Date = new Date()): SmartDefault | null {
  return smartDefaultForHour(currentHour(now));
}

/* ------------------------------------------------------------------ */
/* Numpad                                                              */
/* ------------------------------------------------------------------ */

export interface NumpadState {
  digits: string;
}

export type NumpadKey =
  | { kind: 'digit'; value: string }
  | { kind: 'backspace' }
  | { kind: 'clear' };

export const NUMPAD_KEYS: readonly NumpadKey[] = [
  { kind: 'digit', value: '1' },
  { kind: 'digit', value: '2' },
  { kind: 'digit', value: '3' },
  { kind: 'digit', value: '4' },
  { kind: 'digit', value: '5' },
  { kind: 'digit', value: '6' },
  { kind: 'digit', value: '7' },
  { kind: 'digit', value: '8' },
  { kind: 'digit', value: '9' },
  { kind: 'digit', value: '0' },
  { kind: 'backspace' },
  { kind: 'clear' },
];

const MAX_NUMPAD_DIGITS = 9; // ₱9,999,999.99 — comfortably under the ₱10M cap.

/** Digits are centavos: `5` → ₱0.05, `8550` → ₱85.50. */
export function numpadAppend(digits: string, digit: string): string {
  if (digits === '0') return digit;
  if (digits.length >= MAX_NUMPAD_DIGITS) return digits;
  return digits + digit;
}

export function numpadBackspace(digits: string): string {
  if (digits === '') return '';
  const next = digits.slice(0, -1);
  return next === '' ? '' : next;
}

export function numpadCents(digits: string): number | null {
  if (digits === '') return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/* ------------------------------------------------------------------ */
/* History grouping                                                    */
/* ------------------------------------------------------------------ */

export interface GroupableExpense {
  id: string;
  amount_cents: number;
  spent_on: string;
}

export interface ExpenseDayGroup<T extends GroupableExpense> {
  date: string;
  totalCents: number;
  items: T[];
}

/** History groups by day with a daily total header, newest day first. */
export function groupExpensesByDay<T extends GroupableExpense>(items: readonly T[]): ExpenseDayGroup<T>[] {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const bucket = groups.get(item.spent_on);
    if (bucket) bucket.push(item);
    else groups.set(item.spent_on, [item]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, dayItems]) => ({
      date,
      totalCents: dayItems.reduce((total, item) => total + item.amount_cents, 0),
      items: dayItems,
    }));
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export type DateRangePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

export interface FilterState {
  preset: DateRangePreset;
  from?: string;
  to?: string;
  categoryIds: string[];
  typeIds: string[];
  paymentMethodIds: string[];
  groceryOnly: boolean;
  minCents?: number;
  maxCents?: number;
}

export const EMPTY_FILTERS: FilterState = {
  preset: 'all',
  categoryIds: [],
  typeIds: [],
  paymentMethodIds: [],
  groceryOnly: false,
};

/** True when anything other than "All time" is narrowing the list. */
export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.preset !== 'all' ||
    filters.categoryIds.length > 0 ||
    filters.typeIds.length > 0 ||
    filters.paymentMethodIds.length > 0 ||
    filters.groceryOnly ||
    filters.minCents !== undefined ||
    filters.maxCents !== undefined
  );
}

export function countActiveFilters(filters: FilterState): number {
  let count = 0;
  if (filters.preset !== 'all') count += 1;
  count += filters.categoryIds.length;
  count += filters.typeIds.length;
  count += filters.paymentMethodIds.length;
  if (filters.groceryOnly) count += 1;
  if (filters.minCents !== undefined || filters.maxCents !== undefined) count += 1;
  return count;
}

/* ------------------------------------------------------------------ */
/* Bulk selection                                                      */
/* ------------------------------------------------------------------ */

export function toggleInList<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function areAllSelected(ids: readonly string[], selected: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => selected.includes(id));
}

/* ------------------------------------------------------------------ */
/* Microcopy (brief Section 4.5) — warm, short, never shaming           */
/* ------------------------------------------------------------------ */

export function loggedMessage(amountLabel: string, noteOrType?: string | null): string {
  return noteOrType ? `Nice! Logged ${amountLabel} for ${noteOrType.toLowerCase()}.` : `Nice! Logged ${amountLabel}.`;
}

export const EMPTY_HISTORY_MESSAGE = 'No spending yet. Tap + to log your first one.';
export const EMPTY_SEARCH_MESSAGE = 'Nothing matched that. Try a shorter word.';
export const NO_SPEND_TODAY_MESSAGE = "No spending today. That's a win.";