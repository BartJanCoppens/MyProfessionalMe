// Counsellor side of certification trajectories (design v4): requests and sign-offs waiting for the signed-in
// counsellor, a progress table for their counsellees, and the lines in the curriculum mapping's person zoom.
// Decisions go through Logic.persist, so View as refuses them; the screen shows no buttons then.
import { AUD_INFO, LEARN, LEARN_BY } from './data';
import { confirmCredential, decideTrajectory } from './lib/trajectoryStore';
import type { Member } from './logic/team';
import { COMMENT_MAX, COMMENT_MIN } from './logic/record';
import { canBeMandatory, mapAtStage, totals, trajectoryProgress } from './logic/trajectory';
import type { Credential, Enrolment, StepEntry, Trajectory, TrjStep } from './logic/trajectory';
import { credentialHeld, dayLabel, effectiveEnrolment, renewedExpiry } from './logic/trajectoryLearner';
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

// A renewal: the current expiry, and the one confirming gives (the learner's date for an external credential, today +
// valid_months for a trajectory one; undefined when the trajectory is not loaded, null when it does not expire).
function renewalLine(L: Logic, member: Member, c: Credential, now: Date) {
  const old = member.trj?.creds.find((x) => x.id === c.renewal_of), first = member.name.split(' ')[0];
  const t = c.trajectory_id ? L.state.trjs.find((x) => x.id === c.trajectory_id) : undefined;
  const next = !c.trajectory_id ? c.expires_on : t ? renewedExpiry(now, t.valid_months) : undefined;
  const nextLabel = next === undefined ? 'from the trajectory' : next === null ? 'does not expire' : dayLabel(next);
  return {
    text: c.name + ' · ' + c.issuer + ' · ' + (old?.expires_on ? 'expires ' + dayLabel(old.expires_on) : 'current expiry unknown') + ' → new expiry on confirm: ' + nextLabel,
    done: next === undefined ? 'Renewed' : 'Renewed · ' + first + '\'s credential ' + (next === null ? 'does not expire' : 'now runs to ' + dayLabel(next)),
  };
}

function credentialRow(L: Logic, member: Member, c: Credential, canDecide: boolean, reload: (id: string) => Promise<void>, now: Date) {
  const key = member.id + '|cred|' + c.id, first = member.name.split(' ')[0];
  const renewal = c.renewal_of ? renewalLine(L, member, c, now) : null;
  // confirm_credential refuses an external renewal whose expiry date has passed (UTC days, as the database's current_date).
  const stale = !!renewal && !c.trajectory_id && !!c.expires_on && c.expires_on <= now.toISOString().slice(0, 10);
  return {
    key, userId: member.id, initials: initialsOf(member.name), name: member.name, trj: c.issuer, kind: renewal ? 'Renewal' : 'Credential',
    text: renewal ? renewal.text + (stale ? ' · expiry date has passed; ask for a new one' : '') : c.name + ' · ' + c.issuer, proof: { link: c.link, note: '', ref: c.ref }, approveLabel: 'Confirm', talkForm: null,
    approve: canDecide && !stale ? decideRow(L, key, member.id, reload, () => confirmCredential(c.id), renewal ? renewal.done : 'Confirmed · ' + first + '\'s credential is in their wallet') : null,
    talk: null,
  };
}

function tableRow(member: Member, t: Trajectory, e: Enrolment, now: Date) {
  const lib = library(member.data.progress), pg = trajectoryProgress(t, e, lib);
  const submitted = t.steps.filter((st) => PROOF_KINDS.includes(st.k) && e.steps[st.id]?.state === 'submitted');
  const earned = !!member.trj?.creds.some((c) => c.trajectory_id === t.id && credentialHeld(c, now));
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
    ...members.flatMap((m) => (m.trj?.creds ?? []).filter((c) => c.status === 'waiting').map((c) => credentialRow(L, m, c, canDecide, reload, now))),
  ];
  // A person whose trajectory data or memberships did not load is named, never computed without them.
  const notLoaded = members.filter((m) => !m.trj || !m.audiences).map((m) => m.name);
  const teamTrj = members.filter((m) => m.audiences).flatMap((m) => trjs.flatMap((t) => {
    const e = effectiveEnrolment(t, m.trj?.enrols[t.id], { line: m.businessLine, stage: m.stage, audiences: m.audiences! }, now);
    return e ? [tableRow(m, t, e, now)] : [];
  }));
  return { approvals, approvalCount: String(approvals.length), noApprovals: approvals.length === 0, canDecide, teamTrj, notLoaded };
}
