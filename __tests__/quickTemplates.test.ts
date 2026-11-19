/**
 * Quick templates ("one-tap adds") repository — the data layer behind the
 * Home add/edit/remove sheet (flaw: the feature had full CRUD in the repo but
 * no UI ever called it).
 *
 * Same stub-DB approach as `categories.test.ts`: nothing here executes real
 * SQLite, the handle is a recording stub and `expo-sqlite` is mocked so the
 * import graph resolves.
 */

jest.mock('expo-sqlite', () => ({}));
// Under jest-expo `Crypto.randomUUID()` resolves but returns undefined, which
// would silently produce `id = undefined` and shift every param index. Pin it
// so the SQL payloads below are asserted against a real primary key.
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-test-0001' }));

import {
  createQuickTemplate,
  deleteQuickTemplate,
  saveAsFavorite,
  updateQuickTemplate,
} from '../src/db/repositories/quickTemplatesRepo';
import type { DB } from '../src/db/client';

interface Recorded {
  sql: string;
  params: unknown[];
}

/** `firstResults` is consumed one `getFirstAsync` call at a time. */
function stubDb(firstResults: unknown[] = []): { db: DB; executed: Recorded[]; firstCalls: string[] } {
  const executed: Recorded[] = [];
  const firstCalls: string[] = [];
  const queue = [...firstResults];

  const db = {
    runAsync: async (sql: string, params: unknown[] = []) => {
      executed.push({ sql, params });
      return { rowsAffected: 1, lastInsertRowId: 0 };
    },
    getFirstAsync: async (sql: string) => {
      firstCalls.push(sql);
      return queue.length ? queue.shift() : null;
    },
    getAllAsync: async () => [],
  } as unknown as DB;

  return { db, executed, firstCalls };
}

const INPUT = {
  label: '  Coffee  ',
  amount_cents: 9500,
  category_id: 'cat-food',
  type_id: 'typ-coffee',
  payment_method_id: 'pm-cash',
  note: '  daily cup  ',
};

describe('createQuickTemplate', () => {
  it('trims label/note and appends after the highest sort_order', async () => {
    const { db, executed } = stubDb([{ next: 3 }]);

    const id = await createQuickTemplate(db, INPUT);

    expect(id).toBeTruthy();
    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toContain('INSERT INTO quick_templates');
    // [id, label, amount, category, type, payment, note, sort_order]
    expect(executed[0].params).toEqual([
      'uuid-test-0001',
      'Coffee',
      9500,
      'cat-food',
      'typ-coffee',
      'pm-cash',
      'daily cup',
      3,
    ]);
  });

  it('stores a null note when the field is blank', async () => {
    const { db, executed } = stubDb([{ next: 0 }]);

    await createQuickTemplate(db, { ...INPUT, note: '   ' });

    expect(executed[0].params[6]).toBeNull();
  });
});

describe('updateQuickTemplate', () => {
  it('updates only the provided columns', async () => {
    const { db, executed } = stubDb();

    await updateQuickTemplate(db, 'tpl-1', { label: 'Bus fare', amount_cents: 1500 });

    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toContain('UPDATE quick_templates SET');
    expect(executed[0].sql).toContain('WHERE id = ?');
    expect(executed[0].params).toEqual(['Bus fare', 1500, 'tpl-1']);
  });

  it('writes no SQL for an empty patch', async () => {
    const { db, executed } = stubDb();

    await updateQuickTemplate(db, 'tpl-1', {});

    expect(executed).toHaveLength(0);
  });
});

describe('deleteQuickTemplate', () => {
  it('deletes the row by id', async () => {
    const { db, executed } = stubDb();

    await deleteQuickTemplate(db, 'tpl-9');

    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toContain('DELETE FROM quick_templates');
    expect(executed[0].params).toEqual(['tpl-9']);
  });
});

describe('saveAsFavorite', () => {
  const EXPENSE = {
    amount_cents: 9500,
    category_id: 'cat-food',
    type_id: 'typ-coffee',
    payment_method_id: 'pm-cash',
    note: null,
  };

  it("labels the chip with the expense's type name", async () => {
    const { db, executed } = stubDb([EXPENSE, { name: 'Coffee' }, { next: 0 }]);

    await saveAsFavorite(db, 'exp-1');

    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toContain('INSERT INTO quick_templates');
    expect(executed[0].params[1]).toBe('Coffee');
    expect(executed[0].params[2]).toBe(9500);
  });

  it('falls back to "Favorite" when the expense has no type', async () => {
    const { db, executed } = stubDb([{ ...EXPENSE, type_id: null }, null, { next: 0 }]);

    await saveAsFavorite(db, 'exp-2');

    expect(executed[0].params[1]).toBe('Favorite');
  });

  it('does nothing when the expense no longer exists', async () => {
    const { db, executed } = stubDb([null]);

    await saveAsFavorite(db, 'exp-gone');

    expect(executed).toHaveLength(0);
  });
});
