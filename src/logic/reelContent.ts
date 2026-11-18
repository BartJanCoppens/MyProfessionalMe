// The Reel format (studios plan, Task 5.5) as content. A reel is studio rows [label, text, text2]: a Hook, "Scene N" rows from 1 and a
// Close (3 to 7 scenes; text the voice-over, text 2 the on-screen text), then the Check (the question and 2 to 4 options, the right one
// first). After the rows may come the voice-over item (voiceItem.ts, one clip per scene) and the video item, the cut the browser made
// (videoItem.ts). "Who presents?" says whether the AI voice tells it (every scene needs a clip made from its present words, in one
// voice), over a stock portrait or over text cards, or whether it is text and music only, read at a reading pace. The reel's clock runs
// the scenes one after the other with SCENE_GAP between them. What the rows publish as is private.reel_content, which this repeats for the
// preview and the checks; the checks are private.contribution_problems' (the Reel part), the texts the same.
import type { ReelContent } from '../types';
import { ownSeconds } from './narration';
import { PRESENTER } from './slidesContent';
import { stepsOf } from './studioRows';
import type { StudioItem } from './studioRows';
import { lookOf } from './stockLooks';
import type { StockLook } from './stockLooks';
import { CAPTION_MODES, FORMATS, MUSICS, SIZE_OF, VIDEO_ROWS_MAX, videoOf } from './videoItem';
import type { CutMade } from './videoItem';
import { boundClips } from './voiceItem';
import type { Clip, Part } from './voiceItem';

export { isVideoItem, videoOf } from './videoItem';
export { PRESENTER };
export const REEL_SECONDS_MAX = 90;
export const SCENE_GAP = 0.3;
export const CHECK_OPTIONS = { min: 2, max: 4 };
export const HOOK = 'Hook', CLOSE = 'Close', CHECK = 'Check';
export const PORTRAIT_VOICE = 'Stock presenter and AI voice', CARDS_VOICE = 'AI voice over text cards', TEXT_ONLY = 'Text and music only';
// The two ways the AI voice tells a reel.
export const VOICE_PRESENTERS = [PORTRAIT_VOICE, CARDS_VOICE];
export const VOICE_ALL = 'Voice every scene in Produce, or choose Text and music only in Shape it';
export const NO_VOICE = 'The AI voice is not switched on, so this reel cannot be voiced: choose Text and music only in Shape it';
export const NO_CHECK = 'Add the check question: one question, the right answer first';
export const BAD_OPTIONS = 'The check needs 2 to 4 options, the right one first';
export const NEEDS_CUT = 'Make the final cut in Produce';
export const CHANGED = 'You changed the reel after the final cut · make the final cut again';
export const WRONG_LENGTH = 'The video\'s length does not match the voice-over · make the final cut again';
export const BAD_LOOK = 'That look is not on the stock list';

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const blank = (v: string | undefined) => !v || !v.trim();
const optionsOf = (text2: string | undefined) => (text2 ?? '').split(/\s*·\s*/).map((o) => o.trim());
export const wantsVoice = (shape: Record<string, string>) => VOICE_PRESENTERS.includes(shape[PRESENTER]);
const portrait = (shape: Record<string, string>) => shape[PRESENTER] === PORTRAIT_VOICE;

// The scenes (every row but the Check) and the check, as the rows hold them.
export const sceneRows = (items: readonly unknown[]): StudioItem[] => stepsOf(items).filter((r) => r[0] !== CHECK);
export const checkRow = (items: readonly unknown[]): StudioItem | undefined => stepsOf(items).find((r) => r[0] === CHECK);
const checkOk = (r: StudioItem) => { const o = optionsOf(r[2]); return o.length >= CHECK_OPTIONS.min && o.length <= CHECK_OPTIONS.max && o.every(Boolean); };
// A scene's words, said by no one in particular (so the one voice rule is the reel's voice).
const parts = (items: readonly unknown[]): Part[] => sceneRows(items).map((r) => ({ speaker: '', text: r[1] }));
const clipsOf = (items: readonly unknown[], shape: Record<string, string>): Clip[] | null => (wantsVoice(shape) ? boundClips(items, parts(items)) : null);

