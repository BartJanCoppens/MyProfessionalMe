// The E-learning Studio's course editor as view-model (Task 1.3): the lesson outline, the lesson's blocks on the canvas, the selected block's inspector
// and the widget shelf. The course is `nw.items` (lesson rows, then blocks); every edit is a pure function of logic/courseEdit.ts on it. In View as
// everything shows and nothing changes.
import type { Logic } from './model';
import type { NewDraft } from './types';
import type { SetNw } from './createItems';
import { blockView } from './fmtCourse';
import { fieldsOf } from './courseFields';
import { COURSE_CAPS, KIND_NAME, SCORED_KINDS, courseProblems, courseRowProblems, lessonsOf } from './logic/courseContent';
import type { BlockKind } from './logic/courseContent';
import { addLesson, duplicateBlock, insertBlock, moveBlock, moveLesson, newBlock, patchBlock, removeBlock, removeLesson, renameLesson, setFinal } from './logic/courseEdit';
import { SHORT_MAX } from './logic/items';
import type { Item } from './logic/items';
import type { StudioEntry } from './logic/studios';

// The shelf of Phase 1: the blocks and the interactions that work. (Embedded learnings and images come in a later release.)
const SHELF: { group: string; kinds: [BlockKind, string][] }[] = [
  { group: 'Blocks', kinds: [['text', '¶'], ['callout', '!'], ['accordion', '≡']] },
  { group: 'Interactions', kinds: [['check', '?'], ['sort', '⇅'], ['branch', '⑂'], ['reflect', '✎'], ['exercise', '＝']] },
];
const plural = (n: number, one: string) => n + ' ' + one + (n === 1 ? '' : 's');

export function courseEditVals(L: Logic, nw: NewDraft, setNw: SetNw) {
  const list = (nw.items?.list ?? []) as StudioEntry[], lessons = lessonsOf(list), ro = L.subject.readOnly, ce = L.state.courseEdit;
  const lesson = Math.min(Math.max(ce.lesson, 0), Math.max(lessons.length - 1, 0)), blocks = lessons[lesson]?.blocks ?? [];
  const selected = blocks.find((b) => b.id === ce.block) ?? null, at = selected ? blocks.indexOf(selected) : -1;
  const show = (k: number, block: string | null) => L.setState({ courseEdit: { lesson: k, block } });
  const edit = (f: (items: StudioEntry[]) => StudioEntry[]) => { if (!ro) setNw((cur) => (cur.items ? { items: { ...cur.items, list: f(cur.items.list as StudioEntry[]) as Item[], how: cur.items.how || 'manual', problems: [] } } : {})); };
  const full = () => { const is = blocks.length >= COURSE_CAPS.blocksPerLesson; if (is) L.say('A lesson holds at most ' + COURSE_CAPS.blocksPerLesson + ' blocks'); return is; };

  const add = (kind: BlockKind) => {
    if (ro || full()) return;
    const b = newBlock(kind, lesson, (lessons[lesson]?.title ?? '').trim().slice(0, SHORT_MAX));
    edit((it) => insertBlock(it, lesson, selected?.id ?? null, b));
    show(lesson, b.id);
  };
  const shiftLesson = (k: number, by: -1 | 1) => {
    edit((it) => moveLesson(it, k, by));
    show(lesson === k ? k + by : lesson === k + by ? k : lesson, ce.block);
  };
  const drop = (k: number) => {
    if (ro) return;
    if (lessons.length <= COURSE_CAPS.lessons[0]) { L.say('A course needs at least two lessons'); return; }
    edit((it) => removeLesson(it, k));
    show(Math.min(lesson > k ? lesson - 1 : lesson, lessons.length - 2), null);
  };
  const inspector = ro || !selected ? null : {
    type: KIND_NAME[selected.block], ...fieldsOf(selected, (p) => edit((it) => patchBlock(it, selected.id, p)), (fin) => edit((it) => setFinal(it, selected.id, fin))),
    noUp: at === 0, noDown: at === blocks.length - 1, up: () => edit((it) => moveBlock(it, selected.id, -1)), down: () => edit((it) => moveBlock(it, selected.id, 1)),
    duplicate: () => { if (!full()) edit((it) => duplicateBlock(it, selected.id)); }, remove: () => { edit((it) => removeBlock(it, selected.id)); show(lesson, null); }, done: () => show(lesson, null),
  };
  const scored = lessons.flatMap((l) => l.blocks).filter((b) => SCORED_KINDS.includes(b.block)).length;
  return {
    readOnly: ro, lessonTitle: lessons[lesson]?.title ?? '', noRemove: lessons.length <= COURSE_CAPS.lessons[0], noAdd: lessons.length >= COURSE_CAPS.lessons[1],
    lessons: lessons.map((l, k) => ({ n: k + 1, title: l.title, meta: plural(l.blocks.length, 'block'), on: k === lesson, pick: () => show(k, null),
      noUp: k === 0, noDown: k === lessons.length - 1, up: () => shiftLesson(k, -1), down: () => shiftLesson(k, 1) })),
    blocks: blocks.map((b) => blockView(b, { on: b.id === selected?.id, pick: () => (ro ? undefined : show(lesson, b.id)) })), inspector,
    shelf: ro ? [] : SHELF.map((g) => ({ group: g.group, items: g.kinds.map(([kind, glyph]) => ({ label: KIND_NAME[kind], glyph, add: () => add(kind) })) })),
    count: plural(lessons.length, 'lesson') + ' · ' + plural(lessons.flatMap((l) => l.blocks).length, 'block') + ' · ' + scored + ' scored',
    addLesson: () => { if (!ro && lessons.length < COURSE_CAPS.lessons[1]) { edit(addLesson); show(lessons.length, null); } }, removeLesson: () => drop(lesson), setLessonTitle: (v: string) => edit((it) => renameLesson(it, lesson, v)),
    problems: [...courseRowProblems(list), ...courseProblems(list, nw.shape ?? {})],
  };
}
