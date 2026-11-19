// What a learner does with one course block, as view-model (E-learning Studio, Task 1.4): an accordion's open panels, a knowledge check's pick (a
// one-question round, fmtRound.ts), a sort's groups, a branch's choice and a calculation's value. The answer lives in the run (AppState.course, or the
// preview's own state); a block that scores (SCORED_KINDS) is right or not by `isRight`, which the score line and the completion rule count.
import { NEW_ROUND, roundView } from './fmtRound';
import type { Round, RoundState } from './fmtRound';
import type { CourseBlock } from './logic/courseContent';

export type CourseAnswer = number | { [card: number]: 0 | 1 } | { v: string; checked: boolean } | { [panel: number]: boolean };
export type BlockRun = { answer?: CourseAnswer; round: RoundState };
export const NEW_BLOCK: BlockRun = { round: NEW_ROUND };
// What a block changes: its answer (null clears it) and, for a check, its round.
export type BlockPatch = { answer?: CourseAnswer | null; round?: Partial<RoundState> };

// A number as the design reads it (replace(/[^0-9.\-]/g, '')): its digits, a point and a minus ("2,519" is 2519); NaN when there is none.
export const numberIn = (text: string) => { const d = text.replace(/[^0-9.-]/g, ''); return d === '' ? NaN : Number(d); };
const placed = (a: CourseAnswer | undefined) => (a && typeof a === 'object' ? a : {}) as Record<number, 0 | 1>;
const typed = (a: CourseAnswer | undefined) => (a && typeof a === 'object' && 'v' in a ? a : { v: '', checked: false });

export function isAnswered(b: CourseBlock, a: CourseAnswer | undefined): boolean {
  switch (b.block) {
    case 'check': return typeof a === 'number';
    case 'sort': return b.cards.every((_, i) => placed(a)[i] !== undefined);
    case 'exercise': return typed(a).checked;
    default: return false;
  }
}
export function isRight(b: CourseBlock, a: CourseAnswer | undefined): boolean {
  switch (b.block) {
    case 'check': return a === b.question.a;
    case 'sort': return b.cards.every((c, i) => placed(a)[i] === c[1]);
    case 'exercise': return typed(a).checked && Math.abs(numberIn(typed(a).v) - b.a) <= b.tol + 1e-9;
    default: return false;
  }
}

type Verdict = { text: string; good: boolean };
export type Play =
  | { kind: 'accordion'; panels: { title: string; body: string; open: boolean; toggle: () => void }[] }
  | { kind: 'check'; round: Round }
  | { kind: 'sort'; prompt: string; bins: [string, string]; cards: { label: string; bin: 0 | 1 | null; place: (g: 0 | 1) => void }[]; verdict: Verdict | null }
  | { kind: 'branch'; q: string; choices: { label: string; on: boolean; pick: () => void }[]; outcome: Verdict | null; retry: () => void }
  | { kind: 'exercise'; q: string; unit: string; value: string; set: (v: string) => void; check: () => void; canCheck: boolean; checked: boolean; verdict: Verdict | null; retry: () => void }
  | { kind: 'reflect'; p: string; shown: boolean; readOnly: boolean; value: string; set: (text: string) => void; note: string };

// The check as a one-question round: its answer is the pick once checked, and "Try again" starts the round over (the answer clears with it).
function checkPlay(b: Extract<CourseBlock, { block: 'check' }>, run: BlockRun, patch: (p: BlockPatch) => void, ro: boolean): Play {
  const round = roundView([b.question], run.round, (r) => patch({ round: r, ...('checked' in r && { answer: r.checked ? r.picks?.[0] ?? null : null }) }),
    { locked: () => ro, finishLabel: 'Done', onFinish: () => {} });
  const retry = () => { if (!ro) patch({ round: NEW_ROUND, answer: null }); };
  return { kind: 'check', round: { ...round, pos: '', topic: '', hint: '', mainLabel: run.round.checked ? 'Try again' : round.mainLabel, main: run.round.checked ? retry : round.main } };
}

