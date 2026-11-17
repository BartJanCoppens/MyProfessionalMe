// "Draft with AI" for every studio, one path (studios plan, Task 1.4): ground on the picked bundles, ask the AI use, read the
// answer strictly, fall back to scripted rows when there are any, and set the items with their provenance (`how`). Flash cards
// and exams (createItems.ts) and the other studios differ only in the DraftSpec they hand in.
import type { Logic } from './model';
import type { Bundle, NewDraft } from './types';
import { domainName } from './logic/contribution';
import { retrieve, usablePassage } from './logic/okf';
import type { Hit } from './logic/okf';
import type { DraftItems, Item } from './logic/items';
import { scriptedItems, parseStudioItems, studioRequest } from './logic/studioItems';
import type { StudioDef } from './logic/studios';
import type { AiUseKey } from './logic/ai';
import { canComplete } from './lib/ai';
import type { AiRequest } from './lib/ai';

export type SetNw = (p: Partial<NewDraft> | ((cur: NewDraft) => Partial<NewDraft>)) => void;

// What differs per format: the AI use and request, how its answer is read, the scripted rows (null when there are none) and the words shown.
export type DraftSpec = { use: AiUseKey; request: AiRequest; parse: (raw: string) => Item[] | null; scripted: Item[] | null;
  noScript: string; failed: string; aiNote: string };

// Passages a creator may use, with where each came from: the ones that match the piece, else every passage the bundles hold
// (never client or licensed ones).
export function hitsOf(bundles: Bundle[], query: string, max = 8): Hit[] {
  const hits = retrieve(bundles, query);
  const all = bundles.flatMap((b) => b.chunks.filter((c) => { const s = b.sources[c[0]]; return s && usablePassage(s); }).map((c): Hit => ({ text: c[1], src: b.sources[c[0]][0] + ' · ' + b.name, score: 0 })));
  return (hits.length ? hits : all).slice(0, max);
}
export const passagesOf = (bundles: Bundle[], query: string, max = 8): string[] => hitsOf(bundles, query, max).map((h) => h.text);

export async function draftItems(L: Logic, nw: NewDraft, bundles: Bundle[], setNw: SetNw, query: string, spec: (passages: string[]) => DraftSpec) {
  if (L.state.nwAiBusy || L.readOnly()) return;
  if (!bundles.length) { L.say('Pick at least one knowledge bundle'); return; }
  const passages = passagesOf(bundles, query);
  if (!passages.length) { L.say('These bundles have no passages a creator may use'); return; }
  const s = spec(passages), live = canComplete(s.use, L.aiOpts());
  if (!live && !s.scripted) { L.say(s.noScript); return; }
  L.setState({ nwAiBusy: true });
  const ai = live ? await L.viaAi(s.use, s.request, s.parse) : null;
  L.setState({ nwAiBusy: false });
  // The creator cannot change the format meanwhile; if it changed anyway, the answer is dropped.
  const land = (items: DraftItems) => setNw((cur) => (cur.type === nw.type ? { items } : {}));
  if (ai) { land({ list: ai, how: 'ai', problems: [], note: s.aiNote }); return; }
  if (!s.scripted) { L.say(s.failed); return; }
  land({ list: s.scripted, how: 'scripted', problems: [], note: live ? 'AI draft unavailable · scripted from the bundle' : 'Scripted from the bundle · no AI connection for this use' });
}

// The spec of a generic studio (use studio_draft); Game has no scripted rows.
export const studioSpec = (def: StudioDef, nw: NewDraft) => (passages: string[]): DraftSpec => ({
  use: 'studio_draft', request: studioRequest(def, nw, passages), parse: (raw) => parseStudioItems(def, raw), scripted: scriptedItems(def, nw, passages),
  noScript: 'Draft with AI or write the items yourself', failed: 'AI did not return usable items · try again or write them yourself',
  aiNote: 'AI-assisted draft · grounded on the picked bundles · check every item' });
export const studioQuery = (nw: NewDraft) => nw.title + ' ' + nw.take + ' ' + domainName(nw.dom);
