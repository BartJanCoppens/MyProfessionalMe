// The Slides format (studios plan, Task 3.4) as content. A slide is a studio row [title, bullets, talk-over]: the bullets
// sit between middle dots in one text, the talk-over may hold ⟨next⟩ and ⟨cue⟩ marks. After the rows may come the
// voice-over item (voiceItem.ts). The studio's "Who presents?" says whether the piece is told by the AI voice (every
// slide needs a clip made from its present talk-over) or by captions at a reading pace. What the rows publish as is
// private.slides_content, which this repeats for the preview and for the checks; the seconds are private.slides_seconds.
import type { SlidesContent } from '../types';
import { horizonHours, lengthWords, slideCount } from './horizonItem';
import { ownSeconds } from './narration';
import type { StudioEntry, StudioItem } from './studios';
import { voiceOf } from './voiceItem';
import type { Clip } from './voiceItem';

export const PRESENTER = 'Who presents?', AI_VOICE = 'AI voice', CAPTIONS = 'Captions only';
export const TEMPLATE = 'Template', TEMPLATES = ['Firm template', 'Minimal'];
export const TRANSITIONS = 'Transitions', MOVES = ['Calm', 'Camera flight'];
// A deck plays at most 15 minutes (the design's limit for slides); private.contribution_problems repeats it.
export const SLIDES_MAX_SECONDS = 900;
export const VOICE_ALL = 'Voice every slide in Produce, or choose Captions only in Shape it';
export const NO_VOICE = 'The AI voice is not switched on, so this cannot be sent with AI voice: choose Captions only in Shape it (the browser voice only previews the talk-over)';

const pick = (shape: Record<string, string>, q: string, options: string[]) => (options.includes(shape[q]) ? shape[q] : options[0]);
const rowsOf = (items: readonly StudioEntry[]) => items.filter((i): i is StudioItem => Array.isArray(i));
// A slide's bullets: the text between middle dots, each trimmed, none empty.
export const bulletsOf = (text: string) => text.split(/\s*·\s*/).map((b) => b.trim()).filter(Boolean);
export const wantsVoice = (shape: Record<string, string>) => shape[PRESENTER] === AI_VOICE;

// Each slide's clip, made from the words the slide has now; undefined where it has none.
export function clipsFor(items: readonly StudioEntry[]): (Clip | undefined)[] {
  const voice = voiceOf(items);
  return rowsOf(items).map((r, k) => voice?.clips.find((c) => c.slide === k && c.text.trim() === (r[2] ?? '').trim()));
}
// The clip of every slide; null when some slide has none.
export function boundClips(items: readonly StudioEntry[]): Clip[] | null {
  const clips = clipsFor(items);
  return clips.length && clips.every(Boolean) ? (clips as Clip[]) : null;
}
// The slides with these clips as their one voice-over item after them.
export const withClips = (items: readonly StudioEntry[], clips: Clip[]): StudioEntry[] =>
  [...rowsOf(items), ...(clips.length ? [{ kind: 'voice' as const, clips: clips.slice().sort((a, b) => a.slide - b.slide) }] : [])];
const clipsIn = (items: readonly StudioEntry[], shape: Record<string, string>) => (wantsVoice(shape) ? boundClips(items) : null);

// How long the talk runs: each slide's stored seconds with the AI voice, else its words at the reading pace.
export function slidesSeconds(items: readonly StudioEntry[], shape: Record<string, string>): number {
  const clips = clipsIn(items, shape);
  return Math.round(rowsOf(items).reduce((t, r, k) => t + (clips ? clips[k].seconds : ownSeconds(r[2] ?? '')), 0));
}

// The published content; null while the AI voice is wanted and some slide has no clip.
export function slidesContent(items: readonly StudioEntry[], shape: Record<string, string>): SlidesContent | null {
  const rows = rowsOf(items), clips = clipsIn(items, shape);
  if (!rows.length || (wantsVoice(shape) && !clips)) return null;
  return {
    kind: 'slides', template: pick(shape, TEMPLATE, TEMPLATES), transitions: pick(shape, TRANSITIONS, MOVES), seconds: slidesSeconds(items, shape), made: clips ? 'ai' : 'scripted',
    slides: rows.map((r, k) => ({ title: r[0].trim(), bullets: bulletsOf(r[1]), narration: (r[2] ?? '').trim(), ...(clips && { audio: { path: clips[k].path, seconds: clips[k].seconds, marks: clips[k].marks } }) })),
  };
}

// A talk over the limit, in words; null when it fits.
export function overTime(items: readonly StudioEntry[], shape: Record<string, string>): string | null {
  const s = slidesSeconds(items, shape);
  return s > SLIDES_MAX_SECONDS ? 'The talk runs ' + Math.ceil(s / 60) + ' min, over the ' + SLIDES_MAX_SECONDS / 60 + ' min limit: shorten the talk-over or cut slides' : null;
}

// What still blocks sending after the Draft step: the AI voice wanted but not on every slide (and why it cannot be made now),
// and a talk over the limit.
export function slidesProblems(items: readonly StudioEntry[], shape: Record<string, string>, voiceOn: boolean): string[] {
  const over = overTime(items, shape);
  return [...(wantsVoice(shape) && !boundClips(items) ? [voiceOn ? VOICE_ALL : NO_VOICE] : []), ...(over ? [over] : [])];
}

// How many of the studio's three build steps the output shows done: the talk-over written on every slide, every slide told (the AI
// voice voiced, or captions: nothing to voice), the talk within the limit.
export function slidesBuilt(items: readonly StudioEntry[], shape: Record<string, string>): number {
  const rows = rowsOf(items);
  if (!rows.length || rows.some((r) => !(r[2] ?? '').trim())) return 0;
  return wantsVoice(shape) && !boundClips(items) ? 1 : overTime(items, shape) ? 2 : 3;
}

// "3 slides · 2 min 5 s · counts 0.05 h": what the deck holds and the hours it counts (the one hours helper, horizonHours).
export const slidesLine = (c: { slides: unknown[]; seconds: number }) =>
  slideCount(c.slides.length) + ' · ' + lengthWords(c.seconds) + ' · counts ' + horizonHours(c.seconds) + ' h';
