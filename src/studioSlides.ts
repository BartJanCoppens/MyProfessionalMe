// Slides Studio (studios plan, Task 3.4): its build runner and what its Produce step shows. The three build steps:
// "Writing the talk-over" checks that every slide has one (the creator writes it, or Draft with AI did, in the Draft
// step); "Voicing each slide" has the AI voice (voice.speak, the one adapter) say each slide's talk-over in the chosen
// stock voice and stores the mp3 with the draft, one clip per slide in the voice-over item after the rows, and a retry voices only
// the slides still without one; "Timing slides to the voice" holds the talk to 15 minutes, from the stored seconds or, without a
// voice, the words at a reading pace. Without the live AI voice, or with "Captions only", nothing is voiced or stored: the
// browser voice is offered to hear the talk-over, labelled "Browser voice · not saved", and never stored.
import { PACE } from './logic/narration';
import { mediaHours, lengthWords } from './logic/horizonItem';
import { boundClips, clipsFor, hasWords, overTime, slidesSeconds, wantsVoice } from './logic/slidesContent';
import type { BuildRunner } from './logic/studioBuild';
import { stepsOf } from './logic/studios';
import type { StudioEntry } from './logic/studios';
import { BROWSER_VOICE, speakInBrowser, voiceOn } from './lib/voice';
import type { BuildCtx } from './studioDraft';
import { dropClips, voiceFor, voiceParts } from './studioVoicing';

export type { BuildCtx };
const listOf = (nw: BuildCtx['nw']) => (nw.items?.list ?? []) as StudioEntry[];
export const VOICE_NOT_ON = 'The AI voice is not switched on · hear the talk-over with the browser voice, or choose Captions only in Shape it';
export const WRITE_TALK = 'Write the talk-over for every slide in the Draft step';

// The voice the deck is voiced in: the one picked in Produce, else (after a reload or an Edit, when the pick is gone) the voice
// its stored clips were made in. One voice for the whole deck: a clip in another voice is voiced again.
const deckVoice = (L: BuildCtx['L'], nw: BuildCtx['nw']) => voiceFor(L, nw, 'Voice', clipsFor(listOf(nw)).find(Boolean)?.voice);
export const deckVoiceName = (L: BuildCtx['L'], nw: BuildCtx['nw']) => deckVoice(L, nw)?.name;

// Picking another voice drops the clips made in the old one, so the deck is voiced again whole (and never mixes voices).
export const dropOtherVoices = (cur: BuildCtx['nw'], voiceId: string): Partial<BuildCtx['nw']> => dropClips(cur, (c) => c.voice === voiceId);

// Says each slide without a clip in the deck's voice (the shared runner) and returns the slides with all their clips.
const voiceSlides = (ctx: BuildCtx, list: StudioEntry[]) => {
  const voice = deckVoice(ctx.L, ctx.nw)?.voice_id;
  return voiceParts(ctx, list, stepsOf(list).map((r) => ({ text: r[2] ?? '', voice })), VOICE_NOT_ON);
};

export function slidesRunner(ctx: BuildCtx): BuildRunner {
  const shape = ctx.nw.shape ?? {};
  let list = listOf(ctx.nw); // the slides as the steps leave them: the voice step adds the clips the timing step reads
  const steps = [
    async () => { if (stepsOf(list).some((r) => !hasWords(r[2]))) throw new Error(WRITE_TALK); },
    async () => { if (wantsVoice(shape)) list = await voiceSlides(ctx, list); },
    async () => { const over = overTime(list, shape); if (over || (wantsVoice(shape) && !boundClips(list))) throw new Error(over ?? 'Voice every slide first'); },
  ];
  return async (_name, index) => {
    if (ctx.L.readOnly()) throw new Error('Only the creator can build it');
    await steps[index]();
  };
}

// The Produce step's part for the deck: how it is told and how long it runs, and the browser voice to hear a talk-over when the
// AI voice cannot be used (a preview: never stored).
export function slidesProduce(ctx: Pick<BuildCtx, 'L' | 'nw'>) {
  const { L, nw } = ctx, list = listOf(nw), shape = nw.shape ?? {}, rows = stepsOf(list), seconds = slidesSeconds(list, shape);
  const voiced = clipsFor(list).filter(Boolean).length, on = voiceOn(L.aiOpts());
  const counts = rows.length ? ' · ' + lengthWords(seconds) + ' · counts ' + mediaHours(seconds) + ' h' : '';
  return {
    line: wantsVoice(shape) ? 'AI voice · voiced ' + voiced + ' of ' + rows.length + ' slides' + (voiced === rows.length ? counts : '')
      : 'Captions only · no voice is made, each slide is read at ' + PACE + ' words a minute' + counts,
    hear: on || !rows.length ? null : { label: BROWSER_VOICE, head: 'Hear the talk-over', noun: 'slide', parts: rows.map((r) => ({ title: r[0], run: () => speakInBrowser(r[2] ?? '') })) },
  };
}
