// Knowledge library (design v3): retrieval over bundle passages, Open Knowledge Format (OKF v0.2) files, tar download and import.
import { KB_ACCESS, KB_TYPES, TOPIC_BY, isoDate, mkModels, ragOptLabel, slugify, yamlList, yq } from '../data';
import type { Bundle, BundleSource, RagModel } from '../types';

export type Hit = { text: string; src: string; score: number; disp?: number };
export type OkfFile = { path: string; type: string; front: string; body: string };

const excluded = (src: BundleSource) => src[5] === 'client' || src[5] === 'licensed';

// Keyword match over every passage; client-confidential and licensed sources are never read.
export function retrieve(bundles: Bundle[], q: string): Hit[] {
  const words = q.toLowerCase().replace(/[^a-z0-9€% ]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  const hits: Hit[] = [];
  bundles.forEach((b) => b.chunks.forEach((c) => {
    const src = b.sources[c[0]]; if (!src || excluded(src)) return; const tx = c[1].toLowerCase();
    const sc = words.reduce((a, w) => a + (tx.includes(w) ? 1 : tx.includes(w.slice(0, 5)) ? 0.5 : 0), 0);
    if (sc > 0) hits.push({ text: c[1], src: src[0] + ' · ' + b.name, score: sc / Math.max(3, words.length) });
  }));
  return hits.sort((a, b) => b.score - a.score);
}

// The passages a retrieval profile would pass to the model: displayed similarity, threshold, top-k.
export function rankHits(bundles: Bundle[], m: RagModel, q: string): Hit[] {
  return retrieve(bundles, q).map((h) => ({ ...h, disp: Math.min(0.99, 0.6 + h.score * 0.5 * (1 + (m.hybrid - 50) / 250)) }))
    .filter((h) => h.disp >= +m.thresh).slice(0, +m.topk);
}

type Front = Record<string, string | number | boolean | string[] | undefined>;
const fm = (o: Front) => '---\n' + Object.keys(o).filter((k) => o[k] !== undefined && o[k] !== '')
  .map((k) => { const v = o[k]; return k + ': ' + (Array.isArray(v) ? yamlList(v) : typeof v === 'string' ? yq(v) : String(v)); }).join('\n') + '\n---\n';
const RES: Record<string, string> = { upload: 'file://knowledge/', sharepoint: 'https://firm.sharepoint.com/sites/knowledge/', confluence: 'https://firm.atlassian.net/wiki/spaces/', web: 'https://', lms: 'lms://courses/' };

// A bundle as OKF files: index, one file per concept, source and retrieval profile.
export function okfFiles(b: Bundle): OkfFile[] {
  const tp = TOPIC_BY[b.topic] || { groupLabel: '', label: '' }, ts = isoDate(b.updated);
  const srcSlug = (r: BundleSource) => slugify(r[0]); const files: OkfFile[] = [];
  files.push({ path: 'index.md', type: 'bundle', front: fm({ type: 'bundle', title: b.name, description: b.desc || '', tags: b.tags, topic: tp.groupLabel + ' / ' + tp.label, also_filed_under: b.topics2.map((x) => (TOPIC_BY[x] || {}).label).filter(Boolean), owner: b.owner, access: (KB_ACCESS.find((a) => a[0] === b.access) || ['', ''])[1], timestamp: ts, okf_version: '0.2' }),
    body: '# ' + b.name + '\n\n' + (b.desc || '') + '\n\n## Concepts\n' + (b.concepts.map((c) => '- [' + c[2] + '](concepts/' + c[0] + '.md): ' + c[3]).join('\n') || '- none yet') + '\n\n## Sources\n' + (b.sources.map((r) => '- [' + r[0] + '](sources/' + srcSlug(r) + '.md)').join('\n') || '- none yet') + '\n\n## Retrieval profiles\n' + b.models.map((m) => '- [' + m.name + '](retrieval/' + slugify(m.name) + '.md)' + (m.def ? ' (default)' : '')).join('\n') + '\n' });
  b.concepts.forEach((c) => files.push({ path: 'concepts/' + c[0] + '.md', type: c[1], front: fm({ type: c[1], title: c[2], description: c[3], tags: c[6], resource: c[7].map((k) => b.sources[k] ? 'sources/' + srcSlug(b.sources[k]) + '.md' : '').filter(Boolean)[0] || '', timestamp: ts }),
    body: '# ' + c[2] + '\n\n' + c[4] + '\n' + (c[5].length ? '\n## Related\n' + c[5].map((l) => '- [' + l + '](' + l + '.md)').join('\n') + '\n' : '') + '\n## Citations\n' + (c[7].map((k) => b.sources[k] ? '- [' + b.sources[k][0] + '](../sources/' + srcSlug(b.sources[k]) + '.md)' : '').filter(Boolean).join('\n') || '- none') + '\n' }));
  b.sources.forEach((r) => {
    const ex = excluded(r);
    files.push({ path: 'sources/' + srcSlug(r) + '.md', type: 'source', front: fm({ type: 'source', title: r[0], resource: RES[r[1]] + srcSlug(r), sensitivity: r[5], retrieval: ex ? 'excluded' : 'included', passages: ex ? 0 : r[3], size: r[2], timestamp: isoDate(r[4]) }),
      body: '# ' + r[0] + '\n\n' + KB_TYPES[r[1]] + ' source, ' + r[2] + '. ' + (ex ? 'Listed for provenance only. The retriever never reads it (' + (r[5] === 'client' ? 'client-confidential' : 'licence forbids reuse') + ').' : 'Indexed into ' + r[3] + ' passages.') + '\n' });
  });
  b.models.forEach((m) => files.push({ path: 'retrieval/' + slugify(m.name) + '.md', type: 'retrieval-profile', front: fm({ type: 'retrieval-profile', title: m.name, default: m.def, embedding_model: ragOptLabel('embed', m.embed), chunk_tokens: +m.chunk, chunk_overlap: m.overlap + '%', top_k: +m.topk, hybrid_keyword_weight: m.hybrid / 100, similarity_threshold: +m.thresh, reranker: m.rerank, generation_model: ragOptLabel('gen', m.gen), temperature: +m.temp, citations: m.cite, timestamp: ts }),
    body: '# ' + m.name + '\n\nProducer-defined type. Consumers that do not know retrieval-profile can ignore this file; the knowledge above stays readable.\n' }));
  return files;
}

// A ustar archive of the files under one root folder. `mtime` in seconds.
export function tarBytes(root: string, files: { path: string; front: string; body: string }[], mtime = Math.floor(Date.now() / 1000)): Uint8Array {
  const enc = new TextEncoder(), parts: Uint8Array[] = [];
  files.forEach((f) => {
    const data = enc.encode(f.front + '\n' + f.body), hd = new Uint8Array(512); const w = (s: string, o: number, l: number) => hd.set(enc.encode(s).slice(0, l), o);
    w(root + '/' + f.path, 0, 100); w('0000644\0', 100, 8); w('0000000\0', 108, 8); w('0000000\0', 116, 8); w(data.length.toString(8).padStart(11, '0') + '\0', 124, 12); w(mtime.toString(8).padStart(11, '0') + '\0', 136, 12);
    hd.fill(32, 148, 156); hd[156] = 48; w('ustar\0', 257, 6); w('00', 263, 2); let sum = 0; for (let i = 0; i < 512; i++) sum += hd[i]; w(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    parts.push(hd, data); const pad = (512 - (data.length % 512)) % 512; if (pad) parts.push(new Uint8Array(pad));
  });
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; parts.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
}

// YAML-ish frontmatter: `key: value`, `key: [a, b]` and `- item` lists. Anything else is body text; it never throws.
export function parseOkf(raw: string): { fm: Record<string, string | string[]>; body: string } {
  const text = String(raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/); const out: Record<string, string | string[]> = {}; let body = text;
  if (m) {
    body = m[2]; let lastKey: string | null = null;
    m[1].split('\n').forEach((ln) => {
      const li = ln.match(/^\s*-\s+(.*)$/);
      if (li && lastKey) { const cur = out[lastKey]; out[lastKey] = (Array.isArray(cur) ? cur : []).concat(li[1].replace(/^["']|["']$/g, '')); return; }
      const kv = ln.match(/^([A-Za-z_][\w-]*):\s*(.*)$/); if (!kv) return; lastKey = kv[1]; const v = kv[2].trim();
      out[kv[1]] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : v.replace(/^["']|["']$/g, '');
    });
  }
  return { fm: out, body };
}

// Imported OKF files become a new admins-only bundle; files without a `type` are skipped and counted.
export function importBundle(files: { file: string; text: string }[], topic: string, id: string) {
  const docs = files.map((f) => ({ file: f.file, ...parseOkf(f.text) }));
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v || '');
  const skipped = docs.filter((d) => !d.fm.type).length;
  const idx = docs.find((d) => d.fm.type === 'bundle' || d.fm.type === 'index' || /^index\.md$/i.test(d.file));
  const cs = docs.filter((d) => d !== idx && d.fm.type && d.fm.type !== 'source' && d.fm.type !== 'retrieval-profile');
  const tagsOf = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
  const tags = Array.from(new Set(docs.flatMap((d) => tagsOf(d.fm.tags)))).slice(0, 8);
  const chunks: [number, string][] = [];
  cs.forEach((d) => d.body.split(/\n\s*\n/).map((p) => p.replace(/^#+\s.*$/gm, '').replace(/^-\s.*$/gm, '').trim()).filter((p) => p.length > 30).slice(0, 2).forEach((p) => chunks.push([0, p.slice(0, 260)])));
  const bundle: Bundle = {
    id, name: str(idx?.fm.title) || files[0].file.replace(/\.(md|markdown)$/i, ''), owner: 'Imported by you · system admin', topic: TOPIC_BY[topic] ? topic : 'cons.opm', topics2: [],
    desc: str(idx?.fm.description) || 'Imported from ' + files.length + ' OKF file' + (files.length > 1 ? 's' : '') + '.', access: 'admins', fresh: '12', status: 'reindex', updated: '31 Oct 2026', usedBy: 0,
    tags, sugg: [], models: mkModels(['precise']), sources: [['Imported OKF files', 'upload', files.length + ' files', chunks.length, '31 Oct', 'internal']], chunks,
    concepts: cs.map((d) => [slugify(str(d.fm.title) || d.file.replace(/\.md$/i, '')), str(d.fm.type), str(d.fm.title) || d.file, str(d.fm.description), d.body.replace(/^#.*$/m, '').trim().slice(0, 400), [], tagsOf(d.fm.tags), [0]]),
  };
  return { bundle, concepts: cs.length, skipped };
}
