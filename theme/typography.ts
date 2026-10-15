/**
 * Matcha Wallet — typography scale (brief Section 4.3).
 * Dynamic-Type-like: every size is multiplied by the OS font scale
 * (the app supports up to 130%).
 */

export type TypeStyleName =
  | 'largeTitle'
  | 'title'
  | 'title2'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption';

export const typeScale: Record<TypeStyleName, { fontSize: number; lineHeight: number; fontWeight: '400' | '500' | '600' | '700' | '800' }> = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
};

/** Corner radii from Section 4.3. */
export const radius = {
  card: 24,
  sheet: 32,
  chip: 999,
  button: 999,
  input: 16,
  list: 20,
  control: 12,
} as const;

/** 8-pt grid (Section 4.4). */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

/** Motion tokens — gentle 150–250 ms, spring physics (Section 4.3). */
export const motion = {
  quick: 160,
  base: 220,
  slow: 260,
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
  pressScale: 0.97,
} as const;

export const layout = {
  tabBarHeight: 64,
  tabBarRadius: 32,
  tabBarItemRadius: 999,
  tabBarSideMargin: 16,
  tabBarFloat: 12,
  addButtonSize: 56,
  minTouchTarget: 48,
} as const;