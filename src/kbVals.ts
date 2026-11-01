// Knowledge library view-model (admin, design v3), split out of Logic.renderVals(). Bundles live in AppState for the session.
import type { ChangeEvent, KeyboardEvent } from 'react';
import { KB_ACCESS, KB_TYPES, RAG_OPTS, RAG_PRESETS, TOPIC_BY, TOPICS, isoDate, mkModels, ragOptLabel, slugify } from './data';
import type { Logic } from './model';
import { importBundle, okfFiles, rankHits, tarBytes } from './logic/okf';
import { saveBundleNow, saveBundleSoon } from './lib/contentStore';
import type { AppState, Bundle, BundleSource, RagModel } from './types';

type Input = ChangeEvent<HTMLInputElement>; type Sel = ChangeEvent<HTMLSelectElement>; type Area = ChangeEvent<HTMLTextAreaElement>;
const ST: Record<string, [string, string, string]> = { indexed: ['accepted', 'Indexed', 'check'], reindex: ['in-progress', 'Re-indexing', 'dot'], stale: ['clarification', 'Stale source', 'dot'], draft: ['not-started', 'Draft', 'dot'] };
const SENS: Record<string, [string, string]> = { public: ['Public', 'muted'], internal: ['Internal', 'muted'], client: ['Client confidential', 'orange'], licensed: ['Licensed · no reuse', 'blue'] };
const excluded = (r: BundleSource) => r[5] === 'client' || r[5] === 'licensed';
const passages = (x: Bundle) => x.sources.filter((r) => !excluded(r)).reduce((a, r) => a + r[3], 0);
const tpath = (k: string) => (TOPIC_BY[k] ? TOPIC_BY[k].groupLabel + ' · ' + TOPIC_BY[k].label : 'Unclassified');
const inTopic = (x: Bundle, k: string) => k === 'all' || [x.topic].concat(x.topics2).some((tk) => tk === k || (TOPIC_BY[tk] && TOPIC_BY[tk].group === k));
const opts = (k: string) => RAG_OPTS[k].map((o) => ({ value: o[0], label: o[1] }));
const fresh = { kbValid: null, kbHits: null, kbAnswer: '', kbBusy: false };
// Each test question gets a number; an answer that arrives after another question or bundle is dropped.
let askSeq = 0;

// Bundles as last rendered; a scheduled save writes the latest version.
const LATEST = new Map<string, Bundle>();
const notSaved = (L: Logic) => (m: string) => L.say('Not saved · ' + m + ' · your change is still on screen; edit again to retry');
// The bundle being edited, updated from the latest state (also from timers and after awaits) and saved shortly after.
const patchBundle = (L: Logic, id: string, patch: Partial<Bundle> | ((x: Bundle) => Partial<Bundle>)) => {
  L.setState((s) => ({ bundles: s.bundles.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x)) }));
  saveBundleSoon(id, () => LATEST.get(id), notSaved(L));
};
// A new bundle belongs to the first line this admin edits (firm-wide for General and System Admins) and is stored at once.
const addBundle = (L: Logic, b: Bundle) => { saveBundleNow(b, notSaved(L)); return b; };

async function ask(L: Logic, b: Bundle, m: RagModel, q0: string) {
  const q = (q0 || '').trim(); if (!q || L.state.kbBusy) return;
  const seq = ++askSeq, hits = rankHits([b], m, q);
  L.setState({ kbQ: q, kbHits: hits, kbAnswer: '', kbBusy: hits.length > 0 }); if (!hits.length) return;
  let ans = '';
  if (L.props.liveAssistant !== false && window.claude?.complete) {
    try {
      ans = await window.claude.complete({ messages: [{ role: 'user', content: 'Answer using ONLY these numbered passages. Citation rule: ' + ragOptLabel('cite', m.cite).toLowerCase() + ' carries a citation like [1]. At most 60 words, plain English, no emoji. If the passages do not answer it, say so.\n' + hits.map((h, k) => '[' + (k + 1) + '] ' + h.text).join('\n') + '\nQuestion: ' + q }], max_tokens: 250 });
    } catch { ans = ''; }
  }
  if (seq !== askSeq) return;
  if (!ans) ans = hits[0].text + ' [1]' + (hits[1] ? ' ' + hits[1].text + ' [2]' : '');
  L.setState({ kbBusy: false, kbAnswer: String(ans).trim() });
}

