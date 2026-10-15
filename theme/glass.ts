/**
 * Matcha Wallet — glassmorphism tokens.
 *
 * Exact values from the project brief (Section 4.1). `solidFallback` is used
 * whenever blur is unsupported, the device is low-end, or the user turns on
 * "Reduce transparency" — the app must stay fully readable with zero blur.
 */

export type GlassTint = 'light' | 'dark';

export interface GlassVariant {
  fill: string;
  fillStrong: string;
  fillTintGreen: string;
  border: string;
  borderInner: string;
  shadow: string;
  blur: { low: number; medium: number; high: number };
  tint: GlassTint;
}

export const glass = {
  light: {
    fill: 'rgba(255,255,255,0.55)', // standard cards
    fillStrong: 'rgba(255,255,255,0.72)', // tab bar, sheets, forms, anything text-heavy
    fillTintGreen: 'rgba(127,183,117,0.22)', // hero card, selected states
    border: 'rgba(255,255,255,0.75)', // 1px outer edge
    borderInner: 'rgba(255,255,255,0.35)', // top-edge inner highlight
    shadow: 'rgba(36,59,42,0.10)', // matcha-tinted, never pure black
    blur: { low: 24, medium: 40, high: 60 }, // expo-blur intensity
    tint: 'light',
  } as GlassVariant,
  dark: {
    fill: 'rgba(32,48,38,0.55)',
    fillStrong: 'rgba(32,48,38,0.78)',
    fillTintGreen: 'rgba(127,183,117,0.18)',
    border: 'rgba(255,255,255,0.14)',
    borderInner: 'rgba(255,255,255,0.06)',
    shadow: 'rgba(0,0,0,0.35)',
    blur: { low: 24, medium: 40, high: 60 },
    tint: 'dark',
  } as GlassVariant,
  // Used when blur is unsupported / low-end device / "Reduce transparency" is on
  solidFallback: { light: 'rgba(250,253,247,0.92)', dark: 'rgba(24,36,28,0.94)' },
} as const;

/** App-wide background that sits BEHIND all glass (so the blur has colour to frost). */
export const backdrop = {
  gradient: ['#F5FAF0', '#E4F2D8', '#DDEFE6'], // top-left -> bottom-right
  orbs: [
    { color: '#FFD9C7', opacity: 0.55, size: 260, x: -80, y: 120 }, // peach
    { color: '#E3DAF5', opacity: 0.55, size: 300, x: 220, y: 360 }, // lavender
    { color: '#CFE8F5', opacity: 0.5, size: 280, x: -60, y: 620 }, // sky
    { color: '#FFF3C4', opacity: 0.6, size: 220, x: 200, y: -40 }, // lemon
    { color: '#B8D8A0', opacity: 0.6, size: 320, x: 120, y: 760 }, // matcha
  ],
} as const;

/** How much blur the user picked in Settings. */
export type GlassIntensity = 'low' | 'medium' | 'high';

export const intensityScale: Record<GlassIntensity, number> = {
  low: 0.5,
  medium: 0.8,
  high: 1,
};

/** Resolved tokens a component actually paints with, after fallbacks are applied. */
export interface ResolvedGlass {
  fill: string;
  fillStrong: string;
  fillTintGreen: string;
  border: string;
  borderInner: string;
  shadow: string;
  blurIntensity: number;
  blurEnabled: boolean;
  tint: GlassTint;
}

export function resolveGlass(
  variant: GlassVariant,
  options: { blurSupported: boolean; reduceTransparency: boolean; intensity: GlassIntensity },
): ResolvedGlass {
  const solid = !options.blurSupported || options.reduceTransparency;
  const scale = intensityScale[options.intensity];

  if (solid) {
    const base = glass.solidFallback[variant.tint];
    return {
      fill: base,
      fillStrong: base,
      fillTintGreen: variant.tint === 'light' ? 'rgba(127,183,117,0.20)' : 'rgba(127,183,117,0.16)',
      border: variant.tint === 'light' ? 'rgba(127,183,117,0.28)' : 'rgba(255,255,255,0.14)',
      borderInner: 'rgba(255,255,255,0)',
      shadow: variant.shadow,
      blurIntensity: 0,
      blurEnabled: false,
      tint: variant.tint,
    };
  }

  return {
    fill: variant.fill,
    fillStrong: variant.fillStrong,
    fillTintGreen: variant.fillTintGreen,
    border: variant.border,
    borderInner: variant.borderInner,
    shadow: variant.shadow,
    blurIntensity: Math.round(variant.blur.medium * scale),
    blurEnabled: true,
    tint: variant.tint,
  };
}

export default glass;