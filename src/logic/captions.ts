// Caption cues from the voice's own word timings (studios plan, Task 5.1), for the Reel and any other voiced piece. A cue
// is a run of spoken words of at most CAPTION_CHARS characters that ends at a sentence end; it starts where its first word
// is spoken and ends where the next cue starts (the last, at `end`). Never an even spread: a clip without word timings
// (voiced before this phase, or a voice that sent none) gives null and has to be voiced again. A word longer than a cue is
// broken into pieces spread over the word's own time.
import { spokenWords } from './narration';

export type Cue = { start: number; end: number; text: string };
export const CAPTION_CHARS = 42;

// A sentence ends at . ! ? (closing quotes allowed) before a capital or the end, unless the word is an abbreviation (Dr., U.S., e.g.).
const ABBREVIATION = /^(?:Mr|Mrs|Ms|Dr|Prof|St|vs|etc|[A-Za-z](?:\.[A-Za-z])+)\.$/;
const endsSentence = (w: string, next: string | undefined) => /[.!?]["')\]]*$/.test(w) && !ABBREVIATION.test(w) && (next === undefined || /^["'([]*[\p{Lu}\d]/u.test(next));

type Unit = { text: string; at: number; last: boolean };

// The words as units that fit a cue: a long word's pieces start evenly across the word's time (to the next word's start).
function units(list: string[], times: number[], stop: number): Unit[] {
  return list.flatMap((w, i) => {
    const pieces = w.match(new RegExp('.{1,' + CAPTION_CHARS + '}', 'gu')) ?? [w];
    const next = i + 1 < times.length ? times[i + 1] : stop;
    return pieces.map((text, k) => ({ text, at: times[i] + ((next - times[i]) * k) / pieces.length, last: k === pieces.length - 1 }));
  });
}

// The cues of `text` for a clip whose audio starts at `offset` and ends at `end` (both in seconds on the reel's clock);
// words[i] is when the i-th spoken word starts, in seconds from the clip's start. Null when the timings do not match the words.
export function captionCues(text: string, words: number[], offset: number, end: number): Cue[] | null {
  const list = spokenWords(text);
  if (list.length !== words.length) return null;
  const times = words.map((t) => Math.min(offset + t, end));
  const groups: { at: number; text: string }[] = [];
  let open: { at: number; text: string } | null = null;
  units(list, times, end).forEach((u, i, all) => {
    if (open && (open.text + ' ' + u.text).length > CAPTION_CHARS) { groups.push(open); open = null; }
    open = open ? { at: open.at, text: open.text + ' ' + u.text } : { at: u.at, text: u.text };
    const nextWord = all[i + 1]?.text;
    if (u.last && endsSentence(u.text, nextWord)) { groups.push(open); open = null; }
  });
  if (open) groups.push(open);
  return groups.map((g, k) => ({ start: g.at, end: k + 1 < groups.length ? groups[k + 1].at : end, text: g.text })).filter((c) => c.end > c.start);
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
