/**
 * `<ChipRow />` — a horizontally scrolling row of `<GlassChip />`.
 *
 * Used for category chips, type chips, payment chips and date chips on the
 * Add sheet. Chips are tinted with the category pastel at ~60 % over glass.
 */

import { memo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GlassChip } from '../glass/GlassChip';
import { spacing } from '../../../theme/typography';

export interface ChipRowItem {
  id: string;
  label: string;
  tint?: string;
  icon?: ReactNode;
}

export interface ChipRowProps {
  items: readonly ChipRowItem[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  size?: 'small' | 'regular';
  /** Wraps onto multiple lines instead of scrolling (settings lists). */
  wrap?: boolean;
  testID?: string;
}

function ChipRowImpl({
  items,
  selectedIds,
  onToggle,
  size = 'regular',
  wrap = false,
  testID,
}: ChipRowProps) {
  const chips = items.map((item) => (
    <GlassChip
      key={item.id}
      label={item.label}
      tint={item.tint}
      icon={item.icon}
      size={size}
      selected={selectedIds.includes(item.id)}
      onPress={() => onToggle(item.id)}
    />
  ));

  if (wrap) {
    return (
      <View style={styles.wrapRow} testID={testID}>
        {chips}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scrollContent}
      testID={testID}
      // Chip rows are short; a fixed height stops the sheet from jumping.
      style={styles.scroll}
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: spacing.xs,
    paddingRight: spacing.lg,
    paddingVertical: 2,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});

export const ChipRow = memo(ChipRowImpl);
export default ChipRow;