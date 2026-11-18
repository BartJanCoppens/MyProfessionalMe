// What each Trajectory AI call is sent besides the plan and the last messages (Phase 7): a bounded pool of passages (the plan's cited ones,
// then the best matches in the uploaded documents and the picked Knowledge bundles) and a bounded catalogue of learnings. Never a whole
// document, never a client-confidential or licensed source. Pure. Every text, label and description comes back already inside marked()
// (untrusted data: a forged marker is neutralised and nothing is cut after marking), so no caller can send one unwrapped.
import { LEARN_META } from '../data';
import type { Bundle, Learn } from '../types';
import { marked } from './items';
import { rankPassages, usablePassage } from './okf';
import { refKey } from './trajectoryPlan';
import type { PlanSource, SourceRef, TrajectoryPlan } from './trajectoryPlan';

// chars: the budget of the pool (marked texts and labels together); the catalogue is bounded by its rows. Plan and messages are the caller's.
export const PLAN_POOL = { passages: 24, citedFirst: 16, passageChars: 700, catalogue: 40, catalogueChars: 160, titleChars: 120, labelChars: 160, chars: 20_000 } as const;
export type PoolPassage = { ref: SourceRef; label: string; text: string };
export type CatalogueRow = { id: string; title: string; format: string; hours: number; level: number; desc: string };

const clip = (text: string): string => text.slice(0, PLAN_POOL.passageChars);
const out = (ref: SourceRef, label: string, text: string): PoolPassage => ({ ref, label: marked(label, PLAN_POOL.labelChars), text: marked(text, PLAN_POOL.passageChars) });

// Passages a creator may use, as pool passages (unmarked, clipped to what is sent: ranking reads the same text).
function bundlePassages(b: Bundle): PoolPassage[] {
  return b.chunks.flatMap(([si, text], chunk): PoolPassage[] => {
    const src = b.sources[si];
    return src && usablePassage(src) ? [{ ref: { kind: 'kb', bundleId: b.id, chunk }, label: `${src[0]} · ${b.name}`, text: clip(text) }] : [];
  });
}
// Each uploaded passage has its own reference: its page and its index among the source's passages.
const filePassages = (s: PlanSource): PoolPassage[] => s.passages.map(([page, text], passage) => ({ ref: { kind: 'file', sourceId: s.id, page, passage }, label: `${s.name} · p. ${page}`, text: clip(text) }));

// Every passage that can be cited now, by reference: the usable chunks of all known bundles (never a client or licensed source) and the passages of the
// plan's documents. The one lookup the pool and the cards share: a citation that is not in it no longer resolves.
export const liveIndex = (known: Bundle[], sources: PlanSource[]): Map<string, PoolPassage> => new Map([...known.flatMap(bundlePassages), ...sources.flatMap(filePassages)].map((p) => [refKey(p.ref), p]));

// A cited passage as it is now, by its reference. One that no longer resolves (its file was removed, its chunk is gone or now restricted, its
// bundle unknown) is not sent and not numbered, so the AI cannot cite it again; the plan keeps the citation and the screen says it is gone.
// A learning has no passage text: its stored quote stands.
function resolveCited(c: { ref: SourceRef; label: string; quote: string }, live: Map<string, PoolPassage>): PoolPassage | null {
  const found = live.get(refKey(c.ref));
  if (found) return out(found.ref, found.label, found.text);
  return c.ref.kind === 'learning' ? out(c.ref, c.label, clip(c.quote)) : null;
}

export function poolFor(a: { plan: TrajectoryPlan; sources: PlanSource[]; bundles: Bundle[]; known: Bundle[]; query: string }): PoolPassage[] {
  const known = a.known, pool = new Map<string, PoolPassage>();
  const live = liveIndex(known, a.sources);
  let used = 0;
  // false once the pool is full (count or budget): ranked order decides what made it in.
  const add = (p: PoolPassage): boolean => {
    const size = p.label.length + p.text.length;
    if (pool.has(refKey(p.ref))) return true;
    if (pool.size >= PLAN_POOL.passages || used + size > PLAN_POOL.chars) return false;
    pool.set(refKey(p.ref), p); used += size;
    return true;
  };
  for (const c of a.plan.modules.flatMap((m) => m.sources)) {
    const cited = resolveCited(c, live);
    if (!cited) continue;
    if (pool.size >= PLAN_POOL.citedFirst || !add(cited)) break;
  }
  for (const p of rankPassages([...a.sources.flatMap(filePassages), ...a.bundles.flatMap(bundlePassages)], a.query)) {
    if (!add(out(p.ref, p.label, p.text))) break;
  }
  return [...pool.values()];
}

// Published learnings of the line or firm-wide: the plan's existing and cited ones first, then the best matches, then the rest, at most 40.
export function catalogueFor(a: { plan: TrajectoryPlan; learnings: Learn[]; line: string | null; query: string }): CatalogueRow[] {
  const open = a.learnings.filter((l) => { const m = LEARN_META[l[0]]; return m?.status === 'published' && (m.line === null || m.line === a.line); });
  const row = (l: Learn): CatalogueRow => ({ id: l[0], title: marked(l[1], PLAN_POOL.titleChars), format: l[4], hours: l[6], level: l[3], desc: marked(l[9], PLAN_POOL.catalogueChars) });
  const keep = new Set(a.plan.modules.flatMap((m) => [...m.material.flatMap((x) => (x.kind === 'existing' ? [x.learningId] : [])), ...m.sources.flatMap((s) => (s.ref.kind === 'learning' ? [s.ref.learningId] : []))]));
  const first = open.filter((l) => keep.has(l[0])), rest = open.filter((l) => !keep.has(l[0]));
  const ranked = rankPassages(rest.map((l) => ({ text: l[1].slice(0, PLAN_POOL.titleChars) + ' ' + l[9].slice(0, PLAN_POOL.catalogueChars), l })), a.query).map((r) => r.l);
  const seen = new Set(ranked);
  return [...first, ...ranked, ...rest.filter((l) => !seen.has(l))].slice(0, PLAN_POOL.catalogue).map(row);
}
