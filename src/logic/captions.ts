// Caption cues from the voice's own word timings (studios plan, Task 5.1), for the Reel and any other voiced piece. A cue
// is a run of spoken words of at most CAPTION_CHARS characters that ends at a sentence end; it starts where its first word
// is spoken and ends where the next cue starts (the last, at `end`). Never an even spread: a clip without word timings
// (voiced before this phase, or a voice that sent none) gives null and has to be voiced again.
import { spoken } from './narration';

export type Cue = { start: number; end: number; text: string };
export const CAPTION_CHARS = 42;

// The cues of `text` for a clip whose audio starts at `offset` and ends at `end` (both in seconds on the reel's clock);
// words[i] is when the i-th spoken word starts, in seconds from the clip's start. Null when the timings do not match the words.
export function captionCues(text: string, words: number[], offset: number, end: number): Cue[] | null {
  const list = spoken(text).split(' ').filter(Boolean);
  if (list.length !== words.length) return null;
  const groups: { from: number; text: string }[] = [];
  let open: { from: number; text: string } | null = null;
  list.forEach((w, i) => {
    if (open && (open.text + ' ' + w).length > CAPTION_CHARS) { groups.push(open); open = null; }
    open = open ? { from: open.from, text: open.text + ' ' + w } : { from: i, text: w };
    if (/[.!?]["')\]]*$/.test(w)) { groups.push(open); open = null; }
  });
  if (open) groups.push(open);
  return groups.map((g, k) => ({ start: offset + words[g.from], end: k + 1 < groups.length ? offset + words[groups[k + 1].from] : end, text: g.text }));
}

// The cue showing at time t (start included, end excluded), else null.
export const cueAt = (cues: readonly Cue[], t: number): Cue | null => cues.find((c) => t >= c.start && t < c.end) ?? null;

const stamp = (s: number) => {
  const ms = Math.round(s * 1000), p = (n: number, w = 2) => String(n).padStart(w, '0');
  return p(Math.floor(ms / 3_600_000)) + ':' + p(Math.floor(ms / 60_000) % 60) + ':' + p(Math.floor(ms / 1000) % 60) + '.' + p(ms % 1000, 3);
};
// The cues as a WebVTT file.
export const toVtt = (cues: readonly Cue[]): string =>
  'WEBVTT\n\n' + cues.map((c) => stamp(c.start) + ' --> ' + stamp(c.end) + '\n' + c.text + '\n').join('\n');
