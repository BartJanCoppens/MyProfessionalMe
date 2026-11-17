import { AUDS, BLS } from '../data';
import type { Bundle, FormatContent, Learn, LearnMeta, Mapping } from '../types';
import { supabase } from './supabase';

// The learning catalogue, curriculum mappings and knowledge bundles, stored in Supabase.
// Row-level security decides who may write: General and System Admins everything, Domain Admins their own business line.

export type LearningRow = { id: string; title: string; domain: string; level: number; format: string; source: string; hours: number | string; cpd: number | string; due: string; why: string; business_line: string | null; status: LearnMeta['status']; content?: unknown };
export type MappingRow = { audience: string; learning_id: string; stage: string; obligation: string };
export type BundleRow = { id: string; business_line: string | null; access: string; data: Omit<Bundle, 'id' | 'access' | 'line'> };
export type Content = { learnings: [Learn, LearnMeta][]; maps: Record<string, Mapping[]>; bundles: Bundle[] };
export type LearningFields = Omit<LearningRow, 'id'>;

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

const isText = (v: unknown): v is string => typeof v === 'string';
const isTexts = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPair = (v: unknown): v is [string, string] => Array.isArray(v) && v.length === 2 && v.every(isText);

// Stored content (jsonb) to a typed value; anything malformed is null so a screen can fall back to the plain page.
export function parseFormatContent(raw: unknown): FormatContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, any>;
  switch (c.kind) {
    case 'flash': return isCount(c.total) && isCount(c.due) && isText(c.next) && Array.isArray(c.cards) && c.cards.every(isPair) ? c as FormatContent : null;
    case 'exam': return isCount(c.bank) && isText(c.real) && Array.isArray(c.qs) && c.qs.every(examQuestionOk) ? c as FormatContent : null;
    case 'case': return isText(c.brief) && isTexts(c.deliv) && isTexts(c.rubric) && isText(c.reviewer) ? c as FormatContent : null;
    case 'teach': return isText(c.prompt) && Array.isArray(c.crit) ? teach(c.prompt, c.crit) : null;
    case 'stretch': return isText(c.brief) && isTexts(c.checks) ? c as FormatContent : null;
    case 'webinar': return [c.mon, c.day, c.time, c.when, c.speakers].every(isText) && isTexts(c.agenda) ? c as FormatContent : null;
    case 'aid': return isTexts(c.items) ? c as FormatContent : null;
    case 'explainer': return [c.style, c.depth, c.end].every(isText) && listOf(c.steps, (s) => labelled(s) && (s.svg === undefined || isText(s.svg)))
      && (c.check === undefined || (Array.isArray(c.check) && c.check.length === 3 && c.check.every(examQuestionOk))) ? c as FormatContent : null;
    case 'motion': return listOf(c.stages, labelled) && isText(c.svg) && isText(c.alt) && isCount(c.seconds) ? c as FormatContent : null;
    default: return null;
  }
}
// A non-empty list whose every entry passes ok; a step or stage is { label, text }.
const listOf = (v: unknown, ok: (x: any) => boolean) => Array.isArray(v) && v.length > 0 && v.every((x) => !!x && typeof x === 'object' && ok(x));
const labelled = (x: any) => isText(x.label) && isText(x.text);
const examQuestionOk = (q: any) => !!q && [q.t, q.q, q.why].every(isText) && isTexts(q.o) && Number.isInteger(q.a) && q.a >= 0 && q.a < q.o.length;
function teach(prompt: string, crit: unknown[]): FormatContent | null {
  const out: [string, RegExp | null][] = [];
  for (const c of crit) {
    if (!Array.isArray(c) || c.length !== 2 || !isText(c[0]) || !(c[1] === null || isText(c[1]))) return null;
    try { out.push([c[0], c[1] === null ? null : new RegExp(c[1], 'i')]); } catch { return null; }
  }
  return { kind: 'teach', prompt, crit: out };
}

export const toLearn = (r: LearningRow): [Learn, LearnMeta] =>
  [[r.id, r.title, r.domain, r.level, r.format, r.source, Number(r.hours), Number(r.cpd), r.due, r.why], { line: r.business_line, status: r.status, ...(r.content ? { content: parseFormatContent(r.content) } : {}) }];

