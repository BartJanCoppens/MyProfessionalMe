// View-model of the learner's trajectory page (design v4): the steps with their actions, progress, and the credential.
// Actions render only when the subject is the signed-in person; View as shows the viewed person's progress and nothing to click.
import { AUD_INFO } from './data';
import { monthLabel, relevantMap, stepHours, stepProofProblem, totals, trajectoryProgress } from './logic/trajectory';
import type { StepProgress, Trajectory, TrjStep } from './logic/trajectory';
import { canWithdraw, stepAction } from './logic/trajectoryLearner';
import { STEP_KINDS, enrolLabel, fmtHours, stepTitle, validLabel } from './logic/trajectoryView';
import { requestTrajectory, submitTrajectoryStep, withdrawTrajectory } from './lib/trajectoryStore';
import type { StepDraft } from './types';
import { act, enrolmentOf } from './trajectoryCtx';
import type { Ctx } from './trajectoryCtx';

// The design's yearly hours budget: the app has no per-stage or per-line goal.
const YEARLY_HOURS = 80;
const BLANK: StepDraft = { link: '', ref: '', note: '' };
export type Btn = { label: string; run: () => unknown };
export type StepForm = StepDraft & { showNote: boolean; showRef: boolean; set: (field: keyof StepDraft, value: string) => void };
export type StepActVm = { label: string; variant: 'primary' | 'secondary'; hint: string; run: () => unknown; form: StepForm | null };

const STATE_CHIP = { done: 'accepted', progress: 'in-progress', submitted: 'submitted', booked: 'in-progress', open: 'not-started' } as const;

function stepAct(c: Ctx, t: Trajectory, st: TrjStep, p: StepProgress, enrolled: boolean, isNext: boolean): StepActVm | null {
  const what = stepAction(st.k, p.state);
  if (!what || p.locked || p.missing) return null;
  const variant = isNext ? 'primary' : 'secondary';
  if (what === 'open') return { label: 'Open learning', variant, hint: p.state === 'progress' ? 'Pick up where you left off.' : '', form: null, run: () => c.L.openDetail(st.lid!, 'trajectory') };
  if (c.ro || !enrolled) return null;
  const key = c.me + '|' + t.id + '|' + st.id, d = c.L.state.stepDraft[key] ?? BLANK;
  const clear = () => c.L.setState((s) => { const next = { ...s.stepDraft }; delete next[key]; return { stepDraft: next }; });
  const send = (state: 'submitted' | 'booked', proof: Partial<StepDraft>, done: string) => act(c, () => submitTrajectoryStep(t.id, st.id, state, proof), done, clear);
  const withProof = (kind: 'evidence' | 'exam', done: string) => () => {
    const proof = { link: d.link.trim(), ref: d.ref.trim(), note: d.note.trim() }, problem = stepProofProblem(kind, proof);
    return problem ? c.L.say(problem) : send('submitted', proof, done);
  };
  const set = (field: keyof StepDraft, value: string) => c.L.setState((s) => ({ stepDraft: { ...s.stepDraft, [key]: { ...(s.stepDraft[key] ?? BLANK), [field]: value } } }));
  if (what === 'signoff') return { label: 'Request sign-off', variant, hint: c.boss + ' signs off in Waiting for you.', form: null, run: () => send('submitted', {}, 'Sign-off requested from ' + c.boss) };
  if (what === 'book') return { label: 'Book the exam', variant, hint: 'Marks the exam as booked; book your slot with ' + t.issuer + '.' + (t.cost ? ' ' + t.cost : ''), form: null, run: () => send('booked', {}, 'Exam marked as booked') };
  const evidence = what === 'evidence';
  return {
    label: evidence ? 'Send for review' : 'Submit the result', variant, form: { ...d, showNote: evidence, showRef: !evidence, set },
    hint: evidence ? 'Your evidence goes to ' + c.boss + ' for review.' : 'Add your certificate link or number; ' + c.boss + ' confirms it.',
    run: withProof(evidence ? 'evidence' : 'exam', evidence ? 'Evidence sent to ' + c.boss : 'Result sent to ' + c.boss),
  };
}

