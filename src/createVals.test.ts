// Create & share view-model (FT-CS-*): the three tabs and the admin tab, topic picker and no-grant state, stepper per
// policy, submit / approve / request changes through the store, the badge, View as and the Draft with AI fallback.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
import * as store from './lib/contributionStore';
import { draftFromPassages } from './createVals';
import { emptyParts } from './logic/contribution';
import type { CreateData, PolicyRow, Rule, RuleParts } from './logic/contribution';
import { contribution, review } from './test/contributions';
import { domainAdmin, flush, harness, member, person, stubWindow, systemAdmin } from './test/harness';
import type { AppState } from './types';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async () => 'new1'), removeDraft: vi.fn(async () => {}), submitContribution: vi.fn(async () => 'review'),
  decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(async () => {}), removePolicy: vi.fn(async () => {}),
  loadGrants: vi.fn(), addGrant: vi.fn(), removeGrant: vi.fn(), loadExperts: vi.fn(), setExpert: vi.fn(),
}));
vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), saveProgress: vi.fn(), savePrefs: vi.fn(), loadLearner: vi.fn(),
}));

const ev = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>;
let ids = 0;
const rule = (o: Partial<RuleParts>): Rule => ({ id: ++ids, user_id: 'u1', ...emptyParts(), ...o });
const pol = (o: Partial<RuleParts>, peers: number, expert: boolean, quality: boolean): PolicyRow => ({ id: ++ids, ...emptyParts(), ...o, peers, expert, quality });
const data = (o: Partial<CreateData> = {}): CreateData => ({ contributions: [], reviews: [], rules: [rule({ lines: ['Consulting'] })], policies: [], peers: 3, ...o });
const cs = (o: { data?: CreateData; state?: Partial<AppState>; access?: ReturnType<typeof member>; readOnly?: boolean } = {}) => {
  const h = harness({ access: o.access || member('u1'), subject: person(o.readOnly ? { id: 'u9', name: 'Other Person', readOnly: true } : {}), state: { screen: 'create', create: o.data || data(), ...o.state } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  return Object.assign(h, { c: () => h.vm().create! });
};

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('navigation', () => {
  it('builds the screen only on Create & share; the badge counts the signed-in person\'s open reviews', () => {
    const d = data({ contributions: [contribution({ id: 'x1', author_id: 'u5', status: 'review', step: 1 })], reviews: [review({ contribution_id: 'x1', reviewer_id: 'u1' })] });
    const h = harness({ access: member('u1'), state: { create: d } });
    expect(h.vm().create).toBeNull();
    expect(h.vm().reviewBadge).toBe(1);
    h.vm().goCreate();
    expect(h.state.screen).toBe('create');
    expect(h.vm().navCreate).toBe(true);
  });
  it('keeps the badge on the signed-in person while viewing someone else', () => {
    const d = data({ contributions: [contribution({ id: 'x1', author_id: 'u5', status: 'review', step: 1 })], reviews: [review({ contribution_id: 'x1', reviewer_id: 'u1' })] });
    expect(cs({ data: d, readOnly: true }).vm().reviewBadge).toBe(1);
  });
  it('shows loading until the data arrives, then an error with a retry', () => {
    const h = cs({ state: { create: null } });
    expect(h.c().loading).toBe(true);
    const e = cs({ state: { create: null, createError: 'offline' } });
    expect(e.c().loading).toBe(false);
    expect(e.c().error).toBe('offline');
  });
});

describe('no creation rights', () => {
  it('says to ask an admin and keeps the New tab closed', () => {
    const h = cs({ data: data({ rules: [] }) });
    expect(h.c().canCreate).toBe(false);
    expect(h.c().noGrantText).toMatch(/^You have no creation rights yet\. Ask an admin for creation rights/);
    h.c().setTab('new');
    expect(h.state.createTab).toBe('mine');
    expect(h.lastToast()).toBe('Ask an admin for creation rights first');
    h.c().goNew();
    expect(h.c().tabNew).toBe(false);
  });
  it('falls back to Mine when the New tab is open without rights', () => {
    expect(cs({ data: data({ rules: [] }), state: { createTab: 'new' } }).c().tab).toBe('mine');
  });
});

describe('the New tab', () => {
  const rules = () => [rule({ lines: ['Consulting', 'Tax & Legal'], formats: ['Podcast'] }), rule({ lines: ['Consulting'], formats: ['Micro-guide'], domains: ['reg'], audiences: ['ind:energy'] })];
  const open = (h: ReturnType<typeof cs>) => { h.c().setTab('new'); return h; };
  it('starts from the first rule, on the person\'s own line', () => {
    const h = open(cs({ data: data({ rules: rules() }) }));
    expect(h.c().nw).toMatchObject({ line: 'Consulting', type: 'Podcast', aud: '' });
    expect(h.c().nwAllowed).toBe(true);
    expect(h.c().nwRulesText).toBe('Your creation rules: Consulting or Tax & Legal · Podcast; Consulting · Micro-guide · Regulations · Energy & utilities.');
    expect(h.c().stageOptions).toHaveLength(7);
  });
  it('offers only values some rule allows', () => {
    const h = open(cs({ data: data({ rules: rules() }) }));
    expect(h.c().lineOptions.map((o) => o.value)).toEqual(['Consulting', 'Tax & Legal']);
    // the first rule leaves audiences open, so every one is on offer, and none
    expect(h.c().audOptions.map((o) => o.label).slice(0, 2)).toEqual(['None', 'Energy & utilities']);
    expect(h.c().audOptions).toHaveLength(8);
    expect(h.c().domainOptions).toHaveLength(9);
    expect(h.c().newTypes.map((t) => [t.label, t.fg === '#b3b8ae'])).toEqual([['Reel', true], ['Podcast', false], ['Micro-guide', false], ['Case write-up', true]]);
    h.c().newTypes[0].pick();
    expect(h.lastToast()).toBe('Not in your creation rules');
    expect(h.c().nw.type).toBe('Podcast');
  });
  it('says when the combination is not allowed and blocks submit', () => {
    const h = open(cs({ data: data({ rules: rules() }) }));
    h.c().nwSetTitle(ev('VAT basics')); h.c().nwSetTake(ev('Four boxes tell you who pays.'));
    expect(h.c().nwBlocked).toBe(false);
    h.c().nwSetLine(ev('Tax & Legal')); h.c().nwSetAud(ev('ind:energy'));
    expect(h.c().nwAllowed).toBe(true);
    h.c().nwSetDom(ev('reg'));
    expect(h.c().nwAllowed).toBe(true);
    // Micro-guide is only allowed by the second rule, which needs Consulting
    h.c().newTypes[2].pick();
    expect(h.c().nwRuleWarn).toBe('Not allowed by your creation rules');
    expect(h.c().nwBlocked).toBe(true);
    h.c().nwSubmit();
    expect(h.lastToast()).toBe('Not allowed by your creation rules');
    expect(store.saveDraft).not.toHaveBeenCalled();
    h.c().nwSetLine(ev('Consulting'));
    expect(h.c().nwAllowed).toBe(true);
    expect(h.c().nwRuleWarn).toBe('');
  });
  it('runs the content checks live and blocks submit until they pass', () => {
    const h = open(cs());
    expect(h.c().nwBlocked).toBe(true);
    h.c().nwSetTitle(ev('Pricing lessons'));
    h.c().nwSetTake(ev('What we learned at Delcroix.'));
    expect(h.c().nwChecks.map((c) => c.text)).toEqual(['Title is clear and short', 'One takeaway, 28 of 200 characters', '“Delcroix” looks like a client name · anonymise it']);
    expect(h.c().nwBlocked).toBe(true);
    h.c().nwSubmit();
    expect(h.lastToast()).toBe('Clear the open checks first');
    expect(store.saveDraft).not.toHaveBeenCalled();
    h.c().nwSetTake(ev('Price the change, not the hours.'));
    expect(h.c().nwBlocked).toBe(false);
  });
  it('shows the route of the strictest requirement and warns when peers are short', () => {
    const d = data({ rules: [rule({ lines: ['Consulting'] })], policies: [pol({ formats: ['Micro-guide'] }, 0, false, true), pol({ domains: ['reg'] }, 1, false, false)], peers: 0 });
    const h = open(cs({ data: d }));
    h.state.nw.type = 'Micro-guide';
    expect(h.c().nwRoute.map((r) => r.name)).toEqual(['Learning team']);
    expect(h.c().nwRouteWarn).toBe('');
    h.c().nwSetDom(ev('reg'));
    expect(h.c().nwRoute.map((r) => r.name)).toEqual(['Peer reviewer 1 of 1', 'Learning team']);
    expect(h.c().nwPolicyNote).toBe('Review for this combination: 1 peer, quality & risk.');
    expect(h.c().nwRouteWarn).toMatch(/^Only 0 colleagues can peer-review you; this combination needs 1\./);
  });
  it('looks for peers in the author\'s line and the content\'s line', () => {
    const h = open(cs({ data: data({ rules: [rule({ lines: ['Tax & Legal'] })] }) }));
    expect(h.state.nw.line).toBe('Tax & Legal');
    expect(h.c().nwRoute[0].role).toBe('A colleague in Consulting or Tax & Legal');
  });
  it('labels the button Publish when no review is required', () => {
    const d = data({ policies: [pol({ lines: ['Consulting'] }, 0, false, false)] });
    const h = open(cs({ data: d }));
    expect(h.c().nwSubmitLabel).toBe('Publish');
    expect(h.c().nwRouteEmpty).toBe(true);
  });
});

describe('submitting', () => {
  const filled = { createTab: 'new', nw: { line: 'Consulting', aud: '', type: 'Reel', title: 'Pricing lessons', dom: 'prof', lvl: '3', stage: 'Manager', take: 'Price the change, not the hours.', outline: [], sources: [], ai: false, aiNote: '' } };
  it('saves the draft, submits it, reloads and names the reviewers', async () => {
    const h = cs({ state: filled });
    vi.mocked(store.submitContribution).mockImplementation(async () => {
      h.state.create!.contributions.push(contribution({ id: 'new1', title: 'Pricing lessons', status: 'review', step: 1 }));
      h.state.create!.reviews.push(review({ contribution_id: 'new1', reviewer_name: 'Sam Peer' }), review({ contribution_id: 'new1', slot: 2, reviewer_id: 'u3', reviewer_name: 'Alex Peer' }));
      return 'review';
    });
    h.c().nwSubmit(); await flush(10);
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ business_line: 'Consulting', audience: null, type: 'Reel', title: 'Pricing lessons', domain: 'prof', level: 3, audience_stage: 'Manager' }), null);
    expect(store.submitContribution).toHaveBeenCalledWith('new1');
    expect(h.state.createTab).toBe('mine');
    expect(h.state.contribSel).toBe('new1');
    expect(h.lastToast()).toBe('Submitted · Sam Peer and Alex Peer review it first');
  });
  it('keeps a saved draft when the database refuses the submit, so a retry edits it', async () => {
    const h = cs({ state: filled });
    vi.mocked(store.submitContribution).mockRejectedValueOnce(new Error('Only 1 colleague(s) in your business line can peer-review this'));
    h.c().nwSubmit(); await flush(10);
    expect(h.lastToast()).toMatch(/^Only 1 colleague/);
    expect(h.state.editing).toBe('new1');
    expect(h.state.createBusy).toBe(false);
    h.c().nwSubmit(); await flush(10);
    expect(vi.mocked(store.saveDraft).mock.calls[1][1]).toBe('new1');
  });
  it('reloads the catalogue when a contribution is published on submit', async () => {
    const reloadContent = vi.fn(async () => {});
    const h = harness({ access: member('u1'), reloadContent, state: { screen: 'create', create: data(), ...filled } });
    vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
    vi.mocked(store.submitContribution).mockResolvedValueOnce('published');
    h.vm().create!.nwSubmit(); await flush(10);
    expect(reloadContent).toHaveBeenCalled();
    expect(h.lastToast()).toMatch(/^Published · /);
  });
  it('saves a draft without submitting', async () => {
    const h = cs({ state: filled });
    h.c().nwDraft(); await flush(10);
    expect(store.saveDraft).toHaveBeenCalled();
    expect(store.submitContribution).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Saved as draft · only you can see it');
  });
});

