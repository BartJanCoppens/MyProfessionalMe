// The Podcast format (studios plan, Task 3.5) as content. A script is studio rows [label, text] of two kinds: a chapter row,
// "Chapter N · m:ss" with the chapter's title (N counts from 1, the times rise from 0:00: the draft's plan; the published
// start of a chapter comes from the voiced lengths), and a turn row, a speaker (Host, Guest or Co-host) with the words. After
// the rows may come the one voice-over item (voiceItem.ts), one clip per turn. "Format?" says who speaks; each speaker has one
// stock voice and two speakers have different ones. What the script publishes as is private.podcast_content, which this
// repeats for the preview and for the checks; the checks are private.contribution_problems'.
import type { PodMedia, PodcastContent } from '../types';
import { lengthWords, mediaHours } from './horizonItem';
import { CHUNK_CHARS, chunkText, narrationSteps, ownSeconds } from './narration';
import type { NarrationPart, RunStep } from './narration';
import { itemsValid, stepsOf, studioById } from './studios';
import type { StudioEntry } from './studios';
import { boundClips as boundOf, clipsFor as clipsOf } from './voiceItem';
import type { Part } from './voiceItem';

export const FORMAT_QUESTION = 'Format?', INTERVIEW = 'Interview with an expert', TWO_HOSTS = 'Two AI hosts', SOLO = 'Solo talk';
export const SPEAKERS: Record<string, string[]> = { [INTERVIEW]: ['Host', 'Guest'], [TWO_HOSTS]: ['Host', 'Co-host'], [SOLO]: ['Host'] };
export const ALL_SPEAKERS = ['Host', 'Guest', 'Co-host'];
// The speakers of the format chosen: an interview when unanswered (private.contribution_problems says the same).
export const speakersOf = (shape: Record<string, string>) => SPEAKERS[shape[FORMAT_QUESTION]] ?? SPEAKERS[INTERVIEW];
// An episode plays at most 30 minutes (the design's limit for podcasts); private.contribution_problems repeats it.
export const PODCAST_MAX_SECONDS = 1800;
export const CHAPTER = /^Chapter (\d{1,3}) · (\d{1,3}):([0-5]\d)$/;
export const isChapter = (label: string) => CHAPTER.test(label);
export const VOICE_ALL = 'Voice every line in Produce: an episode is always told by the AI voice, with a different voice for each speaker';
export const NO_VOICE = 'The AI voice is not switched on, so an episode cannot be produced: the browser voice only previews the script';

export type Turn = { speaker: string; text: string; chapter: number };
// The script's chapter titles and turns in order; a turn's chapter counts from 1.
export function scriptOf(items: readonly StudioEntry[]): { chapters: string[]; turns: Turn[] } {
  const chapters: string[] = [], turns: Turn[] = [];
  for (const r of stepsOf(items)) {
    if (isChapter(r[0])) chapters.push(r[1].trim());
    else turns.push({ speaker: r[0], text: r[1].trim(), chapter: chapters.length });
  }
  return { chapters, turns };
}
// What the voice says, in order: each turn, cut at the voice's limit into the parts a clip is made from (a valid row is far shorter,
// so a turn is one part; the SQL counts turns).
export const segmentsOf = (items: readonly StudioEntry[]): (Part & { chapter: number })[] =>
  scriptOf(items).turns.flatMap((t) => chunkText(t.text, CHUNK_CHARS).map((text) => ({ speaker: t.speaker, text, chapter: t.chapter })));
export const partsOf = (items: readonly StudioEntry[]): Part[] => segmentsOf(items).map(({ speaker, text }) => ({ speaker, text }));
// Each part's clip, and every part's clip when each speaker has their own voice.
export const clipsFor = (items: readonly StudioEntry[]) => clipsOf(items, partsOf(items));
export const boundClips = (items: readonly StudioEntry[]) => boundOf(items, partsOf(items));

// How long the episode plays: each part's stored seconds once every part is voiced, else its words at the reading pace.
export function podcastSeconds(items: readonly StudioEntry[]): number {
  const clips = boundClips(items);
  return Math.round(segmentsOf(items).reduce((t, s, k) => t + (clips ? clips[k].seconds : ownSeconds(s.text)), 0));
}

