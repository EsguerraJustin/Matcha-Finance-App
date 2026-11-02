/**
 * Grocery domain logic — pure functions only, unit tested.
 *
 * The finish-trip rule (brief Section 9, rule 8) lives here so it can be
 * proven with the exact acceptance example:
 *   Rice 2 kg @ ₱55 + Milk 1 L @ ₱85, both purchased, Eggs left to buy
 *   → one Groceries expense of ₱195, Eggs carry over.
 */

import { MAX_AMOUNT_CENTS } from './money';

export const GROCERY_UNITS = ['pc', 'kg', 'g', 'L', 'ml', 'tray', 'pack', 'can'] as const;
export type GroceryUnit = (typeof GROCERY_UNITS)[number];

export type GroceryItemStatus = 'to_buy' | 'purchased';

export interface GroceryItemLike {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  est_price_cents: number;
  actual_price_cents: number | null;
  status: GroceryItemStatus;
  sort_order: number;
}

/** Cents for one line. Quantity is fractional (2 kg, 0.5 L) so this rounds. */
export function lineTotalCents(item: GroceryItemLike): number {
  const unitPrice = item.actual_price_cents ?? item.est_price_cents;
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  return Math.max(0, Math.round(unitPrice * quantity));
}

/** The price that counts for a line: actual when known, otherwise estimated. */
export function effectivePriceCents(item: GroceryItemLike): number {
  return item.actual_price_cents ?? item.est_price_cents;
}

/** Only **purchased** items count toward a finished trip. */
export function purchasedTotalCents(items: readonly GroceryItemLike[]): number {
  return items.filter((item) => item.status === 'purchased').reduce((total, item) => total + lineTotalCents(item), 0);
}

export function estimatedTotalCents(items: readonly GroceryItemLike[]): number {
  return items.reduce((total, item) => total + lineTotalCents(item), 0);
}

/** What the cart would cost if everything were bought at the estimate. */
export function toBuyEstimatedCents(items: readonly GroceryItemLike[]): number {
  return items.filter((item) => item.status === 'to_buy').reduce((total, item) => total + lineTotalCents(item), 0);
}

export function purchasedCount(items: readonly GroceryItemLike[]): number {
  return items.filter((item) => item.status === 'purchased').length;
}

export function toBuyCount(items: readonly GroceryItemLike[]): number {
  return items.length - purchasedCount(items);
}

export interface BudgetComparison {
  remainingCents: number;
  estimateCents: number;
  /** Positive means the trip would bust the remaining budget. */
  shortfallCents: number;
  overBudget: boolean;
}

export function compareToBudget(items: readonly GroceryItemLike[], remainingBudgetCents: number): BudgetComparison {
  const estimateCents = estimatedTotalCents(items);
  const shortfallCents = estimateCents - remainingBudgetCents;
  return {
    remainingCents: remainingBudgetCents,
    estimateCents,
    shortfallCents: Math.max(0, shortfallCents),
    overBudget: shortfallCents > 0,
  };
}

export function budgetWarningCopy(comparison: BudgetComparison): string {
  if (!comparison.overBudget) return `₱${Math.floor(comparison.estimateCents / 100).toLocaleString('en-PH')} left after this trip — comfortable.`;
  return `That's about ₱${Math.floor(comparison.shortfallCents / 100).toLocaleString('en-PH')} over your remaining budget. Trim the list or come back next week.`;
}

/** Unpurchased items carry over to a new list (brief Section 6.5). */
export function itemsToCarryOver(items: readonly GroceryItemLike[]): GroceryItemLike[] {
  return items.filter((item) => item.status === 'to_buy');
}

export function carryOverTotalCents(items: readonly GroceryItemLike[]): number {
  return itemsToCarryOver(items).reduce((total, item) => total + lineTotalCents(item), 0);
}

/** Purchased items drop to the bottom of the list (brief Section 6.5). */
export function sortForDisplay(items: readonly GroceryItemLike[]): GroceryItemLike[] {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'purchased' ? 1 : -1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });
}

/* ------------------------------------------------------------------ */
/* Finish trip                                                         */
/* ------------------------------------------------------------------ */

