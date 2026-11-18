// Create & share view-model (design v3, F12), split out of Logic.renderVals() like kbVals. It shows the signed-in
// person's own work: their contributions, the reviews assigned to them and, for admins, the review requirements.
// The writes live in createSave.ts, the bundles and "Draft with AI" in createGrounding.ts.
import type { ChangeEvent } from 'react';
import { LEARN_BY, LEVELS, REVIEW_STAGES, REVIEW_WHO, RUBRIC, STAGES } from './data';
import type { Logic } from './model';
import type { AppState } from './types';
import { itemsPanel, viewItems } from './createItems';
import type { SetNw } from './createItems';
import { carriesItems, hasItems, itemsCheck, itemsFromSaved, itemsText, noItems, noun } from './logic/items';
import {
  CREATE_TYPES, PARTS, PART_LABEL, PART_VALUES, MAKEABLE_FORMATS, ROLE_OF_STEP, TAKE_MAX, allowedValues, attrsLabel, attrsOf, audienceName, checksPass, contentChecks, daysWaiting, domainName,
  emptyParts, fmtDate, mayCreate, policyFor, policyLabel, reviewBadge, rubricComplete, ruleProblem, ruleSentence, stageAt, stagesOf, togglePart, valueName, withinLines,
} from './logic/contribution';
import type { Check, Contribution, CreateData, Policy, Review, RuleParts } from './logic/contribution';
import { removePolicy, savePolicy } from './lib/contributionStore';
import {
  attrsOfDraft, blankDraft, checkKey, decide, deleteDraft, draftOf, effective, first, myLine, revKey, runCheck, saveForm, saveWithFile, submitSaved, submittedEdit, writePolicy,
} from './createSave';
import { bundleFinder, draftAi, usableBundles } from './createGrounding';
import { horizonCheck, horizonPanel } from './createHorizon';
import { studioById } from './logic/studios';
import { stillMotion } from './fmtMotion';
import { changeFormat } from './studioRules';
import { HUB, studioOf, studioVals } from './studioVals';

