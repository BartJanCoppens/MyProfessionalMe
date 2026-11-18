// The build-in (studios plan, Task 3.3), copied from Horizon's buildIn.ts unchanged but for this note: at Slide
// animation High a slide's elements appear one after another on arrival, the title first, the rest in an order fixed
// per slide, all within BUILD_TOTAL_S, through the Web Animations API (opacity, a small shift, a scale or a line's
// drawing), so fitted text never reflows. Targets are found by the attributes SlideFace.tsx and SlideObjects.tsx draw.

export const BUILD_TOTAL_S = 2.5;
export const BUILD_STEP_S = 0.4;
const GAP = [0.15, 0.35] as const, HOLD_S = 0.25, FINISH_S = 0.2;

export type BuildKind = 'title' | 'line' | 'visual' | 'shape' | 'stroke' | 'object' | 'tail';
export interface BuildTarget { key: string; el: Element; kind: BuildKind }

/** A small seeded random generator (mulberry32 on a string hash): the same slide gets the same order and gaps. */
function random(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAILS = ['caption', 'foot', 'by'];
/** The order of a slide's elements: `first` (the title, and its parts `first:…`), then `lead:` elements, the rest shuffled by `seed`, then the caption, foot line and who said it. */
export function buildOrder(keys: string[], seed: string, first = 'title'): string[] {
  const head = keys.filter(k => k === first || k.startsWith(first + ':')), leads = keys.filter(k => k.startsWith('lead:'));
  const tails = TAILS.filter(t => keys.includes(t)), rest = keys.filter(k => !head.includes(k) && !leads.includes(k) && !tails.includes(k));
  const rnd = random(seed);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return [...head, ...leads, ...rest, ...tails];
}

/** When each of `n` elements starts, in seconds: gaps of 0.15–0.35 s, fitted (and past the limit grouped) so the last ends by BUILD_TOTAL_S. */
export function buildTimes(n: number, seed: string): number[] {
  if (n <= 0) return [];
  const room = BUILD_TOTAL_S - BUILD_STEP_S, rnd = random(seed + '#t');
  const gaps = Array.from({ length: n - 1 }, () => GAP[0] + rnd() * (GAP[1] - GAP[0])), sum = gaps.reduce((a, b) => a + b, 0);
  if (sum <= room) { const t = [0]; for (const g of gaps) t.push(t[t.length - 1] + g); return t; }
  // Too many for the time: as many steps as fit at the shortest gap, the elements spread over them (some together).
  const steps = Math.floor(room / GAP[0]) + 1;
  if (n <= steps) { const k = room / sum, t = [0]; for (const g of gaps) t.push(t[t.length - 1] + g * k); return t; }
  return Array.from({ length: n }, (_, i) => Math.round(i * (steps - 1) / (n - 1)) * (room / (steps - 1)));
}

/** A slide's elements to build in, in the order they are drawn. */
export function buildTargets(root: HTMLElement): BuildTarget[] {
  const out: BuildTarget[] = [], q = (s: string) => root.querySelector(s);
  const quote = q('[data-build="quote"]');
  const title = quote ?? q('[data-field="title"]');
  if (title) out.push({ key: 'title', el: title, kind: 'title' });
  const mark = q('[data-build="quote-mark"]');
  if (mark) out.push({ key: 'title:mark', el: mark, kind: 'title' });
  root.querySelectorAll('[data-field="body"] [data-line]').forEach((el, k) => { if (!quote?.contains(el)) out.push({ key: 'line:' + k, el, kind: 'line' }); });
  const visual = q('[data-visual]');
  if (visual) out.push({ key: 'visual', el: visual, kind: 'visual' });
  root.querySelectorAll<HTMLElement>('[data-object]').forEach(el => {
    const id = el.dataset.object!, kind = el.dataset.kind, shape = el.dataset.shape, line = el.querySelector('line');
    if (kind === 'shape' && (shape === 'line' || shape === 'arrow') && line) out.push({ key: 'stroke:' + id, el: line, kind: 'stroke' });
    else if (kind === 'shape') out.push({ key: 'shape:' + id, el, kind: 'shape' });
    // Avatars and Calc animations start on arrival by themselves: they appear right after the title.
    else if (kind === 'avatar' || kind === 'animation') out.push({ key: 'lead:' + id, el, kind: 'object' });
    else out.push({ key: 'object:' + id, el, kind: 'object' });
  });
  const by = q('[data-build="by"]'), caption = q('[data-fit-role="caption"]'), foot = q('.hz-refs');
  if (caption) out.push({ key: 'caption', el: caption, kind: 'tail' });
  if (foot) out.push({ key: 'foot', el: foot, kind: 'tail' });
  if (by) out.push({ key: 'by', el: by, kind: 'tail' });
  return out;
}

const running = new WeakMap<HTMLElement, { anims: Animation[]; timers: number[]; held?: boolean; finish?: () => void }>();
const canAnimate = () => typeof Element !== 'undefined' && typeof (Element.prototype as { animate?: unknown }).animate === 'function';
function clear(root: HTMLElement) {
  const r = running.get(root);
  r?.anims.forEach(a => a.cancel());
  r?.timers.forEach(t => clearTimeout(t));
  running.delete(root);
}
const lengthOf = (l: Element) => Math.hypot(+(l.getAttribute('x2') || 0) - +(l.getAttribute('x1') || 0), +(l.getAttribute('y2') || 0) - +(l.getAttribute('y1') || 0)) || 1;

/** How each kind appears: opacity with a small rise, a growing shape, or a line drawing itself. */
function keyframes(t: BuildTarget): Keyframe[] {
  if (t.kind === 'stroke') { const len = lengthOf(t.el); return [{ strokeDasharray: `${len}`, strokeDashoffset: `${len}` }, { strokeDasharray: `${len}`, strokeDashoffset: '0' }]; }
  // The scale property, not transform: a shape's own rotation (its inline transform) stays as it grows.
  if (t.kind === 'shape') return [{ opacity: 0, scale: '.85' }, { opacity: 1, scale: '1' }];
  if (t.kind === 'line') return [{ opacity: 0 }, { opacity: 1 }];
  return [{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }];
}

/** Builds the slide in after its title, which is there from the start (held slides keep it in view) and never moves. `finish()` brings in what is still to come within about 0.2 s; `cancel()` stops it, showing everything. */
export function runBuild(root: HTMLElement, seed: string): { finish(): void; cancel(): void } {
  clear(root);
  if (!canAnimate()) return { finish() {}, cancel() {} };
  const targets = buildTargets(root).filter(t => t.kind !== 'title'), byKey = new Map(targets.map(t => [t.key, t]));
  // The title holds the first moment (0 s); the rest follow it, one gap after another.
  const order = buildOrder(targets.map(t => t.key), seed), times = buildTimes(order.length + 1, seed).slice(1);
  const anims: Animation[] = [], timers: number[] = [];
  order.forEach((key, k) => {
    const t = byKey.get(key)!, delay = times[k] * 1000;
    // When it comes in, in ms: kept on the element for tests and for anyone inspecting a slide.
    t.el.setAttribute('data-build-at', String(Math.round(delay)));
    const a = t.el.animate(keyframes(t), { duration: BUILD_STEP_S * 1000, delay, easing: 'cubic-bezier(0.2,0.7,0.3,1)', fill: 'backwards' });
    anims.push(a);
    // An arrow's head comes when its line is drawn.
    if (t.kind === 'stroke' && t.el.getAttribute('marker-end')) {
      const line = t.el as SVGElement;
      line.style.markerEnd = 'none';
      timers.push(window.setTimeout(() => { line.style.markerEnd = ''; }, delay + BUILD_STEP_S * 1000));
    }
    // A visual or a chart starts its own animation as it appears, not before.
    if (t.kind === 'visual' || t.kind === 'object') {
      timers.push(window.setTimeout(() => t.el.querySelectorAll('svg').forEach(svg => svg.setCurrentTime?.(0)), delay));
    }
  });
  const run = {
    finish() {
      for (const a of anims) {
        const timing = a.effect?.getTiming(), at = Number(a.currentTime) || 0;
        if (timing && at < Number(timing.delay || 0)) { a.effect!.updateTiming({ delay: 0, duration: FINISH_S * 1000 }); a.currentTime = 0; }
      }
      timers.forEach(t => clearTimeout(t));
      root.querySelectorAll<SVGElement>('line').forEach(l => { l.style.markerEnd = ''; });
    },
    cancel() { clear(root); root.querySelectorAll<SVGElement>('line').forEach(l => { l.style.markerEnd = ''; }); }
  };
  running.set(root, { anims, timers, finish: run.finish });
  return run;
}

/** While the camera flies to the slide: everything but the title fades out where it stands and stays out; `instant` for a slide not seen yet (just put on screen), so nothing shows and then goes. */
export function holdBuild(root: HTMLElement, instant = false): void {
  clear(root);
  if (!canAnimate()) return;
  const anims = buildTargets(root).filter(t => t.kind !== 'title').map(t => t.el.animate([{}, { opacity: 0 }], { duration: instant ? 0 : HOLD_S * 1000, fill: 'forwards' }));
  running.set(root, { anims, timers: [], held: true });
}

/** The slide is left (or its level changed): a build under way brings in the rest within about 0.2 s; a held slide fades back in. Nothing stays hidden. */
export function endBuild(root: HTMLElement): void {
  const r = running.get(root);
  if (!r) return;
  if (!r.held) return r.finish?.();
  clear(root);
  if (canAnimate()) buildTargets(root).filter(t => t.kind !== 'title').forEach(t => t.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FINISH_S * 1000 }));
}
