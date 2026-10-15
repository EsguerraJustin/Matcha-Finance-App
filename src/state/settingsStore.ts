/**
 * Settings store (Zustand).
 *
 * Per the brief, Zustand holds **UI state only** — the canonical values live in
 * SQLite and are written through `settingsRepo`. This store is a cache that is
 * hydrated on boot and re-synced after every write.
 */

import { create } from 'zustand';

import { getDatabase } from '../db/client';
import { loadSettings, saveSettings } from '../db/repositories/settingsRepo';
import { DEFAULT_SETTINGS, type SettingsShape } from '../db/settings';
import type { GlassIntensity } from '../../theme/glass';

interface SettingsState extends SettingsShape {
  hydrated: boolean;
  /** Bumped whenever the DB changes, so screens can re-query. */
  revision: number;
  hydrate: () => Promise<void>;
  update: (patch: Partial<SettingsShape>) => Promise<void>;
  setGlassIntensity: (value: GlassIntensity) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,
  revision: 0,

  hydrate: async () => {
    try {
      const db = await getDatabase();
      const settings = await loadSettings(db);
      set({ ...settings, hydrated: true, revision: get().revision + 1 });
    } catch {
      // A corrupt/missing database must not brick the shell — fall back to
      // defaults and let the next launch retry the migration.
      set({ ...DEFAULT_SETTINGS, hydrated: true });
    }
  },

  update: async (patch) => {
    const optimistic = { ...get(), ...patch } as SettingsState;
    set({ ...patch });
    try {
      const db = await getDatabase();
      const saved = await saveSettings(db, patch);
      set({ ...saved, revision: optimistic.revision + 1 });
    } catch {
      set({ ...patch });
    }
  },

  setGlassIntensity: async (value) => {
    await get().update({ glassIntensity: value });
  },
}));

/** Non-hook read for code outside React. */
export function currentSettings(): SettingsShape {
  const { hydrate, update, setGlassIntensity, hydrated, revision, ...settings } = useSettingsStore.getState();
  void hydrate;
  void update;
  void setGlassIntensity;
  void hydrated;
  void revision;
  return settings;
}