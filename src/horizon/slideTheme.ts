// A slide's look (studios plan, Task 3.3), copied from Horizon's themes.ts (slide and canvas themes, slideVars),
// palette.ts (paletteVars: the Nocturne tokens re-hued in OKLCH) and fonts.ts (the five font stacks). Horizon's own
// stylesheet is not part of the player, so its tokens are set here on the player's element: --color-* from the
// presentation's hue (Nocturne's own hue when it has none), --s-* from the slide theme, as pptxExport.ts lookFor does.
// No font is loaded: each stack falls back to the system's fonts (no network).
import type { CSSProperties } from 'react';
import type { Frame, Theme } from './types';

const V = (n: string) => 'var(--color-' + n + ')';
export interface SlideTheme { bg1: string; bg2: string; text: string; muted: string; kicker: string; acc: string; acc2: string; line: string; line2: string; fill: string; hole: string; tint: string; tint2: string; light: string; label: string }
type CanvasTheme = { bg: string };

export const SLIDE: Record<string, SlideTheme> = {
  nocturne: { bg1: V('surface'), bg2: V('bg'), text: V('text'), muted: V('neutral-300'), kicker: V('accent-300'), acc: V('accent'), acc2: V('accent-700'), line: V('neutral-700'), line2: V('neutral-800'), fill: V('surface'), hole: V('bg'), tint: V('accent-800'), tint2: V('accent-900'), light: V('accent-300'), label: V('neutral-400') },
  indigo: { bg1: V('section-glow'), bg2: V('section'), text: V('text'), muted: V('neutral-200'), kicker: V('accent-200'), acc: V('accent-400'), acc2: V('section-ghost'), line: V('section-ghost'), line2: V('section-glow'), fill: V('section'), hole: V('section'), tint: V('accent-800'), tint2: V('section-glow'), light: V('accent-200'), label: V('neutral-300') },
  plum: { bg1: V('accent-800'), bg2: V('accent-900'), text: V('text'), muted: V('accent-200'), kicker: V('accent-300'), acc: V('accent-400'), acc2: V('accent-600'), line: V('accent-700'), line2: V('accent-800'), fill: V('accent-900'), hole: V('accent-900'), tint: V('accent-700'), tint2: V('accent-800'), light: V('accent-200'), label: V('accent-300') },
  paper: { bg1: V('neutral-100'), bg2: V('neutral-200'), text: V('neutral-900'), muted: V('neutral-700'), kicker: V('accent-700'), acc: V('accent-600'), acc2: V('accent-300'), line: V('neutral-400'), line2: V('neutral-300'), fill: V('neutral-100'), hole: V('neutral-100'), tint: V('accent-200'), tint2: V('accent-100'), light: V('accent-700'), label: V('neutral-700') },
};
const CANVAS: Record<string, CanvasTheme> = { night: { bg: V('bg') }, indigo: { bg: V('section') }, graphite: { bg: V('neutral-900') }, dusk: { bg: V('accent-900') } };

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const mix = (a: string, p: number, b: string) => `color-mix(in oklab, ${a} ${p}%, ${b})`;
// hex is #rrggbb (cleanDeck.ts checks it).
function customSlide(hex: string): SlideTheme {
  const L = lum(hex) > 0.4, ink = L ? V('neutral-900') : V('text'), acc = L ? V('accent-600') : V('accent'), hi = L ? V('accent-700') : V('accent-300');
  return { bg1: mix(hex, 88, ink), bg2: hex, text: ink, muted: mix(ink, 75, hex), kicker: hi, acc, acc2: mix(acc, 45, hex), line: mix(ink, 30, hex), line2: mix(ink, 15, hex), fill: mix(hex, 90, ink), hole: hex, tint: mix(acc, 35, hex), tint2: mix(acc, 18, hex), light: hi, label: mix(ink, 60, hex) };
}

