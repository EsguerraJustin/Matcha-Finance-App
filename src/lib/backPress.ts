/**
 * Android hardware-back decisions for History's in-scene overlays.
 *
 * The floating tab bar hides itself while `sheetOverlayStore.open` is true
 * (flaws #13/#14), and History owns that flag for its filter sheet and bulk
 * selection. Android back used to fall through to the tab navigator: it
 * switched tabs while the overlay stayed open in the still-mounted History
 * scene, so the flag stayed true and the tab bar disappeared app-wide until
 * an app restart (flaw #16). Back must close the topmost overlay instead,
 * and only fall through to navigation when no overlay is up.
 */

export type OverlayBackAction = 'close-sheet' | 'clear-selection' | 'pass-through';

export interface OverlayBackState {
  /** True while the History filter sheet is open. */
  sheetOpen: boolean;
  /** Expenses in bulk selection (0 = not selecting). */
  selectionCount: number;
}

/**
 * Decide what Android back should do given the current overlays.
 *
 * Precedence matters: the filter sheet renders above the list, so it closes
 * first; bulk selection clears next; only then may back reach navigation.
 */
export function resolveOverlayBack(state: OverlayBackState): OverlayBackAction {
  if (state.sheetOpen) return 'close-sheet';
  if (state.selectionCount > 0) return 'clear-selection';
  return 'pass-through';
}
