// A deck from a file made safe to present (studios plan, Task 3.3; Review Focus 6). Horizon's offline.ts (deckOfCopy,
// slidesOf) and objects.ts (cleanFrames, cleanObjects) keep what presenting draws and repair damaged parts; here that
// is an allow-list: every field is rebuilt from what it may hold, so nothing else in the file reaches the page.
//   * Pictures (slides, picture objects, avatar stills, animation posters) only as data: images (PNG, JPEG, GIF, WebP);
//     clips and voices only as data: audio or video. Any other address is dropped: the player makes no network call.
//   * A Horizon Calc animation keeps its name and poster; its program and data are not kept, so they can never run.
//   * Colours only as Horizon's theme inks or #rrggbb, theme keys only from the list, so no style can load anything.
//   * A custom drawing stays text; SafeSvg sanitises it whenever it is drawn.
import { SLIDE } from './slideTheme';
import type { CaseShot, Deck, Frame, Narrative, Passage, SlideObject, Theme, Viz, VizItem } from './types';

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const opt = <T,>(k: string, v: T | undefined | null | '') => (v === undefined || v === null || v === '' ? {} : { [k]: v });
const oneOf = <T extends string>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? (v as T) : undefined);

const IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]*$/;
const MEDIA = /^data:(audio|video)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]*$/;
export const dataImage = (v: unknown) => (typeof v === 'string' && IMAGE.test(v) ? v : undefined);
const dataMedia = (v: unknown) => (typeof v === 'string' && MEDIA.test(v) ? v : undefined);
const HEX = /^#[0-9a-f]{6}$/i;
const INKS = ['accent', 'accent2', 'light', 'tint', 'text', 'muted', 'surface', 'none'] as const;
const ink = (v: unknown) => (typeof v === 'string' && (HEX.test(v) || (INKS as readonly string[]).includes(v)) ? (v as SlideObject['color']) : undefined);
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback);
const hue = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? ((Math.round(v) % 360) + 360) % 360 : undefined);

const PRESETS = ['bars', 'trend', 'flow', 'orbit', 'timeline', 'counter', 'network', 'pyramid', 'tree', 'circles'] as const;
const LAYOUTS = ['auto', 'title', 'statement', 'visualRight', 'visualLeft', 'headline', 'focus', 'columns', 'quote', 'fallback', 'blank'] as const;
const SHAPES = ['rect', 'rounded', 'ellipse', 'triangle', 'diamond', 'star', 'line', 'arrow'] as const;
const KINDS = ['text', 'shape', 'picture', 'chart', 'animation', 'avatar', 'case'] as const;
const MOTIONS = ['high', 'medium', 'low'] as const;
const FONTS = ['inter', 'serif', 'grotesk', 'rounded', 'mono'] as const;

function vizOf(v: unknown): Viz | null {
  if (!isObject(v)) return null;
  const type = v.type === 'custom' ? 'custom' : oneOf(v.type, PRESETS);
  if (!type) return null;
  const items: VizItem[] = (Array.isArray(v.items) ? v.items : []).filter(isObject).slice(0, 12).map((it) => ({
    label: text(it.label, 300), ...opt('value', typeof it.value === 'number' && Number.isFinite(it.value) ? it.value : undefined), ...opt('note', text(it.note, 300)),
    ...(Array.isArray(it.more) ? { more: it.more.slice(0, 3).map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)) } : {}) }));
  const series = Array.isArray(v.series) ? v.series.slice(0, 4).map((s) => text(s, 100)) : [];
  return { type, items, ...opt('center', text(v.center, 100)), ...opt('suffix', text(v.suffix, 20)), ...(series.length > 1 ? { series } : {}),
    ...(type === 'custom' ? opt('svg', text(v.svg, 200000)) : {}) };
}

function caseOf(c: unknown): CaseShot | undefined {
  if (!isObject(c)) return undefined;
  const s = isObject(c.shot) ? c.shot : {}, list = (v: unknown, pick: (x: unknown) => string) => (Array.isArray(v) ? v.slice(0, 12).map(pick).filter(Boolean) : []);
  return { title: text(c.title, 200), label: text(s.label, 300), facts: list(s.facts, (x) => text(x, 300)), notes: list(s.notes, (x) => text(x, 300)),
    answers: list(s.answers, (x) => (isObject(x) ? text(x.text, 600) : '')) };
}

