// Learning record and approvals view-model (F2, F3), split out of Logic.renderVals() like createVals.
// The learner adds evidence and submits through Logic.persist() (refused in View as). A counsellor, managing admin or
// General or System Admin decides through decide_learning(): from the learning's detail in View as, or from the
// approvals queue, which belongs to the signed-in person whoever is being viewed.
import type { ChangeEvent } from 'react';
import { LEARN_BY } from './data';
import type { Item, Logic } from './model';
import {
  COMMENT_MAX, COMMENT_MIN, LINKED_NOT_UPLOADED, NO_EVIDENCE, REFLECTION_MIN, SELF_COMPLETE, decisionLine, decisionsFor, evidenceNeed, evidenceProblem, evidenceRule,
  fieldProblem, hasEvidence, lastActivityLabel, openChanges, ruleText, sameEvidence, waitingLabel,
} from './logic/record';
import type { Evidence } from './logic/record';
import { fmtDate } from './logic/contribution';
import { saveProgress } from './lib/learnerStore';
import { decideLearning, loadQueue } from './lib/recordStore';

type Field = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
// Decisions in flight, per person and learning; a second click while one runs does nothing.
const BUSY = new Set<string>();
export const recKey = (userId: string, learningId: string) => userId + '|' + learningId;
const first = (name: string) => name.split(/[\s.@]+/)[0] || name;
const initialsOf = (name: string) => name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const without = <T,>(o: Record<string, T>, k: string) => { const n = { ...o }; delete n[k]; return n; };
const trimmed = (e: Evidence): Evidence => ({ note: e.note.trim(), link: e.link.trim(), ref: e.ref.trim() });

// What the subject saved, and what the learner sees in the form: the draft being typed, else what is saved.
export const savedEvidence = (L: Logic, id: string): Evidence => L.subject.data.progress[id]?.evidence || NO_EVIDENCE;
export function draftEvidence(L: Logic, id: string): Evidence {
  const d = L.state.evDraft;
  return d && d.key === recKey(L.subject.id, id) ? { note: d.note, link: d.link, ref: d.ref } : savedEvidence(L, id);
}
// The evidence fields to send with a save: only when the draft differs from what is saved.
const changedEvidence = (L: Logic, id: string) => {
  const ev = draftEvidence(L, id);
  return sameEvidence(ev, savedEvidence(L, id)) ? {} : trimmed(ev);
};

export function reloadQueue(L: Logic) {
  return loadQueue().then((queue) => L.setState({ queue, queueError: null }), (err) => L.setState({ queueError: (err as Error).message }));
}

// Log one hour. The last hour submits the learning when the format's evidence rule is met; otherwise it stops at 100%
// and says what is still needed.
export function logHour(L: Logic, it: Item) {
  const np = Math.min(100, Math.round(it.pct + 100 / it.hours));
  if (np < 100) {
    L.persist(() => saveProgress(L.subject.id, it.id, { state: 'in-progress', pct: np }), '1 hour logged · ' + np + '% of ' + it.hoursLabel);
    return;
  }
  const ev = draftEvidence(L, it.id), need = fieldProblem(ev) ? null : evidenceNeed(it.format, ev);
  if (fieldProblem(ev) || need) {
    L.persist(() => saveProgress(L.subject.id, it.id, { state: 'in-progress', pct: 100 }),
      'All hours logged · ' + (need ? 'add ' + need + ', then submit it to ' + L.counsellorFull() : 'fix the evidence, then submit it'));
    return;
  }
  L.persist(() => saveProgress(L.subject.id, it.id, { state: 'submitted', pct: 100, ...changedEvidence(L, it.id) }), 'All hours logged · sent to ' + L.counsellorFull() + ' for acceptance');
}

// Submit (or resubmit) with the evidence typed so far; refused while the format's rule is not met.
export function submit(L: Logic, it: Item) {
  if (L.readOnly()) return;
  const ev = draftEvidence(L, it.id), bad = evidenceProblem(it.format, ev);
  if (bad) { L.say(bad); return; }
  L.persist(() => saveProgress(L.subject.id, it.id, { state: 'submitted', pct: 100, ...changedEvidence(L, it.id) }),
    'Sent to ' + L.counsellorFull() + ' · they see the hours you logged' + (hasEvidence(ev) ? ' and your evidence' : ''));
}

