/**
 * Add-Expense sheet host.
 *
 * Rendered once at the root so the floating orb can open it from any tab.
 * Phase 0 ships a placeholder shell; Phase 1 fills in the numpad + chips form.
 */

import { useCallback, useMemo, useRef } from 'react';
import { View } from 'react-native';
import type BottomSheet from '@gorhom/bottom-sheet';

import { GlassSheet } from '../src/components/glass/GlassSheet';
import { EmptyState } from '../src/components/ui/EmptyState';
import { useAddExpenseStore } from '../src/state/addExpenseStore';

export default function AddExpenseSheetRoute() {
  const open = useAddExpenseStore((state) => state.open);
  const hide = useAddExpenseStore((state) => state.hide);
  const editingId = useAddExpenseStore((state) => state.editingId);

  const sheetRef = useRef<BottomSheet>(null);

  const snapPoints = useMemo(() => ['92%'], []);
  const handleChange = useCallback(
    (index: number) => {
      if (index === -1) hide();
    },
    [hide],
  );

  return (
    <View style={{ flex: 1, pointerEvents: open ? 'auto' : 'none' }}>
      <GlassSheet
        ref={sheetRef}
        index={open ? 0 : -1}
        snapPoints={snapPoints}
        onChange={handleChange}
        onClose={hide}
        title={editingId ? 'Edit expense' : 'Add expense'}
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <EmptyState
            compact
            title={editingId ? 'Editing an expense' : 'Add an expense'}
            message="The numpad, category chips and receipt capture arrive in Phase 1."
          />
        </View>
      </GlassSheet>
    </View>
  );
}