function objectOf(o: Raw): SlideObject | null {
  const kind = oneOf(o.kind, KINDS);
  if (!kind || typeof o.id !== 'string') return null;
  const base: SlideObject = { id: text(o.id, 80), kind, x: num(o.x), y: num(o.y), w: Math.max(0, num(o.w)), h: Math.max(0, num(o.h)), ...opt('rotate', num(o.rotate) || undefined),
    ...opt('text', text(o.text)), ...opt('size', num(o.size) || undefined), ...opt('bold', o.bold === true || undefined), ...opt('align', oneOf(o.align, ['left', 'center', 'right'] as const)),
    ...opt('font', oneOf(o.font, FONTS)), ...opt('color', ink(o.color)), ...opt('shape', oneOf(o.shape, SHAPES)), ...opt('flipX', o.flipX === true || undefined),
    ...opt('flipY', o.flipY === true || undefined), ...opt('fill', ink(o.fill)), ...opt('line', ink(o.line)), ...opt('weight', num(o.weight) || undefined) };
  if (kind === 'picture') return { ...base, ...opt('image', dataImage(o.image)), ...opt('alt', text(o.alt, 300)) };
  if (kind === 'chart') { const viz = vizOf(o.viz); return viz ? { ...base, viz } : null; }
  if (kind === 'case') { const c = caseOf(o.case); return c ? { ...base, case: c } : null; }
  if (kind === 'animation') {
    const a = isObject(o.animation) ? o.animation : null, poster = a && dataImage(a.poster);
    return poster ? { ...base, animation: { name: text(a.name, 200) || 'Animation', poster } } : null;
  }
  if (kind === 'avatar') {
    const a = isObject(o.avatar) ? o.avatar : null, clip = a && isObject(a.clip) && typeof a.clip.media === 'string' ? a.clip : null;
    if (!a || a.mode === 'live') return null; // a conversation needs Horizon's live service: not in the player
    return { ...base, avatar: { name: text(isObject(a.look) ? a.look.name : '', 100) || 'Avatar', speaks: a.speaks === 'cue' ? 'cue' : 'arrival', ...opt('still', dataImage(a.still)),
      ...(clip ? { clip: { media: text(clip.media, 200), seconds: num(clip.seconds) } } : {}) } };
  }
  return base;
}

export function themeOf(t: unknown): Theme {
  const r = isObject(t) ? t : {};
  return { canvas: typeof r.canvas === 'string' && ['night', 'indigo', 'graphite', 'dusk', 'custom'].includes(r.canvas) ? r.canvas : 'night', canvasCustom: hex(r.canvasCustom, '#1c2a36'),
    slide: typeof r.slide === 'string' && (r.slide in SLIDE || r.slide === 'custom') ? r.slide : 'nocturne', slideCustom: hex(r.slideCustom, '#2f2747'),
    ...opt('hue', hue(r.hue)), ...opt('slideMotion', oneOf(r.slideMotion, MOTIONS)), ...opt('worldMotion', oneOf(r.worldMotion, MOTIONS)) };
}

export function framesOf(list: unknown[]): Frame[] {
  const F = list.filter(isObject).filter((f) => typeof f.id === 'string' && f.id);
  const ids = new Set(F.map((f) => f.id as string));
  return F.map((f) => ({
    id: text(f.id, 80), x: num(f.x), y: num(f.y), next: (Array.isArray(f.next) ? f.next : []).filter((n): n is string => typeof n === 'string' && ids.has(n)),
    title: text(f.title, 1000), body: text(f.body), viz: vizOf(f.viz), image: dataImage(f.image) ?? null, ...opt('imageAlt', text(f.imageAlt, 300)),
    ...opt('imageBlend', f.imageBlend === true || undefined), ...opt('theme', typeof f.theme === 'string' && (f.theme in SLIDE || f.theme === 'custom') ? f.theme : undefined),
    ...opt('titleFont', oneOf(f.titleFont, FONTS)), ...opt('bodyFont', oneOf(f.bodyFont, FONTS)), ...opt('titleScale', num(f.titleScale) || undefined),
    ...opt('bodyScale', num(f.bodyScale) || undefined), ...opt('layout', oneOf(f.layout, LAYOUTS)), ...opt('tag', text(f.tag, 100)), ...opt('hue', hue(f.hue)),
    ...(Array.isArray(f.objects) ? { objects: f.objects.filter(isObject).map(objectOf).filter((o): o is SlideObject => !!o) } : {}),
    ...(isObject(f.section) && Array.isArray(f.section.frames) ? { section: { frames: framesOf(f.section.frames), theme: themeOf(f.section.theme) } } : {}),
  }));
}

const allIds = (F: Frame[]): string[] => F.flatMap((f) => [f.id, ...(f.section ? allIds(f.section.frames) : [])]);

function passageOf(p: Raw): Passage {
  const a = isObject(p.audio) && typeof p.audio.key === 'string' ? p.audio : null;
  const marks = a && Array.isArray(a.marks) ? a.marks.filter(isObject).filter((m) => m.kind === 'next' || m.kind === 'cue').map((m) => ({ kind: m.kind as 'next' | 'cue', at: num(m.at) })) : [];
  return { id: text(p.id, 80), part: text(p.part, 80), text: text(p.text), ...(a ? { audio: { key: text(a.key, 200), seconds: num(a.seconds), marks } } : {}) };
}

export function narrativesOf(store: unknown, frames: Frame[]): Narrative[] {
  const parts = new Set(allIds(frames)), items = isObject(store) && Array.isArray(store.items) ? store.items.filter(isObject) : [];
  return items.map((n) => ({ id: text(n.id, 80), name: text(n.name, 200) || 'Narration', ...opt('pace', num(n.pace) > 0 ? num(n.pace) : undefined),
    passages: (Array.isArray(n.passages) ? n.passages.filter(isObject) : []).map(passageOf).filter((p) => parts.has(p.part)) }));
}

export function mediaOf(m: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(isObject(m) ? m : {}).flatMap(([k, v]) => (dataMedia(v) ? [[k, v as string]] : [])));
}

// The deck to present from the file's parsed JSON (already checked to be a Horizon presentation).
export function cleanDeck(d: Raw): Deck {
  const frames = framesOf(Array.isArray(d.frames) ? d.frames : []);
  return { title: text(d.title, 200).trim() || 'Presentation', theme: themeOf(d.theme), frames, narratives: narrativesOf(d.narratives, frames), media: mediaOf(d.media) };
}
