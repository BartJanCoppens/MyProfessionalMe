// A presentation's narration (studios plan, Task 3.3) on the shared narration steps (src/logic/narration.ts, which holds
// Horizon's narrativeRun.ts): the file's first narrative, its passages in order, each on its slide. As Horizon's run,
// it is told by its voice when every passage with words has its audio in the file's media; otherwise in its own words
// at the narrative's pace, without sound. Audio plays from the file's own data: URLs (no network).
import { narrationSteps, runLength } from '../logic/narration';
import type { NarrationPart, RunStep } from '../logic/narration';
import { spoken } from '../logic/narration';
import type { Deck } from './types';

export type DeckNarration = { name: string; way: 'voice' | 'own'; steps: RunStep[]; seconds: number };

export function deckNarration(deck: Deck): DeckNarration | null {
  const n = deck.narratives.find((x) => x.passages.some((p) => spoken(p.text)));
  if (!n) return null;
  const parts: NarrationPart[] = n.passages.map((p) => {
    const url = p.audio ? deck.media[p.audio.key] : undefined;
    return { part: p.part, text: p.text, audio: p.audio && url ? { url, seconds: p.audio.seconds, marks: p.audio.marks } : null };
  });
  const voiced = parts.every((p) => !spoken(p.text) || p.audio);
  const { steps } = narrationSteps(parts, voiced ? 'voice' : 'own', n.pace);
  return { name: n.name, way: voiced ? 'voice' : 'own', steps, seconds: runLength(steps) };
}
