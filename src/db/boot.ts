/**
 * Boot routine.
 *
 * Runs once per app open, after migrations and seeding:
 *   1. purge soft-deleted expenses older than 30 days (business rule 10)
 *   2. catch up recurring rules that fell due while the app was closed
 *   3. re-evaluate budget thresholds so a single notification fires per crossing
 *   4. (re)schedule the daily reminder and the fortnightly backup nudge
 *
 * Everything here is local and idempotent.
 */

import type { DB } from './client';
import { purgeExpiredDeleted } from './repositories/expensesRepo';
import { runAllowanceCatchUp, runCatchUp } from './repositories/recurringRepo';
import { evaluateBudgetThresholds } from './repositories/budgetGlue';
import { hasPendingBackupReminder, scheduleBackupReminder, scheduleDailyReminder } from '../lib/notifications';
import { addDaysISO, nowTimestamp, todayISO } from '../lib/date';
import { getSetting, setSetting } from './repositories/settingsRepo';
import { categoryId as seedCategoryId, paymentMethodId as seedPaymentMethodId } from './seed';

export interface BootReport {
  purged: number;
  expensesCreated: number;
  allowanceCreated: number;
  billRemindersScheduled: number;
  thresholdsChecked: boolean;
}

let booted = false;
let inFlight: Promise<BootReport> | null = null;

/** `expenses` cleared of the soft-delete grace period. */
const SOFT_DELETE_GRACE_DAYS = 30;

export function runBootRoutine(db: DB): Promise<BootReport> {
  if (booted && inFlight) return inFlight;

  inFlight = (async (): Promise<BootReport> => {
    const today = todayISO();
    const report: BootReport = {
      purged: 0,
      expensesCreated: 0,
      allowanceCreated: 0,
      billRemindersScheduled: 0,
      thresholdsChecked: false,
    };

    try {
      // 1 — purge expired soft deletes
      report.purged = await purgeExpiredDeleted(db, addDaysISO(today, -SOFT_DELETE_GRACE_DAYS));

      // 2 — recurring catch-up (auto rules create; remind rules notify)
      const catchUp = await runCatchUp(db, today, {
        categoryId: seedCategoryId('others'),
        paymentMethodId: seedPaymentMethodId('cash'),
      });
      report.expensesCreated = catchUp.created;
      report.billRemindersScheduled = catchUp.reminded;
      report.allowanceCreated = await runAllowanceCatchUp(db, today);

      // 3 — thresholds
      await evaluateBudgetThresholds(db, today);
      report.thresholdsChecked = true;

      // 4 — reminders, only when they are actually due again
      await scheduleDailyReminder((await getSetting(db, 'dailyReminderTime')) ?? '20:00');
      await maybeScheduleBackupReminder(db);
    } catch {
      // A failed boot step must never block the UI — every step is re-runnable.
    } finally {
      booted = true;
    }

    return report;
  })();

  return inFlight;
}

async function maybeScheduleBackupReminder(db: DB): Promise<void> {
  // A nudge that is still queued already covers this window.
  if (await hasPendingBackupReminder()) return;

  const days = Number((await getSetting(db, 'backupReminderDays')) ?? '14');
  const interval = Number.isFinite(days) && days > 0 ? Math.trunc(days) : 14;
  const lastBackupAt = await getSetting(db, 'lastBackupAt');

  // Anchor the cycle on the last backup. With no backup yet, the cycle starts
  // now, so the first nudge lands `interval` days after first use rather than
  // never (the old behaviour waited for a backup that might never happen).
  const backupDate = lastBackupAt ? parseStoredDate(lastBackupAt) : todayISO();
  const dueBy = addDaysISO(backupDate ?? todayISO(), interval);
  if (dueBy > todayISO()) return;

  // The previous nudge may have already fired and left the OS queue. Recording
  // when we scheduled it stops a once-per-open re-nudge after that.
  const lastScheduledAt = await getSetting(db, 'backupReminderScheduledAt');
  if (lastScheduledAt) {
    const scheduledDate = parseStoredDate(lastScheduledAt);
    if (scheduledDate && addDaysISO(scheduledDate, interval) > todayISO()) return;
  }

  const scheduled = await scheduleBackupReminder(nextMorning());
  if (!scheduled) return;
  await setSetting(db, 'backupReminderScheduledAt', nowTimestamp());
}

/** A stored ISO timestamp → its Manila calendar date, or null when unreadable. */
function parseStoredDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : todayISO(date);
}

/** 9:00 AM tomorrow in device-local time — never a mid-session interruption. */
function nextMorning(now = new Date()): Date {
  const when = new Date(now);
  when.setDate(when.getDate() + 1);
  when.setHours(9, 0, 0, 0);
  return when;
}

/** For tests and "reset dev state" — lets the routine run again. */
export function resetBootRoutine(): void {
  booted = false;
  inFlight = null;
}