describe('My contributions', () => {
  it('lists the person\'s own work and shows the stepper of its route', () => {
    const d = data({
      contributions: [contribution({ id: 'a', status: 'review', step: 3, audience: 'ind:energy', type: 'Micro-guide', submitted_at: '2026-10-30T09:00:00Z' }), contribution({ id: 'theirs', author_id: 'u5' })],
      reviews: [review({ contribution_id: 'a', step: 1, verdict: 'approved', comment: 'Clear.', decided_at: '2026-10-31T09:00:00Z' }), review({ contribution_id: 'a', step: 3, reviewer_id: 'u4', reviewer_name: 'Lee Quality' }), review({ contribution_id: 'theirs', reviewer_id: 'u1' })],
    });
    const c = cs({ data: d }).c();
    expect(c.contribList.map((x) => x.id)).toEqual(['a']);
    expect(c.cs!.eyebrow).toBe('Micro-guide · Personal growth · L2 · Consulting · Energy & utilities');
    expect(c.cs!.stages).toEqual(['Draft', 'Peer review', 'Quality & risk', 'Published']);
    expect(c.cs!.stage).toBe(2);
    expect(c.cs!.revs.map((r) => [r.name, r.role, r.stLabel])).toEqual([['Sam Peer', 'Peer reviewer', 'Approved'], ['Lee Quality', 'Quality & risk', 'Reviewing']]);
    expect(c.cs!.revs[0].comment).toBe('Clear. ');
    expect(c.cs!.mainLabel).toBe('');
  });
  it('shows a draft with its policy, submit, edit and delete', async () => {
    const d = data({ contributions: [contribution({ id: 'd1' })], policies: [pol({ lines: ['Consulting'] }, 1, false, false), pol({ formats: ['Reel'] }, 0, false, true)] });
    const h = cs({ data: d });
    expect(h.c().cs!.stages).toEqual(['Draft', 'Peer review', 'Quality & risk', 'Published']);
    expect(h.c().cs!.draftNote).toMatch(/it needs 1 peer, quality & risk\.$/);
    h.c().cs!.second();
    expect(h.state.createTab).toBe('new');
    expect(h.state.editing).toBe('d1');
    expect(h.state.nw.title).toBe('One slide, one message');
    h.c().cs!.third(); await flush(10);
    expect(store.removeDraft).toHaveBeenCalledWith('d1');
  });
  it('refuses to submit a saved draft that fails a check', () => {
    const h = cs({ data: data({ contributions: [contribution({ takeaway: '' })] }) });
    h.c().cs!.main();
    expect(store.submitContribution).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Write the one takeaway · edit it first');
  });
  it('lets the author edit after changes were requested, with line, format, domain and audience fixed', () => {
    const d = data({ contributions: [contribution({ id: 'ch', status: 'changes', step: 1, audience: 'ind:energy' })], rules: [rule({ lines: ['Consulting', 'Audit'] })], reviews: [review({ contribution_id: 'ch', verdict: 'changes', comment: 'Shorter.' })] });
    const h = cs({ data: d });
    expect(h.c().cs!.mainLabel).toBe('Edit and resubmit');
    h.c().cs!.main();
    expect(h.c().locked).toBe(true);
    expect(h.c().lineOptions).toEqual([{ value: 'Consulting', label: 'Consulting' }]);
    expect(h.c().audOptions).toEqual([{ value: 'ind:energy', label: 'Energy & utilities' }]);
    expect(h.c().domainOptions.map((o) => o.value)).toEqual(['pers']);
    expect(h.c().nwSubmitLabel).toBe('Resubmit');
    h.c().nwSetLine(ev('Audit'));
    expect(h.c().nw.line).toBe('Consulting');
    h.c().newTypes[1].pick();
    expect(h.lastToast()).toBe('The format stays as submitted');
  });
  it('refuses to submit a saved draft that the rules no longer allow', () => {
    const h = cs({ data: data({ contributions: [contribution({ business_line: 'Audit' })] }) });
    h.c().cs!.main();
    expect(store.submitContribution).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Not allowed by your creation rules · ask an admin');
  });
  it('opens a published piece in the library', () => {
    const d = data({ contributions: [contribution({ status: 'published', step: 4, learning_id: 'L45', published_at: '2026-10-03T09:00:00Z' })] });
    const h = cs({ data: d });
    expect(h.c().cs!.date).toBe('Published 3 Oct 2026 · for Consultant');
    h.c().cs!.main();
    expect(h.state.screen).toBe('detail');
    expect(h.state.detailId).toBe('L45');
    expect(h.vm().backLabel).toBe('← Back to Create & share');
  });
});

