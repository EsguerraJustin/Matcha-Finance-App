/**
 * Money helpers.
 *
 * MONEY RULE (brief Section 3): every amount is stored as an **integer number
 * of centavos**. `₱85.50` → `8550`. Floats are never used for money.
 */

/** ₱10,000,000 — the hard upper bound from business rule 14. */
export const MAX_AMOUNT_CENTS = 1_000_000_000;

/** Smallest valid expense: one centavo. */
export const MIN_AMOUNT_CENTS = 1;

export interface FormatMoneyOptions {
  /** Currency symbol, configurable in Settings. Default ₱. */
  symbol?: string;
  /** Hide the `.00` when the amount is a whole peso. Default false. */
  compactZeroDecimals?: boolean;
  /** Always show a leading sign, e.g. `+₱85.50`. Default false. */
  signed?: boolean;
  /** Use thin spaces for thousands separators. Default true. */
  groupThousands?: boolean;
}

const THIN_SPACE = '\u2009';

function groupThousands(intPart: string, useThinSpace: boolean): string {
  const sep = useThinSpace ? THIN_SPACE : ',';
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * Parse a plain peso string ("85.50", "₱1,234.56", " 7 ") into centavos.
 * Returns `null` when the input is not a well-formed, non-negative amount.
 * Uses string arithmetic so binary floating point never enters the picture.
 */
export function parseAmountToCents(input: string): number | null {
  if (typeof input !== 'string') return null;

  let cleaned = input.replace(/[₱,\s\u00a0]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;

  const negative = cleaned.startsWith('-');
  if (negative) cleaned = cleaned.slice(1);

  if (!/^\d*(\.\d*)?$/.test(cleaned)) return null;

  const [whole = '0', fraction = ''] = cleaned.split('.');
  if (whole === '' && fraction === '') return null;

  const centsFraction = (fraction + '00').slice(0, 2);
  const wholePart = whole === '' ? '0' : whole;
  if (wholePart.length > 12) return null;

  const cents = Number(wholePart) * 100 + Number(centsFraction);
  if (!Number.isSafeInteger(cents)) return null;

  return negative ? -cents : cents;
}

/**
 * Parse the raw digit string produced by the custom numpad.
 * Digits are **centavos**: `5` → ₱0.05, `85` → ₱0.85, `8550` → ₱85.50.
 * This is how money keypads behave and it avoids a decimal key entirely.
 */
export function parseNumpadDigits(digits: string): number | null {
  if (typeof digits !== 'string') return null;
  const trimmed = digits.replace(/\D/g, '');
  if (trimmed === '') return null;
  const cents = Number(trimmed);
  if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT_CENTS) return null;
  return cents;
}

/** The mirror of {@link parseNumpadDigits} — cents to what the numpad should show. */
export function centsToNumpadDigits(cents: number): string {
  const safe = Math.max(0, Math.trunc(cents));
  return String(safe);
}

/** Centavos → a float ONLY for display math. Never feed this back into storage. */
export function centsToPesos(cents: number): number {
  return Math.trunc(cents) / 100;
}

export function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100);
}

/**
 * The single money formatter used by the whole app.
 * `formatMoney(8550)` → `₱85.50`
 */
export function formatMoney(cents: number, options: FormatMoneyOptions = {}): string {
  const {
    symbol = '₱',
    compactZeroDecimals = false,
    signed = false,
    groupThousands: useGrouping = true,
  } = options;

  const safe = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);

  const pesos = Math.floor(abs / 100);
  const centavos = abs % 100;

  const whole = useGrouping ? groupThousands(String(pesos), true) : String(pesos);
  let body = compactZeroDecimals && centavos === 0 ? whole : `${whole}.${String(centavos).padStart(2, '0')}`;

  const sign = negative ? '−' : signed ? '+' : '';
  return `${sign}${symbol}${body}`;
}

/** Short form for tight spaces: `₱1.2k`, `₱12.3k`, `₱1.1M`. */
export function formatMoneyCompact(cents: number, symbol = '₱'): string {
  const safe = Math.trunc(Number.isFinite(cents) ? cents : 0);
  const abs = Math.abs(safe);
  const sign = safe < 0 ? '−' : '';

  if (abs < 100_000) return `${sign}${symbol}${Math.floor(abs / 100)}`;
  if (abs < 100_000_000) {
    const thousands = abs / 100_000; // pesos in thousands
    return `${sign}${symbol}${trimZero(thousands.toFixed(1))}k`;
  }
  const millions = abs / 100_000_000;
  return `${sign}${symbol}${trimZero(millions.toFixed(1))}M`;
}

function trimZero(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value;
}

/** `8550` → `₱85.50` with an explicit plus sign, used in reports deltas. */
export function formatMoneyDelta(cents: number, symbol = '₱'): string {
  return formatMoney(cents, { symbol, signed: cents > 0, compactZeroDecimals: true });
}

/** Sum of any list of centavo integers. */
export function sumMoney(values: number[]): number {
  let total = 0;
  for (const value of values) {
    if (Number.isFinite(value)) total += Math.trunc(value);
  }
  return total;
}

/** Clamp to the allowed range; `null` when the raw value is out of bounds. */
export function validateAmount(cents: number): { ok: true } | { ok: false; reason: string } {
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, reason: 'Enter a whole amount.' };
  }
  if (cents < MIN_AMOUNT_CENTS) {
    return { ok: false, reason: 'Amount must be more than zero.' };
  }
  if (cents > MAX_AMOUNT_CENTS) {
    return { ok: false, reason: 'That is over the ₱10,000,000 limit.' };
  }
  return { ok: true };
}

/**
 * Percentage of `part` within `whole`, clamped to `[0, 1]`.
 * Returns 0 when the budget total is zero (no divide-by-zero, no NaN in UI).
 */
export function ratio(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  const value = part / whole;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Same as {@link ratio} but keeps values above 1 so "112% used" can be shown. */
export function usageRatio(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return part / whole;
}

/** Integer cents, rounded half-up. Used when splitting money across shares. */
export function splitEvenly(cents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(cents / parts);
  const remainder = cents - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}