// A Presentation's one item (studios plan, Task 3.3): the summary the browser reads from a .horizon file before it is
// stored (src/horizon/readDeck.ts), and where the file is. The same object is published as the learning's content.
// Mirrored by private.horizon_ok in supabase/migrations/20261117290000_horizon_presentations.sql (horizonItem.test.ts
// compares the limits).
import { MEDIA_PATH } from './mediaFiles';

export type HorizonItem = { kind: 'horizon'; path: string; title: string; slides: number; seconds: number };

export const HORIZON_TITLE_MAX = 200;
export const HORIZON_SLIDES_MAX = 1000;
export const HORIZON_SECONDS_MAX = 36000;
const KEYS = ['kind', 'path', 'title', 'slides', 'seconds'];

export function isHorizonItem(v: unknown): v is HorizonItem {
  const x = v as Record<string, unknown> | null;
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const keys = Object.keys(x);
  return keys.length === KEYS.length && KEYS.every((k) => keys.includes(k)) && x.kind === 'horizon'
    && typeof x.path === 'string' && MEDIA_PATH.test(x.path) && x.path.endsWith('.horizon')
    && typeof x.title === 'string' && x.title.trim() !== '' && x.title.length <= HORIZON_TITLE_MAX
    && Number.isInteger(x.slides) && (x.slides as number) >= 1 && (x.slides as number) <= HORIZON_SLIDES_MAX
    && typeof x.seconds === 'number' && Number.isFinite(x.seconds) && x.seconds >= 0 && x.seconds <= HORIZON_SECONDS_MAX;
}

// The hours a published Presentation counts: its narration length rounded up to 0.05 h (at least 0.05 h), 0.25 h when it
// has no narration. A default awaiting the owner (docs/decisions.md). Mirrored by private.horizon_hours.
export const horizonHours = (seconds: number) => (seconds > 0 ? Math.round(Math.max(1, Math.ceil(seconds / 180)) * 5) / 100 : 0.25);

// "2 min 5 s", "40 s": a narration's length in words.
export const lengthWords = (seconds: number) => {
  const s = Math.round(seconds), m = Math.floor(s / 60);
  return m ? m + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : '') : s + ' s';
};
// "3 slides", "1 slide · narrated, 2 min 5 s": what the deck holds, for reviewers and the library.
export const deckLine = (x: { slides: number; seconds: number }) =>
  x.slides + (x.slides === 1 ? ' slide' : ' slides') + (x.seconds > 0 ? ' · narrated, ' + lengthWords(x.seconds) : '');
