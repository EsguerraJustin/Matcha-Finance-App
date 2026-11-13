/**
 * Regression test for Android back on History's in-scene overlays (extended
 * UAT flaw #16): back used to fall through to the tab navigator while the
 * filter sheet stayed open in the still-mounted History scene, leaving
 * `sheetOverlayStore.open` true — so `GlassTabBar` returned null and the
 * floating tab bar disappeared app-wide until an app restart.
 */

import { resolveOverlayBack } from '../src/lib/backPress';
import { useSheetOverlayStore } from '../src/state/sheetOverlayStore';

describe('resolveOverlayBack', () => {
  it('closes the filter sheet first when the sheet and bulk selection are both up', () => {
    // The sheet renders above the list, so it is the topmost overlay.
    expect(resolveOverlayBack({ sheetOpen: true, selectionCount: 3 })).toBe('close-sheet');
  });

  it('clears bulk selection when no sheet is open', () => {
    expect(resolveOverlayBack({ sheetOpen: false, selectionCount: 1 })).toBe('clear-selection');
  });

  it('lets back fall through to navigation when no overlay is up', () => {
    // Must not consume back on plain History/Home, or the user could never
    // leave the screen.
    expect(resolveOverlayBack({ sheetOpen: false, selectionCount: 0 })).toBe('pass-through');
  });
});

describe('sheetOverlayStore (flaw #16)', () => {
  it('keeps the tab bar visible once the overlay flag is cleared', () => {
    useSheetOverlayStore.getState().setOpen(true);
    expect(useSheetOverlayStore.getState().open).toBe(true);

    // History's back/close handler clears the flag, which is what makes
    // `GlassTabBar` render again.
    useSheetOverlayStore.getState().setOpen(false);
    expect(useSheetOverlayStore.getState().open).toBe(false);
  });
});
