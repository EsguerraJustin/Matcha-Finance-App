/**
 * Matcha Wallet — colour tokens.
 *
 * The values in this file are the exact tokens from the project brief
 * (Section 4.1). Do not hard-code colours anywhere outside `theme/` —
 * every screen pulls its palette from here.
 */

export const colors = {
  // Matcha (main brand, light-to-dark)
  matcha50: '#F5FAF0', // app background
  matcha100: '#E8F3DD', // card tint, selected chip
  matcha200: '#D3E8C0', // subtle borders, progress track
  matcha300: '#B8D8A0', // hover/pressed tint
  matcha400: '#9CC882', // secondary buttons, icons
  matcha500: '#7FB775', // PRIMARY (buttons, FAB, active tab, progress)
  matcha600: '#5F9B5B', // pressed primary
  matcha700: '#467A45', // links, emphasis
  matcha900: '#243B2A', // main text, text on primary buttons

  // Neutrals (warm, slightly green)
  surface: '#FFFFFF',
  surfaceAlt: '#FBFDF8',
  textMuted: '#6B7F6E',
  divider: '#E4EEDD',

  // Status (pastel, never harsh)
  warningBg: '#FFE9B8',
  warningText: '#7A5200',
  dangerBg: '#F8CFCA',
  dangerText: '#8A2A22',
  successBg: '#D6EFD0',
  successText: '#2F6B34',
  infoBg: '#D5EBF7',
  infoText: '#245B7A',
} as const;

/** Pastel category colours (background chip + icon tint uses matcha900 or darker shade). */
export const categoryColors = {
  Food: '#FFD9C7', // peach
  Transportation: '#CFE8F5', // sky
  Groceries: '#FFF3C4', // lemon
  'School supplies': '#E3DAF5', // lavender
  Shopping: '#FAD4E1', // blush pink
  Bills: '#CDEFE3', // mint
  Others: '#E9E4D8', // oat
} as const;

export type CategoryColorName = keyof typeof categoryColors;

/** Every pastel in one list so charts/pickers can cycle through them. */
export const categoryColorList = Object.values(categoryColors) as readonly string[];

/** Matcha Night backdrop (Phase 6) — deep green-gray. */
export const night = {
  gradient: ['#16211A', '#1E2E24', '#1A2A20'] as const,
  orbs: [
    { color: '#7FB775', opacity: 0.12, size: 280, x: -80, y: 140 },
    { color: '#4E7C8A', opacity: 0.12, size: 300, x: 220, y: 380 },
    { color: '#8A7FB0', opacity: 0.10, size: 280, x: -60, y: 640 },
    { color: '#B8D8A0', opacity: 0.10, size: 320, x: 120, y: 780 },
  ] as const,
};

/** Semantic alias so components never branch on light/dark themselves. */
export interface Palette {
  background: string;
  cardFill: string;
  text: string;
  textMuted: string;
  /** Links, emphasis and secondary icons. */
  emphasis: string;
  divider: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  dangerText: string;
  dangerBg: string;
  successText: string;
  warningText: string;
  /** Soft warning banner background (light amber pastel). */
  warningBg: string;
  isDark: boolean;
}

export const lightPalette: Palette = {
  background: colors.matcha50,
  cardFill: colors.surface,
  text: colors.matcha900,
  textMuted: colors.textMuted,
  emphasis: colors.matcha700,
  divider: colors.divider,
  primary: colors.matcha500,
  primaryPressed: colors.matcha600,
  onPrimary: colors.matcha900,
  dangerText: colors.dangerText,
  dangerBg: colors.dangerBg,
  successText: colors.successText,
  warningText: colors.warningText,
  warningBg: colors.warningBg,
  isDark: false,
};

export const darkPalette: Palette = {
  background: '#16211A',
  cardFill: '#1E2E24',
  text: '#EAF3E6',
  textMuted: '#9DB3A2',
  emphasis: '#B8D8A0',
  divider: 'rgba(255,255,255,0.10)',
  primary: colors.matcha400,
  primaryPressed: colors.matcha500,
  onPrimary: '#16211A',
  dangerText: '#F2B0A8',
  dangerBg: 'rgba(248,207,202,0.18)',
  successText: '#A9D9AE',
  warningText: '#EBCB8B',
  warningBg: 'rgba(255,233,184,0.15)',
  isDark: true,
};

/**
 * Maps a light-theme token onto the matching semantic colour for the active
 * palette. Screens can keep using `colors.*` in props; text and icons rendered
 * through the helpers below stay legible in Matcha Night instead of becoming
 * dark-on-dark.
 */
export function resolveTone(color: string, palette: Palette): string {
  switch (color) {
    case colors.matcha900:
      return palette.text;
    case colors.textMuted:
      return palette.textMuted;
    case colors.matcha700:
      return palette.emphasis;
    case colors.matcha600:
      return palette.isDark ? colors.matcha300 : colors.matcha600;
    case colors.matcha500:
      return palette.primary;
    case colors.surface:
    case colors.surfaceAlt:
      return palette.cardFill;
    case colors.dangerText:
      return palette.dangerText;
    case colors.dangerBg:
      return palette.dangerBg;
    case colors.successText:
      return palette.successText;
    case colors.warningText:
      return palette.warningText;
    case colors.warningBg:
      return palette.warningBg;
    default:
      return color;
  }
}

export default colors;