export function saveEvidence(L: Logic, it: Item) {
  if (L.readOnly()) return;
  const ev = draftEvidence(L, it.id), bad = it.state === 'submitted' ? evidenceProblem(it.format, ev) : fieldProblem(ev);
  if (bad) { L.say(bad); return; }
  if (sameEvidence(ev, savedEvidence(L, it.id))) { L.say('Nothing changed'); return; }
  L.persist(() => saveProgress(L.subject.id, it.id, trimmed(ev)), it.state === 'submitted' ? 'Evidence updated · ' + L.counsellorFull() + ' sees the new version' : 'Evidence saved · it goes with your submission');
}

type Target = { userId: string; learningId: string; title: string; name: string };
// Accept, or request changes with a comment. The database decides who may; the queue and the viewed person reload.
export async function decide(L: Logic, t: Target, verdict: 'accepted' | 'changes') {
  const key = recKey(t.userId, t.learningId), comment = (L.state.decideNote[key] || '').trim();
  if (verdict === 'changes' && comment.length < COMMENT_MIN) { L.say('Say what should change (at least ' + COMMENT_MIN + ' characters)'); return; }
  if (comment.length > COMMENT_MAX) { L.say('Keep the comment to ' + COMMENT_MAX + ' characters'); return; }
  if (BUSY.has(key)) return;
  BUSY.add(key);
  try {
    await decideLearning(t.userId, t.learningId, verdict, comment);
    L.setState((s) => ({ decideNote: without(s.decideNote, key) }));
    L.say(verdict === 'accepted' ? 'Accepted · “' + t.title + '” now counts toward ' + first(t.name) + '’s levels' : 'Sent back to ' + first(t.name) + ' · it is in progress again with your comment');
    await Promise.all([L.reloadSubject(), reloadQueue(L)]);
  } catch (err) { L.say((err as Error).message); }
  finally { BUSY.delete(key); }
}

const commentBox = (L: Logic, key: string) => ({
  comment: L.state.decideNote[key] || '',
  setComment: (e: Field) => { const v = e.target.value; L.setState((s) => ({ decideNote: { ...s.decideNote, [key]: v } })); },
  commentCount: (L.state.decideNote[key] || '').trim().length + ' / ' + COMMENT_MAX,
});
const evidenceView = (e: Evidence, format: string) => ({
  note: e.note, link: e.link, ref: e.ref,
  none: hasEvidence(e) ? '' : evidenceRule(format) === 'none' ? 'No evidence needed for a ' + (format || 'learning').toLowerCase() : 'No evidence attached',
});