type Input = ChangeEvent<HTMLInputElement>; type Sel = ChangeEvent<HTMLSelectElement>; type Area = ChangeEvent<HTMLTextAreaElement>;
const ST: Record<string, [string, string, string]> = { published: ['accepted', 'Published', 'check'], review: ['submitted', 'In review', 'dot'], changes: ['clarification', 'Changes requested', 'dot'], draft: ['not-started', 'Draft', 'dot'] };
const RV: Record<string, [string, string, string]> = { approved: ['accepted', 'Approved', 'check'], changes: ['clarification', 'Changes requested', 'dot'], pending: ['in-progress', 'Reviewing', 'dot'], waiting: ['not-started', 'Waiting', 'dot'] };
const EMPTY: CreateData = { contributions: [], reviews: [], rules: [], policies: [], peers: 0 };
const ini = (name: string) => name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const dot = (c: Check) => ({ text: c.text, dot: c.ok ? '#86BC25' : '#e0a100', fg: c.ok ? '#3d423b' : '#7a5000' });

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
  const canCreate = d.rules.length > 0, isAdmin = L.isAdmin();
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
  const nw = effective(s), attrs = attrsOfDraft(nw), policy = policyFor(d.policies, attrs), allowed = allowedValues(d.rules), ok = mayCreate(d.rules, attrs);
  const setNw: SetNw = (p) => L.setState((st) => { const cur = effective(st); return { nw: { ...cur, ...(typeof p === 'function' ? p(cur) : p) } }; });
  const checks = contentChecks({ title: nw.title, takeaway: nw.take, outline: nw.outline, sources: nw.sources, items: itemsText(nw.items?.list ?? []) })
    .concat(hasItems(nw.type) ? [itemsCheck(nw.type, nw.items ?? noItems())] : [], nw.type === 'Presentation' ? [horizonCheck(nw)] : []);
  const line = myLine(L);
  const picked = usableBundles(s.bundles, line).filter((b) => s.nwKb.includes(b.id));
  const editing = s.editing ? byId.get(s.editing) : null, locked = !!submittedEdit(s);
  const fresh = () => blankDraft(d.rules, line);
  // Pristine forms start from the person's rules (they load after the first render).
  const pristine = !s.editing && !s.nw.title && !s.nw.take;
  const short = policy.peers > d.peers;
  const nwRoute = [
    ...Array.from({ length: policy.peers }, (_, k) => ({ n: String(k + 1), name: 'Peer reviewer ' + (k + 1) + ' of ' + policy.peers, role: 'A colleague in ' + (Array.from(new Set([line, nw.line].filter(Boolean))).join(' or ') || 'your business line') })),
    ...(policy.expert ? [{ n: '', name: 'Subject-matter expert', role: domainName(nw.dom) + ' · or a System Admin when none is named' }] : []),
    ...(policy.quality ? [{ n: '', name: 'Learning team', role: 'Quality & risk · a General Admin' }] : []),
  ].map((x, k) => ({ ...x, n: String(k + 1) }));
  // Pickers offer what at least one rule allows; a submitted contribution keeps its own values. Every contribution has a line.
  const lineOptions = (locked ? [nw.line] : allowed.lines).map((v) => ({ value: v, label: v }));
  const audOptions = (locked ? [nw.aud] : (allowed.noAudience ? [''] : []).concat(allowed.audiences)).map((v) => ({ value: v, label: v ? audienceName(v) : 'None' }));

  // Review requirements (admins): System and General Admins any; a Domain Admin only with lines, all of them theirs.
  const anyLine = L.access.isSystem || !!L.access.isGeneral;
  const canSet = (r: RuleParts) => withinLines(r, anyLine, L.access.domains);
  const policyRows = d.policies.map((p) => {
    const editable = canSet(p), words = ruleSentence(p), save = (patch: Partial<Policy>) => writePolicy(L, () => savePolicy({ ...p, ...patch }), 'Saved · ' + words + ' · ' + policyLabel({ ...p, ...patch }));
    return { key: String(p.id), label: words, summary: policyLabel(p), editable, peers: String(p.peers), expert: p.expert, quality: p.quality,
      setPeers: (v: string) => save({ peers: +v }), setExpert: (v: boolean) => save({ expert: v }), setQuality: (v: boolean) => save({ quality: v }),
      remove: () => writePolicy(L, () => removePolicy(p.id), 'Removed · ' + words) };
  });
  const pf = s.polForm, pfParts: RuleParts = { lines: pf.lines, formats: pf.formats, domains: pf.domains, audiences: pf.audiences };
  const pfLines = anyLine ? PART_VALUES.lines : PART_VALUES.lines.filter((l) => L.access.domains.includes(l));
  const pfProblem = ruleProblem(pfParts, anyLine, L.access.domains);

  const tabs = [{ value: 'mine', label: 'My contributions · ' + mine.length }, { value: 'review', label: 'Review for peers · ' + openN }, { value: 'new', label: editing ? 'Edit content' : 'New content' }]
    .concat(isAdmin ? [{ value: 'rules', label: 'Review requirements' }] : []);
  const tab = (s.createTab === 'new' && !canCreate) || (s.createTab === 'rules' && !isAdmin) ? 'mine' : s.createTab;

  const vm = {
    loading: !s.create && !s.createError, error: s.createError, retry: () => L.reloadCreate(), busy: s.createBusy,
    readOnly: L.subject.readOnly, readOnlyNote: 'Create & share shows your own work, not ' + L.subject.name + '’s. Go back to yourself to create, submit or review.',
    lead: 'Make something for your colleagues: ' + MAKEABLE_FORMATS.slice(0, -1).join(', ') + ' or ' + MAKEABLE_FORMATS[MAKEABLE_FORMATS.length - 1] + '. Review requirements depend on the line, format, domain and audience: by default two peer reviews, an expert check and a quality and risk check before it reaches the library.',
    canCreate, noGrantText: 'You have no creation rights yet. Ask an admin for creation rights: a Domain Admin or General Admin gives you rules such as “Consulting or Tax & Legal · Podcast”.',
    myRules: d.rules.map((r) => ruleSentence(r)),
    goNew: () => (canCreate ? setState({ createTab: 'new', editing: null, nw: fresh(), nwKb: [], nwKbQ: '', studio: HUB }) : L.say('Ask an admin for creation rights first')),
    // The full flow, as the design shows it. Peers come from the author's business line (the design said "same domain").
    reviewSteps: REVIEW_STAGES.map((n, k) => ({ n: String(k + 1), name: n, who: k === 1 ? 'Two colleagues in your line or the content\'s line · 5 working days' : REVIEW_WHO[k], bg: k === 4 ? '#86BC25' : '#1a1d18', fg: k === 4 ? '#10180a' : '#fff' })),
    tabs, tab, setTab: (v: string) => (v === 'new' && !canCreate ? L.say('Ask an admin for creation rights first') : v === 'rules' && !isAdmin ? undefined
      : setState(v === 'new' && pristine ? { createTab: v, nw: fresh(), studio: HUB } : { createTab: v })),
    tabMine: tab === 'mine', tabReview: tab === 'review', tabNew: tab === 'new', tabRules: tab === 'rules',
    contribList, cs, noMine: !mine.length, noMineText: canCreate ? 'Nothing yet. Make your first piece in New content.' : 'Nothing yet.',
    revList, rs, noRev: !mineRev.length, noRevText: 'No reviews for you yet. When a colleague submits, you may be asked as a peer, an expert or for quality and risk.',
    // New
    editing: !!editing, editingNote: editing ? (editing.status === 'changes' ? 'Editing after changes were requested. Submitting sends it back to the reviewer who asked.' : 'Editing your draft.') : '',
    nw, locked, lockedNote: locked ? 'Submitted once: business line, format, domain and audience stay as they are.' : '',
    lineOptions, nwSetLine: (e: Sel) => setNw({ line: e.target.value }), audOptions, nwSetAud: (e: Sel) => setNw({ aud: e.target.value }),
    nwAllowed: ok, nwRuleWarn: ok ? '' : 'Not allowed by your creation rules', nwRulesText: 'Your creation rules: ' + d.rules.map((r) => ruleSentence(r)).join('; ') + '.',
    nwPolicyNote: 'Review for this combination: ' + policyLabel(policy) + '.',
    newTypes: CREATE_TYPES.map((x) => {
      const on = nw.type === x[0], fixed = !on && (locked || !allowed.formats.includes(x[0]));
      return { label: x[0], desc: x[1], bg: on ? '#1a1d18' : '#fff', fg: on ? '#fff' : fixed ? '#b3b8ae' : '#1a1d18', bd: on ? '#1a1d18' : '#d5dacf',
        pick: () => (s.nwAiBusy ? L.say('Wait for the draft to finish') : fixed ? L.say(locked ? 'The format stays as submitted' : 'Not in your creation rules') : setNw((cur) => changeFormat(cur, x[0]))) };
    }),
    domainOptions: (locked ? [nw.dom] : allowed.domains).map((k) => ({ value: k, label: domainName(k) })),
    levelOptions: LEVELS.map((l, i) => ({ value: String(i + 1), label: 'L' + (i + 1) + ' · ' + l })), stageOptions: STAGES.map((x) => ({ value: x, label: x })),
    nwSetTitle: (e: Input) => setNw({ title: e.target.value }), nwSetDom: (e: Sel) => setNw({ dom: e.target.value }), nwSetLvl: (e: Sel) => setNw({ lvl: e.target.value }),
    nwSetStage: (e: Sel) => setNw({ stage: e.target.value }), nwSetTake: (e: Area) => setNw({ take: e.target.value }),
    nwTakeHint: 'Reviewers judge the piece against this sentence. ' + nw.take.length + ' / ' + TAKE_MAX,
    ...bundleFinder(L, nw, line),
    nwDraftAi: () => draftAi(L), nwAiBusy: s.nwAiBusy, nwAiLabel: s.nwAiBusy ? 'Drafting' : 'Draft with AI', nwHasAi: nw.outline.length > 0 || nw.sources.length > 0, nwAiNote: nw.aiNote,
    nwAiOutline: nw.outline.map((o, k) => ({ n: (k + 1) + '.', text: o })), nwAiCites: nw.sources.map((c, k) => ({ n: String(k + 1), text: c })),
    itemsPanel: itemsPanel(L, nw, picked, setNw), horizonPanel: horizonPanel(L, nw),
    nwFileText: nw.type + ' · the file itself (video, audio or document) is attached later; this prototype stores the text only.',
    nwChecks: checks.map(dot), nwBlocked: !checksPass(checks) || s.createBusy || !ok,
    nwSubmitLabel: editing?.status === 'changes' ? 'Resubmit' : policyLabel(policy).startsWith('no review') ? 'Publish' : 'Submit for review',
    nwSubmit: () => saveForm(L, true), nwDraft: () => saveForm(L, false), nwCancel: () => setState({ editing: null, nw: fresh(), nwKb: [], nwKbQ: '', createTab: 'mine', studio: HUB }),
    nwRoute, nwRouteEmpty: !nwRoute.length, nwRouteWarn: short ? 'Only ' + d.peers + ' colleague' + (d.peers === 1 ? '' : 's') + ' can peer-review you; this combination needs ' + policy.peers + '. Submitting is refused until an admin lowers the peer requirement.' : '',
    // Review requirements
    policyRows, defaultPolicy: 'When no requirement matches: ' + policyLabel(policyFor([], null)) + '. When several match, the strictest counts.',
    polGroups: PARTS.map((part) => ({ part, label: PART_LABEL[part], chips: (part === 'lines' ? pfLines : PART_VALUES[part]).map((v) => ({ value: v, label: valueName(part, v), on: pf[part].includes(v),
      toggle: () => L.setState((st) => ({ polForm: { ...st.polForm, ...togglePart({ lines: st.polForm.lines, formats: st.polForm.formats, domains: st.polForm.domains, audiences: st.polForm.audiences }, part, v) } })) })) })),
    polPreview: pfProblem || ruleSentence(pfParts), polProblem: pfProblem,
    polForm: pf, peerOptions: ['0', '1', '2'].map((v) => ({ value: v, label: v === '0' ? 'No peers' : v === '1' ? '1 peer' : '2 peers' })),
    polSet: (p: Partial<AppState['polForm']>) => L.setState((st) => ({ polForm: { ...st.polForm, ...p } })),
    polAdd: () => (pfProblem ? L.say(pfProblem) : writePolicy(L, async () => {
      await savePolicy({ ...pfParts, peers: +pf.peers, expert: pf.expert, quality: pf.quality });
      L.setState({ polForm: { ...emptyParts(), peers: '2', expert: true, quality: true } });
    }, 'Saved · ' + ruleSentence(pfParts) + ' · ' + policyLabel({ peers: +pf.peers, expert: pf.expert, quality: pf.quality }))),
    rulesLead: (anyLine ? 'You can set review requirements for anything.' : 'You can set review requirements within ' + L.access.domains.join(', ') + '.')
      + ' A requirement applies to every contribution it matches (same parts as creation rules); a contribution is routed by the strictest one when it is submitted, and with no review at all it is published on submit, after the content checks.',
  };
  // The Studios hub arranges what the form already computed (studioVals.ts); an edit shows the form unless it opened in its studio.
  const chk = s.studio.check, checkReasons = chk && chk.key === checkKey(nw, s.nwKb, studioOf(s)) ? chk.reasons : null;
  const studio = studioVals(L, { nw, setNw, bundles: picked, rules: d.rules, canCreate, busy: vm.busy, checks: vm.nwChecks, blocked: vm.nwBlocked, route: vm.nwRoute, policyNote: vm.nwPolicyNote,
    routeWarn: vm.nwRouteWarn, submitLabel: vm.nwSubmitLabel, submit: vm.nwSubmit, saveDraft: vm.nwDraft, cancel: vm.nwCancel, checkReasons, runCheck: () => runCheck(L), withFile: (attach, done, how) => saveWithFile(L, attach, {}, done, how) });
  return { ...vm, studio, newView: s.editing && s.studio.view !== 'studio' ? 'form' as const : s.studio.view };
}