describe('Review for peers', () => {
  const d = () => data({
    contributions: [contribution({ id: 'r1', author_id: 'u5', author_name: 'Kim Author', status: 'review', step: 1, submitted_at: '2026-10-30T09:00:00Z' }), contribution({ id: 'r2', author_id: 'u6', status: 'changes', step: 1 })],
    reviews: [review({ contribution_id: 'r1', reviewer_id: 'u1' }), review({ contribution_id: 'r1', slot: 2, reviewer_id: 'u7' }), review({ contribution_id: 'r2', reviewer_id: 'u1' })],
  });
  it('lists the reviews of the signed-in person, open ones first', () => {
    const c = cs({ data: d() }).c();
    expect(c.revList.map((r) => [r.title, r.stLabel])).toEqual([['One slide, one message', 'Your turn'], ['One slide, one message', 'With the author']]);
    expect(c.tabs[1].label).toBe('Review for peers · 1');
    expect(c.rs!.eyebrow).toBe('Reel · Personal growth · L2 · Peer reviewer 1 of 2');
    expect(c.rs!.open).toBe(true);
  });
  it('enables Approve only when all four rubric items are ticked', async () => {
    const h = cs({ data: d() });
    expect(h.c().rs!.canApprove).toBe(false);
    h.c().rs!.approve();
    expect(h.lastToast()).toBe('Tick all four criteria to approve, or request changes');
    expect(store.decideReview).not.toHaveBeenCalled();
    [0, 1, 2].forEach((k) => h.c().rs!.rubric[k].toggle(true));
    expect(h.c().rs!.canApprove).toBe(false);
    h.c().rs!.rubric[3].toggle(true);
    expect(h.c().rs!.canApprove).toBe(true);
    h.c().rs!.approve(); await flush(10);
    expect(store.decideReview).toHaveBeenCalledWith('r1', 'approved', [true, true, true, true], '');
    expect(h.lastToast()).toBe('Approved · Kim sees it in Create & share');
    expect(h.state.revChecks).toEqual({});
  });
  it('needs a comment to request changes', async () => {
    const h = cs({ data: d() });
    h.c().rs!.changes();
    expect(h.lastToast()).toBe('Add a comment so Kim knows what to change');
    h.c().rs!.setComment(ev('Name the model at 02:10.'));
    h.c().rs!.changes(); await flush(10);
    expect(store.decideReview).toHaveBeenCalledWith('r1', 'changes', [false, false, false, false], 'Name the model at 02:10.');
    expect(h.lastToast()).toBe('Changes requested · Kim sees your comment in Create & share');
  });
  it('numbers the peers from the policy, since a peer reads only their own row', () => {
    const one = data({ contributions: [contribution({ id: 'r1', author_id: 'u5', status: 'review', step: 1 })], reviews: [review({ contribution_id: 'r1', reviewer_id: 'u1', slot: 2 })] });
    expect(cs({ data: one }).c().rs!.eyebrow).toBe('Reel · Personal growth · L2 · Peer reviewer 2 of 2');
  });
  it('closes a review that is back with its author', () => {
    const h = cs({ data: d(), state: { revSel: 'r2|1|1' } });
    expect(h.c().rs!.open).toBe(false);
    expect(h.c().rs!.doneText).toMatch(/^Another reviewer asked for changes/);
  });
});

