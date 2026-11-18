// One message to the Trajectory AI (Phase 7), from the "Build with AI" panel: the guards, the bounded request (planRequest), the one AI path
// (completeOrThrow: the function's own words are shown, never a scripted plan) and the answer laid onto the trajectory the call was for. The
// plan changes only here and in the curating actions; nothing changes the trajectory itself until Apply.
import type { Logic } from './model';
import { LEARN } from './data';
import { completeOrThrow } from './lib/ai';
import { usableBundles } from './createGrounding';
import { catalogueFor, poolFor } from './logic/planPool';
import { PLAN_ASK, planRequest, requestChars } from './logic/planPrompt';
import { mergeReply, readPlanReply, seenKeys } from './logic/planReply';
import type { PlanReply } from './logic/planReply';
import { PLAN_CAPS, PLAN_FORMATS } from './logic/trajectoryPlan';
import type { PlanMessage, PlanRecord } from './logic/trajectoryPlan';
import type { Trajectory } from './logic/trajectory';
import { blankRecord, editRecord, failed } from './trajectoryAiState';

export const TRAJECTORY_AI = 'trajectory_ai';
export const OFF_TEXT = 'Build with AI needs AI: a System Admin switches on Trajectory AI in AI connections';
const UNUSABLE = 'AI did not return a usable plan · try again';
const TOO_LONG = `A message is at most ${PLAN_CAPS.messageChars.toLocaleString('en-US')} characters`;
let counter = 0;
const newId = () => 'm' + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 4);

// The request for this trajectory as the state is now: the pool from its sources and picked bundles (all bundles are known, for cited chunks), the catalogue of its line.
function requestFor(L: Logic, t: Trajectory, record: PlanRecord, text: string, focus: string | null, mode: 'talk' | 'propose') {
  const s = L.latest().state, sources = s.trjPlans[t.id]?.sources ?? [];
  const query = [text, t.name, record.plan.brief?.goal ?? ''].join(' ');
  const bundles = usableBundles(s.bundles, t.business_line).filter((b) => record.bundleIds.includes(b.id));
  const pool = poolFor({ plan: record.plan, sources, bundles, known: s.bundles, query });
  const catalogue = catalogueFor({ plan: record.plan, learnings: LEARN, line: t.business_line, query });
  return planRequest({ trajectory: t, record, pool, catalogue, say: text, focus, mode });
}

// The AI's message: its words, then its questions.
const aiMessage = (r: PlanReply, focus: string | null, merged: { kept: number; suggested: number }): PlanMessage => ({
  role: 'ai', at: new Date().toISOString(), text: r.reply + (r.questions.length ? '\n\n' + r.questions.map((q, i) => `${i + 1}. ${q}`).join('\n') : ''),
  ...(focus ? { focus } : {}), ...(r.dropped.sources + r.dropped.learnings + r.dropped.formats ? { dropped: r.dropped } : {}), ...(merged.kept + merged.suggested ? { merged: { kept: merged.kept, suggested: merged.suggested } } : {}),
});
const append = (r: PlanRecord, m: PlanMessage): PlanRecord => ({ ...r, messages: [...r.messages, m].slice(-PLAN_CAPS.messages) });

export async function sendToPlan(L: Logic, trajectoryId: string, say: string, mode: 'talk' | 'propose', focus: string | null): Promise<void> {
  if (L.state.trjAi.busy || L.readOnly()) return;
  const t = L.state.trjs.find((x) => x.id === trajectoryId);
  if (!t) return;
  if (!L.aiCan(TRAJECTORY_AI)) return L.say(OFF_TEXT);
  const text = say.trim() || (mode === 'propose' ? 'Propose the plan.' : '');
  if (!text) return;
  if (text.length > PLAN_CAPS.messageChars) return failed(L, TOO_LONG);
  const record = L.latest().state.trjPlans[trajectoryId]?.record ?? blankRecord(trajectoryId);
  const built = requestFor(L, t, record, text, focus, mode), { numbering } = built, request = { ...built.request, trajectoryId };
  if (requestChars(request) > PLAN_ASK.budgetChars) return failed(L, 'The request is too large to send · remove a source or a bundle');
  L.setState((st) => ({ trjAi: { busy: 'send', error: null }, trjPanel: { ...st.trjPanel, say: '', focus: null } }));
  const said: PlanMessage = { role: 'admin', text, at: new Date().toISOString(), ...(focus ? { focus } : {}) };
  editRecord(L, trajectoryId, (r) => append(r, said));
  let reply: PlanReply | null = null, failure: string | null = null;
  try {
    const out = await completeOrThrow(TRAJECTORY_AI, request, L.aiOpts(), OFF_TEXT);
    reply = out.cut ? null : readPlanReply(out.text, { numbering, formats: PLAN_FORMATS, prev: record.plan.modules, newId });
  } catch (err) { failure = (err as Error).message; }
  if (reply) {
    // Merged against the plan as it was when asked (record.plan) and as it is now; the message is made once, so what is saved is what is shown.
    const r = reply, ctx = { snapshot: record.plan, seen: seenKeys(numbering) };
    const message = aiMessage(r, focus, mergeReply(L.latest().state.trjPlans[trajectoryId]?.record?.plan ?? record.plan, r, ctx));
    editRecord(L, trajectoryId, (cur) => append({ ...cur, plan: mergeReply(cur.plan, r, ctx).plan }, message));
  }
  failed(L, reply ? null : failure ?? UNUSABLE);
}
