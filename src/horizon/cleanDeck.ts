// A deck from a file made safe to present (studios plan, Task 3.3; Review Focus 6). Horizon's offline.ts (deckOfCopy,
// slidesOf) and objects.ts (cleanFrames, cleanObjects) keep what presenting draws and repair damaged parts; here that
// is an allow-list: every field is rebuilt from what it may hold, so nothing else in the file reaches the page.
//   * Pictures (slides, picture objects, avatar stills, animation posters) only as data: images (PNG, JPEG, GIF, WebP);
//     clips and voices only as data: audio or video. Any other address is dropped: the player makes no network call.
//   * A Horizon Calc animation keeps its name and poster; its program and data are not kept, so they can never run.
//   * Colours only as Horizon's theme inks or #rrggbb, theme keys only from the list, so no style can load anything.
//   * A custom drawing stays text; SafeSvg sanitises it whenever it is drawn.
import { HORIZON_SLIDES_MAX } from '../logic/horizonItem';
import { isCount, isObject, isText } from '../logic/values';
import { HEX, isInk } from './objects';
import { SLIDE } from './slideTheme';
import type { CaseShot, Deck, Frame, Narrative, Passage, SlideObject, Theme, Viz, VizItem } from './types';

type Raw = Record<string, unknown>;
const text = (v: unknown, max = 5000) => (isText(v) ? v.slice(0, max) : '');
const num = (v: unknown, fallback = 0) => (isCount(v) ? v : fallback);
const opt = <T,>(k: string, v: T | undefined | null | '') => (v === undefined || v === null || v === '' ? {} : { [k]: v });
const oneOf = <T extends string>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? (v as T) : undefined);

const IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]*$/;
const MEDIA = /^data:(audio|video)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]*$/;
export const dataImage = (v: unknown) => (isText(v) && IMAGE.test(v) ? v : undefined);
const dataMedia = (v: unknown) => (isText(v) && MEDIA.test(v) ? v : undefined);
const ink = (v: unknown) => (isInk(v) ? v : undefined);
const hex = (v: unknown, fallback: string) => (isText(v) && HEX.test(v) ? v : fallback);
const hue = (v: unknown) => (isCount(v) ? ((Math.round(v) % 360) + 360) % 360 : undefined);

const PRESETS = ['bars', 'trend', 'flow', 'orbit', 'timeline', 'counter', 'network', 'pyramid', 'tree', 'circles'] as const;
const LAYOUTS = ['auto', 'title', 'statement', 'visualRight', 'visualLeft', 'headline', 'focus', 'columns', 'quote', 'fallback', 'blank'] as const;
const SHAPES = ['rect', 'rounded', 'ellipse', 'triangle', 'diamond', 'star', 'line', 'arrow'] as const;
const KINDS = ['text', 'shape', 'picture', 'chart', 'animation', 'avatar', 'case'] as const;
const MOTIONS = ['high', 'medium', 'low'] as const;
const WORLDS = ['surface', 'globe', 'space', 'panorama'] as const;
const FONTS = ['inter', 'serif', 'grotesk', 'rounded', 'mono'] as const;

function vizOf(v: unknown): Viz | null {
  if (!isObject(v)) return null;
  const type = v.type === 'custom' ? 'custom' : oneOf(v.type, PRESETS);
  if (!type) return null;
  const items: VizItem[] = (Array.isArray(v.items) ? v.items : []).filter(isObject).slice(0, 12).map((it) => ({
    label: text(it.label, 300), ...opt('value', isCount(it.value) ? it.value : undefined), ...opt('note', text(it.note, 300)),
    ...(Array.isArray(it.more) ? { more: it.more.slice(0, 3).map((x) => (isCount(x) ? x : null)) } : {}) }));
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

function objectsOf(f: Raw): SlideObject[] {
  const list = (f.objects as unknown[]).filter(isObject);
  if (list.length > OBJECTS_PER_SLIDE_MAX) throw new Error('The slide “' + (text(f.title, 40) || text(f.id, 40)) + '” has more than ' + OBJECTS_PER_SLIDE_MAX + ' objects · simplify it in Horizon');
  return list.map(objectOf).filter((o): o is SlideObject => !!o);
}

function objectOf(o: Raw): SlideObject | null {
  const kind = oneOf(o.kind, KINDS);
  if (!kind || !isText(o.id)) return null;
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
    const a = isObject(o.avatar) ? o.avatar : null, clip = a && isObject(a.clip) && isText(a.clip.media) ? a.clip : null;
    if (!a) return null;
    const name = text(isObject(a.look) ? a.look.name : '', 100) || 'Avatar', speaks = a.speaks === 'cue' ? 'cue' : 'arrival';
    // A conversation needs Horizon's live service: kept as a placeholder that says so, never run.
    if (a.mode === 'live') return { ...base, avatar: { name, speaks, live: true } };
    return { ...base, avatar: { name, speaks, ...opt('still', dataImage(a.still)), ...(clip ? { clip: { media: text(clip.media, 200), seconds: num(clip.seconds) } } : {}) } };
  }
  return base;
}

export function themeOf(t: unknown): Theme {
  const r = isObject(t) ? t : {};
  return { canvas: isText(r.canvas) && ['night', 'indigo', 'graphite', 'dusk', 'custom'].includes(r.canvas) ? r.canvas : 'night', canvasCustom: hex(r.canvasCustom, '#1c2a36'),
    slide: isText(r.slide) && (Object.hasOwn(SLIDE, r.slide) || r.slide === 'custom') ? r.slide : 'nocturne', slideCustom: hex(r.slideCustom, '#2f2747'),
    ...opt('hue', hue(r.hue)), ...opt('slideMotion', oneOf(r.slideMotion, MOTIONS)), ...opt('worldMotion', oneOf(r.worldMotion, MOTIONS)),
    ...opt('world', oneOf(r.world, WORLDS)), ...opt('transition', oneOf(r.transition, ['fly', 'fall'] as const)) };
}

