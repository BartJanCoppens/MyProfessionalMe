// Profile: ambitions, interests, avatar, the "Talk it through" assistant and its proposals; projects and tests (FT-PRO-*).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { AV_SWATCHES } from './data';
import * as learner from './lib/learnerStore';
import { flush, harness, person, stubWindow, withProgress } from './test/harness';

vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(async () => {}), addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));

const store = new Map<string, string>();
const localStorageStub = { getItem: (k: string) => store.get(k) ?? null, setItem: vi.fn((k: string, v: string) => { store.set(k, v); }), removeItem: vi.fn((k: string) => { store.delete(k); }) };
beforeEach(() => { stubWindow(); vi.stubGlobal('localStorage', localStorageStub); store.clear(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

const input = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement>;
const key = (k: string) => ({ key: k }) as KeyboardEvent<HTMLInputElement>;
const ambition = { id: '7', text: 'Lead a team', horizon: '3 years', doms: ['lead', 'pers'], from: 'Assistant conversation · 1 Oct 2026' };
const known = person({ counsellor: { id: 'c1', name: 'Sam Coach' }, data: withProgress({}, { ambitions: [ambition], interests: [{ label: 'Data analysis', dom: 'tec' }, { label: 'Writing', dom: 'pers' }] }) });

describe('ambitions and interests', () => {
  it('list what the person saved, with horizon, source and domain names', () => {
    const vm = harness({ subject: known }).vm();
    expect(vm.ambitions).toEqual([expect.objectContaining({ id: '7', text: 'Lead a team', meta: '3 years · Assistant conversation · 1 Oct 2026', doms: [{ key: 'lead', label: 'Leadership' }, { key: 'pers', label: 'Personal growth' }] })]);
    expect(vm.interests.map((i) => [i.label, i.dom])).toEqual([['Data analysis', 'Technology'], ['Writing', 'Personal growth']]);
  });
  it('remove an ambition and an interest', async () => {
    const h = harness({ subject: known });
    h.vm().ambitions[0].remove();
    await flush();
    expect(learner.removeAmbition).toHaveBeenCalledWith('7');
    expect(h.lastToast()).toBe('Ambition removed');
    h.vm().interests[1].remove();
    await flush();
    expect(learner.removeInterest).toHaveBeenCalledWith('u1', 'Writing');
    expect(h.lastToast()).toBe('Interest removed');
    expect(h.reloadSubject).toHaveBeenCalledTimes(2);
  });
  it('are empty for a newcomer', () => {
    const vm = harness().vm();
    expect(vm.ambitions).toEqual([]);
    expect(vm.interests).toEqual([]);
  });
});

describe('the assistant greeting', () => {
  it('counts what is on file', () => {
    expect(harness({ subject: known }).vm().chat[0].text).toBe('I help you put your interests and ambitions into words. Nothing is saved until you confirm it. You have 1 ambition and 2 interests on file. What kind of work gave you the most energy this year?');
    expect(harness().vm().chat[0].text).toBe('I help you put your interests and ambitions into words. Nothing is saved until you confirm it. What kind of work gave you the most energy this year?');
  });
  it('says the assistant is scripted outside Claude Design', () => {
    expect(harness().vm().chatSub).toBe('Scripted assistant · reads your projects and profiles · saves nothing until you confirm');
    stubWindow({ claude: { complete: async () => '' } });
    expect(harness({ config: { liveAssistant: true } }).vm().chatSub).toMatch(/^AI assistant/);
  });
});

describe('the scripted assistant', () => {
  const reply = async (text: string, subject = person()) => {
    const h = harness({ subject });
    await h.L().send(text);
    return h;
  };
  it('answers the five-years prompt without a proposal', async () => {
    const h = await reply('Where could I be in five years?');
    expect(h.state.chat.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(h.state.chat[1].text).toMatch(/^Picture a normal week five years from now/);
    expect(h.state).toMatchObject({ chatFor: 'u1', chatBusy: false, proposal: null, chatInput: '' });
  });
  it('proposes an energy-transition ambition', async () => {
    const h = await reply('I enjoyed the energy client most');
    expect(h.state.proposal).toEqual({ interests: [], ambition: { text: 'Work mainly with energy-transition clients', horizon: '3 years', domains: ['ind', 'reg', 'tec'] } });
    expect(h.vm()).toMatchObject({ hasProposal: true, proposalItems: [{ kind: 'Ambition', text: 'Work mainly with energy-transition clients · 3 years' }] });
  });
  it('proposes an interest from a keyword, unless it is already known', async () => {
    const h = await reply('I love working with data');
    expect(h.state.proposal).toEqual({ interests: [{ label: 'Data analysis', domain: 'tec' }], ambition: null });
    expect(h.vm().proposalItems).toEqual([{ kind: 'Interest', text: 'Data analysis · Technology' }]);
    const k = await reply('I love working with data', known);
    expect(k.state.proposal).toBeNull();
    expect(k.state.chat[1].text).toMatch(/^Noted\./);
  });
  it('talks about evaluations', async () => {
    expect((await reply('What do my evaluations say?')).state.chat[1].text).toMatch(/^No project evaluations are on file yet/);
  });
  it('ignores an empty message and a message while busy', async () => {
    const h = harness();
    await h.L().send('   ');
    expect(h.patches).toEqual([]);
    const busy = harness({ state: { chatBusy: true } });
    await busy.L().send('hello');
    expect(busy.patches).toEqual([]);
  });
  it('sends on Enter and from the prompt chips', async () => {
    const h = harness({ state: { chatInput: 'tell me about coaching' } });
    h.vm().chatKey(key('a'));
    expect(h.patches).toEqual([]);
    h.vm().chatKey(key('Enter'));
    await flush();
    expect(h.state.proposal).toEqual({ interests: [{ label: 'Coaching others', domain: 'lead' }], ambition: null });
    const p = harness();
    expect(p.vm().chatPrompts.map((c) => c.label)).toEqual(['Where could I be in five years?', 'I enjoyed the energy client most', 'What do my evaluations say?']);
    p.vm().chatPrompts[1].send();
    await flush();
    expect(p.state.proposal!.ambition!.text).toBe('Work mainly with energy-transition clients');
  });
  it('types into the chat box', () => {
    const h = harness();
    h.vm().setChatInput(input('hi'));
    expect(h.state.chatInput).toBe('hi');
  });
});

describe('the live assistant', () => {
  it('uses the model reply and drops interests in unknown domains', async () => {
    const complete = vi.fn(async () => 'Sure. {"reply":"Noted, tax tech.","interests":[{"label":"Tax technology","domain":"reg"},{"label":"Gardening","domain":"garden"}],"ambition":null}');
    stubWindow({ claude: { complete } });
    const h = harness({ config: { liveAssistant: true } });
    await h.L().send('I like tax tech');
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 600, messages: [{ role: 'user', content: 'I like tax tech' }] }));
    expect(h.state.chat[1].text).toBe('Noted, tax tech.');
    expect(h.state.proposal).toEqual({ interests: [{ label: 'Tax technology', domain: 'reg' }], ambition: null });
  });
  it('falls back to the scripted reply when the model fails or returns no JSON', async () => {
    stubWindow({ claude: { complete: async () => { throw new Error('offline'); } } });
    const a = harness({ config: { liveAssistant: true } });
    await a.L().send('five years from now?');
    expect(a.state.chat[1].text).toMatch(/^Picture a normal week/);
    stubWindow({ claude: { complete: async () => 'no json here' } });
    const b = harness({ config: { liveAssistant: true } });
    await b.L().send('five years from now?');
    expect(b.state.chat[1].text).toMatch(/^Picture a normal week/);
  });
  it('is not called when the live prop is off', async () => {
    const complete = vi.fn(async () => '{"reply":"x"}');
    stubWindow({ claude: { complete } });
    await harness().L().send('hello');
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('saving a proposal', () => {
  it('saves a dated ambition with known domains and only new interests, then shows the ambitions cloud', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
    const proposal = { ambition: { text: 'Run a practice', domains: ['lead', 'zzz'] }, interests: [{ label: 'data analysis', domain: 'tec' }, { label: 'Negotiation', domain: 'prof' }] };
    const h = harness({ subject: known, state: { chatFor: 'u1', proposal, clouds: { proj: true, pers: true, amb: false } } });
    h.vm().saveProposal();
    await flush(10);
    expect(learner.addAmbition).toHaveBeenCalledWith('u1', { text: 'Run a practice', horizon: '3 years', doms: ['lead'], from: 'Assistant conversation · 1 Nov 2026' });
    expect(learner.addInterest).toHaveBeenCalledTimes(1);
    expect(learner.addInterest).toHaveBeenCalledWith('u1', { label: 'Negotiation', dom: 'prof' });
    expect(h.state.proposal).toBeNull();
    expect(h.state.clouds.amb).toBe(true);
    expect(h.lastToast()).toBe('Saved to your profile · the ambitions cloud on your growth map now reflects it');
  });
  it('does nothing for a proposal made for someone else', () => {
    const h = harness({ state: { chatFor: 'other', proposal: { interests: [{ label: 'X', domain: 'tec' }], ambition: null } } });
    h.vm().saveProposal();
    expect(learner.addInterest).not.toHaveBeenCalled();
    expect(h.patches).toEqual([]);
  });
  it('drops a proposal', () => {
    const h = harness({ state: { chatFor: 'u1', proposal: { interests: [], ambition: { text: 'X' } } } });
    h.vm().dropProposal();
    expect(h.state.proposal).toBeNull();
  });
});

describe('the avatar', () => {
  it('uses initials from the name and the ink colour until the person picks their own', () => {
    const vm = harness().vm();
    expect(vm).toMatchObject({ avatarInitials: 'RT', avatarBg: '#1a1d18', avatarFg: '#fff', avatarPhoto: null, uploadLabel: 'Upload a photo' });
    const own = harness({ subject: person({ data: withProgress({}, { prefs: { initials: 'ZZ', color: '#86BC25' } }) }) }).vm();
    expect(own).toMatchObject({ avatarInitials: 'ZZ', avatarBg: '#86BC25', avatarFg: '#10180a' });
    expect(own.avatarSwatches.find((s) => s.bg === '#86BC25')!.ring).toBe('0 0 0 2px #1a1d18');
  });
  it('saves two upper-case initials', async () => {
    const h = harness();
    h.vm().setInitials(input('abc'));
    await flush();
    expect(learner.savePrefs).toHaveBeenCalledWith('u1', { initials: 'AB', color: undefined });
    expect(h.vm().avatarInitials).toBe('AB');
  });
  it('saves a colour from the swatches', () => {
    const h = harness();
    expect(h.vm().avatarSwatches.map((s) => s.label)).toEqual(AV_SWATCHES.map((w) => w[2]));
    h.vm().avatarSwatches[2].pick();
    expect(learner.savePrefs).toHaveBeenCalledWith('u1', { initials: undefined, color: '#2f7fc1' });
    expect(h.vm().avatarBg).toBe('#2f7fc1');
  });
  it('shows the error when the colour does not save', async () => {
    vi.mocked(learner.savePrefs).mockRejectedValueOnce(new Error('denied'));
    const h = harness();
    h.vm().avatarSwatches[1].pick();
    await flush();
    expect(h.lastToast()).toBe('denied');
  });
  it('keeps a photo in this browser only and removes it', () => {
    const h = harness();
    h.L().setAvatar({ photo: 'data:image/jpeg;base64,AAA' });
    expect(localStorageStub.setItem).toHaveBeenCalledWith('mpm-avatar:u1', 'data:image/jpeg;base64,AAA');
    expect(learner.savePrefs).not.toHaveBeenCalled();
    expect(h.vm()).toMatchObject({ avatarPhoto: 'data:image/jpeg;base64,AAA', uploadLabel: 'Change photo' });
    h.vm().removePhoto();
    expect(localStorageStub.removeItem).toHaveBeenCalledWith('mpm-avatar:u1');
    expect(h.vm().avatarPhoto).toBeNull();
  });
  it('warns when the photo is too large to keep', () => {
    localStorageStub.setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError'); });
    const h = harness();
    h.L().setAvatar({ photo: 'data:big' });
    expect(h.lastToast()).toBe('Photo too large to keep after reload');
  });
  it('ignores an avatar edit made for another person', () => {
    expect(harness({ state: { avatarEdit: { userId: 'other', initials: 'QQ' } } }).vm().avatarInitials).toBe('RT');
  });
  it('opens the file picker', () => {
    const h = harness();
    const click = vi.fn();
    h.refs.file.current = { click } as unknown as HTMLInputElement;
    h.vm().pickAvatarFile();
    expect(click).toHaveBeenCalled();
  });
  it('does nothing when the file picker is closed without a file', () => {
    const h = harness();
    const target = { files: null, value: 'x' };
    h.vm().onAvatarFile({ target } as unknown as ChangeEvent<HTMLInputElement>);
    expect(target.value).toBe('');
    expect(h.patches).toEqual([]);
  });
});

describe('projects and personality tests', () => {
  const project = { id: 'P4', client: 'Northwind', name: 'Pillar Two readiness', role: 'Engagement director', period: 'Mar–Jun 2026', hours: 210, lead: 'Kato Laurent', evaluator: 'Kato Laurent',
    evalDate: '2 Jul 2026', overall: 'Exceeds expectations', summary: 'Readiness review.', dims: [['Leadership', 2, 'Clear']] as [string, number, string][], quote: 'Calm under pressure.', advice: [['L37', 'Tell the story first.']] as [string, string][] };
  const pending = { ...project, id: 'P5', client: 'Contoso', dims: null, overall: '', evalDate: '', quote: '', advice: [] };
  const test = { id: 'T2', name: 'Four Colours', provider: 'Insights', date: 'Sep 2026', headline: 'Fiery red first', unit: '%', bars: [['Red', 48, '#c0392b']] as [string, number, string][], reading: 'Direct.', sugg: [['L10', 'Slow down to listen.']] as [string, string][] };
  const theirs = (readOnly: boolean) => person({ readOnly, counsellor: { id: 'c1', name: 'Sam Coach' }, data: withProgress({}, { projects: [project, pending], tests: [test] }) });
  const chip = (vm: ReturnType<ReturnType<typeof harness>['vm']>, key: string) => vm.cloudChips.find((c) => c.key === key)!.count;
  it('have nothing for a newcomer', () => {
    const vm = harness().vm();
    expect(vm.projList).toEqual([]);
    expect(vm.pr).toBeNull();
    expect(vm.tests).toEqual([]);
    expect(vm.projLead).toMatch(/^0 engagements · 0 evaluated/);
  });
  it('come from the person: projects with their evaluation advice feed the projects cloud, results the personality cloud', () => {
    const vm = harness({ subject: theirs(false) }).vm();
    expect(vm.projList.map((p) => p.client)).toEqual(['Northwind', 'Contoso']);
    expect(vm.projCount).toBe('2');
    expect(vm.projLead).toMatch(/^2 engagements · 1 evaluated/);
    expect(vm.pr!.advice.map((a) => a.id)).toEqual(['L37']);
    expect(vm.tests.map((t) => t.headline)).toEqual(['Fiery red first']);
    expect(chip(vm, 'proj')).toBe('1');
    expect(chip(vm, 'pers')).toBe('1');
  });
  it('keep personality results private in View as, while projects show like the rest of the formal track', () => {
    const vm = harness({ subject: theirs(true) }).vm();
    expect(vm.projList).toHaveLength(2);
    expect(chip(vm, 'proj')).toBe('1');
    expect(vm.tests).toEqual([]);
    expect(chip(vm, 'pers')).toBe('0');
  });
  it('say a pending evaluation is requested from its evaluator', () => {
    const h = harness({ subject: theirs(false), state: { projSel: 'P5' } });
    expect(h.vm().pr!.pendingText).toBe('Evaluation requested from Kato Laurent. Its advice joins your projects cloud once it is submitted.');
  });
  it('explain the prototype actions', () => {
    const h = harness();
    h.vm().requestEval();
    expect(h.lastToast()).toMatch(/^Prototype: sends an evaluation request/);
    h.vm().addTest();
    expect(h.lastToast()).toMatch(/^Prototype: upload a report or enter results/);
  });
});

describe('asking the counsellor', () => {
  it('names the counsellor, or says none is assigned', () => {
    const h = harness({ subject: known });
    expect(h.vm().askLabel).toBe('Ask Sam');
    h.vm().toastHelp();
    expect(h.lastToast()).toBe('Prototype: opens a message to Sam Coach, your counsellor');
    const n = harness();
    expect(n.vm().askLabel).toBe('Ask your counsellor');
    n.vm().toastHelp();
    expect(n.lastToast()).toBe('No counsellor yet · an admin can assign one in User management');
  });
  it('clears a toast after a few seconds', () => {
    vi.useFakeTimers();
    const h = harness();
    h.L().say('hello');
    expect(h.state.toast).toBe('hello');
    vi.advanceTimersByTime(2800);
    expect(h.state.toast).toBeNull();
  });
});
