/**
 * `<AmountNumpad />`
 *
 * Round glass keys like the iPhone calculator. Every digit is a centavo, so
 * the amount never needs a decimal key and the system keyboard never opens.
 */

import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Delete } from 'lucide-react-native';

import { GlassSurface } from '../glass/GlassSurface';
import { AppText } from '../ui/AppText';
import { useAppTheme } from '../../hooks/useAppTheme';
import { numpadAppend, numpadBackspace, type NumpadKey } from '../../lib/expenses';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/typography';
import { selectionHaptic } from '../../lib/haptics';

export interface AmountNumpadProps {
  digits: string;
  onChange: (digits: string) => void;
  style?: StyleProp<ViewStyle>;
}

function AmountNumpadImpl({ digits, onChange, style }: AmountNumpadProps) {
  const { solidGlass } = useAppTheme();

  const press = useCallback(
    (key: NumpadKey) => {
      selectionHaptic();
      if (key.kind === 'digit') onChange(numpadAppend(digits, key.value));
      else if (key.kind === 'backspace') onChange(numpadBackspace(digits));
      else onChange('');
    },
    [digits, onChange],
  );

  /** Keys the keypad can render. `blank` reserves the space above the zero. */
type Keycap = { kind: 'digit'; value: string } | { kind: 'backspace' } | { kind: 'blank' };

const layout: readonly Keycap[] = [
  { kind: 'digit', value: '1' },
  { kind: 'digit', value: '2' },
  { kind: 'digit', value: '3' },
  { kind: 'digit', value: '4' },
  { kind: 'digit', value: '5' },
  { kind: 'digit', value: '6' },
  { kind: 'digit', value: '7' },
  { kind: 'digit', value: '8' },
  { kind: 'digit', value: '9' },
  { kind: 'blank' },
  { kind: 'digit', value: '0' },
  { kind: 'backspace' },
];

  return (
    <View style={[styles.grid, style]}>
      {layout.map((key, index) => {
        if (key.kind === 'blank') {
          return (
            <Pressable
              key={`blank-${index}`}
              onPress={() => onChange(`${digits}0`)}
              accessibilityRole="button"
              accessibilityLabel="Double zero"
              style={styles.key}
            >
              <GlassSurface level="low" padding={0} radius={KEY_RADIUS} fill="fill" style={styles.keySurface}>
                <AppText variant="title" color={colors.matcha700}>
                  00
                </AppText>
              </GlassSurface>
            </Pressable>
          );
        }

        if (key.kind === 'backspace') {
          return (
            <Pressable
              key="backspace"
              onPress={() => press(key)}
              onLongPress={() => press({ kind: 'clear' })}
              accessibilityRole="button"
              accessibilityLabel="Delete digit"
              accessibilityHint="Long press to clear the amount"
              style={styles.key}
            >
              <View style={[styles.keySurface, styles.plainKey, { borderColor: solidGlass ? colors.divider : 'transparent' }]}>
                <Delete size={26} strokeWidth={1.75} color={colors.matcha700} />
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={`digit-${key.value}`}
            onPress={() => press(key)}
            accessibilityRole="button"
            accessibilityLabel={`${key.value}`}
            style={({ pressed }) => [styles.key, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
          >
            <GlassSurface level="low" padding={0} radius={KEY_RADIUS} fill="fill" style={styles.keySurface}>
              <AppText variant="title">{key.value}</AppText>
            </GlassSurface>
          </Pressable>
        );
      })}
    </View>
  );
}

const KEY_RADIUS = 999;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  key: {
    // 3 per row with the 8-pt grid: (100% − 2 gaps) / 3
    width: '31.5%',
    aspectRatio: 1.55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySurface: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plainKey: {
    borderRadius: KEY_RADIUS,
    borderWidth: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
});

export const AmountNumpad = memo(AmountNumpadImpl);
export default AmountNumpad;