describe('View as (read-only)', () => {
  it('writes nothing', async () => {
    const d = data({ contributions: [contribution({ id: 'd1' }), contribution({ id: 'r1', author_id: 'u5', status: 'review', step: 1 })], reviews: [review({ contribution_id: 'r1', reviewer_id: 'u1', rubric: [] })] });
    const h = cs({ data: d, readOnly: true, state: { revChecks: { 'r1|1|1': [true, true, true, true] }, nw: { line: 'Consulting', aud: '', type: 'Reel', title: 'Ok title', dom: 'prof', lvl: '2', stage: 'Analyst', take: 'Fine.', outline: [], sources: [], ai: false, aiNote: '' } } });
    expect(h.c().readOnly).toBe(true);
    h.c().cs!.main(); h.c().nwSubmit(); h.c().nwDraft(); h.c().rs!.approve(); h.c().cs!.third(); h.c().nwDraftAi();
    await flush(10);
    [store.saveDraft, store.submitContribution, store.decideReview, store.removeDraft, store.savePolicy].forEach((f) => expect(f).not.toHaveBeenCalled());
    expect(h.lastToast()).toBe('Viewing Other Person · read-only');
  });
});

describe('Review requirements (admins)', () => {
  it('is only a tab for admins', () => {
    expect(cs().c().tabs.map((t) => t.value)).toEqual(['mine', 'review', 'new']);
    expect(cs({ access: systemAdmin('u1') }).c().tabs.map((t) => t.value)).toEqual(['mine', 'review', 'new', 'rules']);
  });
  it('lets a Domain Admin set requirements within their own lines only', async () => {
    const d = data({ policies: [pol({ lines: ['Audit'] }, 1, true, true), pol({ lines: ['Consulting'], formats: ['Podcast'] }, 1, false, true)] });
    const h = cs({ data: d, access: domainAdmin(['Consulting'], 'u1'), state: { createTab: 'rules' } });
    expect(h.c().policyRows.map((p) => [p.label, p.editable])).toEqual([['Audit', false], ['Consulting · Podcast', true]]);
    expect(h.c().polGroups[0].chips.map((c) => c.value)).toEqual(['Consulting']);
    expect(h.c().polProblem).toBe('Pick at least one value');
    h.c().polGroups[1].chips[0].toggle();
    expect(h.c().polProblem).toBe('Pick at least one of your business lines, and only yours');
    h.c().polAdd();
    expect(store.savePolicy).not.toHaveBeenCalled();
    h.c().polGroups[0].chips[0].toggle();
    expect(h.c().polPreview).toBe('Consulting · Reel');
    h.c().polSet({ peers: '1', expert: false });
    h.c().polAdd(); await flush(10);
    expect(store.savePolicy).toHaveBeenCalledWith({ lines: ['Consulting'], formats: ['Reel'], domains: [], audiences: [], peers: 1, expert: false, quality: true });
    expect(h.lastToast()).toBe('Saved · Consulting · Reel · 1 peer, quality & risk');
    expect(h.state.polForm.lines).toEqual([]);
  });
  it('lets a System Admin change and remove any requirement', async () => {
    const p = pol({ domains: ['reg'] }, 2, true, true);
    const h = cs({ data: data({ policies: [p] }), access: systemAdmin('u1'), state: { createTab: 'rules' } });
    expect(h.c().policyRows[0].label).toBe('Any line · Regulations');
    h.c().policyRows[0].setPeers('0'); await flush(10);
    expect(store.savePolicy).toHaveBeenCalledWith({ ...p, peers: 0 });
    h.c().policyRows[0].remove(); await flush(10);
    expect(store.removePolicy).toHaveBeenCalledWith(p.id);
  });
});

