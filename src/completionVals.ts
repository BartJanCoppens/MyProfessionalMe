// Completion per learning type (owner's rules, 2 Nov 2026), split out of Logic.renderVals() like recordVals.
// E-learning: "Mark as completed". Classroom: the learner's feedback form, and for admins the Attendance card.
// Avatar: the evaluation quiz after the practice session. Podcasts and reels complete in their players (Logic.mediaVals).
// Learner writes go through Logic.persist() (refused in View as, where the form and quiz are disabled too). Attendance
// is the signed-in admin's own action, like a decision: it works in View as and reloads the viewed person.
import type { ChangeEvent } from 'react';
import { AVATAR_QUIZ, LEARN_BY, LEARN_META } from './data';
import type { Item, Logic } from './model';
import { FEEDBACK_MIN, completionOf, completionText, feedbackProblem } from './logic/record';
import { saveProgress } from './lib/learnerStore';
import { loadRoster, registerAttendance } from './lib/attendanceStore';

type Field = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;
const key = (L: Logic, id: string) => L.subject.id + '|' + id;
const first = (name: string) => name.split(/[\s.@]+/)[0] || name;
// Attendance saves in flight, per learning.
const BUSY = new Set<string>();

// ---------- E-learning ----------

export function markCompleted(L: Logic, it: Item) {
  if (L.readOnly() || it.state === 'accepted') return;
  L.persist(() => saveProgress(L.subject.id, it.id, { state: 'accepted', pct: 100 }), 'Completed · “' + it.title + '” counts toward your hours and levels');
}

// ---------- Classroom feedback ----------

const savedFeedback = (L: Logic, id: string) => {
  const p = L.subject.data.progress[id];
  return { rating: p?.rating ?? null, text: p?.evidence?.note || '' };
};
function draftFeedback(L: Logic, id: string) {
  const d = L.state.fbDraft;
  return d && d.key === key(L, id) ? { rating: d.rating, text: d.text } : savedFeedback(L, id);
}

export function sendFeedback(L: Logic, it: Item) {
  if (L.readOnly() || it.state === 'accepted') return;
  const f = draftFeedback(L, it.id), bad = feedbackProblem(f.rating, f.text);
  if (bad) { L.say(bad); return; }
  L.persist(async () => {
    await saveProgress(L.subject.id, it.id, { state: 'accepted', pct: 100, note: f.text.trim(), rating: f.rating! });
    L.setState({ fbDraft: null });
  }, 'Thank you for your feedback · “' + it.title + '” is complete and counts toward your hours');
}

function feedbackVals(L: Logic, it: Item) {
  const k = key(L, it.id), f = draftFeedback(L, it.id), saved = savedFeedback(L, it.id), ro = L.subject.readOnly;
  const patch = (p: { rating?: number | null; text?: string }) => L.setState((s) => {
    const cur = s.fbDraft && s.fbDraft.key === k ? s.fbDraft : { key: k, ...savedFeedback(L, it.id) };
    return { fbDraft: { ...cur, ...p } };
  });
  // Completed: the feedback as given (read-only), or nothing when the faculty registered the attendance.
  const done = it.state === 'accepted';
  if (done && !saved.rating) return null;
  const n = f.text.trim().length;
  return {
    open: !done, given: done ? { rating: 'Rated ' + saved.rating + ' of 5', text: saved.text } : null, disabled: ro || done,
    lead: ro ? 'Only ' + first(L.subject.name) + ' can give this feedback.' : 'Attended the session? Your feedback completes it. If the faculty registers your attendance first, it is complete too.',
    rating: f.rating ? String(f.rating) : '', ratingOptions: [1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: String(v) })),
    setRating: (v: string) => { if (!ro) patch({ rating: Number(v) || null }); },
    text: f.text, setText: (e: Field) => { if (!ro) patch({ text: e.target.value }); },
    count: n + ' / ' + FEEDBACK_MIN + ' characters',
    problem: ro || done ? null : feedbackProblem(f.rating, f.text),
    send: () => sendFeedback(L, it),
  };
}

// ---------- Avatar evaluation quiz ----------

