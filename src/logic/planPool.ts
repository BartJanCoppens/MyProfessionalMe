// What each Trajectory AI call is sent besides the plan and the last messages (Phase 7): a bounded pool of passages (the plan's cited ones,
// then the best matches in the uploaded documents and the picked Knowledge bundles) and a bounded catalogue of learnings. Never a whole
// document, never a client-confidential or licensed source. Pure. The texts are untrusted: the caller wraps each one in marked().
import { LEARN_META } from '../data';
import type { Bundle, Learn } from '../types';
import { rankPassages, usablePassage } from './okf';
import { refKey } from './trajectoryPlan';
import type { PlanSource, SourceRef, TrajectoryPlan } from './trajectoryPlan';

export const PLAN_POOL = { passages: 24, citedFirst: 16, passageChars: 700, catalogue: 40, catalogueChars: 160 } as const;
export type PoolPassage = { ref: SourceRef; label: string; text: string };
export type CatalogueRow = { id: string; title: string; format: string; hours: number; level: number; desc: string };

const clip = (text: string): string => text.slice(0, PLAN_POOL.passageChars);
const fileLabel = (s: PlanSource, page: number) => `${s.name} · p. ${page}`;

// The passages of a bundle that a creator may use, as pool passages (the chunk number is the index in the bundle's chunks).
function bundlePassages(b: Bundle): PoolPassage[] {
  return b.chunks.flatMap(([si, text], chunk): PoolPassage[] => {
    const src = b.sources[si];
    return src && usablePassage(src) ? [{ ref: { kind: 'kb', bundleId: b.id, chunk }, label: `${src[0]} · ${b.name}`, text: clip(text) }] : [];
  });
}
const filePassages = (s: PlanSource): PoolPassage[] => s.passages.map(([page, text]) => ({ ref: { kind: 'file', sourceId: s.id, page }, label: fileLabel(s, page), text: clip(text) }));

// A cited passage now: found by its reference, else its stored quote marked as changed. A bundle chunk whose source is no longer
// usable (client or licensed) is dropped, quote and all. A learning has no passage text: the quote stands.
function resolveCited(c: { ref: SourceRef; label: string; quote: string }, live: Map<string, PoolPassage>, bundles: Bundle[]): PoolPassage | null {
  const found = live.get(refKey(c.ref));
  if (found) return found;
  if (c.ref.kind === 'learning') return { ref: c.ref, label: c.label, text: clip(c.quote) };
  if (c.ref.kind === 'kb') {
    const { bundleId, chunk } = c.ref, chunkOf = bundles.find((b) => b.id === bundleId)?.chunks[chunk];
    if (chunkOf) return null;
  }
  return { ref: c.ref, label: c.label + ' (source changed)', text: clip(c.quote) };
}

// A file reference is a page: its passages read together.
function liveIndex(sources: PlanSource[], bundles: Bundle[]): Map<string, PoolPassage> {
  const map = new Map<string, PoolPassage>();
  bundles.flatMap(bundlePassages).forEach((p) => map.set(refKey(p.ref), p));
  sources.forEach((s) => {
    const pages = new Map<number, string[]>();
    s.passages.forEach(([page, text]) => pages.set(page, [...(pages.get(page) ?? []), text]));
    pages.forEach((texts, page) => map.set(refKey({ kind: 'file', sourceId: s.id, page }), { ref: { kind: 'file', sourceId: s.id, page }, label: fileLabel(s, page), text: clip(texts.join(' ')) }));
  });
  return map;
}

export function poolFor(a: { plan: TrajectoryPlan; sources: PlanSource[]; bundles: Bundle[]; query: string }): PoolPassage[] {
  const live = liveIndex(a.sources, a.bundles), pool = new Map<string, PoolPassage>();
  for (const c of a.plan.modules.flatMap((m) => m.sources)) {
    if (pool.size >= PLAN_POOL.citedFirst) break;
    const p = resolveCited(c, live, a.bundles);
    if (p && !pool.has(refKey(p.ref))) pool.set(refKey(p.ref), p);
  }
  const candidates = [...a.sources.flatMap(filePassages), ...a.bundles.flatMap(bundlePassages)];
  for (const p of rankPassages(candidates, a.query)) {
    if (pool.size >= PLAN_POOL.passages) break;
    if (!pool.has(refKey(p.ref))) pool.set(refKey(p.ref), { ref: p.ref, label: p.label, text: p.text });
  }
  return [...pool.values()];
}

// Published learnings of the line or firm-wide: the plan's existing and cited ones first, then the best matches, then the rest, at most 40.
export function catalogueFor(a: { plan: TrajectoryPlan; learnings: Learn[]; line: string | null; query: string }): CatalogueRow[] {
  const open = a.learnings.filter((l) => { const m = LEARN_META[l[0]]; return m?.status === 'published' && (m.line === null || m.line === a.line); });
  const row = (l: Learn): CatalogueRow => ({ id: l[0], title: l[1], format: l[4], hours: l[6], level: l[3], desc: l[9].slice(0, PLAN_POOL.catalogueChars) });
  const keep = new Set(a.plan.modules.flatMap((m) => [...m.material.flatMap((x) => (x.kind === 'existing' ? [x.learningId] : [])), ...m.sources.flatMap((s) => (s.ref.kind === 'learning' ? [s.ref.learningId] : []))]));
  const first = open.filter((l) => keep.has(l[0])), rest = open.filter((l) => !keep.has(l[0]));
  const ranked = rankPassages(rest.map((l) => ({ text: l[1] + ' ' + l[9], l })), a.query).map((r) => r.l);
  const others = rest.filter((l) => !ranked.includes(l));
  return [...first, ...ranked, ...others].slice(0, PLAN_POOL.catalogue).map(row);
}
