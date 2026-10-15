/**
 * History — shell placeholder for Phase 1.
 *
 * Phase 1 adds: grouped-by-day totals, search, the filter sheet, swipe
 * actions, bulk select and the recently-deleted screen.
 */

import { ScreenScaffold } from '../../src/components/ui/ScreenScaffold';
import { EmptyState } from '../../src/components/ui/EmptyState';

export default function HistoryScreen() {
  return (
    <ScreenScaffold title="History">
      <EmptyState
        title="No spending yet"
        message="Every expense you log lands here, grouped by day with a running total."
      />
    </ScreenScaffold>
  );
}