function stepVm(c: Ctx, t: Trajectory, i: number, p: StepProgress, enrolled: boolean, next: number, start: number) {
  const st = t.steps[i], [kind, tone] = STEP_KINDS[st.k], it = st.lid ? c.byId[st.lid] : undefined, h = stepHours(st, c.byId), isNext = enrolled && i === next;
  const chip: [string, string] = p.missing ? ['na', 'No longer in the library'] : p.locked ? ['na', 'Locked']
    : p.state === 'submitted' ? ['submitted', 'With ' + c.boss] : p.state === 'booked' ? ['in-progress', 'Booked']
    : p.state === 'progress' ? ['in-progress', 'In progress' + (p.pct ? ' · ' + p.pct + '%' : '')] : [STATE_CHIP[p.state], p.state === 'done' ? 'Done' : isNext ? 'Next' : 'To do'];
  const required = st.req || st.k === 'exam', done = p.state === 'done';
  return {
    id: st.id, mark: done ? '✓' : String(i + 1), kind, tone, st: chip[0], stLabel: chip[1],
    title: stepTitle(st, (id) => c.byId[id]?.title ?? 'A learning that is no longer in the library'),
    meta: [it ? it.format + ' · ' + it.source : null, h ? fmtHours(h) + (st.k === 'elect' ? ' at least' : '') : null, 'target ' + monthLabel(start + (st.win || 1)), required ? null : 'optional'].filter(Boolean).join(' · '),
    cBg: done ? '#86BC25' : isNext ? '#1a1d18' : '#fff', cFg: done ? '#10180a' : isNext ? '#fff' : '#1a1d18', cBd: required ? '1.5px solid #1a1d18' : '1.5px dashed #8b918a',
    lineBg: done ? '#86BC25' : '#e1e5dc', bg: isNext ? '#fbfdf6' : '#fff', op: p.locked ? 0.7 : 1,
    lockText: p.locked ? 'Unlocks when step ' + (t.steps.findIndex((x) => x.id === st.pre) + 1) + ' is done.' : '',
    opts: st.k === 'elect' ? (st.opts || []).filter((id) => c.byId[id]).map((id) => ({ title: c.byId[id].title, sub: c.byId[id].format + ' · ' + c.byId[id].hoursLabel + ' · ' + c.byId[id].stateLabel, open: () => c.L.openDetail(id, 'trajectory') })) : [],
    act: stepAct(c, t, st, p, enrolled, isNext),
  };
}

// Start, ask or leave; none of them for a viewed person.
function buttons(c: Ctx, t: Trajectory): { primary: Btn | null; secondary: Btn | null } {
  const row = c.enrols[t.id], e = enrolmentOf(c, t);
  if (c.ro) return { primary: null, secondary: null };
  const leave = (label: string, done: string): Btn => ({ label, run: () => act(c, () => withdrawTrajectory(t.id), done) });
  if (!e) {
    const ask = t.enrol === 'approval';
    return { secondary: null, primary: { label: ask ? 'Ask ' + c.bossFirst + ' to approve' : 'Start this trajectory',
      run: () => act(c, async () => { const r = await requestTrajectory(t.id); return { error: r.error }; }, ask ? 'Sent to ' + c.boss + ' for approval' : 'Started') } };
  }
  const secondary = canWithdraw(t, row, c.person) ? (e.status === 'requested' ? leave('Withdraw request', 'Request withdrawn') : leave('Leave this trajectory', 'You left this trajectory')) : null;
  return { primary: null, secondary };
}

