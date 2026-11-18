// "Draft with AI" from a placeholder step (Studios Phase 7, Task 7.5). A placeholder is the material a trajectory is waiting for; its editors draft it in the
// matching studio with the module's brief (goals, depth, cited passages), through the studios' own path: the creation grant of a placeholder
// (trajectoryMade), the studio's draft run (studioDraft), the contribution save (createSave) and the check, review and publish that follow. Nothing here
// publishes or links by itself: the step links to its draft when it is saved (linkMadeStep) and the database links it to the learning once published.
import type { Logic } from './model';
import type { Bundle, NewDraft } from './types';
import { domainName } from './logic/contribution';
import { briefDraft } from './logic/planDraft';
import { fromModule } from './logic/planApply';
import { emptyPlan } from './logic/trajectoryPlan';
import type { PlanModule } from './logic/trajectoryPlan';
import type { Trajectory, TrjStep } from './logic/trajectory';
import { studioById, visibleSteps } from './logic/studios';
import type { StudioDef } from './logic/studios';
import { studioFor } from './logic/planDraft';
import { myLine, newKey, rowOf, setNwOf } from './createSave';
import { flashSpec } from './createItems';
import { usableBundles } from './createGrounding';
import { draftItems, passagesOf, runDraft, studioQuery, studioSpec } from './studioDraft';
import type { DraftSpec } from './studioDraft';
import { saveDraft } from './lib/contributionStore';
import { isTaken, linkMadeStep } from './trajectoryMade';
import { refusal } from './trajectoryAdminVals';

// The cited knowledge bundles a creator of this line may use (the studio's picked bundles).
export function briefBundleIds(module: PlanModule, bundles: Bundle[], line: string | null): string[] {
  const cited = new Set(module.sources.flatMap((c) => (c.ref.kind === 'kb' ? [c.ref.bundleId] : [])));
  return usableBundles(bundles, line).filter((b) => cited.has(b.id)).map((b) => b.id);
}

type Prepared = { t: Trajectory; step: TrjStep; def: StudioDef; nw: NewDraft; kb: string[]; picked: Bundle[] };
// What a placeholder opens its studio with, or the sentence that says why it cannot be drafted.
function prepare(L: Logic, trajectoryId: string, stepId: string): Prepared | string {
  const t = L.state.trjs.find((x) => x.id === trajectoryId), step = t?.steps.find((s) => s.id === stepId && s.k === 'make');
  if (!t || !step) return 'That placeholder is no longer in the trajectory';
  if (isTaken(step)) return 'A draft is already linked to this placeholder';
  const def = studioById(studioFor(step.fmt ?? '') ?? '');
  if (!def) return 'No studio makes ' + (step.fmt ?? 'this format') + ' · add it as evidence instead';
  const why = refusal(L, t);
  if (why) return why;
  const state = L.state.trjPlans[trajectoryId], plan = state?.record?.plan ?? emptyPlan();
  const module: PlanModule = plan.modules.find((m) => step.from === fromModule(m.id))
    ?? { id: '', title: step.title ?? step.fmt ?? '', depth: 'foundation', goals: [], hours: step.hours ?? 1, material: [], sources: [], checks: [], accepted: true };
  const nw = briefDraft({ t, step, module, plan, line: L.editableLines().find(Boolean) ?? 'Consulting', bundles: L.state.bundles, sources: state?.sources ?? [], key: newKey() });
  const kb = briefBundleIds(module, L.state.bundles, myLine(L));
  return { t, step, def, nw, kb, picked: usableBundles(L.state.bundles, myLine(L)).filter((b) => kb.includes(b.id)) };
}
const querySpec = (def: StudioDef, nw: NewDraft): [string, (passages: string[]) => DraftSpec] =>
  (def.compact ? [nw.title + ' ' + domainName(nw.dom), flashSpec(nw)] : [studioQuery(nw), studioSpec(def, nw)]);

const busy = (L: Logic) => L.readOnly() || (L.state.nwAiBusy || L.state.createBusy || !!L.state.trjAi.busy ? (L.say('Wait for the draft to finish'), true) : false);

