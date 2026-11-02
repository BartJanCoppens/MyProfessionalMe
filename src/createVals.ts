// Create & share view-model (design v3, F12), split out of Logic.renderVals() like kbVals. It shows the signed-in
// person's own work: their contributions, the reviews assigned to them and, for admins, the review requirements.
// Every write goes through contributionStore, refuses in View as (L.readOnly()) and reloads afterwards.
import type { ChangeEvent } from 'react';
import { LEARN_BY, LEVELS, REVIEW_STAGES, REVIEW_WHO, RUBRIC, STAGES } from './data';
import type { Logic } from './model';
import type { AppState, Bundle, NewDraft } from './types';
import { retrieve } from './logic/okf';
import type { Hit } from './logic/okf';
import {
  CREATE_TYPES, KIND_LABEL, ROLE_OF_STEP, TAKE_MAX, allTopics, checksPass, contentChecks, daysWaiting, domainName, fmtDate, parseTopic, policyFor, policyLabel,
  reviewBadge, rubricComplete, stageAt, stagesOf, topicKey, topicLong, topicOf,
} from './logic/contribution';
import type { Check, Contribution, CreateData, Grant, Policy, Review, Topic } from './logic/contribution';
import { decideReview, loadCreate, removeDraft, removePolicy, saveDraft, savePolicy, submitContribution } from './lib/contributionStore';
import type { DraftFields } from './lib/contributionStore';

type Input = ChangeEvent<HTMLInputElement>; type Sel = ChangeEvent<HTMLSelectElement>; type Area = ChangeEvent<HTMLTextAreaElement>;
const ST: Record<string, [string, string, string]> = { published: ['accepted', 'Published', 'check'], review: ['submitted', 'In review', 'dot'], changes: ['clarification', 'Changes requested', 'dot'], draft: ['not-started', 'Draft', 'dot'] };
const RV: Record<string, [string, string, string]> = { approved: ['accepted', 'Approved', 'check'], changes: ['clarification', 'Changes requested', 'dot'], pending: ['in-progress', 'Reviewing', 'dot'], waiting: ['not-started', 'Waiting', 'dot'] };
const EMPTY: CreateData = { contributions: [], reviews: [], grants: [], policies: [], peers: 0 };
const first = (name: string) => name.split(/\s+/)[0] || name;
const ini = (name: string) => name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const revKey = (r: Review) => r.contribution_id + '|' + r.step + '|' + r.slot;
const dot = (c: Check) => ({ text: c.text, dot: c.ok ? '#86BC25' : '#e0a100', fg: c.ok ? '#3d423b' : '#7a5000' });
const names = (list: string[]) => (list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0] || '');
const without = <T,>(o: Record<string, T>, k: string) => { const n = { ...o }; delete n[k]; return n; };

// A format topic fixes the type; a domain topic fixes the domain.
function applyTopic(nw: NewDraft): NewDraft {
  const t = parseTopic(nw.topic);
  return !t ? nw : t.kind === 'format' ? { ...nw, type: t.value } : t.kind === 'domain' ? { ...nw, dom: t.value } : nw;
}
export function blankDraft(grants: Grant[] | null): NewDraft {
  const g = grants && grants[0];
  return applyTopic({ topic: g ? topicKey(topicOf(g)) : '', type: 'Reel', title: '', dom: 'prof', lvl: '2', stage: 'Senior consultant', take: '', outline: [], sources: [], ai: false, aiNote: '' });
}
// The form as it applies: its topic must be one of the person's grants (the first one otherwise).
// Once submitted, the topic, format and domain stay as they were (the database refuses a change).
function effective(s: AppState): NewDraft {
  const ed = submittedEdit(s);
  if (ed) return { ...s.nw, topic: topicKey(topicOf(ed)), type: ed.type, dom: ed.domain };
  const grants = s.create?.grants || [], keys = grants.map((g) => topicKey(topicOf(g)));
  return applyTopic({ ...s.nw, topic: keys.includes(s.nw.topic) ? s.nw.topic : keys[0] || '' });
}
function submittedEdit(s: AppState) {
  const ed = s.editing ? s.create?.contributions.find((c) => c.id === s.editing) : null;
  return ed && ed.status !== 'draft' ? ed : null;
}
const fieldsOf = (nw: NewDraft, bundles: string[]): DraftFields => {
  const t = parseTopic(nw.topic)!;
  return { topic_kind: t.kind, topic_value: t.value, type: nw.type, title: nw.title.trim().slice(0, 120), domain: nw.dom, level: +nw.lvl, audience_stage: nw.stage,
    takeaway: nw.take.trim().slice(0, 400), outline: nw.outline.join('\n'), sources: nw.sources, ai_assisted: nw.ai, bundle_ids: bundles };
};
const draftOf = (c: Contribution): NewDraft => ({ topic: topicKey(topicOf(c)), type: c.type, title: c.title, dom: c.domain, lvl: String(c.level), stage: c.audience_stage, take: c.takeaway,
  outline: c.outline ? c.outline.split('\n') : [], sources: c.sources || [], ai: c.ai_assisted, aiNote: c.ai_assisted ? 'AI-assisted draft' : '' });

