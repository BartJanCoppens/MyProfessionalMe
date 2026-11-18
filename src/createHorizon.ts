// Create & share: a Presentation's .horizon file (studios plan, Task 3.3; Review Focus 6). The file is read and checked
// in the browser first (src/horizon/readDeck.ts: a .horizon file of at most 50 MB, JSON, format 'horizon', a version
// this player reads, with slides; and no client names in what it shows); a refused file is never stored and the form
// says why. Otherwise the draft is saved through the one save step (createSave.saveWithFile), the file uploaded into the
// contribution's folder through the media adapter, and its summary saved as the contribution's one item.
import type { ChangeEvent } from 'react';
import type { Logic } from './model';
import type { NewDraft } from './types';
import { saveWithFile } from './createSave';
import { deckProblem, deckSummary, deckText, readDeck } from './horizon/readDeck';
import { uploadMedia } from './lib/mediaStore';
import { blockedTerm } from './logic/contribution';
import { HORIZON_SECONDS_MAX, HORIZON_SLIDES_MAX, deckLine, isHorizonItem } from './logic/horizonItem';
import type { HorizonItem } from './logic/horizonItem';
import { noItems } from './logic/items';
import { MEDIA_KINDS } from './logic/mediaFiles';

const FILE_NAME = 'presentation.horizon'; // one per contribution: a new file replaces the last
const cap = (w: string) => w.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
export const horizonItemOf = (nw: NewDraft) => (nw.items?.list ?? []).find(isHorizonItem) ?? null;

// The panel under the takeaway for a Presentation, or null for the other formats.
export function horizonPanel(L: Logic, nw: NewDraft) {
  if (nw.type !== 'Presentation') return null;
  const item = horizonItemOf(nw);
  return {
    item: item && { title: item.title, line: deckLine(item) }, problems: nw.items?.problems ?? [], busy: L.state.createBusy,
    max: 'Up to ' + MEDIA_KINDS.horizon.maxBytes / 1024 / 1024 + ' MB', accept: '.horizon',
    pick: (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addHorizonFile(L, f); },
  };
}
// The form's check line for the file.
export const horizonCheck = (nw: NewDraft) => { const item = horizonItemOf(nw); return { ok: !!item, text: item ? 'Presentation added · ' + deckLine(item) : 'Add the .horizon file' }; };

// Why a file cannot be added, or its summary and the title it suggests.
async function readFile(file: File): Promise<{ why: string } | { sum: Omit<HorizonItem, 'kind' | 'path'> }> {
  const size = deckProblem(file.name, file.size);
  if (size) return { why: size };
  let deck;
  try { deck = readDeck(await file.text()); } catch (e) { return { why: (e as Error).message }; }
  const term = blockedTerm(deckText(deck));
  if (term) return { why: '“' + cap(term) + '” looks like a client name in the presentation · anonymise it in Horizon' };
  const sum = deckSummary(deck);
  if (sum.slides > HORIZON_SLIDES_MAX || sum.seconds > HORIZON_SECONDS_MAX) return { why: 'This presentation is too long to add: at most ' + HORIZON_SLIDES_MAX + ' slides and 10 hours of narration' };
  return { sum };
}

export async function addHorizonFile(L: Logic, file: File) {
  if (L.readOnly() || L.state.createBusy) return;
  const r = await readFile(file);
  if ('why' in r) { L.setState((st) => ({ nw: { ...st.nw, items: { ...(st.nw.items ?? noItems()), problems: [r.why] } } })); return; }
  const title = L.state.nw.title.trim() ? {} : { title: r.sum.title.slice(0, 60) };
  await saveWithFile(L, async (id) => [{ kind: 'horizon', path: await uploadMedia(id, file, FILE_NAME), ...r.sum }], title, 'Saved as draft · the presentation is stored with it');
}
