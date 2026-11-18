// Narration that Slides, Podcast and Horizon presentations share (studios plan, Task 3.2), copied from Horizon's
// narrativeText.ts and narrativeRun.ts: the ⟨next⟩ and ⟨cue⟩ marks inside a passage, the text as a voice speaks it,
// and the steps a narration runs in. A step lasts its voice's seconds, with the marks where the voice timed them; in
// your own words (no stored voice), its words at a pace. The step player (src/screens/StepPlayer.tsx) plays them.
// The marks and the spoken text are the ones the `voice` edge function uses, from one shared file.
import { CUE_MARK, NEXT_MARK, spoken, spokenWords } from '../../supabase/functions/_shared/narrationText.ts';

export { CUE_MARK, NEXT_MARK, spoken, spokenWords } from '../../supabase/functions/_shared/narrationText.ts';

import type { Mark } from '../../supabase/functions/_shared/narrationText.ts';

export type RunMark = Mark;
// audio: a URL the browser can play (a signed URL of the stored file); none for a timed step.
export type RunStep = { part: string; seconds: number; marks: RunMark[]; audio?: string };
// A part of a narration (a slide, a chapter, a frame) with its words and, once voiced, its audio.
export type NarrationPart = { part: string; text: string; audio?: { url: string; seconds: number; marks: RunMark[] } | null };

// Words a minute when nobody's voice sets the time.
export const PACE = 140;
const wordCount = (t: string) => spokenWords(t).length;

// A passage told at `wpm`: its words' time, at least 2 seconds.
export const ownSeconds = (text: string, wpm = PACE): number => Math.max(2, (wordCount(text) / wpm) * 60);
// Each mark at its word's place at `wpm`.
export function ownMarks(text: string, wpm = PACE): RunMark[] {
  const parts = text.split(/(⟨next⟩|⟨cue⟩)/), out: RunMark[] = [];
  parts.forEach((x, i) => { if (x === NEXT_MARK || x === CUE_MARK) out.push({ kind: x === NEXT_MARK ? 'next' : 'cue', at: (wordCount(parts.slice(0, i).join(' ')) / wpm) * 60 }); });
  return out;
}

// The steps of a narration: a part without words, or (with the voice) without audio, is skipped and counted.
export function narrationSteps(parts: NarrationPart[], way: 'voice' | 'own', wpm = PACE): { steps: RunStep[]; skipped: number } {
  const steps: RunStep[] = [];
  let skipped = 0;
  for (const p of parts) {
    const s: RunStep | null = !spoken(p.text) ? null
      : way === 'voice' ? (p.audio ? { part: p.part, seconds: p.audio.seconds, marks: p.audio.marks, audio: p.audio.url } : null)
        : { part: p.part, seconds: ownSeconds(p.text, wpm), marks: ownMarks(p.text, wpm) };
    if (s) steps.push(s); else skipped++;
  }
  return { steps, skipped };
}

// The most characters one call of the voice takes (VOICE_LIMITS.chars in supabase/functions/voice/core.ts); longer text goes in pieces.
export const CHUNK_CHARS = 5000;
// A text in pieces of at most `max` characters, each cut after a sentence end or else at a space (a word longer than the
// limit is cut at it); the pieces put back together with a space are the text.
export function chunkText(text: string, max = CHUNK_CHARS): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const head = rest.slice(0, max + 1), sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? ')), space = head.lastIndexOf(' ');
    const cut = sentence > 0 ? sentence + 1 : space > 0 ? space : max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return rest ? [...out, rest] : out;
}

// How long a run takes.
export const runLength = (steps: RunStep[]): number => steps.reduce((t, s) => t + s.seconds, 0);