// The detail's learning record: evidence (form for the learner, read-only for others), open feedback, decisions.
function detailRecord(L: Logic, it: Item) {
  const key = recKey(L.subject.id, it.id), owner = !L.subject.readOnly, rule = evidenceRule(it.format);
  const saved = savedEvidence(L, it.id), draft = draftEvidence(L, it.id);
  const editable = owner && it.state !== 'accepted' && !SELF_COMPLETE.includes(it.format) && (it.state !== 'not-started' || rule !== 'none');
  const set = (k: keyof Evidence) => (e: Field) => {
    const v = e.target.value;
    L.setState((s) => ({ evDraft: { ...(s.evDraft && s.evDraft.key === key ? s.evDraft : { key, ...savedEvidence(L, it.id) }), [k]: v } }));
  };
  const changes = openChanges(L.subject.data.decisions, it.id, it.state);
  const history = decisionsFor(L.subject.data.decisions, it.id).map((d, i) => ({ key: d.at + '|' + i, ...decisionLine(d, L.subject.id, L.access.userId),
    evidence: d.verdict !== 'self_completed' && hasEvidence(d.evidence) ? [d.evidence.note && 'reflection', d.evidence.link && 'link', d.evidence.ref && 'certificate number'].filter(Boolean).join(', ') : '' }));
  const submittedAt = L.subject.data.progress[it.id]?.submittedAt;
  const canDecide = L.canAccept(it.state);
  const target: Target = { userId: L.subject.id, learningId: it.id, title: it.title, name: L.subject.name };
  return {
    showEvidence: editable || hasEvidence(saved) || (L.subject.readOnly && it.state === 'submitted'),
    editable, ruleText: ruleText(it.format, L.counsellorFull()), linkedNote: LINKED_NOT_UPLOADED,
    note: draft.note, link: draft.link, ref: draft.ref, showRef: rule === 'certificate', setNote: set('note'), setLink: set('link'), setRef: set('ref'),
    noteLabel: rule === 'reflection' ? 'Reflection' : 'Note (optional)', noteCount: rule === 'reflection' ? draft.note.trim().length + ' / ' + REFLECTION_MIN + ' characters' : '',
    dirty: !sameEvidence(draft, saved), save: () => saveEvidence(L, it),
    saved: evidenceView(saved, it.format),
    // why "Submit" is not possible yet (shown under the button)
    problem: owner && it.state === 'in-progress' ? evidenceProblem(it.format, draft) : null,
    submitLabel: changes ? 'Resubmit for acceptance' : (L.subject.counsellor ? 'Ask ' + L.counsellorFirst() : 'Ask your counsellor') + ' to approve',
    changes: changes ? { title: 'Changes requested by ' + (changes.by === L.access.userId ? 'you' : changes.byName || 'your counsellor') + ' · ' + fmtDate(changes.at), comment: changes.comment,
      hint: owner ? 'Make the change, then resubmit. Your hours stay logged.' : '' } : null,
    submittedLine: it.state === 'submitted' && submittedAt ? 'Submitted ' + fmtDate(submittedAt) : '',
    history, hasHistory: history.length > 0,
    decide: canDecide ? { ...commentBox(L, recKey(target.userId, target.learningId)), accept: () => decide(L, target, 'accepted'), sendBack: () => decide(L, target, 'changes'),
      hint: 'Optional when you accept; required to request changes. ' + first(L.subject.name) + ' sees it on this learning.' } : null,
  };
}

// The approvals queue: every submission waiting for the signed-in person, with the evidence and each person's last activity.
function approvals(L: Logic) {
  const s = L.state, now = new Date();
  const rows = (s.queue || []).map((r) => {
    const row = LEARN_BY[r.learningId], title = row ? row[1] : r.learningId, format = row ? row[4] : '';
    const w = waitingLabel(r.submittedAt, now), t: Target = { userId: r.userId, learningId: r.learningId, title, name: r.name };
    return {
      key: recKey(r.userId, r.learningId), userId: r.userId, learningId: r.learningId, initials: initialsOf(r.name), name: r.name,
      sub: (r.line || 'No business line') + ' · last activity: ' + lastActivityLabel(r.lastActivity, now).toLowerCase(),
      title, format: format || 'Learning', waited: w.text, late: w.late, openLabel: 'Open in ' + first(r.name) + '’s app',
      evidence: evidenceView(r.evidence, format), ...commentBox(L, recKey(t.userId, t.learningId)),
      accept: () => decide(L, t, 'accepted'), sendBack: () => decide(L, t, 'changes'),
    };
  });
  return {
    lead: 'Submissions you decide on: your counsellees’ and, if you are an admin, those of people without a counsellor. Accept, or request changes with a comment the learner sees. Amber: waiting more than five working days.',
    loading: s.queue === null && !s.queueError, error: s.queueError, retry: () => { L.setState({ queue: null, queueError: null }); reloadQueue(L); },
    empty: !!s.queue && s.queue.length === 0, rows,
  };
}

export function recordVals(L: Logic, it: Item) {
  const s = L.state;
  return {
    rec: detailRecord(L, it),
    appr: s.screen === 'approvals' ? approvals(L) : null,
    approvalsBadge: (s.queue || []).length,
    navApprovals: s.screen === 'approvals' || (s.screen === 'detail' && s.origin === 'approvals'),
    goApprovals: () => { L.go('approvals'); reloadQueue(L); },
  };
}