// The published content; null until every part is voiced (an episode is always told by the AI voice).
export function podcastContent(items: readonly StudioEntry[]): PodcastContent | null {
  const clips = boundClips(items), segs = segmentsOf(items), chapters = scriptOf(items).chapters;
  if (!clips) return null;
  const first = (ch: number) => segs.filter((s) => s.chapter < ch).length;
  return {
    kind: 'podcast', made: 'ai', seconds: podcastSeconds(items),
    chapters: chapters.map((title, k) => ({ title, turn: first(k + 1), start: Math.round(clips.slice(0, first(k + 1)).reduce((t, c) => t + c.seconds, 0)) })),
    turns: segs.map((s, k) => ({ speaker: s.speaker, text: s.text, audio: { path: clips[k].path, seconds: clips[k].seconds, marks: clips[k].marks } })),
  };
}

// An episode over the limit, in words; null when it fits.
export function overTime(items: readonly StudioEntry[]): string | null {
  const s = podcastSeconds(items);
  return s > PODCAST_MAX_SECONDS ? 'The episode runs ' + Math.ceil(s / 60) + ' min, over the ' + PODCAST_MAX_SECONDS / 60 + ' min limit: shorten the script' : null;
}
// A line by a speaker the format does not have, in words; null when every speaker belongs.
export function wrongSpeaker(items: readonly StudioEntry[], shape: Record<string, string>): string | null {
  const speakers = speakersOf(shape);
  return scriptOf(items).turns.some((t) => !speakers.includes(t.speaker)) ? 'A line has a speaker this format does not have: ' + speakers.join(' and ') + ' only' : null;
}
// What still blocks sending after the Draft step: a speaker the format does not have, the episode not voiced (and why it cannot be
// made now), an episode over the limit.
export function podcastProblems(items: readonly StudioEntry[], shape: Record<string, string>, voiceOn: boolean): string[] {
  const wrong = wrongSpeaker(items, shape), over = overTime(items);
  return [...(wrong ? [wrong] : []), ...(boundClips(items) ? [] : [voiceOn ? VOICE_ALL : NO_VOICE]), ...(over ? [over] : [])];
}
// How many of the studio's three build steps the output shows done: the script written, every line told, the length within the limit.
export function podcastBuilt(items: readonly StudioEntry[], shape: Record<string, string>): number {
  if (itemsValid(studioById('podcast')!, [...items]).length || wrongSpeaker(items, shape)) return 0;
  return !boundClips(items) ? 1 : overTime(items) ? 2 : 3;
}

// "2 chapters · 12 min · counts 0.2 h": what the episode holds and the hours it counts (the one hours helper, mediaHours).
export const podcastLine = (c: { chapters: unknown[]; seconds: number }) =>
  c.chapters.length + (c.chapters.length === 1 ? ' chapter' : ' chapters') + ' · ' + lengthWords(c.seconds) + ' · counts ' + mediaHours(c.seconds) + ' h';

// A v3 episode (MEDIA) as content: chapters on a clock, with no recording and no transcript.
export const seededPodcast = (M: PodMedia): PodcastContent =>
  ({ kind: 'podcast', made: 'scripted', seconds: M.dur, turns: [], chapters: M.ch.map(([start, title], k) => ({ title, start, turn: k })) });

// The steps the one player runs: a stored episode turn by turn on each turn's audio (urls, in order), an episode with no turns
// chapter by chapter on the clock.
export function podcastSteps(c: PodcastContent, urls: string[]): RunStep[] {
  if (!c.turns.length) return c.chapters.map((ch, k) => ({ part: String(k), seconds: (c.chapters[k + 1]?.start ?? c.seconds) - ch.start, marks: [] }));
  return narrationSteps(c.turns.map((t, k): NarrationPart => ({ part: String(k), text: t.text, audio: t.audio && urls[k] ? { url: urls[k], seconds: t.audio.seconds, marks: t.audio.marks } : null })), 'voice').steps;
}
