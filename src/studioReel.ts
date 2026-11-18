// Reel Studio (studios plan, Task 5.5): its build runner and what its Produce step shows. The four build steps: "Writing the voice-over"
// checks the rows and writes nothing (no AI); "Voicing each scene" has the AI voice (voice.speak through the shared voicing runner, one stock
// voice) say each scene without a clip and stores the mp3 with the draft, keeping the clips that have their word timings, and is skipped
// for "Text and music only"; "Adding visuals and captions" checks the timeline, the caption cues of every scene and the 90 s cap and writes
// nothing; "Final cut" has the browser compositor draw and record the reel, then stores the video with the draft. The video item is written
// only after the upload, so a refused or failed render changes nothing. Without the live AI voice a voiced reel cannot be made, and says so.
import type { Logic } from './model';
import type { NewDraft } from './types';
import { latestDraft } from './studioDraft';
import type { BuildCtx } from './studioDraft';
import { mediaUrl, uploadMedia } from './lib/mediaStore';
import { voiceOn } from './lib/voice';
import { captionCues } from './logic/captions';
import type { Item } from './logic/items';
import { ownSeconds } from './logic/narration';
import { NO_VOICE, PRESENTER, REEL_SECONDS_MAX, TEXT_ONLY, cutMade, reelContent, reelProblems, reelSeconds, reelStepsDone, sceneRows, wantsVoice } from './logic/reelContent';
import type { BuildRunner } from './logic/studioBuild';
import { itemsValid, stepsOf, studioById } from './logic/studios';
import type { StudioEntry } from './logic/studios';
import { MIME_OF_EXT, SIZE_OF, isVideoItem, videoOf } from './logic/videoItem';
import type { VideoItem } from './logic/videoItem';
import { voiceOf, withClips } from './logic/voiceItem';
import { renderBuiltCut } from './reel/renderBuilt';
import type { AudioLike, CutResult } from './reel/compositor';
import { prepareAudio } from './reel/compositor';
import type { Cut } from './reel/cutRules';
import { loadPortrait, reelCut } from './reel/reelCut';
import { voiceFor, voiceParts } from './studioVoicing';

export const CUT_FAILED = 'The final cut did not finish · nothing was saved';
export const PICK_LOOK = 'Pick a stock look in Produce first';
const listOf = (nw: NewDraft) => (nw.items?.list ?? []) as StudioEntry[];

// Who runs the cut: the Produce step's host (with progress, Cancel and the reason a cut failed), or, without one, the compositor directly.
export type CutHost = { run: (build: () => Promise<Cut>, context?: AudioLike) => Promise<CutResult | null> };
const direct: CutHost = { run: (build, context) => renderBuiltCut(build, { signal: new AbortController().signal, onProgress: () => {}, context }) };

// The Produce answers and the look, a stored cut's own where the draft has none (after a reload the choices are gone, the cut keeps them).
function chosen(nw: NewDraft, list: StudioEntry[]) {
  const made = videoOf(list)?.made;
  return { produce: { ...(made && { Format: made.format, Captions: made.captions, Music: made.music }), ...nw.produce }, cast: { ...(made?.look && { Look: made.look }), ...nw.cast } };
}

// The voice the reel is voiced in: the one picked in Produce, else the voice its stored clips were made in. One voice for the whole reel.
const voiceId = (L: Logic, nw: NewDraft, list: StudioEntry[]) => voiceFor(L, nw, 'Voice', voiceOf(list)?.clips[0]?.voice);
export const reelVoiceName = (L: Logic, nw: NewDraft) => voiceId(L, nw, listOf(nw))?.name;

// The clips a caption can be made from (word timings that match the words); the others are voiced again.
function usableClips(list: StudioEntry[]): StudioEntry[] {
  const v = voiceOf(list), keep = v?.clips.filter((c) => c.words && captionCues(c.text, c.words, 0, c.seconds)) ?? [];
  return !v || keep.length === v.clips.length ? list : withClips(stepsOf(list), keep) as StudioEntry[];
}

