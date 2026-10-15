/**
 * Versioned SQL migrations.
 *
 * Each file is a numbered `.sql` script that is applied once, in order, inside
 * a transaction. The applied version lives in SQLite's built-in
 * `PRAGMA user_version`, so upgrades never wipe user data (brief Section 8).
 *
 * The `.sql` files are inlined at build time by `babel-plugin-inline-import`.
 */

import migration001 from './001_init.sql';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: '001_init', sql: migration001 },
];

export const LATEST_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

/** Migrations that still need to run, given the stored version. */
export function pendingMigrations(currentVersion: number): Migration[] {
  return MIGRATIONS.filter((migration) => migration.version > currentVersion).sort((a, b) => a.version - b.version);
}