async function importFiles(L: Logic, list: FileList | null) {
  const fl = Array.from(list || []); if (!fl.length) return;
  const topic = L.state.kbTopic;
  let files: { file: string; text: string }[];
  try {
    files = await Promise.all(fl.map(async (f) => ({ file: f.name, text: await f.text().catch(() => { throw new Error('Could not read ' + f.name); }) })));
  } catch (err) { L.say((err as Error).message + ' · nothing was imported'); return; }
  const r = importBundle(files, topic, 'B' + Date.now()), id = r.bundle.id, nb = addBundle(L, { ...r.bundle, line: L.editableLines()[0] || null });
  L.setState((s) => ({ bundles: [nb].concat(s.bundles), kbSel: id, kbOpen: true, kbTab: 'overview', kbFile: 'index.md', ...fresh }));
  L.say('Imported ' + fl.length + ' file' + (fl.length > 1 ? 's' : '') + ' · ' + r.concepts + ' concepts' + (r.skipped ? ' · ' + r.skipped + ' skipped without a type field' : ''));
  setTimeout(() => patchBundle(L, id, { status: 'indexed' }), 1600);
}

export function kbVals(L: Logic) {
  const s = L.state;
  s.bundles.forEach((b) => LATEST.set(b.id, b));
  return { navKb: s.screen === 'adminKb', goKb: () => { L.go('adminKb'); L.setState({ kbOpen: false }); }, kbCount: String(s.bundles.length), kb: s.screen === 'adminKb' ? kbScreen(L) : null };
}

