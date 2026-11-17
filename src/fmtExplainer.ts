// The interactive explainer's panel as view-model (studios plan, Task 2.2): numbered steps with Prev and Next, then its
// ending, a three-question check on the shared question round (fmtRound.ts) or a summary card. The learner's state lives
// in AppState.fmt (`at` is the step, or the ending one past the last step) and completion is saved through saveDetail; the
// Explainer Studio's preview runs the same view over its own state and saves nothing. Step drawings are sanitised.
import { completedToast, detailOf, draftOf, first, patchDraft, saveDetail } from './fmtShared';
import { roundView } from './fmtRound';
import type { RoundState } from './fmtRound';
import { examScore } from './logic/formats';
import { instance, sanitizeSvg } from './logic/sanitizeSvg';
import { END_SUMMARY } from './logic/studioContent';
import type { Item, Logic } from './model';
import type { ExplainerContent } from './types';

export type ExplainerState = RoundState & { at: number; seen: boolean };
// ro: no answering (View as); lastSeen: the learner already saw the last step; onLast: the last step is reached and
// there is no check; onCheck: the check is finished, with its score.
export type ExplainerOpts = { ro: boolean; note: string; lastSeen: boolean; locked: () => boolean; onLast: () => void; onCheck: (pct: number) => void };

const svgOf = (svg: string | undefined, k: number) => { const clean = svg ? sanitizeSvg(svg) : ''; return clean ? instance(clean, 'pmex' + k) : ''; };

export function explainerView(c: ExplainerContent, s: ExplainerState, patch: (p: Partial<ExplainerState>) => void, o: ExplainerOpts) {
  const n = c.steps.length, check = c.check ?? null, ending = check ? 'Check' : c.end === END_SUMMARY ? 'Summary' : '';
  const last = ending ? n : n - 1, at = Math.min(s.at, last), step = at < n ? c.steps[at] : null;
  const go = (k: number) => {
    const reached = k >= n - 1 && !s.seen;
    patch(reached ? { at: k, seen: true } : { at: k });
    if (reached && !check && !o.lastSeen && !o.ro) o.onLast();
  };
  const round = check && at === n && !o.ro ? roundView(check, s, patch, { locked: o.locked, finishLabel: 'See my result', onFinish: (picks) => o.onCheck(examScore(check, picks).pct) }) : null;
  const right = check ? check.filter((q, i) => s.picks[i] === q.a).length : 0;
  return {
    ro: o.ro, sub: n + ' steps · ' + c.depth + (ending ? ' · ends with ' + (check ? 'a three-question check' : 'a summary card') : ''),
    pills: [...c.steps.map((x, k) => ({ n: String(k + 1), label: x.label })), ...(ending ? [{ n: '', label: ending }] : [])]
      .map((p, k) => ({ ...p, on: k === at, done: k < at, pick: () => go(k) })),
    step: step && { label: step.label, text: step.text, svg: svgOf(step.svg, at) }, pos: step ? 'Step ' + (at + 1) + ' of ' + n : ending,
    prev: () => go(Math.max(0, at - 1)), next: () => go(Math.min(last, at + 1)), noPrev: at === 0, noNext: at >= last,
    nextLabel: at === n - 1 && check ? 'Take the check' : at === n - 1 && ending ? 'See the summary' : 'Next',
    round: round && !round.finished ? round : null,
    result: round?.finished ? { label: right + ' of ' + check!.length + ' right', restart: round.restart } : null,
    note: check && at === n && o.ro ? o.note : '',
    summary: at === n && ending === 'Summary' ? c.steps.map((x, k) => ({ n: String(k + 1), label: x.label, text: x.text })) : null,
  };
}
export type ExplainerView = ReturnType<typeof explainerView>;

// The learner's explainer: completes when the last step is seen, or when the check is finished if it has one.
export function explainerVals(L: Logic, it: Item, c: ExplainerContent) {
  const saved = detailOf<'explainer'>(L, it.id);
  return explainerView(c, draftOf(L, it.id), (p) => patchDraft(L, it.id, p), {
    ro: L.subject.readOnly, note: 'Only ' + first(L.subject.name) + ' can take the check.', lastSeen: !!saved.last, locked: () => L.readOnly(),
    onLast: () => saveDetail(L, it, { last: true }, { complete: true, done: completedToast(it, 'Last step seen') }),
    onCheck: (pct) => saveDetail(L, it, { last: true, best: Math.max(pct, saved.best ?? 0) }, { complete: true, done: completedToast(it, 'Check finished') }),
  });
}
