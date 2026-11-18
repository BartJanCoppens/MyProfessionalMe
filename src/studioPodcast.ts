// Podcast Studio (studios plan, Task 3.5): its build runner and what its Produce step shows, on the voicing it shares with Slides
// (studioVoicing.ts). The three build steps: "Writing the script" checks the script (chapters and turns) and that every line is by a
// speaker the format has; "Voicing each speaker" has the AI voice say each turn in its speaker's stock voice (one voice for each
// speaker, a different voice for two speakers) and stores the mp3 with the draft, one clip per turn in the voice-over item after the
// rows, and a retry voices only the turns still without one; "Timing the chapters" holds the episode to 30 minutes from the stored
// seconds. An episode is always told by the AI voice: without it nothing is voiced or stored and the studio says so; the browser voice
// only previews the script, labelled "Browser voice · not saved", and is never stored.
import { leadWords } from './logic/items';
import { boundClips, clipsFor, overTime, podcastLine, scriptOf, segmentsOf, wrongSpeaker } from './logic/podcastContent';
import type { BuildRunner } from './logic/studioBuild';
import { itemsValid, studioById } from './logic/studios';
import type { StudioEntry } from './logic/studios';
import { BROWSER_VOICE, speakInBrowser, voiceOn } from './lib/voice';
import type { BuildCtx } from './studioDraft';
import { dropClips, voiceFor, voiceParts } from './studioVoicing';

const listOf = (nw: BuildCtx['nw']) => (nw.items?.list ?? []) as StudioEntry[];
export const castKey = (speaker: string) => speaker + ' voice';
export const SAME_VOICE = 'Pick a different voice for each speaker';
const NOT_ON = 'The AI voice is not switched on · an episode cannot be produced without it; hear the script with the browser voice in Produce';

// The stock voice each speaker of the script is told in: the one picked in Produce, else the voice that speaker's stored clips were made in.
function voicesOf(L: BuildCtx['L'], nw: BuildCtx['nw'], list: StudioEntry[]) {
  const segs = segmentsOf(list), have = clipsFor(list);
  return new Map([...new Set(segs.map((s) => s.speaker))].map((speaker) => [speaker, voiceFor(L, nw, castKey(speaker), have[segs.findIndex((s) => s.speaker === speaker)]?.voice)] as const));
}
export const speakerVoiceName = (L: BuildCtx['L'], nw: BuildCtx['nw'], speaker: string) => voicesOf(L, nw, listOf(nw)).get(speaker)?.name;

// Picking another voice for a speaker drops that speaker's clips made in the old one, so only their lines are voiced again.
export function dropSpeakerVoice(cur: BuildCtx['nw'], speaker: string, voiceId: string): Partial<BuildCtx['nw']> {
  const segs = segmentsOf(listOf(cur));
  return dropClips(cur, (c) => !(segs[c.slide]?.speaker === speaker && c.voice !== voiceId));
}

// Says each turn without a clip in its speaker's voice (the shared runner) and returns the entries with all their clips.
function voiceTurns(ctx: BuildCtx, list: StudioEntry[]) {
  const voices = voicesOf(ctx.L, ctx.nw, list), ids = [...voices.values()].map((v) => v?.voice_id);
  if (ids.length > 1 && ids.every(Boolean) && new Set(ids).size < ids.length) throw new Error(SAME_VOICE);
  return voiceParts(ctx, list, segmentsOf(list).map((s) => ({ text: s.text, voice: voices.get(s.speaker)?.voice_id })), NOT_ON);
}

export function podcastRunner(ctx: BuildCtx): BuildRunner {
  const shape = ctx.nw.shape ?? {}, def = studioById('podcast')!;
  let list = listOf(ctx.nw); // the script as the steps leave it: the voice step adds the clips the timing step reads
  const steps = [
    async () => { const bad = itemsValid(def, list)[0] ?? wrongSpeaker(list, shape); if (bad) throw new Error(bad); },
    async () => { list = await voiceTurns(ctx, list); },
    async () => { const over = overTime(list); if (over || !boundClips(list)) throw new Error(over ?? 'Voice every line first'); },
  ];
  return async (_name, index) => {
    if (ctx.L.readOnly()) throw new Error('Only the creator can build it');
    await steps[index]();
  };
}

// The Produce step's part for the episode: how many lines are voiced and, once all are, what it holds and the hours it counts; and the
// browser voice to hear the script when the AI voice cannot be used (a preview: never stored).
export function podcastProduce({ L, nw }: Pick<BuildCtx, 'L' | 'nw'>) {
  const list = listOf(nw), segs = segmentsOf(list), on = voiceOn(L.aiOpts());
  const voiced = clipsFor(list).filter(Boolean).length, all = boundClips(list), seconds = all ? all.reduce((t, c) => t + c.seconds, 0) : 0;
  const counts = all ? ' · ' + podcastLine({ chapters: scriptOf(list).chapters, seconds: Math.round(seconds) }) : '';
  return {
    line: on ? 'AI voice · voiced ' + voiced + ' of ' + segs.length + ' lines' + counts : NOT_ON,
    hear: on || !segs.length ? null : { label: BROWSER_VOICE, head: 'Hear the script', noun: 'line', parts: segs.map((s) => ({ title: s.speaker + ' · ' + leadWords(s.text, 8), run: () => speakInBrowser(s.text) })) },
  };
}