// Every audience gets a list, empty when nothing is mapped to it. Mappings to learnings outside `known` are left out.
export function mapsFrom(rows: MappingRow[], known?: Set<string>): Record<string, Mapping[]> {
  const maps: Record<string, Mapping[]> = {};
  BLS.forEach((b) => { maps[b] = []; });
  Object.values(AUDS).forEach((list) => list.forEach((a) => { maps[a[0]] = maps[a[0]] || []; }));
  rows.filter((r) => !known || known.has(r.learning_id)).forEach((r) => { (maps[r.audience] = maps[r.audience] || []).push([r.learning_id, r.stage, r.obligation]); });
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

// After a reload: the stored maps, with this admin's unpublished edits (still pending) laid over them.
// Learnings no longer in the catalogue drop out of both.
export function mergeMaps(reloaded: Record<string, Mapping[]>, local: Record<string, Mapping[]>, pending: Record<string, boolean>, known: Set<string>) {
  const maps: Record<string, Mapping[]> = {}, left: Record<string, boolean> = {};
  Object.keys(reloaded).forEach((k) => { maps[k] = reloaded[k].filter((m) => known.has(m[0])); });
  Object.keys(pending).forEach((key) => {
    const i = key.indexOf('|'), aud = key.slice(0, i), lid = key.slice(i + 1);
    if (!known.has(lid)) return;
    left[key] = true;
    const mine = (local[aud] || []).find((m) => m[0] === lid), rest = (maps[aud] || []).filter((m) => m[0] !== lid);
    maps[aud] = mine ? rest.concat([mine]) : rest;
  });
  return { maps, pending: left };
}

export const bundleFrom = (r: BundleRow): Bundle => ({ ...r.data, id: r.id, access: r.access, line: r.business_line });
export function bundleRow(b: Bundle): BundleRow {
  const { id, access, line, ...data } = b;
  return { id, access, business_line: line ?? null, data };
}

export async function loadContent(): Promise<Content> {
  const [l, m, b] = await Promise.all([
    supabase.from('learnings').select('id, title, domain, level, format, source, hours, cpd, due, why, business_line, status, content').order('id'),
    supabase.from('curriculum_mappings').select('audience, learning_id, stage, obligation'),
    supabase.from('knowledge_bundles').select('id, business_line, access, data').order('id'),
  ]);
  fail(l.error); fail(m.error); fail(b.error);
  const byNumber = (r: LearningRow) => Number(r.id.slice(1)) || 0;
  const rows = (l.data as LearningRow[]).sort((x, y) => byNumber(x) - byNumber(y));
  return { learnings: rows.map(toLearn), maps: mapsFrom(m.data as MappingRow[], new Set(rows.map((r) => r.id))), bundles: (b.data as BundleRow[]).map(bundleFrom) };
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

// A write row-level security refuses: an error on insert, or no rows on delete.
const notYours = 'Not published · you can only change the curriculum of your own audiences';
export async function publishMappings(changes: ReturnType<typeof mappingChanges>) {
  if (changes.upserts.length) {
    const { error } = await supabase.from('curriculum_mappings').upsert(changes.upserts.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (error) throw new Error(/row-level security/.test(error.message) ? notYours : error.message);
  }
  for (const d of changes.deletes) {
    const { data, error } = await supabase.from('curriculum_mappings').delete().eq('audience', d.audience).eq('learning_id', d.learning_id).select('learning_id');
    fail(error);
    if (data?.length) continue;
    // Nothing deleted: fine when it was never stored (added and removed before publishing), refused when it is still there.
    const still = await supabase.from('curriculum_mappings').select('learning_id').eq('audience', d.audience).eq('learning_id', d.learning_id);
    fail(still.error);
    if (still.data?.length) throw new Error(notYours);
  }
}

export async function saveBundle(b: Bundle) {
  const { error } = await supabase.from('knowledge_bundles').upsert({ ...bundleRow(b), updated_at: new Date().toISOString() });
  fail(error);
}

// Bundle edits come in bursts (typing a name, adding tags). Each bundle saves one write at a time, in order;
// a scheduled save reads the bundle as it is when the timer fires, so the last edit wins.
const timers = new Map<string, number>(), chains = new Map<string, Promise<unknown>>();
export function inOrder(id: string, run: () => Promise<void>) {
  const next = (chains.get(id) || Promise.resolve()).then(run, run);
  chains.set(id, next.catch(() => {}));
  return next;
}
export function saveBundleSoon(id: string, latest: () => Bundle | undefined, onError: (message: string) => void, wait = 600) {
  clearTimeout(timers.get(id));
  timers.set(id, window.setTimeout(() => { timers.delete(id); const b = latest(); if (b) inOrder(id, () => saveBundle(b)).catch((err) => onError((err as Error).message)); }, wait));
}
export function saveBundleNow(b: Bundle, onError: (message: string) => void) {
  inOrder(b.id, () => saveBundle(b)).catch((err) => onError((err as Error).message));
}
