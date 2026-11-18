// Slides Studio (studios plan, Task 3.4): its build runner and what its Produce step shows. The three build steps:
// "Writing the talk-over" checks that every slide has one (the creator writes it, or Draft with AI did, in the Draft
// step); "Voicing each slide" has the AI voice (voice.speak, the one adapter) say each slide's talk-over in the chosen
// stock voice and stores the mp3 with the draft, one clip per slide in the voice-over item after the rows, and a retry voices only
// the slides still without one; "Timing slides to the voice" holds the talk to 15 minutes, from the stored seconds or, without a
// voice, the words at a reading pace. Without the live AI voice, or with "Captions only", nothing is voiced or stored: the
// browser voice is offered to hear the talk-over, labelled "Browser voice · not saved", and never stored.
import { noItems } from './logic/items';
import type { Item } from './logic/items';
import { PACE } from './logic/narration';
import { horizonHours, lengthWords } from './logic/horizonItem';
import { boundClips, clipsFor, hasWords, overTime, slidesSeconds, wantsVoice, withClips } from './logic/slidesContent';
import type { BuildRunner } from './logic/studioBuild';
import { stepsOf } from './logic/studios';
import type { StudioEntry } from './logic/studios';
import { BROWSER_VOICE, speak, speakInBrowser, voiceOn } from './lib/voice';
import type { Clip } from './logic/voiceItem';
import type { BuildCtx } from './studioDraft';

export type { BuildCtx };
const listOf = (nw: BuildCtx['nw']) => (nw.items?.list ?? []) as StudioEntry[];
export const WRITE_TALK = 'Write the talk-over for every slide in the Draft step';
export const VOICE_NOT_ON = 'The AI voice is not switched on · hear the talk-over with the browser voice, or choose Captions only in Shape it';
export const PICK_VOICE = 'Pick a stock voice in Produce first';
export const NO_STOCK_VOICES = 'No stock voices yet · a System or General Admin adds them on the AI connections page';

// The active stock voices a creator may choose; null while they are loading.
export const stockVoicesOf = (L: BuildCtx['L']) => L.state.stockVoices?.filter((v) => v.active) ?? null;
// The voice the deck is voiced in: the one picked in Produce, else (after a reload or an Edit, when the pick is gone) the voice
// its stored clips were made in. One voice for the whole deck: a clip in another voice is voiced again.
function deckVoice(L: BuildCtx['L'], nw: BuildCtx['nw'], have: (Clip | undefined)[]) {
  const voices = stockVoicesOf(L);
  return nw.cast?.Voice ? voices?.find((v) => v.name === nw.cast?.Voice) : voices?.find((v) => v.voice_id === have.find(Boolean)?.voice);
}
export const deckVoiceName = (L: BuildCtx['L'], nw: BuildCtx['nw']) => deckVoice(L, nw, clipsFor(listOf(nw)))?.name;

// Picking another voice drops the clips made in the old one, so the deck is voiced again whole (and never mixes voices).
export const dropOtherVoices = (cur: BuildCtx['nw'], voiceId: string): Partial<BuildCtx['nw']> => {
  const list = listOf(cur), have = clipsFor(list).filter((c): c is Clip => !!c);
  return have.some((c) => c.voice !== voiceId) ? { items: { ...(cur.items ?? noItems()), list: withClips(list, have.filter((c) => c.voice === voiceId)) as Item[] } } : {};
};

// Says each slide without a clip in the deck's voice (or with a clip in another voice), stores each with the draft (one save
// step) and returns the slides with all their clips. A slide that fails stops the rest; the ones voiced are kept, and the error
// is thrown after they are saved.
async function voiceSlides({ L, nw, withFile }: BuildCtx, list: StudioEntry[]): Promise<StudioEntry[]> {
  const rows = stepsOf(list), have = clipsFor(list), stock = deckVoice(L, nw, have), bound = boundClips(list);
  if (bound && (!nw.cast?.Voice || bound[0].voice === stock?.voice_id)) return list; // every slide is voiced in the deck's voice
  if (!voiceOn(L.aiOpts())) throw new Error(VOICE_NOT_ON);
  if (!stock) throw new Error(PICK_VOICE);
  const kept = have.filter((c): c is Clip => !!c && c.voice === stock.voice_id), todo = rows.map((_, k) => k).filter((k) => !kept.some((c) => c.slide === k));
  const made: Clip[] = [], failure: { error: Error | null } = { error: null };
  let next = list;
  const ok = await withFile(async (id) => {
    for (const k of todo) {
      const text = (rows[k][2] ?? '').trim();
      try { const v = await speak({ contributionId: id, voiceId: stock.voice_id, text }); made.push({ slide: k, text, voice: stock.voice_id, path: v.path, seconds: v.seconds, marks: v.marks }); }
      catch (e) { failure.error = e as Error; break; }
    }
    next = withClips(list, [...kept, ...made]);
    return next as Item[];
  }, 'Saved as draft · the voice-over is stored with it', nw.items?.how ?? '');
  if (!ok) throw new Error('The voice-over could not be saved · try again');
  if (failure.error) throw failure.error;
  return next;
}

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
  const counts = rows.length ? ' · ' + lengthWords(seconds) + ' · counts ' + horizonHours(seconds) + ' h' : '';
  return {
    line: wantsVoice(shape) ? 'AI voice · voiced ' + voiced + ' of ' + rows.length + ' slides' + (voiced === rows.length ? counts : '')
      : 'Captions only · no voice is made, each slide is read at ' + PACE + ' words a minute' + counts,
    hear: on || !rows.length ? null : { label: BROWSER_VOICE, slides: rows.map((r) => ({ title: r[0], run: () => speakInBrowser(r[2] ?? '') })) },
  };
}
