/**
 * Developer-only performance seed.
 *
 * Generates ~5,000 realistic expenses across the current month so list
 * scrolling, totals and reports can be checked on a low-end device. It runs
 * inside the app (the only place `expo-sqlite` exists) and is only exposed
 * from Settings in development builds.
 *
 * Every row points at a real seeded category, type and payment method, so the
 * foreign keys stay valid and the data behaves exactly like hand-entered data.
 */

import type { DB } from './client';
import { execute, transaction } from './client';
import { SEED_CATEGORIES, SEED_PAYMENT_METHODS, categoryId, paymentMethodId, typeId } from './seed';
import { newId } from '../lib/id';
import { addDaysISO, endOfMonthISO, nowTimestamp, startOfMonthISO, todayISO } from '../lib/date';

const NOTES = [
  null,
  null,
  null,
  'Quick stop',
  'Daily commute',
  'Lunch with friends',
  'School requirement',
  'Emergency',
  'Treat',
  'Bulk buy',
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/**
 * Inserts `target` expenses spread evenly from the start of the current month
 * to today. Returns the number of rows written.
 */
export async function seedPerfExpenses(db: DB, target = 5000): Promise<number> {
  const today = todayISO();
  const monthStart = startOfMonthISO(today, 1);
  const monthEnd = endOfMonthISO(today, 1);
  const dayCount =
    Math.round((Date.parse(`${monthEnd}T00:00:00Z`) - Date.parse(`${monthStart}T00:00:00Z`)) / 86_400_000) + 1;
  const perDay = Math.max(1, Math.ceil(target / dayCount));
  const timestamp = nowTimestamp();

  const categories = SEED_CATEGORIES.map((category) => ({
    categoryId: categoryId(category.key),
    typeIds: category.types.map((name) => typeId(category.key, name)),
  }));

  const paymentIds = SEED_PAYMENT_METHODS.map((method) => paymentMethodId(method.key));

  let written = 0;
  await transaction(db, async () => {
    for (let day = 0; day < dayCount && written < target; day += 1) {
      const spentOn = addDaysISO(monthStart, day);
      if (spentOn > today) break;

      for (let index = 0; index < perDay && written < target; index += 1) {
        const category = pick(categories);
        await execute(
          db,
          `INSERT INTO expenses (
             id, amount_cents, spent_on, category_id, type_id, payment_method_id,
             note, budget_id, receipt_path, grocery_list_id, recurring_rule_id,
             created_at, updated_at, deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL);`,
          [
            newId(),
            Math.floor(Math.random() * 49_500) + 500, // ₱5.00 – ₱500.00
            spentOn,
            category.categoryId,
            pick(category.typeIds),
            pick(paymentIds),
            pick(NOTES),
            timestamp,
            timestamp,
          ],
        );
        written += 1;
      }
    }
  });

  return written;
}