async function hash16(made: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(made)));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function reelRunner(ctx: BuildCtx, host: CutHost = direct): BuildRunner {
  const { L, nw } = ctx, shape = nw.shape ?? {}, def = studioById('reel')!;
  let list = listOf(nw), held: AudioLike | undefined; // the reel as the steps leave it, and the audio context opened in the click
  const voice = async () => {
    const id = voiceId(L, nw, list)?.voice_id, parts = sceneRows(list).map((r) => ({ text: r[1], voice: id }));
    list = await voiceParts(ctx, usableClips(list), parts, NO_VOICE);
  };
  const check = () => {
    const bad = reelProblems(list, shape, { voiceOn: voiceOn(L.aiOpts()), looks: null })[0];
    if (bad) throw new Error(bad);
    // the caption cues of every voiced scene: a scene whose word timings do not match its words has to be voiced again
    const scenes = reelContent(list.filter((x) => !isVideoItem(x)), shape, [], { produce: {}, cast: {} })?.scenes ?? [];
    const at = scenes.findIndex((s) => s.words && !captionCues(s.text, s.words, s.start, s.start + s.seconds));
    if (at >= 0) throw new Error('Voice scene ' + (at + 1) + ' again · its word timing does not match its words');
  };
  async function cut() {
    const { produce, cast } = chosen(nw, list), rows = list.filter((x) => !isVideoItem(x));
    const content = reelContent(rows, shape, L.state.stockLooks ?? [], { produce, cast }), made = cutMade(rows, shape, produce, cast);
    if (!content) throw new Error('Voice the reel first');
    if (shape[PRESENTER] === 'Stock presenter and AI voice' && !content.look) throw new Error(PICK_LOOK);
    const ai = content.made === 'ai' || nw.items?.how === 'ai';
    const done = await host.run(async () => {
      const [urls, img] = await Promise.all([Promise.all(made.clips.map((p) => mediaUrl(p))), content.look ? loadPortrait(content.look.portrait) : null]);
      return reelCut({ ...content, made: ai ? 'ai' : content.made }, urls, img);
    }, held);
    held = undefined;
    if (!done) throw new Error(CUT_FAILED);
    const name = 'reel-' + (await hash16(made)) + '.' + done.ext;
    const stored = await ctx.withFile(async (id) => {
      const path = await uploadMedia(id, done.blob, name), now = listOf(latestDraft(L).nw);
      const video: VideoItem = { kind: 'video', path, seconds: Math.min(done.seconds, REEL_SECONDS_MAX), size: SIZE_OF[made.format], mime: MIME_OF_EXT[done.ext], made };
      return [...stepsOf(now), ...(made.clips.length ? [voiceOf(now)!] : []), video] as Item[];
    }, 'Saved as draft · the final cut is stored with it', nw.items?.how ?? '');
    if (!stored) throw new Error('The final cut could not be saved · try again');
  }
  const steps = [
    async () => { const bad = itemsValid(def, list)[0]; if (bad) throw new Error(bad); },
    async () => { if (wantsVoice(shape)) await voice(); },
    async () => check(),
    cut,
  ];
  const run: BuildRunner = async (_name, index) => {
    if (L.readOnly()) throw new Error('Only the creator can build it');
    try { await steps[index](); } catch (e) { if (index < 3) void held?.close().catch(() => {}); if (index < 3) held = undefined; throw e; }
  };
  return Object.assign(run, { prepare: () => { held = prepareAudio(); } });
}

// How many of the four build steps the draft's own output shows done.
export const reelBuilt = (items: StudioEntry[], shape: Record<string, string>) => reelStepsDone(items, shape, !itemsValid(studioById('reel')!, items).length);

// The Produce step's part for the reel: how it is told and how long it runs, what the final cut was made from, and, for the build step, a runner
// that runs the cut on the screen's host.
export function reelProduce(ctx: Pick<BuildCtx, 'L' | 'nw' | 'setNw' | 'withFile'>) {
  const { nw } = ctx, list = listOf(nw), shape = nw.shape ?? {}, rows = sceneRows(list), seconds = reelSeconds(list, shape), v = videoOf(list);
  const voiced = voiceOf(list)?.clips.filter((c) => rows[c.slide]?.[1].trim() === c.text.trim()).length ?? 0;
  const counts = seconds ? ' · ' + Math.round(seconds) + ' s of ' + REEL_SECONDS_MAX + ' s' : '';
  const told = wantsVoice(shape) ? 'AI voice · voiced ' + voiced + ' of ' + rows.length + ' scenes' + counts
    : shape[PRESENTER] === TEXT_ONLY ? 'Text and music only · no voice is made, each scene is read at 140 words a minute' + counts : 'Choose who presents in Shape it · until then the reel is text and music only' + counts;
  return {
    line: told, seconds: seconds ?? rows.reduce((t, r) => t + ownSeconds(r[1]), 0),
    cut: v ? 'Final cut stored · ' + Math.round(v.seconds) + ' s · ' + (v.mime === 'video/mp4' ? 'MP4' : 'WebM') + ' · ' + v.made.format : 'No final cut yet',
    runner: (host: CutHost) => reelRunner(ctx, host),
  };
}
