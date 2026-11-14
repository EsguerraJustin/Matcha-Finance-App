/**
 * `<GlassDatePickerField />` — a tappable date row that opens the native
 * date picker instead of asking the user to type `YYYY-MM-DD`.
 *
 * Keeps the same `YYYY-MM-DD` string contract as the text inputs it
 * replaces, so validation and storage are untouched. Android shows the
 * Material calendar dialog; iOS gets the compact inline picker.
 */

import { memo, useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { dateToISO, isoToLocalDate, todayISO } from '../../lib/date';
import { radius, spacing } from '../../../theme/typography';
import { AppText } from './AppText';

export interface GlassDatePickerFieldProps {
  label?: string;
  /** `YYYY-MM-DD`; an empty string means "not picked yet". */
  value: string;
  onChange: (iso: string) => void;
  /** Offer a Clear action so optional dates can be unset again. */
  allowClear?: boolean;
  placeholder?: string;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

function GlassDatePickerFieldImpl({
  label,
  value,
  onChange,
  allowClear = false,
  placeholder = 'Pick a date',
  error,
  hint,
  containerStyle,
  testID,
}: GlassDatePickerFieldProps) {
  const { glass, palette } = useAppTheme();
  const [open, setOpen] = useState(false);

  // Open the picker on the stored date, or on today when nothing is stored.
  const picked = isoToLocalDate(value);
  const pickerDate = picked ?? isoToLocalDate(todayISO()) ?? new Date();

  const handleChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (event.type === 'set' && selected) onChange(dateToISO(selected));
      setOpen(false);
    },
    [onChange],
  );

  const borderColor = error ? palette.dangerText : glass.border;

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      {label ? (
        <AppText variant="footnote" color={palette.textMuted}>
          {label}
        </AppText>
      ) : null}

      <View style={styles.row}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${label ?? 'Date'}: ${value || 'not set'}`}
          style={[
            styles.field,
            {
              backgroundColor: glass.fillStrong,
              borderColor,
              borderWidth: error ? 2 : StyleSheet.hairlineWidth * 2,
            },
          ]}
        >
          <AppText
            variant="body"
            color={value ? palette.text : palette.textMuted}
            numberOfLines={1}
            style={styles.value}
          >
            {value || placeholder}
          </AppText>
          <CalendarDays size={18} strokeWidth={1.75} color={palette.textMuted} />
        </Pressable>

        {allowClear && value ? (
          <Pressable
            onPress={() => onChange('')}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label ?? 'date'}`}
            hitSlop={8}
            style={styles.clear}
          >
            <AppText variant="caption" color={palette.emphasis}>
              Clear
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display={Platform.OS === 'android' ? 'calendar' : 'compact'}
          onChange={handleChange}
        />
      ) : null}

      {error ? (
        <AppText variant="caption" color={palette.dangerText}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color={palette.textMuted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.input,
    paddingHorizontal: 14,
    minHeight: 48,
    paddingVertical: 12,
    gap: spacing.xs,
  },
  value: {
    flexShrink: 1,
  },
  clear: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
});

export const GlassDatePickerField = memo(GlassDatePickerFieldImpl);
export default GlassDatePickerField;