export const SECTION_DEPTH_MAX = 3, OBJECTS_PER_SLIDE_MAX = 100;

// depth: how many sections deep this list lies; budget: slides still allowed in the whole file (shared down the sections).
function sectionOf(list: unknown[], budget: { left: number }, depth: number): Frame[] {
  if (depth >= SECTION_DEPTH_MAX) throw new Error('Sections inside sections go at most ' + SECTION_DEPTH_MAX + ' deep · flatten this presentation in Horizon');
  return framesOf(list, budget, depth + 1);
}

export function framesOf(list: unknown[], budget = { left: HORIZON_SLIDES_MAX }, depth = 0): Frame[] {
  const F = list.filter(isObject).filter((f) => isText(f.id) && f.id);
  budget.left -= F.length;
  if (budget.left < 0) throw new Error('This presentation has more slides than can be added: at most ' + HORIZON_SLIDES_MAX + ' slides');
  const ids = new Set(F.map((f) => f.id as string));
  return F.map((f) => ({
    id: text(f.id, 80), x: num(f.x), y: num(f.y), next: (Array.isArray(f.next) ? f.next : []).filter((n): n is string => isText(n) && ids.has(n)),
    title: text(f.title, 1000), body: text(f.body), viz: vizOf(f.viz), image: dataImage(f.image) ?? null, ...opt('imageAlt', text(f.imageAlt, 300)),
    ...opt('imageBlend', f.imageBlend === true || undefined), ...opt('theme', isText(f.theme) && (Object.hasOwn(SLIDE, f.theme) || f.theme === 'custom') ? f.theme : undefined),
    ...opt('titleFont', oneOf(f.titleFont, FONTS)), ...opt('bodyFont', oneOf(f.bodyFont, FONTS)), ...opt('titleScale', num(f.titleScale) || undefined),
    ...opt('bodyScale', num(f.bodyScale) || undefined), ...opt('layout', oneOf(f.layout, LAYOUTS)), ...opt('tag', text(f.tag, 100)), ...opt('hue', hue(f.hue)),
    ...(Array.isArray(f.objects) ? { objects: objectsOf(f) } : {}),
    ...(isObject(f.section) && Array.isArray(f.section.frames) ? { section: { frames: sectionOf(f.section.frames, budget, depth), theme: themeOf(f.section.theme) } } : {}),
  }));
}

const allIds = (F: Frame[]): string[] => F.flatMap((f) => [f.id, ...(f.section ? allIds(f.section.frames) : [])]);

function passageOf(p: Raw): Passage {
  const a = isObject(p.audio) && isText(p.audio.key) ? p.audio : null;
  const marks = a && Array.isArray(a.marks) ? a.marks.filter(isObject).filter((m) => m.kind === 'next' || m.kind === 'cue').map((m) => ({ kind: m.kind as 'next' | 'cue', at: num(m.at) })) : [];
  return { id: text(p.id, 80), part: text(p.part, 80), text: text(p.text), ...(a ? { audio: { key: text(a.key, 200), seconds: num(a.seconds), marks } } : {}) };
}

export function narrativesOf(store: unknown, frames: Frame[]): Narrative[] {
  const parts = new Set(allIds(frames)), items = isObject(store) && Array.isArray(store.items) ? store.items.filter(isObject) : [];
  return items.map((n) => ({ id: text(n.id, 80), name: text(n.name, 200) || 'Narration', ...opt('pace', num(n.pace) > 0 ? num(n.pace) : undefined),
    passages: (Array.isArray(n.passages) ? n.passages.filter(isObject) : []).map(passageOf).filter((p) => parts.has(p.part)) }));
}

// Clips and voices by key. A null-prototype object: a key such as `constructor` or `toString` is not found unless the file has it.
export function mediaOf(m: unknown): Record<string, string> {
  const media: Record<string, string> = Object.create(null);
  for (const [k, v] of Object.entries(isObject(m) ? m : {})) { const url = dataMedia(v); if (url) media[k] = url; }
  return media;
}

function checkIds(F: Frame[]) {
  const seen = new Set<string>();
  for (const id of allIds(F)) {
    if (seen.has(id)) throw new Error('Two slides share the id “' + id + '” · save the presentation again in Horizon');
    seen.add(id);
  }
}

// Horizon draws a world (globe, space, panorama), a falling change of slide and Fall back's standing stage in 3D; here all are flat.
const standsFlat = (t: Theme) => (!!t.world && t.world !== 'surface') || t.transition === 'fall';
const isFlat = (theme: Theme, F: Frame[]): boolean => standsFlat(theme) || F.some((f) => f.layout === 'fallback' || (!!f.section && (standsFlat(f.section.theme) || isFlat(f.section.theme, f.section.frames))));

// The deck to present from the file's parsed JSON (already checked to be a Horizon presentation).
export function cleanDeck(d: Raw): Deck {
  const frames = framesOf(Array.isArray(d.frames) ? d.frames : []), theme = themeOf(d.theme);
  checkIds(frames);
  return { title: text(d.title, 200).trim() || 'Presentation', theme, frames, narratives: narrativesOf(d.narratives, frames), media: mediaOf(d.media), flat: isFlat(theme, frames) };
}
