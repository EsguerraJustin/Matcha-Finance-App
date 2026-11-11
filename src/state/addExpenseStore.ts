/**
 * Add-Expense sheet state (UI state only — the data lives in SQLite).
 *
 * The sheet is a route (`app/add-expense-sheet.tsx`), so opening it means
 * flipping the flag **and** pushing that route; closing it pops back to
 * whatever screen the user came from. `reset()` clears the flag without
 * navigating — the route calls it on unmount, so an Android back press
 * (which pops the route directly) never leaves the flag stuck open.
 */

import { create } from 'zustand';
import { router } from 'expo-router';

interface AddExpenseState {
  open: boolean;
  /** `undefined` = create; a row id = edit that expense. */
  editingId?: string;
  show: (editingId?: string) => void;
  hide: () => void;
  reset: () => void;
}

export const useAddExpenseStore = create<AddExpenseState>((set, get) => ({
  open: false,
  editingId: undefined,
  show: (editingId) => {
    if (get().open) {
      // Already open (double tap) — re-target the form instead of stacking a
      // second copy of the route.
      set({ editingId });
      return;
    }
    set({ open: true, editingId });
    router.push('/add-expense-sheet');
  },
  hide: () => {
    // `onChange(-1)` and `onClose` can both fire for one dismissal; only the
    // first one may pop, otherwise the screen underneath would go too.
    if (!get().open) return;
    set({ open: false, editingId: undefined });
    if (router.canGoBack()) router.back();
  },
  reset: () => set({ open: false, editingId: undefined }),
}));

export const openAddExpense = (editingId?: string) => useAddExpenseStore.getState().show(editingId);
export const closeAddExpense = () => useAddExpenseStore.getState().hide();