// Bundles a creator may draw on: indexed, open to creators, Tax & Legal ones for that line only.
export function usableBundles(bundles: Bundle[], line: string | null) {
  return bundles.filter((b) => b.status !== 'draft' && b.access !== 'admins' && (b.access !== 'tl' || line === 'Tax & Legal'));
}

// "Draft with AI": an outline and a takeaway from the retrieved passages, by the model when one is reachable,
// otherwise the design's scripted outline. Either way the draft is labelled as assisted.
export async function draftFromPassages(nw: NewDraft, hits: Hit[], live: boolean): Promise<{ takeaway: string; outline: string[]; note: string }> {
  const scripted = { takeaway: hits[0].text.slice(0, 170) + ' [1]', outline: hits.map((h, k) => h.text.split('. ')[0].slice(0, 88) + ' [' + (k + 1) + ']') };
  if (!live || !window.claude?.complete) return { ...scripted, note: 'Scripted outline from the passages · no AI in this environment' };
  try {
    const raw = await window.claude.complete({ messages: [{ role: 'user', content: 'You help a consultant draft a ' + nw.type + ' for colleagues titled "' + (nw.title || 'untitled') + '". Use ONLY these passages:\n'
      + hits.map((h, k) => '[' + (k + 1) + '] ' + h.text).join('\n') + '\nReply ONLY with JSON {"takeaway": one sentence under 180 characters with citation like [1], "outline": [3 short steps, each under 90 characters, with citations]}. Plain English, no emoji.' }], max_tokens: 400 });
    const m = String(raw).match(/\{[\s\S]*\}/), res = m ? JSON.parse(m[0]) : null;
    if (res && res.takeaway) return { takeaway: String(res.takeaway).slice(0, TAKE_MAX), outline: (Array.isArray(res.outline) ? res.outline : []).slice(0, 4).map(String), note: 'AI-assisted draft · grounded on keyword-ranked passages · edit it in your own words' };
  } catch { /* the scripted outline below */ }
  return { ...scripted, note: 'AI outline unavailable · scripted outline from the passages' };
}

// ---------- writes ----------

const busy = (L: Logic) => L.readOnly() || L.state.createBusy;
async function reloaded(L: Logic) { return loadCreate(L.access.userId); }
function failed(L: Logic, err: unknown, patch: Partial<AppState> = {}) {
  L.setState({ createBusy: false, ...patch }); L.say((err as Error).message); L.reloadCreate();
}
function doneText(status: string, d: CreateData, id: string, again: boolean) {
  const c = d.contributions.find((x) => x.id === id);
  if (status === 'published') return 'Published · “' + (c?.title || '') + '” is in the library now';
  if (status === 'draft') return 'Saved as draft · only you can see it';
  const who = d.reviews.filter((r) => r.contribution_id === id && r.verdict === 'pending').map((r) => r.reviewer_name);
  return (again ? 'Resubmitted · ' + names(who) + ' review' + (who.length > 1 ? '' : 's') + ' the new version' : 'Submitted · ' + names(who) + ' review' + (who.length > 1 ? '' : 's') + ' it first');
}
async function afterPublish(L: Logic, status: string) { if (status === 'published') await L.reloadContent(); }

