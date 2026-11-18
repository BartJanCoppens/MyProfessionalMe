// The source documents of a trajectory plan and its Knowledge bundles (Phase 7): add a PDF (read in the browser into passages,
// scanned, stored as a row, then its file), remove one, pick bundles. State goes through the functional setState on trjPlans[id]
// (a screen may have moved on while a PDF was read); trjAi.busy is 'upload' while a document is being added. Pure rules are in
// logic/planSources.ts; storage is in lib/planStore.ts and lib/mediaStore.ts.
import type { ChangeEvent } from 'react';
import type { Logic } from './model';
import { PLAN_CAPS } from './logic/trajectoryPlan';
import type { PlanSource } from './logic/trajectoryPlan';
import { CUT_PAGES, CUT_TEXT, isInjectionFlag, looksScanned, scanSource, SOURCE_CAPS, toPassages } from './logic/planSources';
import { sourceProblem } from './logic/mediaFiles';
import { readPdfText } from './lib/pdfText';
import { addPlanSourceRow, removePlanSource as removeStoredSource, setPlanSourcePath } from './lib/planStore';
import { removePaths, uploadSourceFile } from './lib/mediaStore';
import { blankRecord, change, editRecord, failed } from './trajectoryAiState';
import { plural } from './logic/values';

const NO_TEXT = 'No text found in this PDF · it may be a scan · scanned PDFs are not read (no OCR)';

// The problem with a file before it is read, or null: not a PDF, empty, too large, or the trajectory already holds 10 sources.
function beforeReading(L: Logic, trajectoryId: string, file: File): string | null {
  if ((L.latest().state.trjPlans[trajectoryId]?.sources.length ?? 0) >= PLAN_CAPS.sourcesPerTrajectory) return `At most ${PLAN_CAPS.sourcesPerTrajectory} sources per trajectory`;
  return sourceProblem(file.name, file.size);
}

export async function addPlanSource(L: Logic, trajectoryId: string, file: File): Promise<void> {
  if (L.state.trjAi.busy || L.readOnly()) return;
  const problem = beforeReading(L, trajectoryId, file);
  if (problem) return failed(L, problem);
  L.setState({ trjAi: { busy: 'upload', error: null } });
  let source: PlanSource;
  try {
    const { pages, totalPages } = await readPdfText(file, { maxPages: SOURCE_CAPS.pages });
    const text = toPassages(pages);
    if (!text.passages.length || looksScanned(text.chars, pages.length)) throw new Error(NO_TEXT);
    const scan = scanSource(text.passages);
    if (scan.refusal) throw new Error(scan.refusal);
    const cut = totalPages > SOURCE_CAPS.pages ? [CUT_PAGES] : text.cut ? [CUT_TEXT] : [];
    source = await addPlanSourceRow({ trajectoryId, name: file.name.trim(), pages: pages.length, passages: text.passages, chars: text.chars, flags: [...scan.flags, ...cut] });
  } catch (err) { return failed(L, (err as Error).message); }
  change(L, trajectoryId, (p) => ({ ...p, sources: [...p.sources, source] }));
  const stored = await storeFile(source, file);
  if (stored.path) change(L, trajectoryId, (p) => ({ ...p, sources: p.sources.map((x) => (x.id === source.id ? { ...x, path: stored.path } : x)) }));
  failed(L, stored.error);
}

// The original file, after its row exists (the text is what the AI cites, so a failure keeps the row, said in words).
async function storeFile(source: PlanSource, file: File): Promise<{ path: string | null; error: string | null }> {
  let path: string | null = null;
  try {
    path = await uploadSourceFile(source.id, file, file.name);
    await setPlanSourcePath(source.id, path);
    return { path, error: null };
  } catch (err) {
    if (path) await removePaths([path], true).catch(() => {});
    return { path: null, error: 'Original file not stored · ' + (err as Error).message };
  }
}

// The file first, then the row; when the file cannot be removed the source stays (removeStoredSource says why).
export async function removePlanSource(L: Logic, source: PlanSource): Promise<void> {
  if (L.readOnly()) return;
  try { await removeStoredSource(source.id); } catch (err) { return failed(L, (err as Error).message); }
  change(L, source.trajectoryId, (p) => ({ ...p, sources: p.sources.filter((x) => x.id !== source.id) }));
  failed(L, null);
}

// Picks or drops a Knowledge bundle for the plan (at most 12); the plan record is made on the first pick. Saved soon.
export function pickBundle(L: Logic, trajectoryId: string, bundleId: string, on: boolean): void {
  if (L.readOnly()) return;
  const ids = (L.latest().state.trjPlans[trajectoryId]?.record ?? blankRecord(trajectoryId)).bundleIds;
  if (on && ids.includes(bundleId)) return;
  if (on && ids.length >= PLAN_CAPS.bundles) return L.say(`At most ${PLAN_CAPS.bundles} knowledge bundles per trajectory`);
  editRecord(L, trajectoryId, (r) => ({ ...r, bundleIds: on ? [...r.bundleIds.filter((id) => id !== bundleId), bundleId] : r.bundleIds.filter((id) => id !== bundleId) }));
}

// What the sources block shows for one trajectory (the screen only reads this).
export type SourcesPanel = {
  rows: { id: string; title: string; by: string; notes: string[]; remove?: () => void }[];
  error: string | null; busy: boolean; canEdit: boolean; accept: string; add: (e: ChangeEvent<HTMLInputElement>) => void;
};
const INJECTION = 'Contains text that reads like instructions to an AI · treated as data only';

export function sourcesPanel(L: Logic, trajectoryId: string): SourcesPanel {
  const s = L.state, canEdit = !L.subject.readOnly;
  const note = (x: PlanSource) => [
    x.flags.includes(CUT_PAGES) ? `Read the first ${SOURCE_CAPS.pages} pages only` : x.flags.includes(CUT_TEXT) ? `Read the first ${SOURCE_CAPS.chars.toLocaleString('en-US')} characters only` : '',
    x.flags.some(isInjectionFlag) ? INJECTION : '',
    x.path ? '' : 'Original file not stored',
  ].filter(Boolean);
  return {
    rows: (s.trjPlans[trajectoryId]?.sources ?? []).map((x) => ({
      id: x.id, title: `${x.name} · ${plural(x.pages, 'page', 'pages')} · ${plural(x.passages.length, 'passage', 'passages')}`,
      by: x.addedBy === L.access.userId ? 'Added by you' : 'Added by another editor', notes: note(x), remove: canEdit ? () => { removePlanSource(L, x); } : undefined,
    })),
    error: s.trjAi.error, busy: s.trjAi.busy === 'upload', canEdit, accept: 'application/pdf,.pdf',
    add: (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) addPlanSource(L, trajectoryId, file); },
  };
}