function callout(c: Ctx, t: Trajectory, pg: ReturnType<typeof trajectoryProgress>, status: string | undefined, start: number, binds: boolean): string {
  if (status === 'enrolled') {
    const m = relevantMap(t, [c.L.bl()], c.person.stage), intro = binds && m ? 'Enrolled automatically: mandatory for ' + (AUD_INFO[m[0]]?.name ?? m[0]) + ' at ' + m[1] + '. ' : '';
    if (pg.complete) return 'Every required step is done. The credential is in the wallet on My profile.';
    if (pg.next >= 0) return intro + 'Next: ' + stepTitle(t.steps[pg.next], (id) => c.byId[id]?.title ?? '') + '. Aim for ' + monthLabel(start + (t.steps[pg.next].win || 1)) + '.';
    return intro + 'The open steps are with ' + c.boss + ' or waiting on a prerequisite.';
  }
  if (status === 'requested') return 'Waiting for ' + c.boss + ' to approve the start. It can begin once they approve.';
  if (c.ro) return 'Not started.';
  const m = relevantMap(t, [c.L.bl()], c.person.stage) ?? relevantMap(t, [c.L.bl()]);
  if (!m) return 'This trajectory is for ' + (t.maps.map((x) => (AUD_INFO[x[0]]?.name ?? x[0]) + ' at ' + x[1]).join(', ') || 'nobody yet') + '. If it fits where you want to go, talk to ' + c.boss + ' first.';
  if (t.enrol === 'approval') return 'Open to you via ' + AUD_INFO[m[0]]?.name + '. ' + c.boss + ' approves the start.';
  return 'Open to you via ' + AUD_INFO[m[0]]?.name + '. Start whenever you like; it never counts toward readiness.';
}

export function trajectoryPage(c: Ctx, t: Trajectory) {
  const e = enrolmentOf(c, t), enrolled = e?.status === 'enrolled', pg = trajectoryProgress(t, e, c.byId), tot = totals(t, c.byId);
  const start = e ? e.start_month : (c.now.getUTCFullYear() * 12 + c.now.getUTCMonth()), validity = t.valid_months ? validLabel(t.valid_months) : '';
  const m = relevantMap(t, [c.L.bl()], c.person.stage) ?? relevantMap(t, [c.L.bl()]);
  const mandatory = !!m && m[2] === 'mandatory' && AUD_INFO[m[0]]?.lens === 'bl';
  const ob = m ? (mandatory ? ['neutral', 'Mandatory'] : m[2] === 'advised' && AUD_INFO[m[0]]?.lens === 'bl' ? ['blue', 'Advised'] : ['muted', 'Suggested']) : e ? ['green', 'Chosen by me'] : ['muted', 'Open'];
  const binds = enrolled && !c.enrols[t.id];
  return {
    name: t.name, issuer: t.issuer, cred: t.credential || 'Credential', obTone: ob[0], obLabel: ob[1],
    st: enrolled ? (pg.complete ? 'accepted' : 'in-progress') : e ? 'submitted' : 'not-started',
    stLabel: enrolled ? (pg.complete ? 'All steps done' : 'Enrolled since ' + monthLabel(start)) : e ? 'Waiting for approval' : 'Not started',
    stepsSub: enrolled ? 'Done steps turn green. Locked steps open once their prerequisite is done. Dashed circles are optional.' : 'This is the path you would follow. Dates assume you start this month.',
    steps: t.steps.map((_, i) => stepVm(c, t, i, pg.steps[i], enrolled, pg.next, start)),
    credBg: pg.complete ? '#e0a100' : '#fdf3dc', credFg: pg.complete ? '#fff' : '#7a5000',
    credMeta: t.issuer + ' · expected ' + monthLabel(start + t.months) + ' · ' + (validity ? 'valid ' + (t.valid_months === 12 ? '1 year' : validity) + (t.renewal ? ', then ' + t.renewal.charAt(0).toLowerCase() + t.renewal.slice(1) : '') : 'does not expire'),
    frac: pg.reqDone / Math.max(1, pg.reqN), progLabel: pg.reqDone + ' of ' + pg.reqN, progSub: 'required steps done',
    callout: callout(c, t, pg, e?.status, start, binds), ...buttons(c, t),
    kv: [{ k: 'Credential', v: t.credential || '—' }, { k: 'Issued by', v: t.issuer }, { k: 'Study time', v: fmtHours(tot.tot) + ' over ' + t.months + ' months' },
      { k: 'This year', v: fmtHours(tot.perYear[0]) + ' of your ' + YEARLY_HOURS + ' h' }, { k: 'CPD units', v: tot.cpd ? String(tot.cpd) : 'None' },
      { k: 'Valid for', v: validity ? (t.valid_months === 12 ? '1 year' : validity) : 'Does not expire' }, { k: 'Renewal', v: t.renewal || '—' }, { k: 'Cost', v: t.cost || '—' }, { k: 'How to start', v: enrolLabel(t.enrol) }],
  };
}
export type TrajectoryPageVm = ReturnType<typeof trajectoryPage>;
