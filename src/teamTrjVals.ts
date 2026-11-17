// Counsellor side of certification trajectories (design v4): requests and sign-offs waiting for the signed-in
// counsellor, a progress table for their counsellees, and the lines in the curriculum mapping's person zoom.
// Decisions go through Logic.persist, so View as refuses them; the screen shows no buttons then.
import { AUD_INFO, LEARN, LEARN_BY } from './data';
import { confirmCredential, decideTrajectory } from './lib/trajectoryStore';
import type { Member } from './logic/team';
import { COMMENT_MAX, COMMENT_MIN } from './logic/record';
import { canBeMandatory, mapAtStage, totals, trajectoryProgress } from './logic/trajectory';
import type { Credential, Enrolment, StepEntry, Trajectory, TrjStep } from './logic/trajectory';
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
    const map = mapAtStage(t, audiences, stage);
    if (!map) return [];
    const tot = totals(t, lib), obligation = canBeMandatory(map[0]) && map[2] === 'mandatory' ? 'mandatory' : 'suggested';
    return [t.name + ' via ' + (AUD_INFO[map[0]]?.name ?? map[0]) + ' · ' + obligation + (t.status === 'live' ? '' : t.status === 'retired' ? ' · retired' : ' · draft') + ' · ' + fmtHours(tot.perYear[0]) + ' this year of ' + fmtHours(tot.tot) + ' over ' + t.months + ' months'];
  });
}

// One decision per row at a time (a double click sends one). The view-model is rebuilt every render, so the set is module-level.
const busy = new Set<string>();
// Runs one write, then reloads that person; a failed reload keeps the success truthful. Also used by membershipVals.ts.
export function decideRow(L: Logic, key: string, userId: string, reload: (id: string) => Promise<void>, write: () => Promise<{ error: string | null }>, done: string) {
  return async () => {
    if (busy.has(key)) return;
    busy.add(key);
    try {
      await L.persist(async () => {
        const { error } = await write();
        if (error) throw new Error(error);
        let message = done;
        try { await reload(userId); } catch { message = 'Saved; refresh to see the latest'; }
        L.say(message);
      });
    } finally { busy.delete(key); }
  };
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

// "Talk first" opens a comment field on the row (AppState trjTalk); the comment goes with the decision and the learner sees it.
function talkForm(L: Logic, key: string, send: (comment: string) => Promise<void>, step: boolean) {
  if (!(key in L.state.trjTalk)) return null;
  const text = L.state.trjTalk[key], n = text.trim().length, ok = n >= COMMENT_MIN && n <= COMMENT_MAX;
  const close = () => L.setState((s) => { const next = { ...s.trjTalk }; delete next[key]; return { trjTalk: next }; });
  return {
    text, count: n + ' / ' + COMMENT_MAX, ok, max: COMMENT_MAX, sendLabel: step ? 'Send back' : 'Keep as request', cancel: close,
    set: (v: string) => L.setState((s) => ({ trjTalk: { ...s.trjTalk, [key]: v } })),
    send: async () => { if (ok) await send(text.trim()); },
  };
}

function approvalRow(L: Logic, w: Waiting, canDecide: boolean, reload: (id: string) => Promise<void>) {
  const { member, t, step, entry } = w, first = member.name.split(' ')[0];
  const key = member.id + '|' + t.id + '|' + (step?.id ?? 'start');
  const approve = (done: string) => decideRow(L, key, member.id, reload, () => decideTrajectory(member.id, t.id, step?.id ?? null, 'approve', null, first), done);
  const signOff = step?.k === 'check' || step?.k === 'exam';
  const talkDone = step ? 'Sent back to ' + first + ' with your comment' : 'Kept as a request · ' + first + ' sees your comment';
  // the field closes only after the decision is saved; a refusal keeps it and the text
  const sendTalk = async (comment: string) => {
    let saved = false;
    await decideRow(L, key, member.id, reload, async () => { const r = await decideTrajectory(member.id, t.id, step?.id ?? null, 'talk', comment, first); saved = !r.error; return r; }, talkDone)();
    if (saved) L.setState((s) => { const next = { ...s.trjTalk }; delete next[key]; return { trjTalk: next }; });
  };
  return {
    key, userId: member.id, initials: initialsOf(member.name), name: member.name, trj: t.name,
    kind: step ? KIND_LABEL[step.k] : 'Start request',
    text: step ? stepTitle(step, titleOf) || KIND_LABEL[step.k] : 'Asks to start this trajectory.',
    proof: entry ? { link: entry.link ?? '', note: entry.note ?? '', ref: entry.ref ?? '' } : null,
    approveLabel: signOff ? 'Sign off' : 'Approve',
    approve: canDecide ? approve(step ? 'Signed off · ' + first : 'Approved · ' + member.name + ' is enrolled') : null,
    talk: canDecide ? () => L.setState((s) => ({ trjTalk: { ...s.trjTalk, [key]: s.trjTalk[key] ?? '' } })) : null,
    talkForm: canDecide ? talkForm(L, key, sendTalk, !!step) : null,
  };
}

function credentialRow(L: Logic, member: Member, c: Credential, canDecide: boolean, reload: (id: string) => Promise<void>) {
  const key = member.id + '|cred|' + c.id, first = member.name.split(' ')[0];
  return {
    key, userId: member.id, initials: initialsOf(member.name), name: member.name, trj: c.issuer, kind: 'Credential', text: c.name + ' · ' + c.issuer,
    proof: { link: c.link, note: '', ref: c.ref }, approveLabel: 'Confirm', talkForm: null,
    approve: canDecide ? decideRow(L, key, member.id, reload, () => confirmCredential(c.id), 'Confirmed · ' + first + '\'s credential is in their wallet') : null,
    talk: null,
  };
}

function tableRow(member: Member, t: Trajectory, e: Enrolment, now: Date) {
  const lib = library(member.data.progress), pg = trajectoryProgress(t, e, lib);
  const submitted = t.steps.filter((st) => PROOF_KINDS.includes(st.k) && e.steps[st.id]?.state === 'submitted');
  const today = now.toISOString().slice(0, 10);
  const earned = !!member.trj?.creds.some((c) => c.trajectory_id === t.id && c.status === 'confirmed' && (c.expires_on == null || c.expires_on >= today));
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
  const approvals = [
    ...members.flatMap((m) => waitingFor(m, trjs)).map((w) => approvalRow(L, w, canDecide, reload)),
    ...members.flatMap((m) => (m.trj?.creds ?? []).filter((c) => c.status === 'waiting').map((c) => credentialRow(L, m, c, canDecide, reload))),
  ];
  // A person whose trajectory data or memberships did not load is named, never computed without them.
  const notLoaded = members.filter((m) => !m.trj || !m.audiences).map((m) => m.name);
  const teamTrj = members.filter((m) => m.audiences).flatMap((m) => trjs.flatMap((t) => {
    const e = effectiveEnrolment(t, m.trj?.enrols[t.id], { line: m.businessLine, stage: m.stage, audiences: m.audiences! }, now);
    return e ? [tableRow(m, t, e, now)] : [];
  }));
  return { approvals, approvalCount: String(approvals.length), noApprovals: approvals.length === 0, canDecide, teamTrj, notLoaded };
}
