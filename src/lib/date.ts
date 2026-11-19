/**
 * Date helpers.
 *
 * Every calendar date in the app is a `YYYY-MM-DD` string in **Asia/Manila**.
 * Timestamps are ISO-8601 (UTC). Nothing here ever touches the network.
 */

import { addDays, addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns';

export const APP_TIMEZONE = 'Asia/Manila';

/** ISO date parts as seen in Manila, for an arbitrary instant. */
const manilaParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const manilaTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export type ISODate = string; // YYYY-MM-DD

/** Today's calendar date in Manila. */
export function todayISO(now: Date = new Date()): ISODate {
  return manilaParts.format(now);
}

/** Current local hour (0–23) in Manila — drives the smart category default. */
export function currentHour(now: Date = new Date()): number {
  const hour = manilaTime.format(now).split(':')[0];
  return Number(hour);
}

/** ISO-8601 timestamp for `created_at` / `updated_at` columns. */
export function nowTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}

/** Parse `YYYY-MM-DD` into a UTC-midnight Date (Manila has no DST, so this is safe). */
export function isoToDate(iso: ISODate): Date {
  return parseISO(`${iso}T00:00:00.000Z`);
}

export function dateToISO(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd');
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = isoToDate(value);
  return !Number.isNaN(date.getTime()) && dateToISO(date) === value;
}

/**
 * Parse `YYYY-MM-DD` into a **local**-midnight `Date`.
 *
 * Native date pickers read year/month/day off the local getters of the value
 * they are handed, so the round trip must happen in local time — unlike
 * `isoToDate`, which anchors at UTC midnight for calendar arithmetic.
 * Returns `null` for anything that is not a real calendar date.
 */
export function isoToLocalDate(iso: ISODate): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) || dateToISO(date) !== iso ? null : date;
}

/**
 * `HH:MM` (24-hour storage format) → a 12-hour label such as `7:15 PM`.
 * Falls back to the raw string when it is not `HH:MM`, so a bad stored value
 * never crashes a settings row.
 */
export function formatClockTime(hhmm: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return hhmm;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  return dateToISO(addDays(isoToDate(iso), days));
}

export function addMonthsISO(iso: ISODate, months: number): ISODate {
  return dateToISO(addMonths(isoToDate(iso), months));
}

export function diffDaysISO(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(isoToDate(to), isoToDate(from));
}

/** Yesterday / Today labels used across History and the date chips. */
export function relativeDayLabel(iso: ISODate, today: ISODate = todayISO()): string {
  const delta = diffDaysISO(iso, today); // today − iso
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Yesterday';
  if (delta === -1) return 'Tomorrow';
  return format(isoToDate(iso), 'EEE, MMM d');
}

export function formatHumanDate(iso: ISODate): string {
  return format(isoToDate(iso), 'MMMM d, yyyy');
}

export function formatShortDate(iso: ISODate): string {
  return format(isoToDate(iso), 'MMM d');
}

export function formatMonthLabel(iso: ISODate): string {
  return format(isoToDate(iso), 'MMMM yyyy');
}

/* ------------------------------------------------------------------ */
/* Week boundaries — driven by the "week starts on" setting (default Mon) */
/* ------------------------------------------------------------------ */

export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DateRange {
  start: ISODate;
  end: ISODate;
}

export function startOfWeekISO(iso: ISODate, weekStartsOn: WeekStart = 1): ISODate {
  const date = isoToDate(iso);
  const current = date.getUTCDay();
  const delta = (current - weekStartsOn + 7) % 7;
  return addDaysISO(iso, -delta);
}

export function endOfWeekISO(iso: ISODate, weekStartsOn: WeekStart = 1): ISODate {
  return addDaysISO(startOfWeekISO(iso, weekStartsOn), 6);
}

export function weekRangeISO(iso: ISODate, weekStartsOn: WeekStart = 1): DateRange {
  const start = startOfWeekISO(iso, weekStartsOn);
  return { start, end: addDaysISO(start, 6) };
}

/* ------------------------------------------------------------------ */
/* Month / allowance-cycle boundaries — "month starts on day X"        */
/* ------------------------------------------------------------------ */

/**
 * The custom month ("allowance cycle") that contains `iso`.
 * With `monthStartsOn = 1` this is the calendar month. With `monthStartsOn = 15`
 * a date on the 20th belongs to the cycle that began on the previous month's 15th.
 * Start days beyond the length of a month are clamped to that month's last day.
 */
export function monthRangeISO(iso: ISODate, monthStartsOn = 1): DateRange {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));

  const anchor = clampToMonth(year, month, monthStartsOn);
  const [startYear, startMonth] = day >= anchor ? [year, month] : shiftMonthParts(year, month, -1);
  const start = `${startYear}-${pad(startMonth)}-${pad(clampToMonth(startYear, startMonth, monthStartsOn))}`;

  const [nextYear, nextMonth] = shiftMonthParts(startYear, startMonth, 1);
  const nextStart = `${nextYear}-${pad(nextMonth)}-${pad(clampToMonth(nextYear, nextMonth, monthStartsOn))}`;

  return { start, end: addDaysISO(nextStart, -1) };
}