describe('Draft with AI', () => {
  const nw = { line: 'Consulting', aud: '', type: 'Reel', title: 'Pillar Two scope', dom: 'reg', lvl: '2', stage: 'Analyst', take: '', outline: [], sources: [], ai: false, aiNote: '' };
  it('asks for a bundle first', async () => {
    const h = cs({ state: { createTab: 'new', nw } });
    await h.c().nwDraftAi();
    expect(h.lastToast()).toBe('Pick at least one knowledge bundle');
  });
  it('falls back to the scripted outline from retrieved passages, labelled as assisted', async () => {
    const h = cs({ state: { createTab: 'new', nw: { ...nw, title: 'One message per slide', dom: 'pers' }, nwKb: ['B1'] }, data: data() });
    await h.c().nwDraftAi();
    const c = h.c();
    expect(c.nwHasAi).toBe(true);
    expect(c.nwAiNote).toBe('Scripted outline from the passages · no AI in this environment');
    expect(c.nw.take).toMatch(/ \[1\]$/);
    expect(c.nwAiOutline[0].text).toMatch(/\[1\]$/);
    expect(c.nwAiCites[0].text).toMatch(/ · Operating model & cost methods$/);
    expect(h.state.nw.ai).toBe(true);
  });
  it('only offers bundles the author may use: Tax & Legal bundles to Tax & Legal people', () => {
    expect(cs({ state: { createTab: 'new' } }).c().nwBundles.map((b) => b.id)).not.toContain('B2');
    const tl = harness({ access: member('u1'), subject: person({ businessLine: 'Tax & Legal' }), state: { screen: 'create', createTab: 'new', create: data() } });
    expect(tl.vm().create!.nwBundles.map((b) => b.id)).toContain('B2');
  });
  it('says the AI outline is unavailable when the model fails, and the form stays usable', async () => {
    stubWindow({ claude: { complete: vi.fn(async () => { throw new Error('down'); }) } });
    const out = await draftFromPassages(nw, [{ text: 'Groups above €750m are in scope. Minimum rate 15%.', src: 'Guide · B2', score: 1 }], true);
    expect(out.note).toBe('AI outline unavailable · scripted outline from the passages');
    expect(out.outline).toEqual(['Groups above €750m are in scope [1]']);
  });
  it('uses the model\'s JSON when it answers', async () => {
    stubWindow({ claude: { complete: vi.fn(async () => 'Here: {"takeaway":"Check the €750m test first [1]","outline":["Scope [1]","Rate [1]"]}') } });
    const out = await draftFromPassages(nw, [{ text: 'Groups above €750m are in scope.', src: 'Guide · B2', score: 1 }], true);
    expect(out).toEqual({ takeaway: 'Check the €750m test first [1]', outline: ['Scope [1]', 'Rate [1]'], note: 'AI-assisted draft · grounded on keyword-ranked passages · edit it in your own words' });
  });
});