function kbScreen(L: Logic) {
  const s: AppState = L.state, B = s.bundles;

  const q = s.kbSearch.trim().toLowerCase();
  const match = (x: Bundle) => inTopic(x, s.kbTopic) && (!s.kbTagF || x.tags.includes(s.kbTagF)) && (!q || [x.name, x.desc, x.owner].concat(x.tags, x.concepts.map((c) => c[2])).join(' ').toLowerCase().includes(q));
  const shown = B.filter(match).sort((a, b) => (s.kbSort === 'used' ? b.usedBy - a.usedBy : s.kbSort === 'name' ? a.name.localeCompare(b.name) : isoDate(b.updated).localeCompare(isoDate(a.updated))));
  const pickT = (k: string) => () => L.setState({ kbTopic: k });
  const kbTree = [{ key: 'all', label: 'All topics', count: String(B.length), pad: '8px', fw: 600, fs: '13px', bg: s.kbTopic === 'all' ? '#f3f5f0' : 'transparent', pick: pickT('all') }];
  TOPICS.forEach((g) => {
    kbTree.push({ key: g[0], label: g[1], count: String(B.filter((x) => inTopic(x, g[0])).length), pad: '8px', fw: 600, fs: '13px', bg: s.kbTopic === g[0] ? '#f3f5f0' : 'transparent', pick: pickT(g[0]) });
    g[2].forEach((tp) => kbTree.push({ key: tp[0], label: tp[1], count: String(B.filter((x) => inTopic(x, tp[0])).length || ''), pad: '22px', fw: s.kbTopic === tp[0] ? 600 : 400, fs: '12.5px', bg: s.kbTopic === tp[0] ? '#f3f5f0' : 'transparent', pick: pickT(tp[0]) }));
  });
  const tagCount: Record<string, number> = {}; B.filter((x) => inTopic(x, s.kbTopic)).forEach((x) => x.tags.forEach((tg) => { tagCount[tg] = (tagCount[tg] || 0) + 1; }));
  const kbTagChips = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b)).slice(0, 14)
    .map((tg) => ({ label: tg, count: String(tagCount[tg]), on: s.kbTagF === tg, pick: () => L.setState({ kbTagF: s.kbTagF === tg ? null : tg }) }));
  const openB = (id: string) => () => { askSeq++; L.setState({ kbSel: id, kbOpen: true, kbTab: 'overview', kbFile: 'index.md', kbEdit: false, kbModel: null, kbTestModel: null, ...fresh }); };
  const kbCards = shown.map((x, i) => {
    const st = ST[x.status];
    return { id: x.id, name: x.name, desc: x.desc, topic: tpath(x.topic), st: st[0], stLabel: st[1], stIcon: st[2], delay: Math.min(i, 10) * 35 + 'ms', tags: x.tags.slice(0, 4),
      stats: [{ k: 'sources', v: String(x.sources.length) }, { k: 'concepts', v: String(x.concepts.length) }, { k: 'RAG models', v: String(x.models.length) }, { k: 'used by', v: String(x.usedBy) }], open: openB(x.id) };
  });

  const b = B.find((x) => x.id === s.kbSel) || B[0];
  const editable = L.canEditLine(b.line), readOnlyNote = L.lineName(b.line) + ' bundle · read-only for you; ' + L.whoEdits(b.line) + '.';
  const up = (patch: Partial<Bundle> | ((x: Bundle) => Partial<Bundle>)) => (editable ? patchBundle(L, b.id, patch) : L.say(readOnlyNote));
  const st = ST[b.status], files = okfFiles(b), fsel = files.find((f) => f.path === s.kbFile) || files[0];
  const kbTreeFiles = [{ key: '/', name: slugify(b.name) + '/', icon: '▾', pad: '8px', bg: 'transparent', hover: 'transparent', fg: '#1a1d18', fw: 600, cursor: 'default', open: () => {} }];
  let lastDir = '';
  files.forEach((f) => {
    const dir = f.path.includes('/') ? f.path.split('/')[0] : '';
    if (dir && dir !== lastDir) { kbTreeFiles.push({ key: dir + '/', name: dir + '/', icon: '▾', pad: '20px', bg: 'transparent', hover: 'transparent', fg: '#3d423b', fw: 600, cursor: 'default', open: () => {} }); lastDir = dir; }
    const on = f.path === fsel.path;
    kbTreeFiles.push({ key: f.path, name: f.path.split('/').pop()!, icon: '·', pad: dir ? '34px' : '20px', bg: on ? '#1a1d18' : 'transparent', hover: on ? '#1a1d18' : '#f3f5f0', fg: on ? '#fff' : '#1a1d18', fw: on ? 600 : 400, cursor: 'pointer', open: () => L.setState({ kbFile: f.path }) });
  });
  const validate = () => {
    const rows: [boolean, string][] = [], slugs = b.concepts.map((c) => c[0]);
    rows.push([true, files.length + ' files · every file has a type field · index.md present']);
    b.concepts.forEach((c) => c[5].forEach((l) => { if (!slugs.includes(l)) rows.push([false, 'concepts/' + c[0] + '.md links to concepts/' + l + '.md, which does not exist']); }));
    b.concepts.forEach((c) => { if (!c[7].some((k) => b.sources[k])) rows.push([false, 'concepts/' + c[0] + '.md has no citation']); });
    if (!b.tags.length) rows.push([false, 'index.md has no tags; creators will not find this bundle by tag']);
    if (b.status === 'stale') rows.push([false, 'Some sources are older than the ' + b.fresh + '-month freshness window']);
    const ex = b.sources.filter(excluded).length; if (ex) rows.push([true, ex + ' source' + (ex > 1 ? 's' : '') + ' listed with retrieval: excluded']);
    if (rows.every((r) => r[0])) rows.push([true, 'Conformant OKF v0.2 bundle']);
    L.setState({ kbValid: rows });
  };
  const mdl = b.models.find((m) => m.id === s.kbModel) || b.models.find((m) => m.def) || b.models[0];
  const upM = (patch: Partial<RagModel>) => up((x) => ({ models: x.models.map((m) => (m.id === mdl.id ? { ...m, ...patch } : m)) }));
  const setK: Record<string, (e: Sel) => void> = {};
  ['embed', 'chunk', 'overlap', 'topk', 'thresh', 'gen', 'temp', 'cite'].forEach((k) => { setK[k] = (e) => upM({ [k]: e.target.value }); });
  const tm = b.models.find((m) => m.id === s.kbTestModel) || b.models.find((m) => m.def) || b.models[0] || { ...RAG_PRESETS.precise, id: 'precise', def: true };
  const hits = s.kbHits;
  const addTag = (raw: string) => {
    const tg = String(raw || '').trim().replace(/^#/, ''); if (!tg) return;
    if (b.tags.some((x) => x.toLowerCase() === tg.toLowerCase())) { L.say('Already tagged “' + tg + '”'); return; }
    up({ tags: b.tags.concat([tg]), sugg: b.sugg.filter((x) => x[0].toLowerCase() !== tg.toLowerCase()) }); L.setState({ kbTagIn: '' });
  };
  const addSource = () => {
    const a = s.kbAdd, nm = a.name.trim(); if (!nm) { L.say('Name the source first'); return; }
    const n = 20 + Math.floor(Math.random() * 140);
    up({ sources: b.sources.concat([[nm, a.conn, a.conn === 'upload' ? '1 file' : 'connected', 0, '31 Oct', a.sens]]), status: b.status === 'draft' ? 'draft' : 'reindex' });
    L.setState({ kbAdd: { ...a, name: '' } });
    L.say(a.sens === 'client' || a.sens === 'licensed' ? 'Added · stored for provenance, never retrieved' : 'Added · indexing ' + nm + ' · an OKF source file was created');
    setTimeout(() => up((x) => ({ status: x.status === 'draft' ? 'draft' : 'indexed', sources: x.sources.map((r) => (r[0] === nm && r[3] === 0 && !excluded(r) ? [r[0], r[1], r[2], n, r[4], r[5]] : r)) })), 1800);
  };
  const download = () => {
    const blob = new Blob([tarBytes(slugify(b.name), files) as BlobPart], { type: 'application/x-tar' }), url = URL.createObjectURL(blob), el = document.createElement('a');
    el.href = url; el.download = slugify(b.name) + '.okf.tar'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    L.say('Downloaded ' + files.length + ' OKF files as ' + slugify(b.name) + '.okf.tar');
  };

  return {
    kbLead: B.length + ' bundles across ' + TOPICS.length + ' topic areas · ' + B.reduce((a, x) => a + passages(x), 0).toLocaleString('en-GB') + ' passages indexed. Each bundle is a set of sources, RAG models and Open Knowledge Format files that creators draft from. Client-confidential material is never retrieved.',
    kbOnImport: (e: Input) => { const list = e.target.files; importFiles(L, list).finally(() => { e.target.value = ''; }); },
    kbNew: () => {
      const id = 'B' + Date.now();
      const line = L.editableLines()[0] || null;
      const nb = addBundle(L, { id, name: 'New bundle', owner: (line || 'Firm-wide') + ' · admin', topic: TOPIC_BY[s.kbTopic] ? s.kbTopic : 'cons.opm', topics2: [], desc: '', access: 'admins', fresh: '12', status: 'draft', updated: '31 Oct 2026', usedBy: 0, tags: [], sugg: [], models: mkModels(['precise']), sources: [], chunks: [], concepts: [], line });
      L.setState((st2) => ({ bundles: [nb].concat(st2.bundles),
        kbSel: id, kbOpen: true, kbEdit: true, kbTab: 'overview', kbFile: 'index.md', kbModel: null, ...fresh }));
    },
    kbListMode: !s.kbOpen, kbDetailMode: !!s.kbOpen, kbBack: () => { askSeq++; L.setState({ kbOpen: false, kbEdit: false, kbBusy: false }); },
    kbTree, kbTagChips, kbCards, kbSearch: s.kbSearch, kbSetSearch: (e: Input) => L.setState({ kbSearch: e.target.value }), kbSort: s.kbSort, kbSetSort: (e: Sel) => L.setState({ kbSort: e.target.value }),
    kbSortOptions: [{ value: 'recent', label: 'Recently indexed' }, { value: 'used', label: 'Most used' }, { value: 'name', label: 'Name A–Z' }],
    kbResultText: shown.length + ' of ' + B.length + ' bundles' + (s.kbTopic !== 'all' ? ' · ' + (TOPIC_BY[s.kbTopic] ? TOPIC_BY[s.kbTopic].label : (TOPICS.find((g) => g[0] === s.kbTopic) || ['', ''])[1]) : '') + (s.kbTagF ? ' · #' + s.kbTagF : ''),
    kbTabs: [{ value: 'overview', label: 'Overview & tags' }, { value: 'sources', label: 'Sources · ' + b.sources.length }, { value: 'models', label: 'RAG models · ' + b.models.length }, { value: 'files', label: 'OKF files · ' + files.length }, { value: 'test', label: 'Test retrieval' }],
    kbTab: s.kbTab, kbSetTab: (v: string) => L.setState({ kbTab: v }),
    kbs: {
      editable, readOnlyNote, line: b.line || '', setLine: (e: Sel) => up({ line: e.target.value || null }), lineOptions: L.editableLines().map((l) => ({ value: l, label: l || 'Firm-wide' })),
      name: b.name, descRaw: b.desc, desc: b.desc || 'No description yet.', owner: b.owner + ' · last indexed ' + b.updated, topicPath: tpath(b.topic), st: st[0], stLabel: st[1], stIcon: st[2], editing: s.kbEdit, editLabel: s.kbEdit ? 'Done' : 'Edit',
      toggleEdit: () => L.setState((st2) => ({ kbEdit: !st2.kbEdit })), setName: (e: Input) => up({ name: e.target.value }), setDesc: (e: Area) => up({ desc: e.target.value }),
      reindex: () => {
        up({ status: 'reindex' }); L.say('Re-indexing ' + b.name + ' · creators keep using the last index until it finishes');
        setTimeout(() => up((x) => ({ status: 'indexed', updated: '31 Oct 2026', sources: x.sources.map((r) => (excluded(r) ? r : [r[0], r[1], r[2], r[3], '31 Oct', r[5]])) })), 2200);
      },
      facts: [{ k: 'Passages', v: passages(b).toLocaleString('en-GB') }, { k: 'Concepts', v: String(b.concepts.length) }, { k: 'Sources', v: String(b.sources.length) }, { k: 'RAG models', v: String(b.models.length) }, { k: 'Used by', v: b.usedBy + ' pieces' }],
      topic: b.topic, setTopic: (e: Sel) => up({ topic: e.target.value, topics2: b.topics2.filter((x) => x !== e.target.value) }),
      topics2: b.topics2.map((k) => ({ key: k, label: tpath(k), remove: () => up({ topics2: b.topics2.filter((x) => x !== k) }) })),
      addTopic2: (e: Sel) => { const v = e.target.value; if (v && v !== b.topic && !b.topics2.includes(v)) up({ topics2: b.topics2.concat([v]) }); },
      access: b.access, setAccess: (e: Sel) => up({ access: e.target.value }), fresh: b.fresh, setFresh: (e: Sel) => up({ fresh: e.target.value }),
      tags: b.tags.map((tg) => ({ label: tg, remove: () => up({ tags: b.tags.filter((x) => x !== tg) }) })), noTags: !b.tags.length,
      sugg: b.sugg.map((sg) => ({ label: sg[0], conf: sg[1] + '%', add: () => addTag(sg[0]) })),
      concepts: b.concepts.length ? b.concepts.map((c) => ({ key: c[0], title: c[2], desc: c[3], type: c[1], open: () => L.setState({ kbTab: 'files', kbFile: 'concepts/' + c[0] + '.md' }) }))
        : [{ key: '-', title: 'No concepts yet', desc: 'Import OKF files or add sources and re-index', type: '', open: () => {} }],
      sources: b.sources.map((r, k) => {
        const sn = SENS[r[5]], ex = excluded(r), old = b.status === 'stale' && r[4] === '3 Mar';
        return { key: k + r[0], name: r[0], type: KB_TYPES[r[1]], chunks: ex ? '—' : r[3] ? String(r[3]) : 'indexing', synced: r[4], sens: sn[0], tone: sn[1], op: ex ? 0.6 : 1,
          note: ex ? (r[5] === 'client' ? 'Excluded from retrieval · client data' : 'Retrieval blocked · licence forbids reuse') : old ? 'Older than ' + b.fresh + ' months · re-sync or replace' : r[2], noteFg: old ? '#9a3d0c' : '#8b918a',
          remove: () => up({ sources: b.sources.filter((_, j) => j !== k), chunks: b.chunks.filter((c) => c[0] !== k).map((c) => [c[0] > k ? c[0] - 1 : c[0], c[1]] as [number, string]),
            concepts: b.concepts.map((c) => [c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7].filter((x) => x !== k).map((x) => (x > k ? x - 1 : x))]) }) };
      }),
    },
    kbTopicOptions: TOPICS.flatMap((g) => g[2].map((tp) => ({ value: tp[0], label: g[1] + ' · ' + tp[1] }))),
    kbTopic2Options: [{ value: '', label: '+ Add a topic' }].concat(TOPICS.flatMap((g) => g[2].filter((tp) => tp[0] !== b.topic && !b.topics2.includes(tp[0])).map((tp) => ({ value: tp[0], label: g[1] + ' · ' + tp[1] })))),
    kbTagIn: s.kbTagIn, kbSetTagIn: (e: Input) => L.setState({ kbTagIn: e.target.value }), kbTagKey: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') addTag(s.kbTagIn); }, kbAddTag: () => addTag(s.kbTagIn),
    kbAccessOptions: KB_ACCESS.map((a) => ({ value: a[0], label: a[1] })), kbFreshOptions: [['6', '6 months'], ['12', '12 months'], ['24', '24 months']].map((v) => ({ value: v[0], label: v[1] })),
    kbSensOptions: [['public', 'Public'], ['internal', 'Internal'], ['client', 'Client confidential'], ['licensed', 'Licensed · no reuse']].map((v) => ({ value: v[0], label: v[1] })),
    kbConnOptions: Object.keys(KB_TYPES).map((k) => ({ value: k, label: KB_TYPES[k] })), kbAdd: s.kbAdd,
    kbSetConn: (v: string) => L.setState((st2) => ({ kbAdd: { ...st2.kbAdd, conn: v } })), kbSetAddName: (e: Input) => { const v = e.target.value; L.setState((st2) => ({ kbAdd: { ...st2.kbAdd, name: v } })); },
    kbSetSens: (e: Sel) => { const v = e.target.value; L.setState((st2) => ({ kbAdd: { ...st2.kbAdd, sens: v } })); },
    kbAddPh: ({ upload: 'File name, e.g. Pricing method v2.pdf', sharepoint: 'SharePoint folder URL', confluence: 'Confluence space key', web: 'https:// public page', lms: 'LMS course or podcast series' } as Record<string, string>)[s.kbAdd.conn],
    kbAddSource: addSource,
    kbModels: b.models.map((m) => { const on = m.id === mdl.id; return { id: m.id, name: m.name, def: m.def, sub: ragOptLabel('embed', m.embed).split(' · ')[0] + ' · top ' + m.topk + ' · ' + ragOptLabel('gen', m.gen), bd: on ? '#1a1d18' : '#e1e5dc', ring: on ? '0 0 0 3px rgba(134,188,37,.45)' : 'none', open: () => L.setState({ kbModel: m.id }) }; }),
    kbNewModel: () => { const base = b.models.find((m) => m.def) || RAG_PRESETS.precise; const id = 'M' + Date.now(); up({ models: b.models.concat([{ ...base, id, def: false, name: 'New model' }]) }); L.setState({ kbModel: id }); },
    km: {
      name: mdl.name, setName: (e: Input) => upM({ name: e.target.value }), notDef: !mdl.def,
      makeDef: () => { up((x) => ({ models: x.models.map((m) => ({ ...m, def: m.id === mdl.id })) })); L.say(mdl.name + ' is now the default for creators'); },
      dup: () => { const id = 'M' + Date.now(); up({ models: b.models.concat([{ ...mdl, id, def: false, name: mdl.name + ' copy' }]) }); L.setState({ kbModel: id }); },
      del: () => {
        if (b.models.length < 2) { L.say('A bundle needs at least one RAG model'); return; }
        const rest = b.models.filter((m) => m.id !== mdl.id); if (mdl.def) rest[0] = { ...rest[0], def: true };
        up({ models: rest }); L.setState({ kbModel: null });
      },
      embed: mdl.embed, chunk: mdl.chunk, overlap: mdl.overlap, topk: mdl.topk, thresh: mdl.thresh, gen: mdl.gen, temp: mdl.temp, cite: mdl.cite, rerank: mdl.rerank, hybrid: mdl.hybrid, set: setK,
      setHybrid: (e: Input) => upM({ hybrid: +e.target.value }), setRerank: (v: boolean) => upM({ rerank: v }), hybridText: (100 - mdl.hybrid) + '% meaning · ' + mdl.hybrid + '% exact words',
      summary: 'Splits sources into ' + mdl.chunk + '-token passages (' + (mdl.overlap === '0' ? 'no' : mdl.overlap + '%') + ' overlap), embeds them with ' + ragOptLabel('embed', mdl.embed).split(' · ')[0] + ', and returns up to ' + mdl.topk + ' passages scoring ' + mdl.thresh + ' or higher' + (mdl.rerank ? ', re-ranked' : '') + '. ' + ragOptLabel('gen', mdl.gen) + ' drafts at temperature ' + mdl.temp + ' and cites ' + ragOptLabel('cite', mdl.cite).toLowerCase() + '. Saved as retrieval/' + slugify(mdl.name) + '.md.',
    },
    kbEmbedOptions: opts('embed'), kbChunkOptions: opts('chunk'), kbOverlapOptions: opts('overlap'), kbTopkOptions: opts('topk'), kbThreshOptions: opts('thresh'), kbGenOptions: opts('gen'), kbTempOptions: opts('temp'), kbCiteOptions: opts('cite'),
    kbOkfRoot: slugify(b.name) + '/', kbTreeFiles, kbFileView: { path: fsel.path, type: fsel.type, front: fsel.front.trim(), body: fsel.body.trim() },
    kbValidate: validate, kbValidRows: (s.kbValid || []).map((r) => ({ text: r[1], dot: r[0] ? '#86BC25' : '#e0a100', fg: r[0] ? '#3d423b' : '#7a5000' })), kbHasValid: !!s.kbValid,
    kbDownload: download,
    kbTestModelOptions: b.models.map((m) => ({ value: m.id, label: m.name + (m.def ? ' · default' : '') })), kbTestModelId: tm.id, kbSetTestModel: (e: Sel) => { askSeq++; L.setState({ kbTestModel: e.target.value, kbHits: null, kbAnswer: '', kbBusy: false }); },
    kbTestSub: 'Top ' + tm.topk + ' · threshold ' + tm.thresh + ' · ' + tm.hybrid + '% keyword · ' + ragOptLabel('gen', tm.gen),
    kbQ: s.kbQ, kbSetQ: (e: Input) => L.setState({ kbQ: e.target.value }), kbKey: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') ask(L, b, tm, s.kbQ); }, kbAsk: () => ask(L, b, tm, s.kbQ), kbBusy: s.kbBusy,
    kbPrompts: (b.concepts.length ? b.concepts.slice(0, 3).map((c) => 'What should I know about ' + c[2].toLowerCase() + '?') : ['What does this bundle cover?']).map((l) => ({ label: l, send: () => ask(L, b, tm, l) })),
    kbHasHits: !!(hits && hits.length), kbNoHits: !!(hits && !hits.length), kbHitCount: hits ? hits.length + ' of up to ' + tm.topk + ' passages' : '',
    kbNoHitText: 'No passage reaches the ' + tm.thresh + ' threshold. Creators would get no draft, which is the intended behaviour. Lower the threshold in the RAG model or add a source.',
    kbHits: (hits || []).map((h, k) => ({ n: String(k + 1), text: h.text, src: h.src, score: (h.disp || 0.6).toFixed(2), w: Math.round((h.disp || 0.6) * 100) + '%', delay: k * 60 + 'ms' })),
    kbAnswer: s.kbAnswer,
  };
}
