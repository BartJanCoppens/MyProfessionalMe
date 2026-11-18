// Slides Studio (studios plan, Task 3.4): its build runner and what its Produce step shows. The three build steps:
// "Writing the talk-over" checks that every slide has one (the creator writes it, or Draft with AI did, in the Draft
// step); "Voicing each slide" has the AI voice (voice.speak, the one adapter) say each slide's talk-over in the chosen
// stock voice and stores the mp3 with the draft, one clip per slide in the voice-over item after the rows, and a retry voices only
// the slides still without one; "Timing slides to the voice" holds the talk to 15 minutes, from the stored seconds or, without a
// voice, the words at a reading pace. Without the live AI voice, or with "Captions only", nothing is voiced or stored: the
// browser voice is offered to hear the talk-over, labelled "Browser voice · not saved", and never stored.
import type { Item } from './logic/items';
import { PACE } from './logic/narration';
import { horizonHours, lengthWords } from './logic/horizonItem';
import { boundClips, clipsFor, overTime, slidesSeconds, wantsVoice, withClips } from './logic/slidesContent';
import type { BuildRunner } from './logic/studioBuild';
import type { StudioEntry, StudioItem } from './logic/studios';
import { BROWSER_VOICE, speak, speakInBrowser, voiceOn } from './lib/voice';
import type { Clip } from './logic/voiceItem';
import type { BuildCtx } from './studioDraft';

export type { BuildCtx };
export const WRITE_TALK = 'Write the talk-over for every slide in the Draft step';
export const VOICE_NOT_ON = 'The AI voice is not switched on · hear the talk-over with the browser voice, or choose Captions only in Shape it';
export const PICK_VOICE = 'Pick a stock voice in Produce first';
export const NO_STOCK_VOICES = 'No stock voices yet · a System or General Admin adds them on the AI connections page';

const listOf = (nw: BuildCtx['nw']) => (nw.items?.list ?? []) as StudioEntry[];
const rowsOf = (list: StudioEntry[]) => list.filter((i): i is StudioItem => Array.isArray(i));
// The active stock voices a creator may choose; null while they are loading.
export const stockVoicesOf = (L: BuildCtx['L']) => L.state.stockVoices?.filter((v) => v.active) ?? null;

// Says each slide still without a clip in the stock voice, stores each with the draft (one save step) and returns the slides
// with all their clips. A slide that fails stops the rest; the ones voiced are kept, and the error is thrown after they are saved.
async function voiceSlides({ L, nw, withFile }: BuildCtx, list: StudioEntry[]): Promise<StudioEntry[]> {
  const stock = stockVoicesOf(L)?.find((v) => v.name === nw.cast?.Voice);
  if (!voiceOn(L.aiOpts())) throw new Error(VOICE_NOT_ON);
  if (!stock) throw new Error(PICK_VOICE);
  const rows = rowsOf(list), have = clipsFor(list), todo = rows.map((_, k) => k).filter((k) => !have[k]);
  if (!todo.length) return list;
  const made: Clip[] = [], failure: { error: Error | null } = { error: null };
  let next = list;
  const ok = await withFile(async (id) => {
    for (const k of todo) {
      try { const v = await speak({ contributionId: id, voiceId: stock.voice_id, text: rows[k][2] ?? '' }); made.push({ slide: k, text: (rows[k][2] ?? '').trim(), path: v.path, seconds: v.seconds, marks: v.marks }); }
      catch (e) { failure.error = e as Error; break; }
    }
    next = withClips(list, [...(have.filter(Boolean) as Clip[]), ...made]);
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
    async () => { if (rowsOf(list).some((r) => !(r[2] ?? '').trim())) throw new Error(WRITE_TALK); },
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
  const { L, nw } = ctx, list = listOf(nw), shape = nw.shape ?? {}, rows = rowsOf(list), seconds = slidesSeconds(list, shape);
  const voiced = clipsFor(list).filter(Boolean).length, on = voiceOn(L.aiOpts());
  const counts = rows.length ? ' · ' + lengthWords(seconds) + ' · counts ' + horizonHours(seconds) + ' h' : '';
  return {
    line: wantsVoice(shape) ? 'AI voice · voiced ' + voiced + ' of ' + rows.length + ' slides' + (voiced === rows.length ? counts : '')
      : 'Captions only · no voice is made, each slide is read at ' + PACE + ' words a minute' + counts,
    hear: on || !rows.length ? null : { label: BROWSER_VOICE, slides: rows.map((r) => ({ title: r[0], run: () => speakInBrowser(r[2] ?? '') })) },
  };
}
