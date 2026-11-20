// The E-learning Studio's course editor as view-model (Task 1.3): the lesson outline, the lesson's blocks on the canvas, the selected block's inspector
// and the widget shelf. The course is `nw.items` (lesson rows, then blocks); every edit is a pure function of logic/courseEdit.ts on it. In View as
// everything shows and nothing changes.
import type { Logic } from './model';
import type { Bundle, NewDraft } from './types';
import type { SetNw } from './createItems';
import { blockView } from './fmtCourse';
import { fieldsOf } from './courseFields';
import { COURSE_CAPS, KIND_NAME, SCORED_KINDS, courseProblems, courseRowProblems, embedProblems, lessonsOf } from './logic/courseContent';
import type { BlockKind, CourseBlock, EmbedFormat, HotspotBlock, ImageBlock } from './logic/courseContent';
import { EMBED_SHELF, embedAvailable, embedGlyph, embedSources } from './courseEmbedEdit';
import { studioOfFormat } from './logic/studios';
import { openStudioFromCourse } from './createSave';
import { IMAGE_ACCEPT, IMAGE_HINT, setCourseImage } from './courseImageEdit';
import { addLesson, duplicateBlock, insertBlock, moveBlock, moveLesson, newBlock, newEmbed, patchBlock, removeBlock, removeLesson, renameLesson } from './logic/courseEdit';
import { SHORT_MAX, rowFieldMax } from './logic/items';
import type { Item } from './logic/items';
import type { StudioEntry } from './logic/studios';
import { clearAsk } from './studioDraft';
import { draftBlocks } from './courseAiDraft';
import type { BlockJob } from './courseAiDraft';
import { isDraftKind } from './logic/courseDraft';

// The shelf: the blocks and the interactions, then the learnings of the studios (courseEmbedEdit.ts).
const SHELF: { group: string; kinds: [Exclude<BlockKind, 'embed'>, string][] }[] = [
  { group: 'Blocks', kinds: [['text', '¶'], ['callout', '!'], ['accordion', '≡'], ['image', '▣']] },
  { group: 'Interactions', kinds: [['check', '?'], ['sort', '⇅'], ['hotspot', '◎'], ['branch', '⑂'], ['reflect', '✎'], ['exercise', '＝']] },
];
const LESSON_TITLE_MAX = rowFieldMax(1); // a lesson row's second field (private.rows_ok)
const plural = (n: number, one: string) => n + ' ' + one + (n === 1 ? '' : 's');

type Ctx = ReturnType<typeof context>;
function context(L: Logic, nw: NewDraft, setNw: SetNw, bundles: Bundle[]) {
  const list = (nw.items?.list ?? []) as StudioEntry[], lessons = lessonsOf(list), ro = L.subject.readOnly, ce = L.state.courseEdit;
  const lesson = Math.min(Math.max(ce.lesson, 0), Math.max(lessons.length - 1, 0)), blocks = lessons[lesson]?.blocks ?? [];
  const selected = blocks.find((b) => b.id === ce.block) ?? null;
  const show = (k: number, block: string | null) => L.setState({ courseEdit: { lesson: k, block } });
  const edit = (f: (items: StudioEntry[]) => StudioEntry[]) => { if (!ro) setNw((cur) => (cur.items ? { items: { ...cur.items, list: f(cur.items.list as StudioEntry[]) as Item[], how: cur.items.how || 'manual', problems: [] } } : {})); };
  return { L, nw, setNw, bundles, list, lessons, ro, ce, lesson, blocks, selected, show, edit };
}

// An embedded learning's Source and "Make a new one in the … Studio" (the course is saved first: createSave.openStudioFromCourse).
const embedExt = (c: Ctx, format: EmbedFormat, learning: string) => ({ sources: embedSources(format, learning), make: () => { void openStudioFromCourse(c.L, format); }, makeLabel: 'Make a new one in the ' + (studioOfFormat(format)?.name ?? format).replace(/ Studio$/, '') + ' Studio' });

// An edit takes the block's "AI draft" marker off; the AI's jobs (courseAiDraft.ts) run one at a time through the Draft step's busy flag.
const keepAi = (c: Ctx, id: string) => { if (c.L.state.courseAi.ids.includes(id)) c.L.setState((s) => ({ courseAi: { ...s.courseAi, ids: s.courseAi.ids.filter((x) => x !== id) } })); };
const run = (c: Ctx, jobs: BlockJob[]) => draftBlocks(c.L, c.nw, c.bundles, c.setNw, jobs);

const full = (c: Ctx) => { const is = c.blocks.length >= COURSE_CAPS.blocksPerLesson; if (is) c.L.say('A lesson holds at most ' + COURSE_CAPS.blocksPerLesson + ' blocks'); return is; };

// A picture's file picker: "Add an image", or "Replace the image" once it has one.
const imageExt = (c: Ctx, b: ImageBlock | HotspotBlock) => ({ label: b.path ? 'Replace the image' : 'Add an image', hint: IMAGE_HINT, accept: IMAGE_ACCEPT, busy: c.L.state.createBusy, choose: (file: File) => { void setCourseImage(c.L, b.id, file); } });

