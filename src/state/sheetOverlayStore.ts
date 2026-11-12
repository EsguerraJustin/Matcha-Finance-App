/**
 * In-scene sheet overlay state (UI only — no data).
 *
 * `BottomTabView` renders the floating tab bar **after** the screen scenes, so
 * the bar (and its Add orb, Android elevation 6/8) draws above anything mounted
 * inside a tab screen. Two in-scene overlays collide with it: the History
 * filter sheet's Apply/Reset row and the bulk action bar's Delete button both
 * land inside the bar's dead zone — taps there switched tabs instead of
 * pressing the button. Root-route sheets (Add expense) never had this problem
 * because they push above the whole tab shell.
 *
 * While a scene-local overlay is open/visible we hide the tab bar entirely —
 * standard modal behaviour, and it keeps a sheet backdrop's tap-to-dismiss
 * region live too.
 */

import { create } from 'zustand';

interface SheetOverlayState {
  /** True while a sheet rendered inside a tab scene covers the tab bar. */
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useSheetOverlayStore = create<SheetOverlayState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
