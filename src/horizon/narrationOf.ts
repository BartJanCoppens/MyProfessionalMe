// A presentation's narration (studios plan, Task 3.3) on the shared narration steps (src/logic/narration.ts, which holds
// Horizon's narrativeRun.ts): the file's first narrative, its passages in order, each on its slide. As Horizon's run,
// it is told by its voice when every passage with words has its audio in the file's media; otherwise in its own words
// at the narrative's pace, without sound. Audio plays from the file's own data: URLs (no network).
import { PACE, narrationSteps, runLength } from '../logic/narration';
import type { NarrationPart, RunStep } from '../logic/narration';
import { spoken } from '../logic/narration';
import type { Deck } from './types';

// captions: each step's words as spoken (without the marks), shown under the slides while it runs.
export type DeckNarration = { name: string; way: 'voice' | 'own'; pace: number; steps: RunStep[]; captions: string[]; seconds: number; narrations: number };

export function deckNarration(deck: Deck): DeckNarration | null {
  const n = deck.narratives.find((x) => x.passages.some((p) => spoken(p.text)));
  if (!n) return null;
  const parts: NarrationPart[] = n.passages.map((p) => {
    const url = p.audio ? deck.media[p.audio.key] : undefined; // media has no prototype: only the file's own keys
    return { part: p.part, text: p.text, audio: p.audio && url ? { url, seconds: p.audio.seconds, marks: p.audio.marks } : null };
  });
  const voiced = parts.every((p) => !spoken(p.text) || p.audio);
  const { steps } = narrationSteps(parts, voiced ? 'voice' : 'own', n.pace);
  // Both ways keep exactly the passages with words (with the voice, every one of them has its audio).
  const captions = parts.map((p) => spoken(p.text)).filter(Boolean);
  return { name: n.name, way: voiced ? 'voice' : 'own', pace: n.pace ?? PACE, steps, captions, seconds: runLength(steps), narrations: deck.narratives.filter((x) => x.passages.some((p) => spoken(p.text))).length };
}
