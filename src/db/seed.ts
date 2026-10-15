/**
 * First-launch seed data (brief Section 10).
 *
 * Deterministic ids keep re-seeding idempotent, so this runs safely on every
 * start and never duplicates a default row.
 */

import type { DB } from './client';
import { execute, transaction } from './client';
import { DEFAULT_SETTINGS, serializeSettings } from './settings';
import { seededId } from '../lib/id';
import { nowTimestamp } from '../lib/date';

export interface SeedCategory {
  key: string;
  name: string;
  icon: string;
  colorKey: string;
  types: string[];
}

export interface SeedPaymentMethod {
  key: string;
  name: string;
  icon: string;
}

/** Categories and types exactly as listed in brief Section 5, item 2. */
export const SEED_CATEGORIES: readonly SeedCategory[] = [
  { key: 'food', name: 'Food', icon: 'utensils', colorKey: 'Food', types: ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Coffee'] },
  {
    key: 'transportation',
    name: 'Transportation',
    icon: 'bus',
    colorKey: 'Transportation',
    types: ['Jeep', 'Tricycle', 'Bus', 'MRT/LRT', 'Grab'],
  },
  {
    key: 'groceries',
    name: 'Groceries',
    icon: 'shopping-basket',
    colorKey: 'Groceries',
    types: ['Market', 'Dali', 'Super 8', 'SM', 'Puregold'],
  },
  {
    key: 'school-supplies',
    name: 'School supplies',
    icon: 'pencil-ruler',
    colorKey: 'School supplies',
    types: ['Printing', 'Projects', 'Supplies', 'Fees'],
  },
  { key: 'shopping', name: 'Shopping', icon: 'shopping-bag', colorKey: 'Shopping', types: ['Clothing', 'Personal care', 'Gadgets'] },
  { key: 'bills', name: 'Bills', icon: 'receipt', colorKey: 'Bills', types: ['Utilities', 'Internet', 'Phone load'] },
  { key: 'others', name: 'Others', icon: 'shapes', colorKey: 'Others', types: ['General'] },
];

export const SEED_PAYMENT_METHODS: readonly SeedPaymentMethod[] = [
  { key: 'cash', name: 'Cash', icon: 'banknote' },
  { key: 'gcash', name: 'GCash', icon: 'smartphone' },
  { key: 'maya', name: 'Maya', icon: 'wallet' },
  { key: 'debit-card', name: 'Debit card', icon: 'credit-card' },
  { key: 'credit-card', name: 'Credit card', icon: 'credit-card' },
  { key: 'bank-transfer', name: 'Bank transfer', icon: 'landmark' },
  { key: 'others', name: 'Others', icon: 'circle-dashed' },
];

export const categoryId = (key: string) => seededId('cat', key);
export const typeId = (categoryKey: string, name: string) => seededId('typ', `${categoryKey}:${name}`);
export const paymentMethodId = (key: string) => seededId('pm', key);

/** Starter favourites on the Home screen — all editable in Settings. */
const SEED_FAVORITES = [
  { label: 'Jeep', amountCents: 1300, category: 'transportation', type: 'Jeep' },
  { label: 'Coffee', amountCents: 9500, category: 'food', type: 'Coffee' },
  { label: 'Lunch', amountCents: 8500, category: 'food', type: 'Lunch' },
] as const;

export async function isSeeded(db: DB): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM categories;');
  return (row?.count ?? 0) > 0;
}

/** Inserts every default row. No-op when the database already has categories. */
export async function seedDatabase(db: DB, force = false): Promise<void> {
  if (!force && (await isSeeded(db))) return;

  const timestamp = nowTimestamp();

  await transaction(db, async () => {
    for (const [index, category] of SEED_CATEGORIES.entries()) {
      await execute(
        db,
        `INSERT OR IGNORE INTO categories (id, name, icon, color_key, sort_order, is_default, archived)
         VALUES (?, ?, ?, ?, ?, 1, 0);`,
        [categoryId(category.key), category.name, category.icon, category.colorKey, index],
      );

      for (const [typeIndex, typeName] of category.types.entries()) {
        await execute(
          db,
          `INSERT OR IGNORE INTO expense_types (id, category_id, name, sort_order, is_default, archived)
           VALUES (?, ?, ?, ?, 1, 0);`,
          [typeId(category.key, typeName), categoryId(category.key), typeName, typeIndex],
        );
      }
    }

    for (const [index, method] of SEED_PAYMENT_METHODS.entries()) {
      await execute(
        db,
        `INSERT OR IGNORE INTO payment_methods (id, name, icon, sort_order, is_default, archived)
         VALUES (?, ?, ?, ?, 1, 0);`,
        [paymentMethodId(method.key), method.name, method.icon, index],
      );
    }

    // Cash is the sensible first default for a student budget app.
    const settings = {
      ...DEFAULT_SETTINGS,
      lastUsedPaymentMethodId: paymentMethodId('cash'),
    };
    for (const [key, value] of Object.entries(serializeSettings(settings))) {
      await execute(db, 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);', [key, value]);
    }

    for (const [index, favorite] of SEED_FAVORITES.entries()) {
      await execute(
        db,
        `INSERT OR IGNORE INTO quick_templates (id, label, amount_cents, category_id, type_id, payment_method_id, note, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?);`,
        [
          seededId('fav', favorite.label),
          favorite.label,
          favorite.amountCents,
          categoryId(favorite.category),
          typeId(favorite.category, favorite.type),
          paymentMethodId('cash'),
          index,
        ],
      );
    }

    await execute(db, 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);', [
      'seeded_at',
      timestamp,
    ]);
  });
}

/** Looks up a default id by name — used by the onboarding and by tests. */
export function findCategoryKeyByName(name: string): string | undefined {
  return SEED_CATEGORIES.find((category) => category.name === name)?.key;
}

export function findTypeKeyByName(categoryName: string, typeName: string): { categoryKey: string; type: string } | undefined {
  const category = SEED_CATEGORIES.find((entry) => entry.name === categoryName);
  if (!category) return undefined;
  return category.types.includes(typeName) ? { categoryKey: category.key, type: typeName } : undefined;
}

export function findPaymentMethodKeyByName(name: string): string | undefined {
  return SEED_PAYMENT_METHODS.find((method) => method.name === name)?.key;
}