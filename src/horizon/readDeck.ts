// Reading a .horizon file (studios plan, Task 3.3; Review Focus 6): refused before it is stored, with a reason, when
// it is not a .horizon file or over 50 MB (deckProblem, from the media rules), not JSON, does not say format
// 'horizon', was made with a newer Horizon than this player reads, or has no slides; otherwise cleaned (cleanDeck.ts)
// and summarised as a Presentation's item: its title, the slides along its route and how long its narration runs.
// Horizon's own reader is offline.ts deckOfCopy; its messages are kept where they fit.
import { sanitizeSvg } from '../logic/sanitizeSvg';
import { mediaKind, mediaProblem } from '../logic/mediaFiles';
import { cleanDeck } from './cleanDeck';
import { deckNarration } from './narrationOf';
import { routeOf } from './route';
import type { Deck } from './types';

// The file version this player reads (Horizon's COPY_VERSION; its files say `version: 1`).
export const HORIZON_VERSION = 1;
const NOT_HORIZON = 'This file does not say it is a Horizon presentation (format: horizon)';

// Why the file cannot be added, from its name and size alone (before it is read), or null.
export function deckProblem(name: string, bytes: number): string | null {
  if (mediaKind(name)?.label !== 'A Horizon presentation') return 'Add a .horizon file made in Horizon';
  return mediaProblem(name, bytes);
}

export function readDeck(text: string): Deck {
  let d: unknown;
  try { d = JSON.parse(text); } catch { throw new Error('This file is not JSON, so it is not a Horizon presentation'); }
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(NOT_HORIZON);
  const r = d as Record<string, unknown>;
  if (r.format !== 'horizon') throw new Error(NOT_HORIZON);
  if (typeof r.version === 'number' && r.version > HORIZON_VERSION) {
    throw new Error('Made with a newer Horizon (file version ' + r.version + ') · this player reads version ' + HORIZON_VERSION);
  }
  const deck = cleanDeck(r);
  if (!routeOf(deck.frames).length) throw new Error('This presentation has no slides');
  return deck;
}

// What a Presentation's item says of the file (src/logic/horizonItem.ts): seconds is 0 without a narration.
export function deckSummary(deck: Deck) {
  return { title: deck.title, slides: routeOf(deck.frames).length, seconds: deckNarration(deck)?.seconds ?? 0 };
}

// What a cleaned deck holds that is not read by a person: ids and routes, colours, fonts, layouts, addresses (pictures,
// clips) and the media itself. Every other string in the deck is shown or spoken, so the scan reads it.
const NOT_SHOWN = new Set(['id', 'part', 'next', 'key', 'media', 'image', 'still', 'poster', 'audio', 'theme', 'layout', 'type', 'kind', 'shape', 'speaks', 'align', 'font',
  'titleFont', 'bodyFont', 'color', 'fill', 'line', 'canvas', 'canvasCustom', 'slide', 'slideCustom', 'world', 'transition', 'slideMotion', 'worldMotion']);

// The words of a custom drawing as SafeSvg draws them: sanitised, then the text as the browser reads it (entities decoded, tspans joined).
const svgText = (svg: string) => new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + sanitizeSvg(svg) + '</svg>', 'image/svg+xml').documentElement.textContent ?? '';

// One walk over everything the slides show and the narration tells: titles, texts, charts, cases, picture and avatar
// names, drawings. Used for the client-name check before upload.
function shownStrings(v: unknown, key = ''): string[] {
  if (typeof v === 'string') return key === 'svg' ? [svgText(v)] : [v];
  if (Array.isArray(v)) return v.flatMap((x) => shownStrings(x, key));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => (NOT_SHOWN.has(k) ? [] : shownStrings(x, k)));
  return [];
}
export const deckText = (deck: Deck): string => shownStrings({ ...deck, media: undefined }).join(' ');
