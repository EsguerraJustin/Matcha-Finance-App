/**
 * Groceries — shell placeholder for Phase 3.
 *
 * Phase 3 adds: lists and templates, the store selector, price memory, live
 * running totals against the remaining budget, and the finish-trip flow.
 */

import { ScreenScaffold } from '../../src/components/ui/ScreenScaffold';
import { EmptyState } from '../../src/components/ui/EmptyState';

export default function GroceriesScreen() {
  return (
    <ScreenScaffold title="Groceries" subtitle="Plan the trip, then log it once">
      <EmptyState
        title="Your list is empty"
        message="Start from Weekly staples, or just add eggs and see the last price pop up."
      />
    </ScreenScaffold>
  );
}