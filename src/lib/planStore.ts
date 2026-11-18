// Trajectory plans and their source documents, in Supabase (private tables: only editors of the trajectory read or write them, see
// 20261118230000_trajectory_plans.sql). Rows are parsed at the boundary: a malformed plan is shown as the empty plan, malformed
// messages as none and a malformed source is dropped, each with a console warning, never thrown.
import { emptyPlan } from '../logic/trajectoryPlan';
import type { PlanMessage, PlanRecord, PlanSource, TrajectoryPlan } from '../logic/trajectoryPlan';
import { isObject } from '../logic/values';
import { inOrder } from './contentStore';
import { removePaths } from './mediaStore';
import { cancelSoon, saveSoon } from './saveSoon';
import { supabase } from './supabase';

type PlanRow = { trajectory_id: string; plan: unknown; messages: unknown; bundle_ids: unknown; updated_at: string | null };
type SourceRow = { id: string; trajectory_id: string; name: string; path: string | null; pages: number; passages: unknown; chars: number; flags: string[] | null; added_by: string; added_at: string };
type Failure = { message: string; code?: string };

const PLAN_COLUMNS = 'trajectory_id, plan, messages, bundle_ids, updated_at';
const SOURCE_COLUMNS = 'id, trajectory_id, name, path, pages, passages, chars, flags, added_by, added_at';
const key = (trajectoryId: string) => 'plan:' + trajectoryId;

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const moduleOk = (m: unknown) => isObject(m) && typeof m.id === 'string' && typeof m.title === 'string' && typeof m.depth === 'string' && typeof m.hours === 'number'
  && typeof m.accepted === 'boolean' && isStrings(m.goals) && Array.isArray(m.material) && Array.isArray(m.sources) && Array.isArray(m.checks);
const planOk = (p: unknown): p is TrajectoryPlan => isObject(p) && p.version === 1 && Array.isArray(p.modules) && p.modules.every(moduleOk) && isStrings(p.removed);
const messageOk = (m: unknown) => isObject(m) && (m.role === 'admin' || m.role === 'ai') && typeof m.text === 'string' && typeof m.at === 'string';
const passageOk = (p: unknown) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'string';

function parsePlan(r: PlanRow): PlanRecord {
  const plan = planOk(r.plan) ? { ...emptyPlan(), ...r.plan } : null;
  if (!plan) console.warn(`Plan of ${r.trajectory_id} is malformed; shown as the empty plan`);
  const messagesOk = Array.isArray(r.messages) && r.messages.every(messageOk);
  if (!messagesOk) console.warn(`Messages of the plan of ${r.trajectory_id} are malformed; shown with none`);
  return {
    trajectoryId: r.trajectory_id, plan: plan ?? emptyPlan(), messages: messagesOk ? r.messages as PlanMessage[] : [],
    bundleIds: isStrings(r.bundle_ids) ? r.bundle_ids : [], updatedAt: r.updated_at ?? null,
  };
}

function parseSource(r: SourceRow): PlanSource | null {
  if (!Array.isArray(r.passages) || !r.passages.every(passageOk)) {
    console.warn(`Source ${r.id} dropped: its passages are malformed`);
    return null;
  }
  return { id: r.id, trajectoryId: r.trajectory_id, name: r.name, path: r.path, pages: r.pages, passages: r.passages as [number, string][], chars: r.chars, flags: r.flags ?? [], addedBy: r.added_by, addedAt: r.added_at };
}

const refused = 'Not saved · you can only plan trajectories of your own business line';
function fail(error: Failure | null) {
  if (!error) return;
  throw new Error(error.code === '42501' && /row-level security|permission denied/.test(error.message) ? refused : error.message);
}

// The plan of a trajectory (null: none yet) and its source documents, oldest first.
export async function loadPlan(trajectoryId: string): Promise<{ record: PlanRecord | null; sources: PlanSource[] }> {
  const plan = await supabase.from('trajectory_plans').select(PLAN_COLUMNS).eq('trajectory_id', trajectoryId).maybeSingle();
  fail(plan.error);
  const sources = await supabase.from('trajectory_plan_sources').select(SOURCE_COLUMNS).eq('trajectory_id', trajectoryId).order('added_at');
  fail(sources.error);
  return {
    record: plan.data ? parsePlan(plan.data as PlanRow) : null,
    sources: ((sources.data || []) as SourceRow[]).map(parseSource).filter((s): s is PlanSource => !!s),
  };
}

// An upsert of the granted columns (the database stamps who and when). Edits come in bursts: saveSoon, the last edit wins.
async function writePlan(r: PlanRecord) {
  const { error } = await supabase.from('trajectory_plans').upsert({ trajectory_id: r.trajectoryId, plan: r.plan, messages: r.messages, bundle_ids: r.bundleIds }, { onConflict: 'trajectory_id' });
  fail(error);
}
export function savePlanSoon(record: PlanRecord, onError: (message: string) => void, wait = 600) {
  saveSoon(key(record.trajectoryId), () => record, writePlan, onError, wait);
}

// The plan back to empty and the conversation cleared; the knowledge bundles and the sources stay. A pending save is dropped first.
export async function startOver(trajectoryId: string): Promise<void> {
  cancelSoon(key(trajectoryId));
  await inOrder(key(trajectoryId), async () => {
    const { data, error } = await supabase.from('trajectory_plans').update({ plan: emptyPlan(), messages: [] }).eq('trajectory_id', trajectoryId).select('trajectory_id');
    fail(error);
    if (!(data as unknown[] | null)?.length) throw new Error('Not changed · there is no plan, or you cannot change it');
  });
}

// The uploaded files of the trajectory's sources (rows without a file are skipped), listed before the trajectory is deleted.
export async function planFilePaths(trajectoryId: string): Promise<string[]> {
  const { data, error } = await supabase.from('trajectory_plan_sources').select('path').eq('trajectory_id', trajectoryId);
  fail(error);
  return ((data || []) as { path: string | null }[]).map((r) => r.path).filter((p): p is string => !!p);
}

// After the trajectory's row is gone: the files are cleaned up, and a failure is only warned about (a leftover file is acceptable,
// a lost one is not, so this never runs before the delete).
export async function removePlanFiles(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try { await removePaths(paths, true); } catch (err) { console.warn('Plan source files left in storage: ' + (err as Error).message); }
}

// One source: its file first, then its row. When the file cannot be removed the row stays, so the file is never orphaned.
export async function removePlanSource(sourceId: string): Promise<void> {
  const { data, error } = await supabase.from('trajectory_plan_sources').select('path').eq('id', sourceId).maybeSingle();
  fail(error);
  const path = (data as { path: string | null } | null)?.path;
  if (path) {
    try { await removePaths([path], true); } catch { throw new Error('Not removed · the original file could not be removed, so the source stays'); }
  }
  const gone = await supabase.from('trajectory_plan_sources').delete().eq('id', sourceId).select('id');
  fail(gone.error);
  if (!(gone.data as unknown[] | null)?.length) throw new Error('Not removed · only an editor of this trajectory can remove a source');
}
