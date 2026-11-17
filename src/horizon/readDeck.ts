// Reading a .horizon file (studios plan, Task 3.3; Review Focus 6): refused before it is stored, with a reason, when
// it is not a .horizon file or over 50 MB (deckProblem, from the media rules), not JSON, does not say format
// 'horizon', was made with a newer Horizon than this player reads, or has no slides; otherwise cleaned (cleanDeck.ts)
// and summarised as a Presentation's item: its title, the slides along its route and how long its narration runs.
// Horizon's own reader is offline.ts deckOfCopy; its messages are kept where they fit.
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

// Every text the slides and the narration show, for the client-name check before upload.
export const deckText = (deck: Deck): string => {
  const frames = (F: Deck['frames']): string[] => F.flatMap((f) => [f.title, f.body, f.tag ?? '', ...(f.viz?.items ?? []).flatMap((it) => [it.label, it.note ?? '']),
    ...(f.objects ?? []).map((o) => o.text ?? ''), ...(f.section ? frames(f.section.frames) : [])]);
  return [deck.title, ...frames(deck.frames), ...deck.narratives.flatMap((n) => n.passages.map((p) => p.text))].join(' ');
};
