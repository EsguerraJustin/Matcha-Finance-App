/**
 * Settings repository — the only place that reads/writes the `settings` table.
 */

import type { DB } from '../client';
import { queryAll, transaction } from '../client';
import { DEFAULT_SETTINGS, deserializeSettings, serializeSettings, type SettingsShape } from '../settings';

export async function loadSettings(db: DB): Promise<SettingsShape> {
  const rows = await queryAll<{ key: string; value: string | null }>(db, 'SELECT key, value FROM settings;');
  const map: Record<string, string | null> = {};
  for (const row of rows) map[row.key] = row.value;
  return deserializeSettings(map);
}

/** Upserts a partial change set in one transaction. */
export async function saveSettings(db: DB, patch: Partial<SettingsShape>): Promise<SettingsShape> {
  const current = await loadSettings(db);
  const next: SettingsShape = { ...current, ...patch };
  const serialized = serializeSettings(next);

  await transaction(db, async () => {
    for (const [key, value] of Object.entries(serialized)) {
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
        [key, value],
      );
    }
  });

  return next;
}

export async function getSetting(db: DB, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM settings WHERE key = ?;', [key]);
  return row?.value ?? null;
}

export async function setSetting(db: DB, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value],
  );
}

export async function getDefaultSettings(db: DB): Promise<SettingsShape> {
  const stored = await loadSettings(db);
  return { ...DEFAULT_SETTINGS, ...stored };
}