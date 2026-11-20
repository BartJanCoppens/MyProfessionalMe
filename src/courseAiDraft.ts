// AI help in the E-learning Studio's Produce step: "Draft blocks with AI" for a lesson, "Draft all lessons with AI" and "Suggest with AI" for one block. One
// engine for all three: a job is a lesson and what to ask (courseDraft.ts); each job grounds on the picked bundles like the Draft step (groundedPassages), runs the
// one draft pipeline (runDraft: viaAi under studio_draft, strict parse, never scripted blocks) and adds the blocks it gets after the existing ones.
import type { Logic } from './model';
import type { Bundle, NewDraft } from './types';
import { COURSE_CAPS, lessonsOf } from './logic/courseContent';
import type { CourseBlock } from './logic/courseContent';
import { insertBlock } from './logic/courseEdit';
import { FILL_KINDS, FILL_MAX, blocksRequest, readBlocks } from './logic/courseDraft';
import type { BlockAsk } from './logic/courseDraft';
import type { Item } from './logic/items';
import type { StudioEntry } from './logic/studios';
import { currentList, groundedPassages, runDraft, sameDraft } from './studioDraft';
import type { DraftSpec, SetNw } from './studioDraft';

export type BlockJob = { lesson: number; ask: BlockAsk; after?: string | null };
const plural = (n: number, one: string) => n + ' ' + one + (n === 1 ? '' : 's');
const FAILED = 'AI did not return usable blocks · try again';

function blockSpec(nw: NewDraft, lesson: { title: string; summary: string }, k: number, passages: string[], ask: BlockAsk, room: number, tally: { dropped: number }): DraftSpec {
  const kinds = 'fill' in ask ? FILL_KINDS : [ask.kind], max = 'fill' in ask ? Math.min(FILL_MAX, room) : 1;
  return { use: 'studio_draft', request: blocksRequest(nw, lesson, passages, ask), scripted: null, noScript: 'AI drafting is not switched on · add blocks yourself', failed: FAILED,
    parse: (raw) => { const r = readBlocks(raw, k, lesson.title, kinds, max); if (!r?.blocks.length) return null; tally.dropped += r.dropped; return r.blocks as Item[]; },
    aiNote: 'AI-assisted blocks · grounded on the picked bundles · check every block' };
}

// The blocks onto the course as it is now (edits made while the AI worked stay), each after the one before; how = 'ai' makes the contribution AI-assisted.
function addBlocks(L: Logic, setNw: SetNw, job: BlockJob, blocks: CourseBlock[], note: string) {
  const suggested = 'kind' in job.ask; // a suggestion is selected so the creator sees it at once
  setNw((cur) => (cur.type === 'E-learning' && cur.items ? { items: { ...cur.items, how: 'ai', note, problems: [],
    list: blocks.reduce((list, b, i) => insertBlock(list, job.lesson, i ? blocks[i - 1].id : job.after ?? null, b), cur.items.list as StudioEntry[]) as Item[] } } : {}));
  L.setState((s) => ({ courseAi: { ...s.courseAi, ids: [...s.courseAi.ids, ...blocks.map((b) => b.id)] }, courseEdit: suggested ? { lesson: job.lesson, block: blocks[0].id } : s.courseEdit }));
}

export async function draftBlocks(L: Logic, nw: NewDraft, bundles: Bundle[], setNw: SetNw, jobs: BlockJob[]) {
  if (L.state.nwAiBusy || L.readOnly() || !jobs.length) return;
  const started = L.state, out = { added: 0, lessons: 0, dropped: 0, notes: [] as string[], limit: '', stoppedAt: -1 };
  L.setState({ nwAiBusy: true });
  try {
    for (const [n, job] of jobs.entries()) {
      const lesson = lessonsOf(currentList(L))[job.lesson];
      if (!lesson) { out.notes.push('Lesson ' + (job.lesson + 1) + ' no longer exists'); continue; }
      const room = COURSE_CAPS.blocksPerLesson - lesson.blocks.length, who = jobs.length > 1 ? 'Lesson ' + (job.lesson + 1) + ': ' : '';
      if (room <= 0) { out.notes.push(who + 'A lesson holds at most ' + COURSE_CAPS.blocksPerLesson + ' blocks'); continue; }
      const passages = groundedPassages(L, nw, bundles, lesson.title + ' ' + lesson.summary + ' ' + nw.title);
      if (!passages) return;
      if (jobs.length > 1) L.setState((s) => ({ courseAi: { ...s.courseAi, progress: 'Drafting lesson ' + (n + 1) + ' of ' + jobs.length } }));
      const tally = { dropped: 0 }, res = await runDraft(L, blockSpec(nw, lesson, job.lesson, passages, job.ask, room, tally), (m) => { out.limit = m; });
      if (out.limit) { out.stoppedAt = n; break; }
      if (typeof res === 'string') { out.notes.push(who + res); continue; }
      const again = lessonsOf(currentList(L))[job.lesson];
      if (!sameDraft(started, L.latest().state) || again?.title !== lesson.title) { out.notes.push(who + 'The lesson changed meanwhile · nothing added'); continue; }
      const blocks = (res.list as unknown as CourseBlock[]).slice(0, COURSE_CAPS.blocksPerLesson - again.blocks.length);
      addBlocks(L, setNw, job, blocks, res.note);
      out.added += blocks.length; out.lessons++; out.dropped += tally.dropped;
    }
  } finally { L.setState((s) => ({ nwAiBusy: false, courseAi: { ...s.courseAi, progress: null } })); }
  L.say(summary(out, jobs));
}

function summary(out: { added: number; lessons: number; dropped: number; notes: string[]; limit: string; stoppedAt: number }, jobs: BlockJob[]): string {
  const parts = [
    ...(out.added ? ['Added ' + plural(out.added, 'block') + ' from your sources' + (jobs.length > 1 ? ' in ' + plural(out.lessons, 'lesson') : '') + ' · review each one'] : []),
    ...(out.dropped ? [out.dropped + ' dropped: they did not fit the course rules'] : []), ...out.notes,
    ...(out.limit ? [out.limit, ...(jobs.length > 1 ? [left(jobs.slice(out.stoppedAt))] : [])] : []),
  ];
  return parts.join(' · ');
}
const left = (jobs: BlockJob[]) => (jobs.length > 1 ? 'lessons ' + (jobs[0].lesson + 1) + ' to ' + (jobs[jobs.length - 1].lesson + 1) + ' were' : 'lesson ' + (jobs[0].lesson + 1) + ' was') + ' not drafted';
