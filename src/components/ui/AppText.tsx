/**
 * Themed `<AppText />` — the typography scale from brief Section 4.3 with
 * tabular-nums money support and automatic OS font scaling (capped at 130 %).
 */

import { memo } from 'react';
import { StyleSheet, Text as RNText, type StyleProp, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, resolveTone } from '../../../theme/colors';
import { typeScale, type TypeStyleName } from '../../../theme/typography';
import { formatMoney, type FormatMoneyOptions } from '../../lib/money';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useSettingsStore } from '../../state/settingsStore';

export interface AppTextProps extends RNTextProps {
  variant?: TypeStyleName;
  color?: string;
  /** Tabular figures — used for every money string. */
  numeric?: boolean;
  center?: boolean;
  style?: StyleProp<TextStyle>;
}

function AppTextImpl({ variant = 'body', color, numeric = false, center = false, style, ...rest }: AppTextProps) {
  const { palette } = useAppTheme();
  const scale = typeScale[variant];

  return (
    <RNText
      {...rest}
      // Dynamic Type is honoured, but capped: past ~130 % the glass layouts
      // stop holding together and readability suffers anyway.
      maxFontSizeMultiplier={1.3}
      style={[
        styles.base,
        {
          fontSize: scale.fontSize,
          lineHeight: scale.lineHeight,
          fontWeight: scale.fontWeight,
          color: color ? resolveTone(color, palette) : palette.text,
          textAlign: center ? 'center' : undefined,
        },
        numeric && styles.numeric,
        style,
      ]}
    />
  );
}

export const AppText = memo(AppTextImpl);

const styles = StyleSheet.create({
  base: {
    color: colors.matcha900,
  },
  numeric: {
    fontVariant: ['tabular-nums'],
  },
});

/**
 * `<MoneyText />` — every peso string in the app goes through here so the
 * symbol, grouping and tabular figures stay consistent.
 */
export interface MoneyTextProps extends Omit<AppTextProps, 'children'> {
  cents: number;
  format?: Omit<FormatMoneyOptions, 'symbol'>;
}

function MoneyTextImpl({ cents, variant = 'headline', format, color, style, ...rest }: MoneyTextProps) {
  const symbol = useSettingsStore((state) => state.currencySymbol);
  return (
    <AppText variant={variant} color={color} numeric style={style} {...rest}>
      {formatMoney(cents, { ...format, symbol })}
    </AppText>
  );
}

export const MoneyText = memo(MoneyTextImpl);

export default AppText;