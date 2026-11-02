// Create & share view-model (FT-CS-*): the three tabs and the admin tab, topic picker and no-grant state, stepper per
// policy, submit / approve / request changes through the store, the badge, View as and the Draft with AI fallback.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
import * as store from './lib/contributionStore';
import { draftFromPassages } from './createVals';
import type { CreateData, Grant } from './logic/contribution';
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
const grant = (topic_kind: Grant['topic_kind'], topic_value: string): Grant => ({ user_id: 'u1', topic_kind, topic_value });
const data = (o: Partial<CreateData> = {}): CreateData => ({ contributions: [], reviews: [], grants: [grant('line', 'Consulting')], policies: [], peers: 3, ...o });
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
    const h = cs({ data: data({ grants: [] }) });
    expect(h.c().canCreate).toBe(false);
    expect(h.c().noGrantText).toMatch(/^You have no creation rights yet\. Ask an admin for creation rights/);
    h.c().setTab('new');
    expect(h.state.createTab).toBe('mine');
    expect(h.lastToast()).toBe('Ask an admin for creation rights first');
    h.c().goNew();
    expect(h.c().tabNew).toBe(false);
  });
  it('falls back to Mine when the New tab is open without rights', () => {
    expect(cs({ data: data({ grants: [] }), state: { createTab: 'new' } }).c().tab).toBe('mine');
  });
});

