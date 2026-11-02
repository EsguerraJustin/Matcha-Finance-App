/**
 * Backup, restore and erase.
 *
 * Because there is no cloud (brief Section 2), local backup is **mandatory**.
 * The backup is a single JSON document — human readable, portable across
 * devices via the share sheet, with no network involved.
 *
 * Restore runs inside ONE transaction; if anything fails, nothing changes
 * (business rule 13).
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { DB } from '../db/client';
import { execute, queryAll, transaction } from '../db/client';
import { nowTimestamp } from './date';
import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION, parseBackup, type BackupFile, type BackupTableName } from './backupFormat';
import { seedDatabase } from '../db/seed';

export {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  BACKUP_VERSION,
  parseBackup,
  summariseBackup,
} from './backupFormat';
export type { BackupFile, BackupSummary, BackupTableName } from './backupFormat';


/** Reads the whole database into a plain JSON-serialisable object. */
export async function createBackup(db: DB): Promise<BackupFile> {
  const tables = {} as Record<BackupTableName, Record<string, unknown>[]>;

  for (const table of BACKUP_TABLES) {
    tables[table] = await queryAll<Record<string, unknown>>(db, `SELECT * FROM ${table};`);
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: nowTimestamp(),
    tables,
  };
}

/**
 * Wipes every table and replays the backup rows inside a single transaction
 * (business rule 13). Column order is taken from the backup payload, so a
 * future column can simply be added to the file.
 *
 * Foreign keys are switched off around the replay because the schema is
 * circular (`expenses.grocery_list_id` ↔ `grocery_lists.expense_id`). A
 * `foreign_key_check` inside the transaction still rejects a genuinely
 * inconsistent file, so a bad restore rolls back completely.
 */
export async function restoreBackup(db: DB, backup: BackupFile): Promise<void> {
  if (backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) {
    throw new Error('Unsupported backup format');
  }

  const validColumns = new Map<BackupTableName, Set<string>>();
  for (const table of BACKUP_TABLES) {
    const info = await queryAll<{ name: string }>(db, `PRAGMA table_info(${table});`);
    validColumns.set(table, new Set(info.map((column) => column.name)));
  }

  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await transaction(db, async () => {
      // Children before parents, so even a populated database is cleared.
      for (const table of [...BACKUP_TABLES].reverse()) {
        await execute(db, `DELETE FROM ${table};`);
      }

      for (const table of BACKUP_TABLES) {
        const rows = backup.tables[table] ?? [];
        const allowed = validColumns.get(table) ?? new Set<string>();
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const columns = Object.keys(row).filter((column) => allowed.has(column));
          if (!columns.length) continue;
          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map((column) => {
            const value = (row as Record<string, unknown>)[column];
            if (value === null || value === undefined) return null;
            if (typeof value === 'string' || typeof value === 'number') return value;
            return JSON.stringify(value);
          });
          await execute(
            db,
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders});`,
            values as (string | number | null)[],
          );
        }
      }

      const violations = await queryAll<Record<string, unknown>>(db, 'PRAGMA foreign_key_check;');
      if (violations.length) throw new Error('Backup has broken references');
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

/**
 * Removes every row and every receipt file — the double-confirmed "erase all".
 * Defaults are seeded again afterwards so the app is immediately usable.
 */
export async function eraseAllData(db: DB): Promise<void> {
  await transaction(db, async () => {
    for (const table of [...BACKUP_TABLES].reverse()) {
      if (table === 'settings') continue; // preferences survive an erase
      await execute(db, `DELETE FROM ${table};`);
    }
    await execute(
      db,
      "UPDATE settings SET value = '' WHERE key IN ('lastBackupAt', 'lastUsedPaymentMethodId', 'lastUsedCategoryId');",
    );
  });

  // Receipts are best-effort: the DB reference is already gone.
  try {
    const dir = new Directory(Paths.document, 'receipts');
    if (dir.exists) dir.delete();
  } catch {
    // Nothing to delete.
  }

  await seedDatabase(db, true);
}

/** Writes the backup to the cache directory and opens the OS share sheet. */
export async function shareBackup(backup: BackupFile): Promise<string | null> {
  const json = JSON.stringify(backup, null, 2);
  const file = new File(Paths.cache, `matcha-backup-${backup.createdAt.slice(0, 10)}.json`);
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your backup' });
  }

  return file.uri;
}

/** Reads a backup file the user picked through the document picker. */
export async function readBackupUri(uri: string): Promise<BackupFile | null> {
  const file = new File(uri);
  if (!file.exists) return null;
  try {
    return parseBackup(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