// Save the New form as a draft, or save and submit it. A draft that saved before a refused submit is edited next time, never duplicated.
async function saveForm(L: Logic, submit: boolean) {
  if (busy(L)) return;
  const s = L.state, nw = effective(s);
  if (!parseTopic(nw.topic)) { L.say('Ask an admin for creation rights first'); return; }
  if (submit && !checksPass(contentChecks({ title: nw.title, takeaway: nw.take, outline: nw.outline, sources: nw.sources }))) { L.say('Clear the open checks first'); return; }
  const again = !!s.editing && s.create?.contributions.find((c) => c.id === s.editing)?.status === 'changes';
  let id = s.editing;
  L.setState({ createBusy: true });
  try {
    id = await saveDraft(fieldsOf(nw, s.nwKb), id);
    const status = submit ? await submitContribution(id) : 'draft', d = await reloaded(L), saved = id;
    L.setState((st) => ({ create: d, createError: null, createBusy: false, createTab: 'mine', contribSel: saved, editing: null, nw: blankDraft(d.grants), nwKb: [], revChecks: st.revChecks }));
    L.say(doneText(status, d, saved, again));
    await afterPublish(L, status);
  } catch (err) { failed(L, err, { editing: id }); }
}

async function submitSaved(L: Logic, c: Contribution) {
  if (busy(L)) return;
  const bad = contentChecks({ title: c.title, takeaway: c.takeaway, outline: c.outline.split('\n'), sources: c.sources }).find((x) => !x.ok);
  if (bad) { L.say(bad.text + ' · edit it first'); return; }
  L.setState({ createBusy: true });
  try {
    const status = await submitContribution(c.id), d = await reloaded(L);
    L.setState({ create: d, createError: null, createBusy: false, contribSel: c.id });
    L.say(doneText(status, d, c.id, c.status === 'changes'));
    await afterPublish(L, status);
  } catch (err) { failed(L, err); }
}

async function deleteDraft(L: Logic, c: Contribution) {
  if (busy(L)) return;
  L.setState({ createBusy: true });
  try {
    await removeDraft(c.id); const d = await reloaded(L);
    L.setState({ create: d, createBusy: false, contribSel: null });
    L.say('Draft deleted');
  } catch (err) { failed(L, err); }
}

async function decide(L: Logic, c: Contribution, r: Review, verdict: 'approved' | 'changes') {
  const key = revKey(r), chk = RUBRIC.map((_, k) => !!(L.state.revChecks[key] || [])[k]), com = (L.state.revComment[key] || '').trim();
  if (verdict === 'approved' && !rubricComplete(chk)) { L.say('Tick all four criteria to approve, or request changes'); return; }
  if (verdict === 'changes' && !com) { L.say('Add a comment so ' + first(c.author_name) + ' knows what to change'); return; }
  if (busy(L)) return;
  L.setState({ createBusy: true });
  try {
    const status = await decideReview(c.id, verdict, chk, com), d = await reloaded(L);
    L.setState((st) => ({ create: d, createBusy: false, revChecks: without(st.revChecks, key), revComment: without(st.revComment, key) }));
    L.say(verdict === 'changes' ? 'Changes requested · ' + first(c.author_name) + ' sees your comment in Create & share'
      : status === 'published' ? 'Approved and published · “' + c.title + '” is in the library now' : 'Approved · ' + first(c.author_name) + ' sees it in Create & share');
    await afterPublish(L, status);
  } catch (err) { failed(L, err); }
}

async function writePolicy(L: Logic, write: () => Promise<void>, done: string) {
  if (busy(L)) return;
  L.setState({ createBusy: true });
  try { await write(); const d = await reloaded(L); L.setState({ create: d, createBusy: false }); L.say(done); } catch (err) { failed(L, err); }
}

