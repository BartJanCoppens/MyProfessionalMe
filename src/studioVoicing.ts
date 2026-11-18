// The voicing the voice studios share (studios plan, Tasks 3.4 and 3.5: Slides, Podcast): which stock voices a creator may
// choose, the voice a part is told in, and the one runner that has the AI voice (voice.speak, the one adapter) say every part
// that has no clip in its voice yet, storing each with the draft through the one save step. A part that fails stops the rest;
// the ones voiced are kept and the error is thrown after they are saved, so a retry voices only the rest. Nothing is voiced
// without the live AI voice, and the browser voice is only a labelled preview that is never stored.
import type { StockVoice } from './logic/ai';
import type { Item } from './logic/items';
import { noItems } from './logic/items';
import { stepsOf } from './logic/studios';
import type { StudioEntry } from './logic/studios';
import { voiceOf, withClips } from './logic/voiceItem';
import type { Clip } from './logic/voiceItem';
import { speak, voiceOn } from './lib/voice';
import type { BuildCtx } from './studioDraft';
import type { NewDraft } from './types';

export const PICK_VOICE = 'Pick a stock voice in Produce first';
export const NO_STOCK_VOICES = 'No stock voices yet · a System or General Admin adds them on the AI connections page';

// The active stock voices a creator may choose; null while they are loading.
export const stockVoicesOf = (L: BuildCtx['L']): StockVoice[] | null => L.state.stockVoices?.filter((v) => v.active) ?? null;
// The voice picked under a cast key (the name chosen in Produce), else, after a reload or an Edit when the pick is gone, the one the
// clips were made in (`madeIn`, a provider voice id).
export function voiceFor(L: BuildCtx['L'], nw: NewDraft, key: string, madeIn: string | undefined): StockVoice | undefined {
  const voices = stockVoicesOf(L);
  return nw.cast?.[key] ? voices?.find((v) => v.name === nw.cast?.[key]) : voices?.find((v) => v.voice_id === madeIn);
}

// The draft without the clips `keep` refuses (picking another voice drops the clips made in the old one, so they are voiced again).
export function dropClips(cur: NewDraft, keep: (c: Clip) => boolean): Partial<NewDraft> {
  const list = (cur.items?.list ?? []) as StudioEntry[], have = voiceOf(list)?.clips ?? [];
  return have.every(keep) ? {} : { items: { ...(cur.items ?? noItems()), list: withClips(stepsOf(list), have.filter(keep)) as Item[] } };
}

// What one part says and the provider voice id it is told in (undefined: no voice picked for it yet).
export type VoicePart = { text: string; voice: string | undefined };

// Says each part without a clip in its voice, stores each with the draft (one save step) and returns the entries with all their clips.
// `list` holds the rows and any voice-over; `notOn` is what the studio says when the AI voice cannot be used; a clip counts for a part while it was made from the part's words in the part's voice.
export async function voiceParts({ L, nw, withFile }: Pick<BuildCtx, 'L' | 'nw' | 'withFile'>, list: StudioEntry[], parts: VoicePart[], notOn: string): Promise<StudioEntry[]> {
  const have = voiceOf(list)?.clips ?? [];
  const kept = have.filter((c) => parts[c.slide] && c.voice === parts[c.slide].voice && c.text.trim() === parts[c.slide].text.trim());
  const todo = parts.map((_, k) => k).filter((k) => !kept.some((c) => c.slide === k));
  if (!todo.length) return list; // every part is voiced in its voice
  if (!voiceOn(L.aiOpts())) throw new Error(notOn);
  if (todo.some((k) => !parts[k].voice)) throw new Error(PICK_VOICE);
  const made: Clip[] = [], failure: { error: Error | null } = { error: null };
  let next = list;
  const ok = await withFile(async (id) => {
    for (const k of todo) {
      const text = parts[k].text.trim();
      try { const v = await speak({ contributionId: id, voiceId: parts[k].voice!, text }); made.push({ slide: k, text, voice: parts[k].voice!, path: v.path, seconds: v.seconds, marks: v.marks, ...(v.words.length ? { words: v.words } : {}) }); }
      catch (e) { failure.error = e as Error; break; }
    }
    next = withClips(stepsOf(list), [...kept, ...made]) as StudioEntry[];
    return next as Item[];
  }, 'Saved as draft · the voice-over is stored with it', nw.items?.how ?? '');
  if (!ok) throw new Error('The voice-over could not be saved · try again');
  if (failure.error) throw failure.error;
  return next;
}
