/**
 * Reports — shell placeholder for Phase 4.
 *
 * Phase 4 adds: the Day/Week/Month/Custom switcher, donut + bar + line charts,
 * the insight sentences, and CSV / PDF export through the OS share sheet.
 */

import { ScreenScaffold } from '../../src/components/ui/ScreenScaffold';
import { EmptyState } from '../../src/components/ui/EmptyState';

export default function ReportsScreen() {
  return (
    <ScreenScaffold title="Reports">
      <EmptyState
        title="Nothing to chart yet"
        message="Once you've logged a few days, your spending story shows up here."
      />
    </ScreenScaffold>
  );
}