// The problems with a reel's rows, in words (the Reel's item schema, itemsValid): the labels in order, 3 to 7 scenes with on-screen text,
// the check last with its options, and the places the voice-over and the cut take.
export function reelRows(rows: StudioItem[]): string[] {
  const scenes = rows.filter((r) => r[0] !== CHECK), checks = rows.filter((r) => r[0] === CHECK), out: string[] = [];
  if (scenes.length < 3 || scenes.length > 7) out.push('Use 3 to 7 scenes: a Hook, a Close and up to 5 Scene rows in between');
  else {
    if (scenes[0][0] !== HOOK) out.push('Start with a Hook row');
    if (scenes[scenes.length - 1][0] !== CLOSE) out.push('Add a Close row after the scenes');
    if (scenes[0][0] === HOOK && scenes[scenes.length - 1][0] === CLOSE && scenes.slice(1, -1).some((r, k) => r[0] !== 'Scene ' + (k + 1))) out.push('Number the scenes Scene 1, Scene 2 and so on, in order');
  }
  out.push(...scenes.filter((r) => blank(r[2])).map((r) => r[0] + ': add on-screen text'));
  if (!checks.length) out.push(NO_CHECK);
  else {
    if (checks.length > 1) out.push('Use one check question only');
    if (rows[rows.length - 1][0] !== CHECK) out.push('Put the check question last');
    if (!checkOk(checks[0])) out.push(BAD_OPTIONS);
  }
  if (rows.length > VIDEO_ROWS_MAX) out.push('Keep at most ' + VIDEO_ROWS_MAX + ' rows: the voice-over and the final cut take the last two places');
  return out;
}

// When each scene starts and how long it lasts, in seconds on the reel's clock rounded to the millisecond: a scene lasts its clip or, without
// a voice, its words at the reading pace; null while the voice is chosen and some scene has no clip made from its present words.
export function reelTimeline(items: readonly unknown[], shape: Record<string, string>): { start: number; seconds: number }[] | null {
  const scenes = sceneRows(items), clips = clipsOf(items, shape);
  if (wantsVoice(shape) && !clips) return null;
  let at = 0;
  return scenes.map((r, k) => {
    const seconds = clips ? clips[k].seconds : ownSeconds(r[1]), start = round3(at);
    at += seconds + SCENE_GAP;
    return { start, seconds: round3(seconds) };
  });
}
export function reelSeconds(items: readonly unknown[], shape: Record<string, string>): number | null {
  const line = reelTimeline(items, shape), last = line?.[line.length - 1];
  return last ? round3(last.start + last.seconds) : line ? 0 : null;
}

// What the final cut was made from, chosen in Produce (format, captions and music; the stock look only with the portrait presenter).
export function cutMade(items: readonly unknown[], shape: Record<string, string>, produce: Record<string, string>, cast: Record<string, string>): CutMade {
  const pick = <T extends string>(q: string, options: readonly T[]) => (options as readonly string[]).includes(produce[q]) ? produce[q] as T : options[0];
  return { rows: stepsOf(items).map((r) => [...r]), clips: clipsOf(items, shape)?.map((c) => c.path) ?? [], look: portrait(shape) ? cast.Look ?? null : null,
    format: pick('Format', FORMATS), captions: pick('Captions', CAPTION_MODES), music: pick('Music', MUSICS) };
}
// Whether the cut was made from these rows and these clips: the rows are the same, and the clips are the bound ones (none for text only).
// While the voice is chosen but not yet on every scene the clips are not compared (the voice is what is missing then).
export function videoCurrent(items: readonly unknown[], shape: Record<string, string>): boolean {
  const v = videoOf(items);
  if (!v || JSON.stringify(v.made.rows) !== JSON.stringify(stepsOf(items))) return false;
  const clips = clipsOf(items, shape);
  return wantsVoice(shape) ? !clips || JSON.stringify(v.made.clips) === JSON.stringify(clips.map((c) => c.path)) : v.made.clips.length === 0;
}