function blockOps(c: Ctx) {
  const { selected, blocks, edit, show, lesson } = c, at = selected ? blocks.indexOf(selected) : -1;
  const add = (make: (title: string) => CourseBlock) => {
    if (c.ro || full(c)) return;
    const b = make((c.lessons[lesson]?.title ?? '').trim().slice(0, SHORT_MAX));
    edit((it) => insertBlock(it, lesson, selected?.id ?? null, b));
    show(lesson, b.id);
  };
  const inspector = c.ro || !selected ? null : {
    type: KIND_NAME[selected.block], id: selected.id, ...fieldsOf(selected, (p) => { edit((it) => patchBlock(it, selected.id, p)); keepAi(c, selected.id); }, {
      embed: selected.block === 'embed' ? embedExt(c, selected.format, selected.learning) : undefined, image: selected.block === 'image' || selected.block === 'hotspot' ? imageExt(c, selected) : undefined }),
    noUp: at === 0, noDown: at === blocks.length - 1, up: () => edit((it) => moveBlock(it, selected.id, -1)), down: () => edit((it) => moveBlock(it, selected.id, 1)),
    duplicate: () => { if (!full(c)) edit((it) => duplicateBlock(it, selected.id)); }, remove: () => { edit((it) => removeBlock(it, selected.id)); show(lesson, null); }, done: () => show(lesson, null),
  };
  return {
    blocks: blocks.map((b) => blockView(b, 'edit', undefined, () => {}, { ro: c.ro, on: b.id === selected?.id, ai: c.L.state.courseAi.ids.includes(b.id), pick: () => (c.ro ? undefined : show(lesson, b.id)) })), inspector,
    shelf: c.ro ? [] : [...SHELF.map((g) => ({ group: g.group, items: g.kinds.map(([kind, glyph]) => ({ label: KIND_NAME[kind], glyph, add: () => add((title) => newBlock(kind, lesson, title)),
      suggest: isDraftKind(kind) ? () => run(c, [{ lesson, ask: { kind }, after: selected?.id ?? null }]) : undefined })) })),
      ...EMBED_SHELF.map((g) => ({ group: g.group, items: g.items.map(([format, label]) => ({ label, glyph: embedGlyph(format), add: () => add(() => newEmbed(format, lesson)), suggest: undefined })) }))],
  };
}

// Removing a lesson takes its blocks with it: with blocks it asks first (the same Continue / Cancel as a redraft), without it goes at once.
function lessonOps(c: Ctx) {
  const { L, lessons, lesson, edit, show, ce } = c, pending = L.state.studio.ask;
  const drop = (k: number) => {
    if (c.ro) return;
    if (lessons.length <= COURSE_CAPS.lessons[0]) { L.say('A course needs at least two lessons'); return; }
    edit((it) => removeLesson(it, k));
    show(Math.min(lesson > k ? lesson - 1 : lesson, lessons.length - 2), null);
  };
  const shift = (k: number, by: -1 | 1) => { edit((it) => moveLesson(it, k, by)); show(lesson === k ? k + by : lesson === k + by ? k : lesson, ce.block); };
  const asked = !c.ro && pending && 'lesson' in pending && pending.lesson < lessons.length ? pending.lesson : null;
  return {
    lessons: lessons.map((l, k) => ({ n: k + 1, title: l.title, meta: plural(l.blocks.length, 'block'), on: k === lesson, pick: () => show(k, null),
      noUp: k === 0, noDown: k === lessons.length - 1, up: () => shift(k, -1), down: () => shift(k, 1) })),
    noRemove: lessons.length <= COURSE_CAPS.lessons[0], noAdd: lessons.length >= COURSE_CAPS.lessons[1],
    addLesson: () => { if (!c.ro && lessons.length < COURSE_CAPS.lessons[1]) { edit(addLesson); show(lessons.length, null); } },
    removeLesson: () => (c.blocks.length && lessons.length > COURSE_CAPS.lessons[0] ? !c.ro && L.setState((s) => ({ studio: { ...s.studio, ask: { lesson } } })) : drop(lesson)),
    setLessonTitle: (v: string) => edit((it) => renameLesson(it, lesson, v)),
    ask: asked === null ? null : { text: 'This removes ' + plural(lessons[asked].blocks.length, 'block') + ' with lesson ' + (asked + 1), cancel: clearAsk(L), proceed: () => { clearAsk(L)(); drop(asked); } },
  };
}

// AI help (courseAiDraft.ts): fill the lesson on show, fill every lesson; none in View as. `hint` says what it does (honest UI).
const aiOps = (c: Ctx) => (c.ro ? null : { busy: c.L.state.nwAiBusy, progress: c.L.state.courseAi.progress, hint: 'Drafts blocks from your sources · review each one',
  fillLesson: { label: 'Draft blocks with AI', run: () => run(c, [{ lesson: c.lesson, ask: { fill: true } }]) },
  fillAll: { label: 'Draft all lessons with AI', run: () => run(c, c.lessons.map((_, k) => ({ lesson: k, ask: { fill: true } }))) } });

export function courseEditVals(L: Logic, nw: NewDraft, setNw: SetNw, bundles: Bundle[]) {
  const c = context(L, nw, setNw, bundles), scored = c.lessons.flatMap((l) => l.blocks).filter((b) => SCORED_KINDS.includes(b.block)).length;
  return {
    readOnly: c.ro, ai: aiOps(c), lessonTitle: c.lessons[c.lesson]?.title ?? '', titleMax: LESSON_TITLE_MAX, ...blockOps(c), ...lessonOps(c),
    count: plural(c.lessons.length, 'lesson') + ' · ' + plural(c.lessons.flatMap((l) => l.blocks).length, 'block') + ' · ' + scored + ' scored',
    problems: [...courseRowProblems(c.list), ...courseProblems(c.list, nw.shape ?? {}), ...embedProblems(c.list, embedAvailable)],
  };
}
