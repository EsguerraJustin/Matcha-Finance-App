/**
 * Database revision counter.
 *
 * SQLite is the single source of truth. Because `expo-sqlite` has no live
 * query API in this setup, every write bumps a counter and the query hooks
 * below re-run. That keeps Zustand purely a UI-state store (brief Section 3)
 * while still giving screens automatic refreshes.
 */

import { useEffect, useState } from 'react';
import { create } from 'zustand';

import { getDatabase, type DB } from '../db/client';

interface DbState {
  revision: number;
  bump: () => void;
}

export const useDbStore = create<DbState>((set) => ({
  revision: 0,
  bump: () => set((state) => ({ revision: state.revision + 1 })),
}));

/** Call after any write so every mounted query re-runs. */
export function notifyDbChanged(): void {
  useDbStore.getState().bump();
}

/** Resolves the connection once per mount. */
export function useDb(): DB | null {
  const [db, setDb] = useState<DB | null>(null);

  useEffect(() => {
    let alive = true;
    getDatabase()
      .then((handle) => {
        if (alive) setDb(handle);
      })
      .catch(() => {
        // The root layout surfaces the failure; screens stay empty rather than
        // crashing on a null connection.
      });
    return () => {
      alive = false;
    };
  }, []);

  return db;
}

export interface QueryResult<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  db: DB | null;
  reload: () => void;
}

/**
 * Runs a SQLite query and re-runs it whenever `deps` change or any write
 * bumps the revision. `query` must be pure with respect to its arguments.
 */
export function useDbQuery<T>(
  query: (db: DB) => Promise<T>,
  deps: readonly unknown[],
  initial: T,
): QueryResult<T> {
  const db = useDb();
  const revision = useDbStore((state) => state.revision);
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [localReload, setLocalReload] = useState(0);

  const depKey = deps.map((dep) => String(dep)).join('|');

  useEffect(() => {
    if (!db) return;
    let alive = true;
    setLoading(true);

    query(db)
      .then((result) => {
        if (!alive) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, revision, localReload, depKey]);

  return { data, loading, error, db, reload: () => setLocalReload((value) => value + 1) };
}