import { AUDS, BLS } from '../data';
import type { Bundle, Learn, LearnMeta, Mapping } from '../types';
import { supabase } from './supabase';

// The learning catalogue, curriculum mappings and knowledge bundles, stored in Supabase.
// Row-level security decides who may write: General and System Admins everything, Domain Admins their own business line.

export type LearningRow = { id: string; title: string; domain: string; level: number; format: string; source: string; hours: number | string; cpd: number | string; due: string; why: string; business_line: string | null; status: LearnMeta['status'] };
export type MappingRow = { audience: string; learning_id: string; stage: string; obligation: string };
export type BundleRow = { id: string; business_line: string | null; access: string; data: Omit<Bundle, 'id' | 'access' | 'line'> };
export type Content = { learnings: [Learn, LearnMeta][]; maps: Record<string, Mapping[]>; bundles: Bundle[] };
export type LearningFields = Omit<LearningRow, 'id'>;

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export const toLearn = (r: LearningRow): [Learn, LearnMeta] =>
  [[r.id, r.title, r.domain, r.level, r.format, r.source, Number(r.hours), Number(r.cpd), r.due, r.why], { line: r.business_line, status: r.status }];

// Every audience gets a list, empty when nothing is mapped to it.
export function mapsFrom(rows: MappingRow[]): Record<string, Mapping[]> {
  const maps: Record<string, Mapping[]> = {};
  BLS.forEach((b) => { maps[b] = []; });
  Object.values(AUDS).forEach((list) => list.forEach((a) => { maps[a[0]] = maps[a[0]] || []; }));
  rows.forEach((r) => { (maps[r.audience] = maps[r.audience] || []).push([r.learning_id, r.stage, r.obligation]); });
  return maps;
}

// Pending keys are `audience|learningId`: write what the map holds now, or delete when it no longer holds it.
export function mappingChanges(maps: Record<string, Mapping[]>, pending: Record<string, boolean>) {
  const upserts: MappingRow[] = [], deletes: { audience: string; learning_id: string }[] = [];
  Object.keys(pending).forEach((key) => {
    const i = key.indexOf('|'), audience = key.slice(0, i), learning_id = key.slice(i + 1);
    const m = (maps[audience] || []).find((x) => x[0] === learning_id);
    if (m) upserts.push({ audience, learning_id, stage: m[1], obligation: m[2] }); else deletes.push({ audience, learning_id });
  });
  return { upserts, deletes };
}

export const bundleFrom = (r: BundleRow): Bundle => ({ ...r.data, id: r.id, access: r.access, line: r.business_line });
export function bundleRow(b: Bundle): BundleRow {
  const { id, access, line, ...data } = b;
  return { id, access, business_line: line ?? null, data };
}

export async function loadContent(): Promise<Content> {
  const [l, m, b] = await Promise.all([
    supabase.from('learnings').select('id, title, domain, level, format, source, hours, cpd, due, why, business_line, status').order('id'),
    supabase.from('curriculum_mappings').select('audience, learning_id, stage, obligation'),
    supabase.from('knowledge_bundles').select('id, business_line, access, data').order('id'),
  ]);
  fail(l.error); fail(m.error); fail(b.error);
  const byNumber = (r: LearningRow) => Number(r.id.slice(1)) || 0;
  return { learnings: (l.data as LearningRow[]).sort((x, y) => byNumber(x) - byNumber(y)).map(toLearn), maps: mapsFrom(m.data as MappingRow[]), bundles: (b.data as BundleRow[]).map(bundleFrom) };
}

export async function saveLearning(fields: LearningFields, id?: string) {
  const res = id ? await supabase.from('learnings').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select('id')
    : await supabase.from('learnings').insert(fields).select('id');
  fail(res.error);
  if (!res.data?.length) throw new Error('Not saved · you can only edit learnings of your own business line');
}

export async function removeLearning(id: string) {
  const { data, error } = await supabase.from('learnings').delete().eq('id', id).select('id');
  fail(error);
  if (!data?.length) throw new Error('Not removed · you can only remove learnings of your own business line');
}

export async function publishMappings(changes: ReturnType<typeof mappingChanges>) {
  if (changes.upserts.length) fail((await supabase.from('curriculum_mappings').upsert(changes.upserts.map((r) => ({ ...r, updated_at: new Date().toISOString() })))).error);
  for (const d of changes.deletes) fail((await supabase.from('curriculum_mappings').delete().eq('audience', d.audience).eq('learning_id', d.learning_id)).error);
}

export async function saveBundle(b: Bundle) {
  const { error } = await supabase.from('knowledge_bundles').upsert({ ...bundleRow(b), updated_at: new Date().toISOString() });
  fail(error);
}

// Bundle edits come in bursts (typing a name, adding tags); the last version of each bundle is written shortly after.
const timers = new Map<string, number>();
export function saveBundleSoon(b: Bundle, onError: (message: string) => void, wait = 700) {
  clearTimeout(timers.get(b.id));
  timers.set(b.id, window.setTimeout(() => { timers.delete(b.id); saveBundle(b).catch((err) => onError((err as Error).message)); }, wait));
}
