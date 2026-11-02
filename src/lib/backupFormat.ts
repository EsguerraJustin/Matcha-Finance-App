/**
 * Backup shape — pure, dependency-free.
 *
 * Kept separate from `backup.ts` (which touches the filesystem and SQLite) so
 * the parser and the table list can be unit tested without native mocks.
 */

export const BACKUP_FORMAT = 'matcha-wallet-backup';
export const BACKUP_VERSION = 1;

/** Every table, in dependency order (foreign keys are ON). */
export const BACKUP_TABLES = [
  'settings',
  'categories',
  'expense_types',
  'payment_methods',
  'allowances',
  'budgets',
  'category_budgets',
  'expenses',
  'recurring_rules',
  'grocery_lists',
  'grocery_items',
  'grocery_price_memory',
  'quick_templates',
  'savings_goals',
  'savings_contributions',
  'streak_log',
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  tables: Record<BackupTableName, Record<string, unknown>[]>;
}

export interface BackupSummary {
  expenses: number;
  allowances: number;
  budgets: number;
  groceryLists: number;
  createdAt: string;
}

/** Row counts for the confirmation dialog before restoring. */
export function summariseBackup(backup: BackupFile): BackupSummary {
  return {
    expenses: backup.tables.expenses?.length ?? 0,
    allowances: backup.tables.allowances?.length ?? 0,
    budgets: backup.tables.budgets?.length ?? 0,
    groceryLists: backup.tables.grocery_lists?.length ?? 0,
    createdAt: backup.createdAt,
  };
}

/** Rejects anything that is not a backup this app understands. */
export function parseBackup(raw: unknown): BackupFile | null {
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as Partial<BackupFile>;
  if (candidate.format !== BACKUP_FORMAT) return null;
  if (candidate.version !== BACKUP_VERSION) return null;
  if (!candidate.tables || typeof candidate.tables !== 'object') return null;
  if (!Array.isArray(candidate.tables.expenses)) return null;

  // Every known table must be an array when present. Unknown keys are ignored.
  for (const table of BACKUP_TABLES) {
    const rows = (candidate.tables as Record<string, unknown>)[table];
    if (rows !== undefined && !Array.isArray(rows)) return null;
  }

  return candidate as BackupFile;
}
