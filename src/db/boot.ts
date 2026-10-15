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
import { scheduleBackupReminder, scheduleDailyReminder } from '../lib/notifications';
import { addDaysISO, nowTimestamp, todayISO } from '../lib/date';
import { getSetting, setSetting } from './repositories/settingsRepo';
import { categoryId as seedCategoryId, paymentMethodId as seedPaymentMethodId } from './seed';

export interface BootReport {
  purged: number;
  expensesCreated: number;
  allowanceCreated: number;
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
      thresholdsChecked: false,
    };

    try {
      // 1 — purge expired soft deletes
      report.purged = await purgeExpiredDeleted(db, addDaysISO(today, -SOFT_DELETE_GRACE_DAYS));

      // 2 — recurring catch-up
      report.expensesCreated = (await runCatchUp(db, today, {
        categoryId: seedCategoryId('others'),
        paymentMethodId: seedPaymentMethodId('cash'),
      })).created;
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
  const days = Number((await getSetting(db, 'backupReminderDays')) ?? '14');
  const lastBackupAt = await getSetting(db, 'lastBackupAt');

  const dueBy = lastBackupAt
    ? addDaysISO(lastBackupAt.slice(0, 10), Number.isFinite(days) && days > 0 ? days : 14)
    : addDaysISO(todayISO(), 1);

  if (dueBy > todayISO()) return;
  await scheduleBackupReminder(Number.isFinite(days) && days > 0 ? days : 14);
  await setSetting(db, 'backupReminderScheduledAt', nowTimestamp());
}

/** For tests and "reset dev state" — lets the routine run again. */
export function resetBootRoutine(): void {
  booted = false;
  inFlight = null;
}