function dateLine(c: Contribution) {
  return c.status === 'published' ? 'Published ' + fmtDate(c.published_at) : c.status === 'draft' ? 'Edited ' + fmtDate(c.updated_at) : 'Submitted ' + fmtDate(c.submitted_at);
}

function mineDetail(L: Logic, c: Contribution, revs: Review[], d: CreateData) {
  const st = ST[c.status], stages = stagesOf(c, revs, d.policies), policy = policyFor(d.policies, attrsOf(c));
  const learning = c.learning_id ? LEARN_BY[c.learning_id] : null;
  const base = {
    id: c.id, eyebrow: c.type + ' · ' + domainName(c.domain) + ' · L' + c.level + ' · ' + attrsLabel(attrsOf(c)), title: c.title || 'Untitled ' + c.type.toLowerCase(), date: dateLine(c) + ' · for ' + c.audience_stage,
    st: st[0], stLabel: st[1], stIcon: st[2], stages: stages.map((x) => x.name), stage: stageAt(stages, c.step), hasTake: !!c.takeaway, takeaway: c.takeaway,
    outline: c.outline ? c.outline.split('\n').filter(Boolean) : [], sources: c.sources || [], aiTag: c.ai_assisted ? 'AI-assisted draft' : '', ...viewItems(c, '', stillMotion(L), L.aiOpts(), L.state.stockLooks ?? undefined),
    hasRevs: revs.length > 0,
    revs: revs.map((r) => {
      const v = RV[r.verdict];
      return { key: revKey(r), name: r.reviewer_name, role: ROLE_OF_STEP[r.step], init: ini(r.reviewer_name), avBg: r.verdict === 'waiting' ? '#b3b8ae' : '#1a1d18', st: v[0], stLabel: v[1], stIcon: v[2],
        comment: r.comment ? r.comment + ' ' : r.verdict === 'waiting' ? 'Starts when the step before is done. ' : '', date: fmtDate(r.decided_at) };
    }),
    isDraft: c.status === 'draft', draftNote: 'Only you can see a draft. Reviewers are assigned when you submit; it needs ' + policyLabel(policy) + '.',
    isPub: c.status === 'published', pubNote: c.learning_id ? 'In the library as ' + c.learning_id + ' · admins can map it to paths like any learning.' : 'Published.',
    mainLabel: '', mainVariant: 'primary', main: () => {}, secondLabel: '', second: () => {}, thirdLabel: '', third: () => {},
  };
  // A contribution made in a studio with its own steps is edited there (its rows need the row editor); the rest in the form.
  const inStudio = !!c.studio && studioById(c.studio)?.compact === false;
  const edit = () => L.setState({ createTab: 'new', editing: c.id, nw: draftOf(c), nwKb: c.bundle_ids || [], nwKbQ: '',
    studio: inStudio ? { view: 'studio', step: 0, id: c.studio ?? undefined } : { view: 'form', step: 0 } });
  if (c.status === 'published') return { ...base, mainLabel: learning ? 'Open in library' : '', mainVariant: 'secondary', main: () => L.openDetail(c.learning_id!, 'create') };
  if (c.status === 'changes') return { ...base, mainLabel: 'Edit and resubmit', main: edit, secondLabel: 'Resubmit as it is', second: () => submitSaved(L, c) };
  if (c.status === 'review') return { ...base, secondLabel: '', mainLabel: '' };
  return { ...base, mainLabel: 'Submit for review', main: () => submitSaved(L, c), secondLabel: 'Continue editing', second: edit, thirdLabel: 'Delete draft', third: () => deleteDraft(L, c) };
}

