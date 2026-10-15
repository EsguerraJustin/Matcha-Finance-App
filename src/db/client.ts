/**
 * SQLite client.
 *
 * One database, opened once, used for the lifetime of the process. Nothing in
 * here ever leaves the device — there is no remote connection string and the
 * Android manifest does not request the INTERNET permission.
 */

import * as SQLite from 'expo-sqlite';

import { LATEST_VERSION, pendingMigrations } from './migrations';

export const DATABASE_NAME = 'matcha-wallet.db';

let database: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export type DB = SQLite.SQLiteDatabase;

/** Opens (and memoises) the connection, running migrations on first open. */
export function getDatabase(): Promise<DB> {
  if (database) return Promise.resolve(database);
  if (opening) return opening;

  opening = (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync('PRAGMA busy_timeout = 5000;');
    await migrate(db);
    database = db;
    return db;
  })();

  return opening;
}

/** Closes the handle. Only used by tests and the "reset dev state" helper. */
export async function closeDatabase(): Promise<void> {
  if (database) {
    await database.closeAsync();
    database = null;
    opening = null;
  }
}

/** Reads the applied schema version from `PRAGMA user_version`. */
export async function getSchemaVersion(db: DB): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  return row?.user_version ?? 0;
}

/**
 * Applies every migration newer than the stored version.
 * Safe to call repeatedly — already-applied versions are skipped.
 */
export async function migrate(db: DB, log: (message: string) => void = () => {}): Promise<number> {
  const current = await getSchemaVersion(db);
  const pending = pendingMigrations(current);

  for (const migration of pending) {
    log(`migrating → ${migration.name}`);
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    });
  }

  return pending.length ? LATEST_VERSION : current;
}

/* ------------------------------------------------------------------ */
/* Tiny query helpers so screens stay free of SQL boilerplate           */
/* ------------------------------------------------------------------ */

export type SQLInputValue = string | number | null;

export async function queryAll<T>(db: DB, sql: string, params: SQLInputValue[] = []): Promise<T[]> {
  return db.getAllAsync<T>(sql, params);
}

export async function queryOne<T>(db: DB, sql: string, params: SQLInputValue[] = []): Promise<T | null> {
  return db.getFirstAsync<T>(sql, params);
}

export async function execute(db: DB, sql: string, params: SQLInputValue[] = []): Promise<SQLite.SQLiteRunResult> {
  return db.runAsync(sql, params);
}

/** Runs `work` inside a transaction; anything thrown rolls the whole thing back. */
export async function transaction<T>(db: DB, work: () => Promise<T>): Promise<T> {
  let result!: T;
  await db.withTransactionAsync(async () => {
    result = await work();
  });
  return result;
}