const NOCTURNE_HUE = 289;
const STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const ACCENT: [number, number][] = [[0.971, 0.015], [0.930, 0.033], [0.870, 0.065], [0.780, 0.114], [0.679, 0.125], [0.580, 0.125], [0.480, 0.104], [0.380, 0.080], [0.290, 0.047]];
const NEUTRAL: [number, number][] = [[0.971, 0.012], [0.930, 0.019], [0.869, 0.025], [0.779, 0.029], [0.680, 0.030], [0.579, 0.029], [0.480, 0.025], [0.381, 0.019], [0.290, 0.011]];
const ok = (l: number, c: number, h: number) => `oklch(${l} ${c} ${((h % 360) + 360) % 360})`;

// The Nocturne tokens at a hue (Nocturne's own hue when none is set).
export function paletteVars(hue: number | null | undefined): CSSProperties {
  const h = hue ?? NOCTURNE_HUE, n = h - 13, v: Record<string, string> = {
    '--color-bg': ok(0.214, 0.028, n), '--color-surface': ok(0.268, 0.024, n), '--color-text': ok(0.935, 0.005, n),
    '--color-accent': ok(0.660, 0.124, h), '--color-section': ok(0.314, 0.094, n), '--color-section-glow': ok(0.387, 0.115, n), '--color-section-ghost': ok(0.470, 0.109, n),
    '--font-body': FONTS[0].css, '--radius-md': '8px',
  };
  STEPS.forEach((s, i) => { v[`--color-accent-${s}`] = ok(ACCENT[i][0], ACCENT[i][1], h); v[`--color-neutral-${s}`] = ok(NEUTRAL[i][0], NEUTRAL[i][1], n); });
  return v as CSSProperties;
}

function slideVars(t: SlideTheme): CSSProperties {
  return { '--s-bg1': t.bg1, '--s-bg2': t.bg2, '--s-text': t.text, '--s-muted': t.muted, '--s-kicker': t.kicker, '--s-acc': t.acc, '--s-acc2': t.acc2, '--s-line': t.line,
    '--s-line2': t.line2, '--s-fill': t.fill, '--s-hole': t.hole, '--s-tint': t.tint, '--s-tint2': t.tint2, '--s-light': t.light, '--s-label': t.label } as CSSProperties;
}
const slideThemeOf = (t: Theme, k?: string) => { k = k || t.slide; return k === 'custom' ? customSlide(t.slideCustom) : Object.hasOwn(SLIDE, k) ? SLIDE[k] : SLIDE.nocturne; };

// A slide's colours and background: its level's theme, its own slide theme and hue (as Horizon's lookFor).
export function slideLook(theme: Theme, f: Frame): CSSProperties {
  return { ...paletteVars(f.hue ?? theme.hue), ...slideVars(slideThemeOf(theme, f.theme)), background: 'linear-gradient(155deg, var(--s-bg1) 0%, var(--s-bg2) 100%)', color: 'var(--s-text)' };
}
// The space the slides lie in.
export const canvasLook = (theme: Theme): CSSProperties => ({ ...paletteVars(theme.hue), background: theme.canvas === 'custom' ? theme.canvasCustom : (CANVAS[theme.canvas] || CANVAS.night).bg });

export const FONTS = [
  { id: 'inter', css: 'Inter, system-ui, sans-serif' }, { id: 'serif', css: 'Fraunces, Georgia, serif' }, { id: 'grotesk', css: "'Space Grotesk', Inter, sans-serif" },
  { id: 'rounded', css: 'Nunito, Inter, sans-serif' }, { id: 'mono', css: "'JetBrains Mono', ui-monospace, monospace" },
] as const;
export const fontOf = (id?: string) => FONTS.find((f) => f.id === id) || FONTS[0];
// A part's title or body font and size step.
export const textStyle = (f: Frame, which: 'title' | 'body') =>
  ({ font: fontOf(which === 'title' ? f.titleFont : f.bodyFont), scale: (which === 'title' ? f.titleScale : f.bodyScale) || 1 });