function quizVals(L: Logic, it: Item) {
  const Q = AVATAR_QUIZ[it.id]; if (!Q) return null;
  if (it.state === 'accepted') return { done: true, disabled: true, lead: 'Quiz passed · this practice is complete.', items: [], canCheck: false, check: () => {}, retry: () => {}, hasResult: false, result: '', resultColor: '', checked: false, passed: true };
  const k = key(L, it.id), ro = L.subject.readOnly;
  const st = L.state.quiz && L.state.quiz.key === k ? L.state.quiz : { key: k, picks: {} as Record<number, number>, checked: false };
  const right = Q.filter((q, i) => st.picks[i] === q.a).length, all = Q.every((_q, i) => st.picks[i] != null);
  const pick = (qi: number, oi: number) => {
    if (ro) return;
    L.setState((s) => {
      const cur = s.quiz && s.quiz.key === k ? s.quiz : { key: k, picks: {}, checked: false };
      if (cur.checked) return {};
      return { quiz: { ...cur, picks: { ...cur.picks, [qi]: oi } } };
    });
  };
  const check = () => {
    if (L.readOnly()) return;
    if (!all) { L.say('Answer all ' + Q.length + ' questions first'); return; }
    L.setState({ quiz: { ...st, checked: true } });
    if (right === Q.length) L.persist(() => saveProgress(L.subject.id, it.id, { state: 'accepted', pct: 100 }), 'Quiz passed · “' + it.title + '” is complete and counts toward your hours');
  };
  // Try again: the right answers stay, the wrong ones clear.
  const retry = () => {
    const picks: Record<number, number> = {};
    Q.forEach((q, i) => { if (st.picks[i] === q.a) picks[i] = q.a; });
    L.setState({ quiz: { key: k, picks, checked: false } });
  };
  return {
    done: false, disabled: ro, checked: st.checked, passed: st.checked && right === Q.length,
    lead: ro ? 'Only ' + first(L.subject.name) + ' can take this quiz.' : 'After your practice session: answer all three questions. Three right answers complete the learning.',
    items: Q.map((q, qi) => {
      const p = st.picks[qi], wrong = st.checked && p !== q.a;
      return {
        q: (qi + 1) + '. ' + q.q, wrong,
        opts: q.opts.map((o, oi) => {
          const picked = p === oi, shown = st.checked && picked;
          return { label: o, picked, pick: () => pick(qi, oi),
            bd: shown ? (oi === q.a ? '#86BC25' : '#9a2b22') : picked ? '#1a1d18' : '#d5dacf', bg: shown ? (oi === q.a ? '#fbfdf6' : '#fff6f5') : picked ? '#f4f6f1' : '#fff' };
        }),
      };
    }),
    canCheck: !ro && all && !st.checked, check, retry,
    hasResult: st.checked,
    result: right === Q.length ? 'All three right. The practice is complete.' : right + ' of ' + Q.length + ' right. Look at ' + (Q.length - right === 1 ? 'the marked question' : 'the marked questions') + ' against the brief, then try again.',
    resultColor: right === Q.length ? '#3f6a0a' : '#9a2b22',
  };
}

// ---------- Classroom attendance (admins) ----------

export function loadAttendance(L: Logic, learningId: string) {
  L.setState({ att: { learningId, rows: null, error: null, picks: {}, q: '', busy: false } });
  return loadRoster(learningId).then(
    (rows) => L.setState((s) => (s.att && s.att.learningId === learningId ? { att: { ...s.att, rows, error: null } } : {})),
    (err) => L.setState((s) => (s.att && s.att.learningId === learningId ? { att: { ...s.att, error: (err as Error).message } } : {})),
  );
}

// The attendance card shows on a published classroom learning for anyone who is an admin (whoever is being viewed).
export const showsAttendance = (L: Logic, id: string) => L.isAdmin() && LEARN_BY[id]?.[4] === 'Classroom' && (LEARN_META[id]?.status || 'published') === 'published';

