// Motion Studio's drawing (studios plan, Task 2.3): an Animated flow is one SVG of 640 × 320 animated with SMIL. Its
// stages build in over the first BUILD_IN_S seconds, then each stage takes the focus at its cue (stageCues), which the
// player's caption follows too. An AI drawing is read strictly (readMotionSvg); without AI the studio builds the scripted
// flow of boxes and arrows here (motionLayout). Every drawing reaches the page only through SafeSvg (sanitizeSvg). The
// drawing is one entry after the stage rows in the contribution's items (isDrawing; private.drawing_ok repeats it).
import { sanitizeSvg } from './sanitizeSvg';

export const SVG_MAX = 60_000;
export const ANIMATED_MAX = 30;
export const ALT_MAX = 2000;
export const BUILD_IN_S = 2.5;
const W = 640, H = 320, MARGIN = 16, GAP = 24, BOX_H = 76, FONT = 13;

// 'layout': the scripted boxes and arrows before they are animated (the first build step); 'ai' and 'scripted' are animated.
export type Made = 'ai' | 'scripted' | 'layout';
export type MotionDrawing = { svg: string; alt: string; made: Made };
export type Stage = { label: string; text: string };
const MADE: Made[] = ['ai', 'scripted', 'layout'];
// Who made it, in words: AI-made output says so (studios rule), and so does scripted output.
export const MADE_LABEL: Record<Made, string> = { ai: 'Made with AI', scripted: 'Scripted · boxes and arrows', layout: 'Not animated yet' };

export const isDrawing = (v: unknown): v is MotionDrawing => {
  const x = v as Record<string, unknown> | null;
  return !!x && typeof x === 'object' && !Array.isArray(x) && typeof x.svg === 'string' && typeof x.alt === 'string' && MADE.includes(x.made as Made);
};
export const drawingOf = (items: readonly unknown[]): MotionDrawing | null => (items.find(isDrawing) as MotionDrawing | undefined) ?? null;

// Horizon's slide colours (--s-*) mapped to this app's tokens, for a light card: the prompt and the scripted flow use them.
export const COLOURS: [role: string, token: string][] = [
  ['accent: the one thing that matters most', 'var(--tc-green, #86BC25)'],
  ['light accent: highlights and accent fills', 'var(--tc-green-300, #c9e39a)'],
  ['secondary accent: supporting marks', 'var(--tc-green-deep, #4c7a10)'],
  ['tinted fill', 'var(--tc-green-200, #eef7dc)'],
  ['faint tinted fill', 'var(--tc-green-100, #f6f9ef)'],
  ['primary text', 'var(--tc-ink, #1a1d18)'],
  ['secondary labels', 'var(--tc-ink-3, #5a6058)'],
  ['rules and outlines', 'var(--tc-line-strong, #b9bfb5)'],
  ['faint rules', 'var(--tc-line-soft, #e1e5dc)'],
  ['card or surface fill', 'var(--tc-surface-raised, #fafbf8)'],
  ['background-coloured cut-outs and text halos', 'var(--tc-surface, #ffffff)'],
];
const [ACCENT, , DEEP, TINT, , INK, , LINE, , SURFACE] = COLOURS.map((c) => c[1]);

// When each stage takes the focus: after the build-in, an equal share of the rest of the length each.
export function stageCues(n: number, seconds: number): number[] {
  const share = Math.max(0, seconds - BUILD_IN_S) / Math.max(1, n);
  return Array.from({ length: n }, (_, k) => BUILD_IN_S + k * share);
}
// The stage in focus at time t (the first during the build-in).
export const stageAt = (n: number, seconds: number, t: number) => Math.max(0, stageCues(n, seconds).filter((c) => c <= t).length - 1);

// The animations that survive the sanitiser, which is what the page will run.
export const animatedCount = (svg: string) => (sanitizeSvg(svg).match(/<(animate|animateTransform|animateMotion|set)\b/g) ?? []).length;