function reviewDetail(L: Logic, c: Contribution, r: Review, d: CreateData, now: Date) {
  const s = L.state, key = revKey(r), chk = s.revChecks[key] || [], com = s.revComment[key] || '', policy = policyFor(d.policies, attrsOf(c));
  const open = r.verdict === 'pending' && c.status === 'review';
  // A peer reads only their own review row, so the number of peers comes from the effective requirement.
  const role = r.step === 1 ? 'Peer reviewer ' + r.slot + ' of ' + Math.max(r.slot, policy.peers, d.reviews.filter((x) => x.contribution_id === c.id && x.step === 1).length) : ROLE_OF_STEP[r.step];
  const next = r.step === 1 ? (policy.expert ? 'subject-matter expert' : policy.quality ? 'quality & risk' : '') : r.step === 2 ? (policy.quality ? 'quality & risk' : '') : '';
  const doneText = c.status === 'published' ? 'Published · it is in the library now.'
    : r.verdict === 'approved' ? 'You approved this. It moves on once every reviewer of this step has decided.'
    : r.verdict === 'changes' ? 'You asked for changes. ' + first(c.author_name) + ' will resubmit and it comes back to you.'
    : 'Another reviewer asked for changes. It comes back to you after ' + first(c.author_name) + ' resubmits.';
  return {
    key, ai: ini(c.author_name), eyebrow: c.type + ' · ' + domainName(c.domain) + ' · L' + c.level + ' · ' + role, title: c.title,
    meta: 'By ' + c.author_name + ' · for ' + c.audience_stage + ' · ' + (open ? daysWaiting(c.submitted_at, now) : 'submitted ' + fmtDate(c.submitted_at)),
    takeaway: c.takeaway, outline: c.outline ? c.outline.split('\n').filter(Boolean) : [], sources: c.sources || [], aiTag: c.ai_assisted ? 'AI-assisted draft · check the cited sources' : '',
    ...viewItems(c, ' to check', stillMotion(L), L.aiOpts(), L.state.stockLooks ?? undefined),
    fileNote: c.type === 'Presentation' ? 'Play the presentation and check it against the takeaway.' : carriesItems(c.type, c.studio) ? 'Check each ' + noun(c.type, 1) + ' against the takeaway.'
      : 'The ' + (c.type === 'Podcast' ? 'audio' : c.type === 'Reel' ? 'video' : 'document') + ' is attached later; review the takeaway and outline for now.',
    checks: contentChecks({ title: c.title, takeaway: c.takeaway, outline: c.outline.split('\n'), sources: c.sources, items: itemsText(itemsFromSaved(c.type, c.items)) }).map(dot),
    open, closed: !open, bannerTone: r.verdict === 'approved' || c.status === 'published' ? 'success' : 'warning', doneText,
    rubric: RUBRIC.map((l, k) => ({ label: l, on: !!chk[k], toggle: (v: boolean) => L.setState((st) => { const cur = RUBRIC.map((_, j) => !!(st.revChecks[key] || [])[j]); cur[k] = v; return { revChecks: { ...st.revChecks, [key]: cur } }; }) })),
    comment: com, setComment: (e: Area) => L.setState((st) => ({ revComment: { ...st.revComment, [key]: e.target.value } })),
    canApprove: rubricComplete(RUBRIC.map((_, k) => !!chk[k])) && !s.createBusy,
    approve: () => decide(L, c, r, 'approved'), changes: () => decide(L, c, r, 'changes'),
    next: next ? 'Next: ' + next : 'Approving the last step publishes it',
  };
}
