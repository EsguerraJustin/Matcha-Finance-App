import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  BACKUP_VERSION,
  parseBackup,
  summariseBackup,
  type BackupFile,
} from '../src/lib/backupFormat';

function backup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: '2026-10-15T09:30:00.000+08:00',
    tables: Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])) as unknown as BackupFile['tables'],
    ...overrides,
  };
}

describe('parseBackup', () => {
  it('accepts a file this app wrote', () => {
    const value = backup();
    expect(parseBackup(JSON.parse(JSON.stringify(value)))).toEqual(value);
  });

  it('accepts a backup that omits some optional tables', () => {
    const value = backup();
    delete (value.tables as Record<string, unknown>).grocery_items;
    expect(parseBackup(value)).not.toBeNull();
  });

  it('rejects null, primitives and arrays', () => {
    expect(parseBackup(null)).toBeNull();
    expect(parseBackup(undefined)).toBeNull();
    expect(parseBackup('backup')).toBeNull();
    expect(parseBackup(42)).toBeNull();
    expect(parseBackup([])).toBeNull();
  });

  it('rejects a file from another app or a future version', () => {
    expect(parseBackup({ ...backup(), format: 'some-other-app' })).toBeNull();
    expect(parseBackup({ ...backup(), version: BACKUP_VERSION + 1 })).toBeNull();
  });

  it('rejects a file without tables or without expenses', () => {
    const missingTables = { ...backup() } as Record<string, unknown>;
    delete missingTables.tables;
    expect(parseBackup(missingTables)).toBeNull();

    expect(
      parseBackup({
        ...backup(),
        tables: Object.fromEntries(BACKUP_TABLES.filter((table) => table !== 'expenses').map((table) => [table, []])) as unknown as BackupFile['tables'],
      }),
    ).toBeNull();
  });

  it('accepts an old backup whose settings rows carry onboardingComplete', () => {
    const value = backup({
      tables: {
        ...backup().tables,
        settings: [{ key: 'theme', value: 'light', onboardingComplete: true }],
      } as BackupFile['tables'],
    });
    expect(parseBackup(value)).not.toBeNull();
  });

  it('rejects a known table that is not an array', () => {
    expect(
      parseBackup({
        ...backup(),
        tables: { ...backup().tables, expenses: { rows: [] } } as unknown as BackupFile['tables'],
      }),
    ).toBeNull();
  });
});

describe('summariseBackup', () => {
  it('counts the parts a person cares about', () => {
    const value = backup({
      tables: {
        ...backup().tables,
        expenses: [{ id: 'e1' }, { id: 'e2' }],
        allowances: [{ id: 'a1' }],
        budgets: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
        grocery_lists: [{ id: 'g1' }],
      } as BackupFile['tables'],
    });

    expect(summariseBackup(value)).toEqual({
      expenses: 2,
      allowances: 1,
      budgets: 3,
      groceryLists: 1,
      createdAt: '2026-10-15T09:30:00.000+08:00',
    });
  });

  it('treats a missing table as zero', () => {
    const value = backup();
    delete (value.tables as Record<string, unknown>).grocery_lists;
    expect(summariseBackup(value).groceryLists).toBe(0);
  });
});

describe('BACKUP_TABLES', () => {
  it('covers every table in the schema exactly once', () => {
    expect(BACKUP_TABLES).toHaveLength(16);
    expect(new Set(BACKUP_TABLES).size).toBe(BACKUP_TABLES.length);
    expect(BACKUP_TABLES).toContain('settings');
    expect(BACKUP_TABLES).toContain('expenses');
    expect(BACKUP_TABLES).toContain('grocery_price_memory');
    expect(BACKUP_TABLES).toContain('streak_log');
  });
});
