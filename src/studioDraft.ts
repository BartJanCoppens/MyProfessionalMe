// "Draft with AI" for every studio, one path (studios plan, Task 1.4): ground on the picked bundles, ask the AI use, read the
// answer strictly, fall back to scripted rows when there are any, and set the items with their provenance (`how`). Flash cards
// and exams (createItems.ts) and the other studios differ only in the DraftSpec they hand in.
import type { Logic } from './model';
import type { AppState, Bundle, NewDraft } from './types';
import { domainName } from './logic/contribution';
import { retrieve, usablePassage } from './logic/okf';
import type { Hit } from './logic/okf';
import type { DraftItems, Item } from './logic/items';
import { scriptedItems, parseStudioItems, studioRequest } from './logic/studioItems';
import type { StudioDef, StudioEntry } from './logic/studios';
import { droppedBlocks, keepBlocks } from './logic/courseEdit';
import type { AiUseKey } from './logic/ai';
import { canComplete } from './lib/ai';
import type { AiRequest } from './lib/ai';

// Whether the screen still holds the draft a job started on: the same saved row, or, for a draft not saved yet, the same form.
const idOf = (s: AppState) => s.editing ?? s.nw.savedId ?? null;
export const sameDraft = (started: AppState, now: AppState): boolean => (idOf(started) ? idOf(now) === idOf(started) : now.nw.key === started.nw.key);
// The state a long job (a build) saves from: the newest, so edits made meanwhile are kept, but only while the screen is still on the
// draft the job started on; after the creator moved to another draft, New or Cancel, the state the job started with, so it never
// writes into the wrong draft and the build is not lost.
export const latestDraft = (L: Logic): AppState => { const now = L.latest().state; return sameDraft(L.state, now) ? now : L.state; };

export type SetNw = (p: Partial<NewDraft> | ((cur: NewDraft) => Partial<NewDraft>)) => void;
// What a studio's build runner works with: the view-model, the draft on screen, how to change it, and the one save step that stores a
// file with the draft (createSave.saveWithFile, handed in by createVals): true when the draft and its items landed.
export type WithFile = (attach: (id: string) => Promise<Item[]>, done: string, how: DraftItems['how']) => Promise<boolean>;
export type BuildCtx = { L: Logic; nw: NewDraft; setNw: SetNw; withFile: WithFile };

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
  const cited = nw.brief?.passages ?? [];
  if (!bundles.length && !cited.length) { L.say('Pick at least one knowledge bundle'); return; }
  // A placeholder's draft starts from the passages its module cites, then the picked bundles' best matches.
  const passages = [...cited, ...passagesOf(bundles, query)].slice(0, 8);
  if (!passages.length) { L.say('These bundles have no passages a creator may use'); return; }
  const s = spec(passages);
  L.setState({ nwAiBusy: true });
  const out = await runDraft(L, s);
  L.setState({ nwAiBusy: false });
  // The creator cannot change the format meanwhile; if it changed anyway, the answer is dropped.
  if (typeof out === 'string') { L.say(out); return; }
  // A course drafted again keeps the blocks built so far on the lessons that remain; when that would remove blocks, the creator is asked first (it cannot be undone).
  if (nw.type === 'E-learning' && droppedBlocks(currentList(L), out.list as StudioEntry[])) { L.setState((s) => ({ studio: { ...s.studio, redraft: out } })); return; }
  applyDraft(setNw, nw.type, out);
}

const currentList = (L: Logic) => (L.latest().state.nw.items?.list ?? []) as StudioEntry[];
// The drafted items onto the draft: a course keeps its blocks on the lessons that remain (by the items as they are now).
export const applyDraft = (setNw: SetNw, type: string, out: DraftItems) =>
  setNw((cur) => (cur.type === type ? { items: type === 'E-learning' ? { ...out, list: keepBlocks((cur.items?.list ?? []) as StudioEntry[], out.list as StudioEntry[]) as Item[] } : out } : {}));
// The question under Draft while a redraft waits: how many blocks it would remove, counted on the course as it is now.
export const redraftText = (current: StudioEntry[], out: DraftItems) => {
  const lost = droppedBlocks(current, out.list as StudioEntry[]);
  return lost ? 'This removes ' + lost + ' block' + (lost > 1 ? 's' : '') + ' from lessons the new draft no longer has' : 'Use the new draft of the lessons';
};

// One draft run on a spec: the AI's items, else the scripted rows when there are any (labelled as scripted, never AI), else the sentence that says why
// there is nothing. `onLimit` hears a reached daily limit (a loop of drafts stops there). The one run behind a studio's button and "Draft with AI" on a placeholder.
export async function runDraft(L: Logic, s: DraftSpec, onLimit?: (message: string) => void): Promise<DraftItems | string> {
  const live = canComplete(s.use, L.aiOpts());
  if (!live && !s.scripted) return s.noScript;
  const ai = live ? await L.viaAi(s.use, s.request, s.parse, onLimit) : null;
  if (ai) return { list: ai, how: 'ai', problems: [], note: s.aiNote };
  if (!s.scripted) return s.failed;
  return { list: s.scripted, how: 'scripted', problems: [], note: live ? 'AI draft unavailable · scripted from the bundle' : 'Scripted from the bundle · no AI connection for this use' };
}

// The spec of a generic studio (use studio_draft); Game has no scripted rows.
export const studioSpec = (def: StudioDef, nw: NewDraft) => (passages: string[]): DraftSpec => ({
  use: 'studio_draft', request: studioRequest(def, nw, passages), parse: (raw) => parseStudioItems(def, raw, nw.shape), scripted: scriptedItems(def, nw, passages),
  noScript: 'Draft with AI or write the items yourself', failed: 'AI did not return usable items · try again or write them yourself',
  aiNote: 'AI-assisted draft · grounded on the picked bundles · check every item' });
export const studioQuery = (nw: NewDraft) => nw.title + ' ' + nw.take + ' ' + domainName(nw.dom);