describe('the New tab', () => {
  const grants = [grant('line', 'Consulting'), grant('format', 'Podcast'), grant('domain', 'reg')];
  it('offers exactly the person\'s grants as topics, the first one chosen', () => {
    const h = cs({ data: data({ grants }), state: { createTab: 'new' } });
    expect(h.c().topicOptions.map((o) => o.label)).toEqual(['Business line · Consulting', 'Format · Podcast', 'Domain · Regulations']);
    expect(h.c().nw.topic).toBe('line|Consulting');
    expect(h.c().newTypes.map((t) => t.label)).toEqual(['Reel', 'Podcast', 'Micro-guide', 'Case write-up']);
    expect(h.c().stageOptions).toHaveLength(7);
  });
  it('lets a format topic fix the type and a domain topic fix the domain', () => {
    const h = cs({ data: data({ grants }), state: { createTab: 'new' } });
    h.c().nwSetTopic(ev('format|Podcast'));
    expect(h.c().nw.type).toBe('Podcast');
    h.c().newTypes[0].pick();
    expect(h.c().nw.type).toBe('Podcast');
    expect(h.lastToast()).toBe('Your topic is Podcast; the format follows it');
    h.c().nwSetTopic(ev('domain|reg'));
    expect(h.c().nw.dom).toBe('reg');
    expect(h.c().domainOptions.map((o) => o.value)).toEqual(['reg']);
  });
  it('runs the content checks live and blocks submit until they pass', () => {
    const h = cs({ state: { createTab: 'new' } });
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
  it('shows the route of the topic\'s policy and warns when peers are short', () => {
    const d = data({ grants: [grant('format', 'Micro-guide'), grant('line', 'Consulting')], policies: [{ topic_kind: 'format', topic_value: 'Micro-guide', peers: 0, expert: false, quality: true }], peers: 1 });
    const h = cs({ data: d, state: { createTab: 'new' } });
    expect(h.c().nwRoute.map((r) => r.name)).toEqual(['Learning team']);
    expect(h.c().nwRouteWarn).toBe('');
    h.c().nwSetTopic(ev('line|Consulting'));
    expect(h.c().nwRoute.map((r) => r.name)).toEqual(['Peer reviewer 1 of 2', 'Peer reviewer 2 of 2', 'Subject-matter expert', 'Learning team']);
    expect(h.c().nwRouteWarn).toMatch(/^Only 1 colleague can peer-review you; this topic needs 2\./);
  });
  it('labels the button Publish when the topic needs no review', () => {
    const d = data({ policies: [{ topic_kind: 'line', topic_value: 'Consulting', peers: 0, expert: false, quality: false }] });
    const h = cs({ data: d, state: { createTab: 'new' } });
    expect(h.c().nwSubmitLabel).toBe('Publish');
    expect(h.c().nwRouteEmpty).toBe(true);
  });
});

describe('submitting', () => {
  const filled = { createTab: 'new', nw: { topic: 'line|Consulting', type: 'Reel', title: 'Pricing lessons', dom: 'prof', lvl: '3', stage: 'Manager', take: 'Price the change, not the hours.', outline: [], sources: [], ai: false, aiNote: '' } };
  it('saves the draft, submits it, reloads and names the reviewers', async () => {
    const h = cs({ state: filled });
    vi.mocked(store.submitContribution).mockImplementation(async () => {
      h.state.create!.contributions.push(contribution({ id: 'new1', title: 'Pricing lessons', status: 'review', step: 1 }));
      h.state.create!.reviews.push(review({ contribution_id: 'new1', reviewer_name: 'Sam Peer' }), review({ contribution_id: 'new1', slot: 2, reviewer_id: 'u3', reviewer_name: 'Alex Peer' }));
      return 'review';
    });
    h.c().nwSubmit(); await flush(10);
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ topic_kind: 'line', topic_value: 'Consulting', type: 'Reel', title: 'Pricing lessons', domain: 'prof', level: 3, audience_stage: 'Manager' }), null);
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
      contributions: [contribution({ id: 'a', status: 'review', step: 3, topic_kind: 'format', topic_value: 'Micro-guide', type: 'Micro-guide', submitted_at: '2026-10-30T09:00:00Z' }), contribution({ id: 'theirs', author_id: 'u5' })],
      reviews: [review({ contribution_id: 'a', step: 1, verdict: 'approved', comment: 'Clear.', decided_at: '2026-10-31T09:00:00Z' }), review({ contribution_id: 'a', step: 3, reviewer_id: 'u4', reviewer_name: 'Lee Quality' }), review({ contribution_id: 'theirs', reviewer_id: 'u1' })],
    });
    const c = cs({ data: d }).c();
    expect(c.contribList.map((x) => x.id)).toEqual(['a']);
    expect(c.cs!.stages).toEqual(['Draft', 'Peer review', 'Quality & risk', 'Published']);
    expect(c.cs!.stage).toBe(2);
    expect(c.cs!.revs.map((r) => [r.name, r.role, r.stLabel])).toEqual([['Sam Peer', 'Peer reviewer', 'Approved'], ['Lee Quality', 'Quality & risk', 'Reviewing']]);
    expect(c.cs!.revs[0].comment).toBe('Clear. ');
    expect(c.cs!.mainLabel).toBe('');
  });
  it('shows a draft with its policy, submit, edit and delete', async () => {
    const d = data({ contributions: [contribution({ id: 'd1' })], policies: [{ topic_kind: 'line', topic_value: 'Consulting', peers: 1, expert: false, quality: true }] });
    const h = cs({ data: d });
    expect(h.c().cs!.stages).toEqual(['Draft', 'Peer review', 'Quality & risk', 'Published']);
    expect(h.c().cs!.draftNote).toMatch(/this topic needs 1 peer, quality & risk\.$/);
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
  it('lets the author edit after changes were requested, with topic, format and domain fixed', () => {
    const d = data({ contributions: [contribution({ id: 'ch', status: 'changes', step: 1, topic_kind: 'format', topic_value: 'Reel' })], grants: [grant('line', 'Consulting')], reviews: [review({ contribution_id: 'ch', verdict: 'changes', comment: 'Shorter.' })] });
    const h = cs({ data: d });
    expect(h.c().cs!.mainLabel).toBe('Edit and resubmit');
    h.c().cs!.main();
    expect(h.c().nw.topic).toBe('format|Reel');
    expect(h.c().topicOptions).toEqual([{ value: 'format|Reel', label: 'Format · Reel' }]);
    expect(h.c().domainOptions.map((o) => o.value)).toEqual(['pers']);
    expect(h.c().nwSubmitLabel).toBe('Resubmit');
    h.c().nwSetTopic(ev('line|Consulting'));
    expect(h.c().nw.topic).toBe('format|Reel');
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
  it('closes a review that is back with its author', () => {
    const h = cs({ data: d(), state: { revSel: 'r2|1|1' } });
    expect(h.c().rs!.open).toBe(false);
    expect(h.c().rs!.doneText).toMatch(/^Another reviewer asked for changes/);
  });
});

describe('View as (read-only)', () => {
  it('writes nothing', async () => {
    const d = data({ contributions: [contribution({ id: 'd1' }), contribution({ id: 'r1', author_id: 'u5', status: 'review', step: 1 })], reviews: [review({ contribution_id: 'r1', reviewer_id: 'u1', rubric: [] })] });
    const h = cs({ data: d, readOnly: true, state: { revChecks: { 'r1|1|1': [true, true, true, true] }, nw: { topic: 'line|Consulting', type: 'Reel', title: 'Ok title', dom: 'prof', lvl: '2', stage: 'Analyst', take: 'Fine.', outline: [], sources: [], ai: false, aiNote: '' } } });
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
  it('lets a Domain Admin set their own line only', async () => {
    const d = data({ policies: [{ topic_kind: 'line', topic_value: 'Audit', peers: 1, expert: true, quality: true }] });
    const h = cs({ data: d, access: domainAdmin(['Consulting'], 'u1'), state: { createTab: 'rules' } });
    expect(h.c().polTopicOptions.map((o) => o.value)).toEqual(['line|Consulting']);
    expect(h.c().policyRows[0].editable).toBe(false);
    h.c().polSet({ peers: '1', expert: false });
    h.c().polAdd(); await flush(10);
    expect(store.savePolicy).toHaveBeenCalledWith({ topic_kind: 'line', topic_value: 'Consulting', peers: 1, expert: false, quality: true });
    expect(h.lastToast()).toBe('Saved · Business line · Consulting · 1 peer, quality & risk');
  });
  it('lets a System Admin change and remove any requirement', async () => {
    const d = data({ policies: [{ topic_kind: 'domain', topic_value: 'reg', peers: 2, expert: true, quality: true }] });
    const h = cs({ data: d, access: systemAdmin('u1'), state: { createTab: 'rules' } });
    h.c().policyRows[0].setPeers('0'); await flush(10);
    expect(store.savePolicy).toHaveBeenCalledWith({ topic_kind: 'domain', topic_value: 'reg', peers: 0, expert: true, quality: true });
    h.c().policyRows[0].remove(); await flush(10);
    expect(store.removePolicy).toHaveBeenCalledWith({ kind: 'domain', value: 'reg' });
  });
});

describe('Draft with AI', () => {
  const nw = { topic: 'line|Consulting', type: 'Reel', title: 'Pillar Two scope', dom: 'reg', lvl: '2', stage: 'Analyst', take: '', outline: [], sources: [], ai: false, aiNote: '' };
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
