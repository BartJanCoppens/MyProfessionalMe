// Counsellor side of certification trajectories (design v4): requests and sign-offs waiting for the signed-in
// counsellor, a progress table for their counsellees, and the lines in the curriculum mapping's person zoom.
// Decisions go through Logic.persist, so View as refuses them; the screen shows no buttons then.
import { AUD_INFO, LEARN, LEARN_BY } from './data';
import { decideTrajectory } from './lib/trajectoryStore';
import type { Member } from './logic/team';
import { totals, trajectoryProgress } from './logic/trajectory';
import type { Enrolment, StepEntry, Trajectory, TrjStep } from './logic/trajectory';
import { effectiveEnrolment } from './logic/trajectoryLearner';
import { fmtHours, stepTitle } from './logic/trajectoryView';
import type { Logic } from './model';

type Library = Parameters<typeof totals>[1];
const PROOF_KINDS = ['evidence', 'check', 'exam'];
const KIND_LABEL: Record<string, string> = { evidence: 'Evidence', check: 'Sign-off', exam: 'Exam result' };
const titleOf = (id: string) => LEARN_BY[id]?.[1] ?? id;
const initialsOf = (name: string) => name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// Hours and CPD of every learning; with progress, the person's state and percentage too.
function library(progress: Member['data']['progress'] = {}): Library {
  return Object.fromEntries(LEARN.map((r) => [r[0], { hours: r[6], cpd: r[7], state: progress[r[0]]?.state ?? 'not-started', pct: progress[r[0]]?.pct ?? 0 }]));
}

// One line per trajectory mapped to one of the person's audiences at their stage (design: trjFor).
export function personTrajectories(trjs: Trajectory[], audiences: string[], stage: string | null): string[] {
  const lib = library();
  return trjs.flatMap((t) => {
    const map = t.maps.find((x) => audiences.includes(x[0]) && x[1] === stage);
    if (!map) return [];
    const tot = totals(t, lib), obligation = AUD_INFO[map[0]]?.lens === 'bl' && map[2] === 'mandatory' ? 'mandatory' : 'suggested';
    return [t.name + ' via ' + (AUD_INFO[map[0]]?.name ?? map[0]) + ' · ' + obligation + (t.status === 'live' ? '' : ' · draft') + ' · ' + fmtHours(tot.perYear[0]) + ' this year of ' + fmtHours(tot.tot) + ' over ' + t.months + ' months'];
  });
}

type Waiting = { member: Member; t: Trajectory; step: TrjStep | null; entry: StepEntry | null };

function waitingFor(member: Member, trjs: Trajectory[]): Waiting[] {
  const enrols = member.trj?.enrols ?? {};
  return trjs.flatMap((t): Waiting[] => {
    const e: Enrolment | undefined = enrols[t.id];
    if (!e) return [];
    if (e.status === 'requested') return [{ member, t, step: null, entry: null }];
    return t.steps.filter((st) => PROOF_KINDS.includes(st.k) && e.steps[st.id]?.state === 'submitted').map((st) => ({ member, t, step: st, entry: e.steps[st.id] }));
  });
}

function approvalRow(L: Logic, w: Waiting, canDecide: boolean, reload: (id: string) => Promise<void>) {
  const { member, t, step, entry } = w, first = member.name.split(' ')[0];
  const decide = (decision: 'approve' | 'talk', done: string) => () => L.persist(async () => {
    const { error } = await decideTrajectory(member.id, t.id, step?.id ?? null, decision);
    if (error) throw new Error(error);
    await reload(member.id);
  }, done);
  const signOff = step?.k === 'check' || step?.k === 'exam';
  const talkDone = step ? 'Sent back to ' + first + ' to talk it through' : 'Kept as a request; talk it through in your next 1:1';
  return {
    key: member.id + '|' + t.id + '|' + (step?.id ?? 'start'), userId: member.id, initials: initialsOf(member.name), name: member.name, trj: t.name,
    kind: step ? KIND_LABEL[step.k] : 'Start request',
    text: step ? stepTitle(step, titleOf) || KIND_LABEL[step.k] : 'Asks to start this trajectory.',
    proof: entry ? { link: entry.link ?? '', note: entry.note ?? '', ref: entry.ref ?? '' } : null,
    approveLabel: signOff ? 'Sign off' : 'Approve',
    approve: canDecide ? decide('approve', step ? 'Signed off · ' + first : 'Approved · ' + member.name + ' is enrolled') : null,
    talk: canDecide ? decide('talk', talkDone) : null,
  };
}

function tableRow(member: Member, t: Trajectory, e: Enrolment) {
  const lib = library(member.data.progress), pg = trajectoryProgress(t, e, lib);
  const submitted = t.steps.filter((st) => PROOF_KINDS.includes(st.k) && e.steps[st.id]?.state === 'submitted');
  const earned = !!member.trj?.creds.some((c) => c.trajectory_id === t.id && c.status === 'confirmed');
  const [st, stLabel] = earned ? ['accepted', 'Credential earned'] : submitted.some((s) => s.k === 'check' || s.k === 'exam') ? ['submitted', 'Needs sign-off']
    : e.status === 'requested' || submitted.length ? ['submitted', 'Needs approval'] : ['in-progress', 'On track'];
  const next = e.status === 'requested' ? 'Waiting for your approval' : pg.complete ? 'All required steps done' : pg.next >= 0 ? stepTitle(t.steps[pg.next], titleOf) : 'Nothing open';
  return {
    key: member.id + '|' + t.id, initials: initialsOf(member.name), name: member.name, grade: [member.stage || 'No stage', member.businessLine || 'No line'].join(' · '),
    trj: t.name, issuer: t.issuer, prog: pg.reqDone + ' of ' + pg.reqN + ' required steps', barW: Math.round(pg.reqDone / Math.max(1, pg.reqN) * 100) + '%', next, st, stLabel,
  };
}

export function teamTrjVals(L: Logic, members: Member[], reload: (userId: string) => Promise<void> = async () => {}) {
  const now = new Date(), canDecide = !L.subject.readOnly, trjs = L.state.trjs;
  const approvals = members.flatMap((m) => waitingFor(m, trjs)).map((w) => approvalRow(L, w, canDecide, reload));
  const teamTrj = members.flatMap((m) => trjs.flatMap((t) => {
    const e = effectiveEnrolment(t, m.trj?.enrols[t.id], { line: m.businessLine, stage: m.stage }, now);
    return e ? [tableRow(m, t, e)] : [];
  }));
  return { approvals, approvalCount: String(approvals.length), noApprovals: approvals.length === 0, canDecide, teamTrj };
}