async function draftAi(L: Logic) {
  const s = L.state;
  if (s.nwAiBusy || L.readOnly()) return;
  const nw = effective(s), line = L.subject.readOnly ? null : L.subject.businessLine;
  const bundles = usableBundles(s.bundles, line).filter((b) => s.nwKb.includes(b.id));
  if (!bundles.length) { L.say('Pick at least one knowledge bundle'); return; }
  let hits = retrieve(bundles, nw.title + ' ' + domainName(nw.dom)).slice(0, 3);
  if (!hits.length) hits = bundles.flatMap((b) => {
    const ch = b.chunks.find((c) => { const src = b.sources[c[0]]; return src && src[5] !== 'client' && src[5] !== 'licensed'; });
    return ch ? [{ text: ch[1], src: b.sources[ch[0]][0] + ' · ' + b.name, score: 0 }] : [];
  }).slice(0, 3);
  if (!hits.length) { L.say('These bundles have no passages a creator may use'); return; }
  L.setState({ nwAiBusy: true });
  const out = await draftFromPassages(nw, hits, L.props.liveAssistant !== false);
  L.setState((st) => ({ nwAiBusy: false, nw: { ...effective(st), take: out.takeaway, outline: out.outline, sources: hits.map((h) => h.src), ai: true, aiNote: out.note } }));
}

// ---------- view-model ----------

export function createVals(L: Logic) {
  const s = L.state;
  return {
    navCreate: s.screen === 'create' || (s.screen === 'detail' && s.origin === 'create'), goCreate: () => L.go('create'),
    reviewBadge: reviewBadge(s.create, L.access.userId), create: s.screen === 'create' ? createScreen(L) : null,
  };
}