// What still blocks sending a reel, in words: the voice not on every scene (and why it cannot be made now), a clip without word timing,
// a reel over 90 s and, once the final cut is wanted (`cut`: the check), the cut: none, stale, not as long as the reel, or a look that is off.
export function reelProblems(items: readonly unknown[], shape: Record<string, string>, o: { voiceOn: boolean; looks: StockLook[] | null; cut?: boolean }): string[] {
  const clips = clipsOf(items, shape), out: string[] = [], seconds = reelSeconds(items, shape);
  if (wantsVoice(shape) && !clips) out.push(o.voiceOn ? VOICE_ALL : NO_VOICE);
  else if (clips) {
    const at = clips.findIndex((c) => !c.words);
    if (at >= 0) out.push('Voice scene ' + (at + 1) + ' again · its word timing is missing');
  }
  if (seconds !== null && seconds > REEL_SECONDS_MAX) out.push('The reel runs ' + Math.ceil(seconds) + ' s · at most ' + REEL_SECONDS_MAX + ' s');
  if (!o.cut) return out;
  const v = videoOf(items);
  if (!v) return [...out, NEEDS_CUT];
  if (!videoCurrent(items, shape)) out.push(CHANGED);
  if ((clips || !wantsVoice(shape)) && seconds !== null && Math.abs(v.seconds - seconds) > 1.5) out.push(WRONG_LENGTH);
  if (portrait(shape) && o.looks && !o.looks.some((l) => l.active && l.id === v.made.look)) out.push(BAD_LOOK);
  return out;
}

// The build steps the output shows done (0 to 4), `rowsOk` being the rows' own problems gone: the rows written, the voice on every scene with
// its word timing (text only has none to make), the reel within 90 s, the final cut made from these rows and clips.
export function reelStepsDone(items: readonly unknown[], shape: Record<string, string>, rowsOk: boolean): number {
  const clips = clipsOf(items, shape), seconds = reelSeconds(items, shape);
  if (!rowsOk) return 0;
  if (seconds === null || (clips && clips.some((c) => !c.words))) return 1;
  return seconds > REEL_SECONDS_MAX ? 2 : videoCurrent(items, shape) ? 4 : 3;
}

// The look chosen (a stock look's id) as the content names it; none unless it is an active one.
const lookContent = (looks: StockLook[], id: string | null | undefined): ReelContent['look'] => {
  const l = id ? lookOf(looks, id) : undefined;
  return l && l.active ? { id: l.id, name: l.name, portrait: l.portrait, color: l.color } : null;
};

// The published content; null while the voice is chosen and not on every scene, without a check, and (as private.reel_content) without a
// cut. `draft` previews a reel that is not cut yet: no video, the format, captions, music and look as they are chosen in Produce.
export function reelContent(items: readonly unknown[], shape: Record<string, string>, looks: StockLook[], draft?: { produce?: Record<string, string>; cast?: Record<string, string> }): ReelContent | null {
  const scenes = sceneRows(items), check = checkRow(items), line = reelTimeline(items, shape), v = videoOf(items), seconds = reelSeconds(items, shape);
  if (!scenes.length || !check || !line || seconds === null || (!v && !draft)) return null;
  const made: CutMade = v ? v.made : cutMade(items, shape, draft?.produce ?? {}, draft?.cast ?? {}), clips = clipsOf(items, shape);
  return {
    kind: 'reel', size: v ? v.size : SIZE_OF[made.format], seconds,
    scenes: scenes.map((r, k) => ({ label: r[0], text: r[1].trim(), onScreen: (r[2] ?? '').trim(), start: line[k].start, seconds: line[k].seconds, words: clips ? clips[k].words ?? null : null })),
    video: v ? { path: v.path, mime: v.mime } : null, burned: made.captions === 'Burned in', look: portrait(shape) ? lookContent(looks, made.look) : null, music: made.music,
    check: { q: check[1].trim(), opts: optionsOf(check[2]), a: 0 }, made: clips ? 'ai' : 'scripted',
  };
}
