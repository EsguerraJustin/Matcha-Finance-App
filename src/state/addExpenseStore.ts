/**
 * Add-Expense sheet state (UI state only — the data lives in SQLite).
 *
 * Phase 0 wires the floating orb to a placeholder sheet; Phase 1 replaces the
 * placeholder with the real numpad + chips form.
 */

import { create } from 'zustand';

interface AddExpenseState {
  open: boolean;
  /** `undefined` = create; a row id = edit that expense. */
  editingId?: string;
  show: (editingId?: string) => void;
  hide: () => void;
}

export const useAddExpenseStore = create<AddExpenseState>((set) => ({
  open: false,
  editingId: undefined,
  show: (editingId) => set({ open: true, editingId }),
  hide: () => set({ open: false, editingId: undefined }),
}));

export const openAddExpense = (editingId?: string) => useAddExpenseStore.getState().show(editingId);
export const closeAddExpense = () => useAddExpenseStore.getState().hide();