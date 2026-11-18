// The Slides format (studios plan, Task 3.4) as content. A slide is a studio row [title, bullets, talk-over]: the bullets
// sit between middle dots in one text, the talk-over may hold ⟨next⟩ and ⟨cue⟩ marks. After the rows may come the
// voice-over item (voiceItem.ts). The studio's "Who presents?" says whether the piece is told by the AI voice (every
// slide needs a clip made from its present talk-over) or by captions at a reading pace. What the rows publish as is
// private.slides_content, which this repeats for the preview and for the checks; the seconds are private.slides_seconds.
import type { SlidesContent } from '../types';
import { horizonHours, lengthWords } from './horizonItem';
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

// The clip of every slide, made from the words the slide has now; null when some slide has none.
export function boundClips(items: readonly StudioEntry[]): Clip[] | null {
  const rows = rowsOf(items), voice = voiceOf(items);
  const clips = rows.map((r, k) => voice?.clips.find((c) => c.slide === k && c.text.trim() === (r[2] ?? '').trim()));
  return rows.length && clips.every(Boolean) ? (clips as Clip[]) : null;
}
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

// What still blocks sending after the Draft step: the AI voice wanted but not on every slide (and why it cannot be made now),
// and a talk over the limit.
export function slidesProblems(items: readonly StudioEntry[], shape: Record<string, string>, voiceOn: boolean): string[] {
  const s = slidesSeconds(items, shape);
  return [...(wantsVoice(shape) && !boundClips(items) ? [voiceOn ? VOICE_ALL : NO_VOICE] : []),
    ...(s > SLIDES_MAX_SECONDS ? ['The talk runs ' + Math.ceil(s / 60) + ' min, over the ' + SLIDES_MAX_SECONDS / 60 + ' min limit: shorten the talk-over or cut slides'] : [])];
}

// "3 slides · 2 min 5 s · counts 0.05 h": what the deck holds and the hours it counts (the one hours helper, horizonHours).
export const slidesLine = (c: { slides: unknown[]; seconds: number }) =>
  c.slides.length + (c.slides.length === 1 ? ' slide' : ' slides') + ' · ' + lengthWords(c.seconds) + ' · counts ' + horizonHours(c.seconds) + ' h';