async function saveAttendance(L: Logic, it: Item) {
  const a = L.state.att; if (!a || a.learningId !== it.id || !a.rows) return;
  const ids = a.rows.filter((r) => r.state !== 'accepted' && a.picks[r.userId]).map((r) => r.userId);
  if (!ids.length) { L.say('Tick the people who attended'); return; }
  if (BUSY.has(it.id)) return;
  BUSY.add(it.id);
  L.setState((s) => (s.att && s.att.learningId === it.id ? { att: { ...s.att, busy: true } } : {}));
  try {
    const n = await registerAttendance(it.id, ids);
    L.say(n === 1 ? 'Attendance registered for 1 person · “' + it.title + '” is complete for them' : 'Attendance registered for ' + n + ' people · “' + it.title + '” is complete for them');
    await Promise.all([loadAttendance(L, it.id), ids.includes(L.subject.id) ? L.reloadSubject() : Promise.resolve()]);
  } catch (err) {
    L.say((err as Error).message);
    L.setState((s) => (s.att && s.att.learningId === it.id ? { att: { ...s.att, busy: false } } : {}));
  } finally { BUSY.delete(it.id); }
}

function attendanceVals(L: Logic, it: Item) {
  if (!showsAttendance(L, it.id)) return null;
  const a = L.state.att && L.state.att.learningId === it.id ? L.state.att : null;
  const everyone = L.access.isSystem || !!L.access.isGeneral;
  const lead = everyone ? 'Tick the people who attended. You can register anyone.' : 'Tick the people who attended. You can register the people of ' + L.access.domains.join(', ') + ' you manage.';
  if (!a) return { lead, loading: false, notLoaded: true, load: () => loadAttendance(L, it.id), error: null, rows: [], showSearch: false, q: '', setQ: () => {}, empty: '', save: () => {}, canSave: false, busy: false, summary: '', retry: () => {} };
  const q = a.q.trim().toLowerCase(), rows = a.rows || [];
  const fresh = rows.filter((r) => r.state !== 'accepted' && a.picks[r.userId]).length, done = rows.filter((r) => r.state === 'accepted').length;
  const shown = rows.filter((r) => !q || (r.name + ' ' + (r.line || '')).toLowerCase().includes(q));
  return {
    lead, loading: !a.rows && !a.error, notLoaded: false, load: () => loadAttendance(L, it.id), error: a.error, retry: () => loadAttendance(L, it.id),
    showSearch: everyone, q: a.q, setQ: (e: Field) => { const v = e.target.value; L.setState((s) => (s.att && s.att.learningId === it.id ? { att: { ...s.att, q: v } } : {})); },
    rows: shown.map((r) => {
      const locked = r.state === 'accepted';
      return {
        userId: r.userId, name: r.name, sub: (r.line || 'No business line') + (locked ? ' · completed' : r.state === 'in-progress' ? ' · in progress' : r.state === 'submitted' ? ' · waiting for acceptance' : ''),
        ticked: locked || !!a.picks[r.userId], locked,
        toggle: () => { if (!locked) L.setState((s) => (s.att && s.att.learningId === it.id ? { att: { ...s.att, picks: { ...s.att.picks, [r.userId]: !s.att.picks[r.userId] } } } : {})); },
      };
    }),
    empty: a.rows && !rows.length ? 'Nobody you can register yet.' : a.rows && !shown.length ? 'Nobody matches “' + a.q.trim() + '”.' : '',
    summary: done + ' of ' + rows.length + ' completed' + (fresh ? ' · ' + fresh + ' ticked to register' : ''),
    canSave: fresh > 0 && !a.busy, busy: a.busy, save: () => saveAttendance(L, it),
  };
}

export function completionVals(L: Logic, it: Item) {
  const kind = completionOf(it.format), ro = L.subject.readOnly;
  return {
    done: {
      kind, note: completionText(it.format, L.counsellorFull()),
      mark: kind === 'mark' && it.state !== 'accepted' ? { label: 'Mark as completed', disabled: ro, run: () => markCompleted(L, it) } : null,
      feedback: kind === 'feedback' ? feedbackVals(L, it) : null,
      quiz: kind === 'quiz' ? quizVals(L, it) : null,
      attendance: attendanceVals(L, it),
    },
  };
}