// An AI answer as a drawing: the whole answer is one <svg> of at most SVG_MAX characters that survives the sanitiser and
// moves, with at most ANIMATED_MAX animated elements. Anything else is null.
export function readMotionSvg(raw: string): string | null {
  const svg = raw.trim();
  if (!svg.startsWith('<svg') || svg.length > SVG_MAX || !sanitizeSvg(svg)) return null;
  const n = animatedCount(svg);
  return n >= 1 && n <= ANIMATED_MAX ? svg : null;
}

// What learners who cannot watch read: every stage in order.
export const textAlternative = (stages: Stage[]) =>
  ('An animated flow in ' + stages.length + ' stages. ' + stages.map((s, k) => (k + 1) + '. ' + s.label.trim() + ': ' + s.text.trim()).join(' ')).slice(0, ALT_MAX);

// ---------- the scripted flow ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n2 = (v: number) => v.toFixed(2);
// A label in at most two lines of `chars` characters; what still does not fit ends in an ellipsis.
function lines(label: string, chars: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of label.trim().split(/\s+/)) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= chars) cur += ' ' + w;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  const two = out.slice(0, 2).map((l) => (l.length > chars ? l.slice(0, chars - 1) + '…' : l));
  if (out.length > 2 && !two[1].endsWith('…')) two[1] = two[1].slice(0, chars - 1) + '…';
  return two;
}
const fadeIn = (begin: number) => '<animate attributeName="opacity" from="0" to="1" begin="' + n2(begin) + 's" dur="0.4s" fill="freeze"/>';

// One box per stage in a row, joined by arrows. Animated: the boxes build in one after another within BUILD_IN_S, then
// each stage is ringed in the accent at its cue for its share of the length.
export function motionLayout(stages: Stage[], seconds: number, animated: boolean): string {
  const n = stages.length, w = (W - 2 * MARGIN - (n - 1) * GAP) / Math.max(1, n), y = (H - BOX_H) / 2;
  const chars = Math.max(4, Math.floor((w - 10) / (FONT * 0.58))), cues = stageCues(n, seconds), share = n ? (seconds - BUILD_IN_S) / n : 0;
  const parts = stages.map((s, k) => {
    const x = MARGIN + k * (w + GAP), cx = x + w / 2, ls = lines(s.label, chars), y0 = H / 2 - ((ls.length - 1) * FONT * 1.15) / 2 + FONT * 0.35;
    const text = '<text x="' + n2(cx) + '" y="' + n2(y0) + '" text-anchor="middle" style="font-family:var(--font-sans, sans-serif);font-size:' + FONT + 'px;font-weight:600;fill:' + INK + '">'
      + ls.map((l, i) => (i ? '<tspan x="' + n2(cx) + '" dy="1.15em">' + esc(l) + '</tspan>' : esc(l))).join('') + '</text>';
    const box = '<rect x="' + n2(x) + '" y="' + y + '" width="' + n2(w) + '" height="' + BOX_H + '" rx="8" style="fill:' + (k === n - 1 ? TINT : SURFACE) + ';stroke:' + LINE + ';stroke-width:1.5"/>';
    const ax = x - GAP + 3, arrow = k ? '<path d="M' + n2(ax) + ' ' + H / 2 + 'H' + n2(x - 4) + 'M' + n2(x - 10) + ' ' + (H / 2 - 5) + 'L' + n2(x - 4) + ' ' + H / 2 + 'L' + n2(x - 10) + ' ' + (H / 2 + 5) + '" style="fill:none;stroke:' + DEEP + ';stroke-width:2"/>' : '';
    const ring = animated ? '<rect x="' + n2(x - 3) + '" y="' + (y - 3) + '" width="' + n2(w + 6) + '" height="' + (BOX_H + 6) + '" rx="10" opacity="0" style="fill:none;stroke:' + ACCENT + ';stroke-width:3">'
      + '<set attributeName="opacity" to="1" begin="' + n2(cues[k]) + 's" dur="' + n2(share) + 's"/></rect>' : '';
    return animated ? '<g opacity="0">' + fadeIn((k * (BUILD_IN_S - 0.4)) / Math.max(1, n - 1)) + arrow + box + text + '</g>' + ring : arrow + box + text;
  });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">' + parts.join('') + '</svg>';
}