function sortPlay(b: Extract<CourseBlock, { block: 'sort' }>, run: BlockRun, patch: (p: BlockPatch) => void, ro: boolean): Play {
  const put = placed(run.answer), all = isAnswered(b, run.answer);
  return { kind: 'sort', prompt: b.p, bins: b.bins,
    cards: b.cards.map(([label], i) => ({ label, bin: put[i] ?? null, place: (g) => { if (!ro) patch({ answer: { ...put, [i]: g } }); } })),
    verdict: all ? (isRight(b, run.answer) ? { text: 'Correct.', good: true } : { text: 'Not quite: move an item to another group.', good: false }) : null };
}

function branchPlay(b: Extract<CourseBlock, { block: 'branch' }>, run: BlockRun, patch: (p: BlockPatch) => void, ro: boolean): Play {
  const at = typeof run.answer === 'number' ? run.answer : null, chosen = at === null ? null : b.choices[at];
  return { kind: 'branch', q: b.q, choices: b.choices.map(([label], i) => ({ label, on: at === i, pick: () => { if (!ro && at === null) patch({ answer: i }); } })),
    outcome: chosen && { text: (chosen[2] ? 'A good choice. ' : 'Not the best choice. ') + chosen[1], good: chosen[2] }, retry: () => { if (!ro) patch({ answer: null }); } };
}

function exercisePlay(b: Extract<CourseBlock, { block: 'exercise' }>, run: BlockRun, patch: (p: BlockPatch) => void, ro: boolean): Play {
  const t = typed(run.answer), right = isRight(b, run.answer);
  return { kind: 'exercise', q: b.q, unit: b.unit, value: t.v, set: (v) => { if (!ro) patch({ answer: { v, checked: false } }); },
    canCheck: !ro && !t.checked && t.v.trim() !== '', checked: t.checked, check: () => { if (!ro && t.v.trim()) patch({ answer: { v: t.v, checked: true } }); },
    verdict: t.checked ? (right ? { text: 'Correct.', good: true } : { text: 'Not quite. The answer is ' + b.a + (b.unit && ' ' + b.unit) + (b.tol ? ' (± ' + b.tol + ')' : '') + '.', good: false }) : null,
    retry: () => { if (!ro) patch({ answer: { v: t.v, checked: false } }); } };
}

// A reflect block's text. `shown`: the field is there (not in View as, where the reflections are private); `readOnly`: it takes no typing (the preview).
export type Reflection = { shown: boolean; readOnly: boolean; value: (blockId: string) => string; set: (blockId: string, text: string) => void; note: (blockId: string) => string };
export const NO_REFLECTION: Reflection = { shown: false, readOnly: true, value: () => '', set: () => {}, note: () => '' };

// The learner's side of a block, or null for a block that is only read (text, callout). In View as (`ro`) nothing is answered; panels still open.
export function playOf(b: CourseBlock, run: BlockRun, patch: (p: BlockPatch) => void, ro: boolean, reflection: Reflection = NO_REFLECTION): Play | null {
  switch (b.block) {
    case 'accordion': { const open = placed(run.answer) as Record<number, unknown>;
      return { kind: 'accordion', panels: b.panels.map(([title, body], i) => ({ title, body, open: !!open[i], toggle: () => patch({ answer: { ...open, [i]: !open[i] } as CourseAnswer }) })) }; }
    case 'check': return checkPlay(b, run, patch, ro);
    case 'sort': return sortPlay(b, run, patch, ro);
    case 'branch': return branchPlay(b, run, patch, ro);
    case 'exercise': return exercisePlay(b, run, patch, ro);
    case 'reflect': return { kind: 'reflect', p: b.p, shown: reflection.shown, readOnly: reflection.readOnly, value: reflection.value(b.id), set: (t) => reflection.set(b.id, t), note: reflection.note(b.id) };
    default: return null;
  }
}