// Opens the matching studio at its Draft step with the module's brief, then runs the studio's own AI draft on it.
export async function openStudioFor(L: Logic, trajectoryId: string, stepId: string): Promise<void> {
  if (busy(L)) return;
  const made = prepare(L, trajectoryId, stepId);
  if (typeof made === 'string') { L.say(made); return; }
  const { def, nw, kb, picked } = made;
  L.setState({ screen: 'create', sel: null, mapSel: null, createTab: 'new', editing: null, nw, nwKb: kb, nwKbQ: '',
    studio: { view: 'studio', step: Math.max(0, visibleSteps(def).indexOf('Draft')), id: def.compact ? undefined : def.id } });
  const [query, spec] = querySpec(def, nw);
  await draftItems(L, nw, picked, setNwOf(L), query, spec);
}

const GAME_NOTE = 'Build the game in the Game Studio';
// One placeholder: its draft run, then, only when it gave rows, saved in the admin's name as a draft of its studio and linked to its step. A run that gave
// nothing saves and links nothing and says why (a Game has no scripted rows: it is built in its studio).
async function draftOne(L: Logic, p: Prepared, onLimit: (m: string) => void): Promise<{ note: string | null; limit: boolean; saved: boolean }> {
  const passages = [...(p.nw.brief?.passages ?? []), ...passagesOf(p.picked, querySpec(p.def, p.nw)[0])].slice(0, 8);
  const title = p.step.title ?? p.step.fmt ?? '', none = (note: string | null, limit = false) => ({ note: note && title + ': ' + note, limit, saved: false });
  if (!passages.length) return none('no cited passage a creator may use · open it in its studio and pick a bundle');
  let limit = false;
  const spec = querySpec(p.def, p.nw)[1](passages), out = await runDraft(L, spec, (m) => { limit = true; onLimit(m); });
  if (limit) return none(null, true);
  if (typeof out === 'string') return none(p.def.id === 'game' && out === spec.noScript ? GAME_NOTE : out);
  const id = await saveDraft(rowOf({ ...p.nw, items: out }, p.kb, p.def.id, null), null);
  const notLinked = linkMadeStep(L, p.t.id, p.step.id, id);
  return { note: notLinked && title + ': saved but not linked to the step · ' + notLinked, limit: false, saved: true };
}

// Several placeholders, one after the other (one AI call each); stops at the first daily limit. Each lands in My contributions as a draft, linked to its step.
export async function draftPlaceholders(L: Logic, trajectoryId: string, stepIds: string[]): Promise<{ drafted: number; notes: string[] }> {
  const out = { drafted: 0, notes: [] as string[] };
  if (busy(L)) return out;
  const t = L.state.trjs.find((x) => x.id === trajectoryId), ids = (t?.steps ?? []).filter((s) => stepIds.includes(s.id)).map((s) => s.id), total = ids.length;
  const progress = (done: number | null) => L.setState((s) => ({ trjAi: { ...s.trjAi, busy: done === null ? null : 'draft', drafting: done === null ? null : { done, total } } }));
  let limit: string | null = null, done = 0;
  progress(0);
  try {
    for (const id of ids) {
      const title = t?.steps.find((s) => s.id === id)?.title ?? id, made = prepare(L.latest(), trajectoryId, id);
      if (typeof made === 'string') { out.notes.push(title + ': ' + made); continue; }
      try {
        const r = await draftOne(L.latest(), made, (m) => { limit = m; });
        if (r.limit) break;
        if (r.saved) out.drafted++;
        if (r.note) out.notes.push(r.note);
      } catch (err) { out.notes.push(title + ': ' + (err as Error).message); } // one refusal never stops the rest
      progress(++done);
    }
  } finally { progress(null); }
  await L.latest().reloadCreate();
  const head = 'Drafted ' + out.drafted + ' of ' + total;
  if (limit) out.notes.push(head + ' · ' + limit);
  L.say(limit ? head + ' · ' + limit : head + ' · in My contributions as drafts · ' + FINISH);
  return out;
}
export const FINISH = 'Finish each in its studio: the questions, the check and Send for review';