function createScreen(L: Logic) {
  const s = L.state, me = L.access.userId, d = s.create || EMPTY, now = new Date();
  const byId = new Map(d.contributions.map((c) => [c.id, c]));
  const revsOf = (id: string) => d.reviews.filter((r) => r.contribution_id === id).sort((a, b) => a.step - b.step || a.slot - b.slot);
  const canCreate = d.grants.length > 0, isAdmin = L.isAdmin();
  const setState = (p: Partial<AppState>) => L.setState(p);

  // Mine
  const mine = d.contributions.filter((c) => c.author_id === me);
  const c0 = mine.find((c) => c.id === s.contribSel) || mine[0] || null;
  const contribList = mine.map((c) => {
    const on = c.id === c0?.id, st = ST[c.status];
    return { id: c.id, type: c.type, date: dateLine(c), title: c.title || 'Untitled ' + c.type.toLowerCase(), st: st[0], stLabel: st[1], stIcon: st[2],
      bd: on ? '#1a1d18' : '#e1e5dc', ring: on ? '0 0 0 3px rgba(134,188,37,.45)' : 'none', open: () => setState({ contribSel: c.id }) };
  });
  const cs = c0 ? mineDetail(L, c0, revsOf(c0.id), d) : null;

  // Review
  const mineRev = d.reviews.filter((r) => r.reviewer_id === me && r.verdict !== 'waiting' && byId.has(r.contribution_id));
  const isOpen = (r: Review) => r.verdict === 'pending' && byId.get(r.contribution_id)!.status === 'review';
  mineRev.sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || (byId.get(a.contribution_id)!.submitted_at || '').localeCompare(byId.get(b.contribution_id)!.submitted_at || ''));
  const r0 = mineRev.find((r) => revKey(r) === s.revSel) || mineRev[0] || null;
  const openN = reviewBadge(d, me);
  const revList = mineRev.map((r) => {
    const c = byId.get(r.contribution_id)!, on = r0 && revKey(r) === revKey(r0), open = isOpen(r);
    const v = open ? (['in-progress', 'Your turn', 'dot'] as const) : r.verdict === 'approved' ? (['accepted', 'Approved', 'check'] as const) : r.verdict === 'changes' ? (['clarification', 'Changes requested', 'dot'] as const) : (['not-started', 'With the author', 'dot'] as const);
    return { key: revKey(r), type: c.type, author: c.author_name, title: c.title, due: open ? daysWaiting(c.submitted_at, now) : ROLE_OF_STEP[r.step], st: v[0], stLabel: v[1], stIcon: v[2],
      bd: on ? '#1a1d18' : '#e1e5dc', ring: on ? '0 0 0 3px rgba(134,188,37,.45)' : 'none', open: () => setState({ revSel: revKey(r) }) };
  });
  const rs = r0 ? reviewDetail(L, byId.get(r0.contribution_id)!, r0, d, now) : null;

  // New
  const nw = effective(s), topic = parseTopic(nw.topic), policy = policyFor(d.policies, topic);
  const setNw = (p: Partial<NewDraft>) => L.setState((st) => ({ nw: applyTopic({ ...effective(st), ...p }) }));
  const checks = contentChecks({ title: nw.title, takeaway: nw.take, outline: nw.outline, sources: nw.sources });
  const line = L.subject.readOnly ? null : L.subject.businessLine;
  const editing = s.editing ? byId.get(s.editing) : null, locked = !!submittedEdit(s);
  const short = policy.peers > d.peers;
  const nwRoute = [
    ...Array.from({ length: policy.peers }, (_, k) => ({ n: String(k + 1), name: 'Peer reviewer ' + (k + 1) + ' of ' + policy.peers, role: line ? 'A colleague in ' + line : 'A colleague in your business line' })),
    ...(policy.expert ? [{ n: '', name: 'Subject-matter expert', role: domainName(nw.dom) + ' · or a System Admin when none is named' }] : []),
    ...(policy.quality ? [{ n: '', name: 'Learning team', role: 'Quality & risk · a General Admin' }] : []),
  ].map((x, k) => ({ ...x, n: String(k + 1) }));

  // Review requirements (admins)
  const canSet = (t: Topic) => L.access.isSystem || !!L.access.isGeneral || (t.kind === 'line' && L.access.domains.includes(t.value));
  const policyRows = d.policies.map((p) => {
    const t = topicOf(p), editable = canSet(t), save = (patch: Partial<Policy>) => writePolicy(L, () => savePolicy({ ...p, ...patch }), 'Saved · ' + topicLong(t) + ' · ' + policyLabel({ ...p, ...patch }));
    return { key: topicKey(t), label: topicLong(t), summary: policyLabel(p), editable, peers: String(p.peers), expert: p.expert, quality: p.quality,
      setPeers: (v: string) => save({ peers: +v }), setExpert: (v: boolean) => save({ expert: v }), setQuality: (v: boolean) => save({ quality: v }),
      remove: () => writePolicy(L, () => removePolicy(t), 'Removed · ' + topicLong(t) + ' follows the full review again') };
  });
  const taken = new Set(d.policies.map((p) => topicKey(topicOf(p))));
  const polTopics = allTopics().filter((t) => canSet(t) && !taken.has(topicKey(t)));
  const pf = s.polForm, pfTopic = parseTopic(pf.topic && polTopics.some((t) => topicKey(t) === pf.topic) ? pf.topic : polTopics[0] ? topicKey(polTopics[0]) : '');

  const tabs = [{ value: 'mine', label: 'My contributions · ' + mine.length }, { value: 'review', label: 'Review for peers · ' + openN }, { value: 'new', label: editing ? 'Edit content' : 'New content' }]
    .concat(isAdmin ? [{ value: 'rules', label: 'Review requirements' }] : []);
  const tab = (s.createTab === 'new' && !canCreate) || (s.createTab === 'rules' && !isAdmin) ? 'mine' : s.createTab;

  return {
    loading: !s.create && !s.createError, error: s.createError, retry: () => L.reloadCreate(), busy: s.createBusy,
    readOnly: L.subject.readOnly, readOnlyNote: 'Create & share shows your own work, not ' + L.subject.name + '’s. Go back to yourself to create, submit or review.',
    lead: 'Make a reel, podcast, guide or case write-up for your colleagues. Each topic sets its own review: by default two peer reviews, an expert check and a quality and risk check before it reaches the library.',
    canCreate, noGrantText: 'You have no creation rights yet. Ask an admin for creation rights: a Domain Admin or General Admin can let you create for a business line, an industry or technology, a format or a domain.',
    goNew: () => (canCreate ? setState({ createTab: 'new', editing: null, nw: blankDraft(d.grants), nwKb: [] }) : L.say('Ask an admin for creation rights first')),
    // The full flow, as the design shows it. Peers come from the author's business line (the design said "same domain").
    reviewSteps: REVIEW_STAGES.map((n, k) => ({ n: String(k + 1), name: n, who: k === 1 ? 'Two colleagues in your business line · 5 working days' : REVIEW_WHO[k], bg: k === 4 ? '#86BC25' : '#1a1d18', fg: k === 4 ? '#10180a' : '#fff' })),
    tabs, tab, setTab: (v: string) => (v === 'new' && !canCreate ? L.say('Ask an admin for creation rights first') : v === 'rules' && !isAdmin ? undefined : setState({ createTab: v })),
    tabMine: tab === 'mine', tabReview: tab === 'review', tabNew: tab === 'new', tabRules: tab === 'rules',
    contribList, cs, noMine: !mine.length, noMineText: canCreate ? 'Nothing yet. Make your first piece in New content.' : 'Nothing yet.',
    revList, rs, noRev: !mineRev.length, noRevText: 'No reviews for you yet. When a colleague submits, you may be asked as a peer, an expert or for quality and risk.',
    // New
    editing: !!editing, editingNote: editing ? (editing.status === 'changes' ? 'Editing after changes were requested. Submitting sends it back to the reviewer who asked.' : 'Editing your draft.') : '',
    nw, topicOptions: locked && topic ? [{ value: nw.topic, label: topicLong(topic) }] : d.grants.map((g) => ({ value: topicKey(topicOf(g)), label: topicLong(topicOf(g)) })), nwSetTopic: (e: Sel) => setNw({ topic: e.target.value }),
    topicNote: locked ? 'Submitted once: the topic, format and domain stay as they are.' : topic ? (topic.kind === 'format' ? 'Your topic fixes the format.' : topic.kind === 'domain' ? 'Your topic fixes the domain.' : '') + ' Review for this topic: ' + policyLabel(policy) + '.' : '',
    newTypes: CREATE_TYPES.map((x) => {
      const on = nw.type === x[0], fixed = (locked || topic?.kind === 'format') && !on;
      return { label: x[0], desc: x[1], bg: on ? '#1a1d18' : '#fff', fg: on ? '#fff' : fixed ? '#b3b8ae' : '#1a1d18', bd: on ? '#1a1d18' : '#d5dacf',
        pick: () => (fixed ? L.say(locked ? 'The format stays as submitted' : 'Your topic is ' + topic!.value + '; the format follows it') : setNw({ type: x[0] })) };
    }),
    domainOptions: (locked || topic?.kind === 'domain' ? [nw.dom] : CREATE_DOMAINS).map((k) => ({ value: k, label: domainName(k) })),
    levelOptions: LEVELS.map((l, i) => ({ value: String(i + 1), label: 'L' + (i + 1) + ' · ' + l })), stageOptions: STAGES.map((x) => ({ value: x, label: x })),
    nwSetTitle: (e: Input) => setNw({ title: e.target.value }), nwSetDom: (e: Sel) => setNw({ dom: e.target.value }), nwSetLvl: (e: Sel) => setNw({ lvl: e.target.value }),
    nwSetStage: (e: Sel) => setNw({ stage: e.target.value }), nwSetTake: (e: Area) => setNw({ take: e.target.value }),
    nwTakeHint: 'Reviewers judge the piece against this sentence. ' + nw.take.length + ' / ' + TAKE_MAX,
    nwBundles: usableBundles(s.bundles, line).map((b) => {
      const on = s.nwKb.includes(b.id);
      return { id: b.id, label: b.name, meta: b.access === 'tl' ? 'Tax & Legal' : b.sources.filter((r) => r[5] !== 'client' && r[5] !== 'licensed').reduce((a, r) => a + r[3], 0) + ' passages', on,
        toggle: () => L.setState((st) => ({ nwKb: on ? st.nwKb.filter((k) => k !== b.id) : st.nwKb.concat([b.id]) })) };
    }),
    nwDraftAi: () => draftAi(L), nwAiBusy: s.nwAiBusy, nwAiLabel: s.nwAiBusy ? 'Drafting' : 'Draft with AI', nwHasAi: nw.ai && (nw.outline.length > 0 || nw.sources.length > 0), nwAiNote: nw.aiNote,
    nwAiOutline: nw.outline.map((o, k) => ({ n: (k + 1) + '.', text: o })), nwAiCites: nw.sources.map((c, k) => ({ n: String(k + 1), text: c })),
    nwFileText: nw.type + ' · the file itself (video, audio or document) is attached later; this prototype stores the text only.',
    nwChecks: checks.map(dot), nwBlocked: !checksPass(checks) || s.createBusy || !topic,
    nwSubmitLabel: editing?.status === 'changes' ? 'Resubmit' : policyLabel(policy).startsWith('no review') ? 'Publish' : 'Submit for review',
    nwSubmit: () => saveForm(L, true), nwDraft: () => saveForm(L, false), nwCancel: () => setState({ editing: null, nw: blankDraft(d.grants), nwKb: [], createTab: 'mine' }),
    nwRoute, nwRouteEmpty: !nwRoute.length, nwRouteWarn: short ? 'Only ' + d.peers + ' colleague' + (d.peers === 1 ? '' : 's') + ' can peer-review you; this topic needs ' + policy.peers + '. Submitting is refused until an admin lowers the peer requirement for this topic.' : '',
    // Review requirements
    policyRows, defaultPolicy: 'Every other topic: ' + policyLabel(policyFor([], null)) + '.',
    polTopicOptions: polTopics.map((t) => ({ value: topicKey(t), label: topicLong(t) })), polCanAdd: polTopics.length > 0,
    polForm: { ...pf, topic: pfTopic ? topicKey(pfTopic) : '' }, peerOptions: ['0', '1', '2'].map((v) => ({ value: v, label: v === '0' ? 'No peers' : v === '1' ? '1 peer' : '2 peers' })),
    polSet: (p: Partial<AppState['polForm']>) => L.setState((st) => ({ polForm: { ...st.polForm, ...p } })),
    polAdd: () => (pfTopic ? writePolicy(L, () => savePolicy({ topic_kind: pfTopic.kind, topic_value: pfTopic.value, peers: +pf.peers, expert: pf.expert, quality: pf.quality }),
      'Saved · ' + topicLong(pfTopic) + ' · ' + policyLabel({ peers: +pf.peers, expert: pf.expert, quality: pf.quality })) : undefined),
    rulesLead: (L.access.isSystem || L.access.isGeneral ? 'You can set the review requirement of any topic.' : 'You can set the review requirement of ' + L.access.domains.join(', ') + '.')
      + ' A contribution follows the requirement of its topic when it is submitted; with no review at all it is published on submit, after the content checks.',
    kindLabel: KIND_LABEL,
  };
}

