/**
 * `<GlassInput />` — a text field on `fillStrong` glass.
 *
 * Never places a `BlurView` inside another blurred surface (brief Section 4.2
 * rule: no glass inside glass); this uses a plain translucent fill instead.
 */

import React, { forwardRef, memo, useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { radius, typeScale } from '../../../theme/typography';
import { AppText } from './AppText';

export interface GlassInputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

function GlassInputImpl(
  { label, error, hint, containerStyle, style, onFocus, onBlur, ...rest }: GlassInputProps,
  ref: React.ForwardedRef<TextInput>,
) {
  const { glass, palette } = useAppTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? palette.dangerText : focused ? palette.primary : glass.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <AppText variant="footnote" color={palette.textMuted}>
          {label}
        </AppText>
      ) : null}

      <View
        style={[
          styles.field,
          {
            backgroundColor: glass.fillStrong,
            borderColor,
            borderWidth: focused ? 2 : StyleSheet.hairlineWidth * 2,
          },
        ]}
      >
        <TextInput
          ref={ref}
          {...rest}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          placeholderTextColor={palette.textMuted}
          selectionColor={palette.primary}
          maxFontSizeMultiplier={1.3}
          style={[styles.input, { color: palette.text }, style]}
        />
      </View>

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
  field: {
    borderRadius: radius.input,
    paddingHorizontal: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  input: {
    fontSize: typeScale.body.fontSize,
    paddingVertical: 12,
  },
});

export const GlassInput = memo(forwardRef(GlassInputImpl));
export default GlassInput;