export interface FinishTripPlan {
  /** Total that will be recorded on the single Groceries expense. */
  amountCents: number;
  purchasedCount: number;
  /** Items that stay on the list and get carried to the next trip. */
  carryOver: GroceryItemLike[];
  /** False when nothing was actually bought. */
  canFinish: boolean;
  /** A validation message when `canFinish` is false. */
  reason?: string;
}

export function planFinishTrip(items: readonly GroceryItemLike[]): FinishTripPlan {
  const purchased = items.filter((item) => item.status === 'purchased');
  const carryOver = itemsToCarryOver(items);

  if (!purchased.length) {
    return { amountCents: 0, purchasedCount: 0, carryOver: [], canFinish: false, reason: 'Tick at least one item first.' };
  }

  const amountCents = purchasedTotalCents(items);

  if (!Number.isSafeInteger(amountCents) || amountCents > MAX_AMOUNT_CENTS) {
    return { amountCents: 0, purchasedCount: purchased.length, carryOver, canFinish: false, reason: 'That total looks off.' };
  }

  return { amountCents, purchasedCount: purchased.length, carryOver, canFinish: true };
}

/**
 * The expense type to use on the finished trip: the store, when it matches one
 * of the Groceries types (brief Section 9, rule 8).
 */
export function resolveStoreTypeName(store: string | null, typeNames: readonly string[]): string | null {
  if (!store) return null;
  const needle = store.trim().toLowerCase();
  const match = typeNames.find((name) => name.trim().toLowerCase() === needle);
  return match ?? null;
}

/**
 * A one-line itemised breakdown stored on the expense's note.
 * Preserves the user's own list order rather than re-sorting.
 */
export function buildItemisedNote(items: readonly GroceryItemLike[]): string {
  const purchased = items
    .filter((item) => item.status === 'purchased')
    .sort((a, b) => a.sort_order - b.sort_order);
  return purchased
    .map((item) => {
      const qty = formatQuantity(item.quantity);
      const unit = item.unit ? ` ${item.unit}` : '';
      return `${item.name} ${qty}${unit} @ ₱${(effectivePriceCents(item) / 100).toFixed(2)}`;
    })
    .join(' · ');
}

export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return '0';
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/* ------------------------------------------------------------------ */
/* Price memory                                                        */
/* ------------------------------------------------------------------ */

export function priceMemoryKey(name: string, store: string): string {
  return `${normalise(name)}|${normalise(store)}`;
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Eggs" matches a remembered "egg" — singular/plural and casing are ignored. */
export function suggestPriceFromMemory(
  memory: ReadonlyArray<{ name_normalized: string; last_price_cents: number }>,
  name: string,
): number | null {
  const needle = normalise(name);
  if (!needle) return null;

  const singular = needle.endsWith('s') ? needle.slice(0, -1) : needle;
  const match = memory.find(
    (row) => row.name_normalized === needle || row.name_normalized === singular || singular.endsWith(row.name_normalized),
  );
  return match ? match.last_price_cents : null;
}

/* ------------------------------------------------------------------ */
/* Item editing                                                        */
/* ------------------------------------------------------------------ */

export interface ItemDraft {
  name: string;
  quantity: string;
  unit: string | null;
  estPriceText: string;
  actualPriceText: string;
}

export function parseItemDraft(draft: ItemDraft): { ok: true; value: Omit<GroceryItemLike, 'id' | 'status' | 'sort_order'> } | { ok: false; error: string } {
  const name = draft.name.trim();
  if (!name) return { ok: false, error: 'Give the item a name.' };

  const quantity = Number(draft.quantity.trim());
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: 'Quantity must be more than zero.' };

  const est = parsePrice(draft.estPriceText);
  if (est === null) return { ok: false, error: 'Enter an estimated price.' };

  const actual = draft.actualPriceText.trim() ? parsePrice(draft.actualPriceText) : null;
  if (draft.actualPriceText.trim() && actual === null) return { ok: false, error: 'That actual price looks off.' };

  return {
    ok: true,
    value: {
      name,
      quantity,
      unit: draft.unit && draft.unit !== 'none' ? draft.unit : null,
      est_price_cents: est,
      actual_price_cents: actual,
    },
  };
}

function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, '');
  if (!cleaned) return null;
  const value = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}