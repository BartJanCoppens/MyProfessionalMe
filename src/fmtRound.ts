// One round of multiple-choice questions as view-model: pick, check, the explanation, next, and the score at the end.
// The practice exam (fmtStudy.ts), the explainer's three-question check (fmtExplainer.ts) and the Flash studio's play-test
// (StudioPlayTest.tsx) all run it; the state lives where the caller keeps it (AppState.fmt, or a preview's own state).
import { examScore } from './logic/formats';
import type { ExamQuestion, FmtDraft } from './types';

export type RoundState = Pick<FmtDraft, 'qAt' | 'pick' | 'checked' | 'picks'>;
export const NEW_ROUND: RoundState = { qAt: 0, pick: null, checked: false, picks: {} };
// locked: true refuses a click (View as says so); onFinish gets every pick once the last answer is checked and moved past.
export type RoundOpts = { locked: () => boolean; finishLabel: string; onFinish: (picks: Record<number, number>) => void };

export function roundView(qs: ExamQuestion[], d: RoundState, patch: (p: Partial<RoundState>) => void, o: RoundOpts) {
  const n = qs.length, finished = d.qAt >= n, q = qs[Math.min(d.qAt, n - 1)];
  const main = () => {
    if (o.locked() || finished) return;
    if (!d.checked) { if (d.pick !== null) patch({ checked: true, picks: { ...d.picks, [d.qAt]: d.pick } }); return; }
    patch({ qAt: d.qAt + 1, pick: null, checked: false });
    if (d.qAt + 1 >= n) o.onFinish(d.picks);
  };
  const right = d.checked && d.pick === q.a;
  return {
    finished, score: finished ? examScore(qs, d.picks) : null, pos: 'Question ' + (Math.min(d.qAt, n - 1) + 1) + ' of ' + n, topic: q.t, q: q.q,
    opts: q.o.map((label, k) => {
      const on = d.pick === k, ok = d.checked && k === q.a, bad = d.checked && on && k !== q.a;
      return { label, on, mark: ok ? '✓' : bad ? '×' : String.fromCharCode(65 + k), markBg: ok ? '#86BC25' : bad ? '#d14537' : on ? '#1a1d18' : '#fff', markFg: ok ? '#10180a' : bad || on ? '#fff' : '#1a1d18', markBd: ok ? '#86BC25' : bad ? '#d14537' : '#1a1d18',
        bg: ok ? '#f6f9ef' : bad ? '#fff6f5' : on ? '#fafbf8' : '#fff', bd: ok ? '#86BC25' : bad ? '#d14537' : on ? '#1a1d18' : '#e1e5dc', pick: () => { if (!o.locked() && !d.checked) patch({ pick: k }); } };
    }),
    hasFb: d.checked, fbHead: right ? 'Correct.' : 'Not quite.', fbColor: right ? '#3f6a0a' : '#9a2b22', why: q.why,
    mainLabel: d.checked ? (d.qAt + 1 >= n ? o.finishLabel : 'Next question') : 'Check answer', mainOff: !d.checked && d.pick === null, hint: !d.checked && d.pick === null ? 'Pick one answer' : '', main,
    restart: () => patch(NEW_ROUND),
  };
}
export type Round = ReturnType<typeof roundView>;
