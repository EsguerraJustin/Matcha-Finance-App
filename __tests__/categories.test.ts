/**
 * Regression test for the category manager's "Show archived items" toggle
 * (extended UAT flaw #15): `listCategories` used to drop **all** types whenever
 * `includeArchived` was requested, so every category rendered as "0 types".
 */

// The repo imports `src/db/client`, which imports `expo-sqlite`; the native
// module (and its `expo-asset` dependency) cannot load under Jest. Nothing in
// this test executes SQLite — the db handle is a stub — so an empty mock of the
// module is enough to let the import graph resolve.
jest.mock('expo-sqlite', () => ({}));

import { listCategories, type CategoryWithTypes } from '../src/db/repositories/categoriesRepo';
import type { DB } from '../src/db/client';

const CAT_FOOD = {
  id: 'cat-food',
  name: 'Food',
  icon: 'shapes',
  color_key: '#FF0000',
  sort_order: 0,
  is_default: 1,
  archived: 0,
};

const CAT_SHOPPING = {
  id: 'cat-shopping',
  name: 'Shopping',
  icon: 'shapes',
  color_key: '#00FF00',
  sort_order: 1,
  is_default: 1,
  archived: 1,
};

function flat(category: object, type: object | null) {
  return {
    ...category,
    t_id: type ? (type as { id: string }).id : null,
    t_name: type ? (type as { name: string }).name : null,
    t_sort_order: type ? (type as { sort_order: number }).sort_order : null,
    t_is_default: type ? (type as { is_default: number }).is_default : null,
    t_archived: type ? (type as { archived: number }).archived : null,
  };
}

const LUNCH = { id: 'type-lunch', name: 'Lunch', sort_order: 0, is_default: 1, archived: 0 };
const OLD_TYPE = { id: 'type-old', name: 'Old type', sort_order: 1, is_default: 0, archived: 1 };

const ROWS = [
  flat(CAT_FOOD, LUNCH),
  flat(CAT_FOOD, OLD_TYPE),
  flat(CAT_SHOPPING, LUNCH),
];

function stubDb(): DB {
  return { getAllAsync: async () => ROWS } as unknown as DB;
}

describe('listCategories', () => {
  it('hides archived categories and archived types by default', async () => {
    const result = await listCategories(stubDb());
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Food');
    expect(result[0].types.map((t) => t.name)).toEqual(['Lunch']);
  });

  it('keeps every type when archived entries are included (flaw #15)', async () => {
    const result = await listCategories(stubDb(), { includeArchived: true });
    const names = result.map((c) => c.name).sort();
    expect(names).toEqual(['Food', 'Shopping']);

    const food = result.find((c) => c.name === 'Food') as CategoryWithTypes;
    expect(food.types.map((t) => t.name).sort()).toEqual(['Lunch', 'Old type']);

    const shopping = result.find((c) => c.name === 'Shopping') as CategoryWithTypes;
    expect(shopping.types.map((t) => t.name)).toEqual(['Lunch']);
  });
});