/** Start date of the cycle containing `iso`. */
export function startOfMonthISO(iso: ISODate, monthStartsOn = 1): ISODate {
  return monthRangeISO(iso, monthStartsOn).start;
}

export function endOfMonthISO(iso: ISODate, monthStartsOn = 1): ISODate {
  return monthRangeISO(iso, monthStartsOn).end;
}

/** Last calendar day number of a given year/month. */
function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `monthStartsOn` never exceeds the number of days the month actually has. */
function clampToMonth(year: number, month: number, monthStartsOn: number): number {
  const requested = Math.min(Math.max(Math.trunc(monthStartsOn) || 1, 1), 31);
  return Math.min(requested, lastDayOf(year, month));
}

function shiftMonthParts(year: number, month: number, delta: number): [number, number] {
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return [shifted.getUTCFullYear(), shifted.getUTCMonth() + 1];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/* ------------------------------------------------------------------ */
/* Budget / allowance arithmetic (Section 9)                           */
/* ------------------------------------------------------------------ */

/**
 * Days remaining **including today**, never below 1 (business rule 5).
 * A period that already ended yields 1, so "safe to spend today" stays sane.
 */
export function daysLeftInclusive(today: ISODate, end: ISODate): number {
  return Math.max(1, diffDaysISO(today, end) + 1);
}

/**
 * Safe to spend today = max(0, remaining) ÷ max(1, days left including today),
 * minus "set aside" savings contributions where enabled (business rule 5).
 * Integer cents throughout; the division truncates toward zero.
 */
export function safeToSpendTodayCents(params: {
  budgetCents: number;
  rolloverCents?: number;
  spentCents: number;
  today: ISODate;
  endDate: ISODate;
  setAsideCents?: number;
}): number {
  const { budgetCents, rolloverCents = 0, spentCents, today, endDate, setAsideCents = 0 } = params;
  const remaining = Math.max(0, budgetCents + rolloverCents - spentCents - setAsideCents);
  const days = daysLeftInclusive(today, endDate);
  return Math.floor(remaining / days);
}

export type BudgetThreshold = 'ok' | 'warning' | 'exceeded';

/** Business rule 4: ≥ 0.8 → warning, ≥ 1.0 → exceeded. */
export function budgetThreshold(spentCents: number, totalCents: number): BudgetThreshold {
  const ratio = usage(spentCents, totalCents);
  if (ratio >= 1) return 'exceeded';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
}

function usage(spent: number, total: number): number {
  if (total <= 0) return 0;
  return spent / total;
}

/** Remaining budget after spend, floored at zero for display. */
export function remainingBudgetCents(budgetCents: number, rolloverCents: number, spentCents: number): number {
  return budgetCents + rolloverCents - spentCents;
}

/** Sum of the per-category limits that a budget declares. */
export function sumLimits(limits: number[]): number {
  return limits.reduce<number>((total, value) => total + (Number.isFinite(value) ? Math.trunc(value) : 0), 0);
}

/** Average per day so far; 0 when nothing was spent or the day count is 0. */
export function dailyAverageCents(spentCents: number, days: number): number {
  if (days <= 0 || spentCents <= 0) return 0;
  return Math.floor(spentCents / days);
}

/**
 * End-of-period projection: today's spend carried forward at the current daily
 * average across the days that are still left. Used by the budget summary card.
 */
export function projectedEndOfPeriodCents(params: {
  budgetCents: number;
  rolloverCents?: number;
  spentCents: number;
  today: ISODate;
  startDate: ISODate;
  endDate: ISODate;
}): number {
  const { spentCents, today, startDate, endDate } = params;
  const daysLeft = daysLeftInclusive(today, endDate);
  const totalDays = Math.max(daysLeft, diffDaysISO(startDate, endDate) + 1);
  const daysElapsed = Math.max(1, totalDays - daysLeft + 1);
  const perDay = Math.floor(spentCents / daysElapsed);
  return spentCents + perDay * daysLeft;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function clampDate(value: ISODate, min?: ISODate, max?: ISODate): ISODate {
  if (min && value < min) return min;
  if (max && value > max) return max;
  return value;
}

/** Every `YYYY-MM-DD` in an inclusive range — used by charts and streaks. */
export function eachDayInRange(range: DateRange): ISODate[] {
  const out: ISODate[] = [];
  let cursor = range.start;
  let guard = 0;
  while (cursor <= range.end && guard < 4000) {
    out.push(cursor);
    cursor = addDaysISO(cursor, 1);
    guard += 1;
  }
  return out;
}