const CREATE_DOMAINS = ['tech', 'acad', 'pers', 'prof', 'ind', 'reg', 'corp', 'tec', 'lead'];

function dateLine(c: Contribution) {
  return c.status === 'published' ? 'Published ' + fmtDate(c.published_at) : c.status === 'draft' ? 'Edited ' + fmtDate(c.updated_at) : 'Submitted ' + fmtDate(c.submitted_at);
}

function mineDetail(L: Logic, c: Contribution, revs: Review[], d: CreateData) {
  const st = ST[c.status], stages = stagesOf(c, revs, d.policies), policy = policyFor(d.policies, topicOf(c));
  const learning = c.learning_id ? LEARN_BY[c.learning_id] : null;
  const base = {
    id: c.id, eyebrow: c.type + ' · ' + domainName(c.domain) + ' · L' + c.level + ' · ' + topicLong(topicOf(c)), title: c.title || 'Untitled ' + c.type.toLowerCase(), date: dateLine(c) + ' · for ' + c.audience_stage,
    st: st[0], stLabel: st[1], stIcon: st[2], stages: stages.map((x) => x.name), stage: stageAt(stages, c.step), hasTake: !!c.takeaway, takeaway: c.takeaway,
    outline: c.outline ? c.outline.split('\n').filter(Boolean) : [], sources: c.sources || [], aiTag: c.ai_assisted ? 'AI-assisted draft' : '',
    hasRevs: revs.length > 0,
    revs: revs.map((r) => {
      const v = RV[r.verdict];
      return { key: revKey(r), name: r.reviewer_name, role: ROLE_OF_STEP[r.step], init: ini(r.reviewer_name), avBg: r.verdict === 'waiting' ? '#b3b8ae' : '#1a1d18', st: v[0], stLabel: v[1], stIcon: v[2],
        comment: r.comment ? r.comment + ' ' : r.verdict === 'waiting' ? 'Starts when the step before is done. ' : '', date: fmtDate(r.decided_at) };
    }),
    isDraft: c.status === 'draft', draftNote: 'Only you can see a draft. Reviewers are assigned when you submit; this topic needs ' + policyLabel(policy) + '.',
    isPub: c.status === 'published', pubNote: c.learning_id ? 'In the library as ' + c.learning_id + ' · admins can map it to paths like any learning.' : 'Published.',
    mainLabel: '', mainVariant: 'primary', main: () => {}, secondLabel: '', second: () => {}, thirdLabel: '', third: () => {},
  };
  const edit = () => L.setState({ createTab: 'new', editing: c.id, nw: draftOf(c), nwKb: c.bundle_ids || [] });
  if (c.status === 'published') return { ...base, mainLabel: learning ? 'Open in library' : '', mainVariant: 'secondary', main: () => L.openDetail(c.learning_id!, 'create') };
  if (c.status === 'changes') return { ...base, mainLabel: 'Edit and resubmit', main: edit, secondLabel: 'Resubmit as it is', second: () => submitSaved(L, c) };
  if (c.status === 'review') return { ...base, secondLabel: '', mainLabel: '' };
  return { ...base, mainLabel: 'Submit for review', main: () => submitSaved(L, c), secondLabel: 'Continue editing', second: edit, thirdLabel: 'Delete draft', third: () => deleteDraft(L, c) };
}

