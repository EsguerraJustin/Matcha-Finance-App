/**
 * Recurring rules — pure date logic plus the idempotent catch-up contract
 * from business rule 11.
 *
 * "Create all missed occurrences up to today (cap at 60 to avoid floods),
 * then advance `next_due_on`. Must be idempotent — never create the same
 * occurrence twice."
 */

import { addDaysISO, addMonthsISO, startOfWeekISO, type WeekStart } from './date';

export type Frequency = 'daily' | 'weekly' | 'monthly';
export type RuleMode = 'auto' | 'remind';
export type RuleKind = 'expense' | 'allowance';

/** Hard cap from business rule 11 — never flood the app with backfill rows. */
export const MAX_CATCH_UP_OCCURRENCES = 60;

export interface RecurringRule {
  id: string;
  kind: RuleKind;
  amount_cents: number;
  label: string;
  frequency: Frequency;
  interval_n: number;
  day_of_week: number | null;
  day_of_month: number | null;
  next_due_on: string;
  end_on: string | null;
  mode: RuleMode;
  active: number;
}

export interface Occurrence {
  ruleId: string;
  dueOn: string;
  amount_cents: number;
  kind: RuleKind;
}

/** The date a rule fires on, starting from `from`. */
export function nextOccurrence(rule: RecurringRule, from: string): string {
  const interval = Math.max(1, rule.interval_n);

  switch (rule.frequency) {
    case 'daily':
      return addDaysISO(from, interval);
    case 'weekly': {
      // Anchor on the rule's chosen weekday where we can, so the cadence
      // survives a "next_due_on" that was moved by the user.
      if (rule.day_of_week !== null) {
        const target = ((rule.day_of_week % 7) + 7) % 7;
        const current = new Date(`${from}T00:00:00Z`).getUTCDay();
        const delta = (current - target + 7) % 7;
        const aligned = addDaysISO(from, -delta);
        return addDaysISO(aligned, interval * 7);
      }
      return addDaysISO(from, interval * 7);
    }
    case 'monthly':
    default: {
      const targetDay = clampDay(rule.day_of_month, from);
      return addMonthsISO(setDayOfMonth(from, targetDay), interval);
    }
  }
}

/** The due dates a rule still owes, newest-lost first, never past `today`. */
export function dueOccurrences(rule: RecurringRule, today: string, limit = MAX_CATCH_UP_OCCURRENCES): string[] {
  if (!rule.active) return [];
  if (rule.end_on && rule.next_due_on > rule.end_on) return [];
  if (rule.next_due_on > today) return [];

  const due: string[] = [];
  let cursor = rule.next_due_on;

  while (cursor <= today && due.length < limit) {
    if (rule.end_on && cursor > rule.end_on) break;
    due.push(cursor);
    cursor = nextOccurrence(rule, cursor);
  }

  return due;
}

/**
 * `next_due_on` after a catch-up: the first date that has not happened yet.
 * Keeping this in one place is what makes the catch-up idempotent — a second
 * run on the same day computes the same value and creates nothing.
 */
export function advanceNextDue(rule: RecurringRule, today: string): string {
  if (rule.end_on && rule.next_due_on > rule.end_on) return rule.next_due_on;

  let cursor = rule.next_due_on;
  // Bounded so a pathological rule can never spin forever.
  for (let guard = 0; cursor <= today && guard < MAX_CATCH_UP_OCCURRENCES * 2; guard += 1) {
    cursor = nextOccurrence(rule, cursor);
  }
  return cursor;
}

export function toOccurrences(rule: RecurringRule, today: string): Occurrence[] {
  return dueOccurrences(rule, today).map((dueOn) => ({
    ruleId: rule.id,
    dueOn,
    amount_cents: rule.amount_cents,
    kind: rule.kind,
  }));
}

/** The first weekly due date aligned to the user's week-start setting. */
export function firstWeeklyDue(today: string, weekStartsOn: WeekStart = 1): string {
  return startOfWeekISO(today, weekStartsOn);
}

/** The first monthly due date, clamped to the length of the month. */
export function firstMonthlyDue(today: string, dayOfMonth: number): string {
  return setDayOfMonth(today, clampDay(dayOfMonth, today));
}

function setDayOfMonth(iso: string, day: number): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function clampDay(day: number | null, iso: string): number {
  if (!day || day < 1) return Number(iso.slice(8, 10));
  return day;
}

/** Upcoming bills for the next `days` days (brief Section 6.7). */
export function upcomingBills(rules: readonly RecurringRule[], today: string, days = 7): Occurrence[] {
  const horizon = addDaysISO(today, days);
  const out: Occurrence[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    let cursor = rule.next_due_on;
    if (cursor < today) cursor = today;

    for (let guard = 0; cursor <= horizon && guard < 60; guard += 1) {
      if (!rule.end_on || cursor <= rule.end_on) {
        out.push({ ruleId: rule.id, dueOn: cursor, amount_cents: rule.amount_cents, kind: rule.kind });
      }
      cursor = nextOccurrence(rule, cursor);
    }
  }

  return out.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
}

export function humanFrequency(rule: RecurringRule): string {
  const interval = Math.max(1, rule.interval_n);
  const unit = rule.frequency === 'daily' ? 'day' : rule.frequency === 'weekly' ? 'week' : 'month';
  return interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
}