function reviewDetail(L: Logic, c: Contribution, r: Review, d: CreateData, now: Date) {
  const s = L.state, key = revKey(r), chk = s.revChecks[key] || [], com = s.revComment[key] || '', policy = policyFor(d.policies, topicOf(c));
  const open = r.verdict === 'pending' && c.status === 'review';
  const role = r.step === 1 ? 'Peer reviewer ' + r.slot + ' of ' + d.reviews.filter((x) => x.contribution_id === c.id && x.step === 1).length : ROLE_OF_STEP[r.step];
  const next = r.step === 1 ? (policy.expert ? 'subject-matter expert' : policy.quality ? 'quality & risk' : '') : r.step === 2 ? (policy.quality ? 'quality & risk' : '') : '';
  const doneText = c.status === 'published' ? 'Published · it is in the library now.'
    : r.verdict === 'approved' ? 'You approved this. It moves on once every reviewer of this step has decided.'
    : r.verdict === 'changes' ? 'You asked for changes. ' + first(c.author_name) + ' will resubmit and it comes back to you.'
    : 'Another reviewer asked for changes. It comes back to you after ' + first(c.author_name) + ' resubmits.';
  return {
    key, ai: ini(c.author_name), eyebrow: c.type + ' · ' + domainName(c.domain) + ' · L' + c.level + ' · ' + role, title: c.title,
    meta: 'By ' + c.author_name + ' · for ' + c.audience_stage + ' · ' + (open ? daysWaiting(c.submitted_at, now) : 'submitted ' + fmtDate(c.submitted_at)),
    takeaway: c.takeaway, outline: c.outline ? c.outline.split('\n').filter(Boolean) : [], sources: c.sources || [], aiTag: c.ai_assisted ? 'AI-assisted draft · check the cited sources' : '',
    fileNote: 'The ' + (c.type === 'Podcast' ? 'audio' : c.type === 'Reel' ? 'video' : 'document') + ' is attached later; review the takeaway and outline for now.',
    checks: contentChecks({ title: c.title, takeaway: c.takeaway, outline: c.outline.split('\n'), sources: c.sources }).map(dot),
    open, closed: !open, bannerTone: r.verdict === 'approved' || c.status === 'published' ? 'success' : 'warning', doneText,
    rubric: RUBRIC.map((l, k) => ({ label: l, on: !!chk[k], toggle: (v: boolean) => L.setState((st) => { const cur = RUBRIC.map((_, j) => !!(st.revChecks[key] || [])[j]); cur[k] = v; return { revChecks: { ...st.revChecks, [key]: cur } }; }) })),
    comment: com, setComment: (e: Area) => L.setState((st) => ({ revComment: { ...st.revComment, [key]: e.target.value } })),
    canApprove: rubricComplete(RUBRIC.map((_, k) => !!chk[k])) && !s.createBusy,
    approve: () => decide(L, c, r, 'approved'), changes: () => decide(L, c, r, 'changes'),
    next: next ? 'Next: ' + next : 'Approving the last step publishes it',
  };
}
