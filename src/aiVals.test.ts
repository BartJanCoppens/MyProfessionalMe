// AI connections page view-model (System Admins only) and the honest AI/scripted labels of the live text uses.
// The AI store is mocked; the database rules themselves are in supabase/tests/rls.sql.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/aiStore';
import { loadAiPage, refreshAiLive } from './aiVals';
import { domainAdmin, flush, generalAdmin, harness, member, stubWindow, systemAdmin } from './test/harness';
import type { AiAdmin, AiConnection, AiUse } from './logic/ai';

vi.mock('./lib/aiStore', () => ({
  loadAiAdmin: vi.fn(), loadLiveUses: vi.fn(async () => []), saveConnection: vi.fn(async () => 'c9'), setKey: vi.fn(async () => {}),
  deleteConnection: vi.fn(async () => {}), updateUse: vi.fn(async () => {}), testConnection: vi.fn(), askAi: vi.fn(),
}));

const conn = (over: Partial<AiConnection> = {}): AiConnection => ({ id: 'c1', name: 'Claude', provider: 'anthropic', base_url: null, default_model: 'claude-opus-5-5', region: 'global', key_hint: 'abcd', ...over });
const aiUse = (over: Partial<AiUse> = {}): AiUse => ({ key: 'profile_chat', label: 'Talk it through', description: 'Profile chat', place: 'My profile', kind: 'text', waiting_for: null, admins_only: false, connection_id: 'c1', model: null, enabled: true, preamble: '', daily_limit: 50, ...over });
const admin = (): AiAdmin => ({
  connections: [conn(), conn({ id: 'c2', name: 'Voices', provider: 'elevenlabs', default_model: null, key_hint: null })],
  uses: [aiUse(), aiUse({ key: 'kb_answer', label: 'Test retrieval answer', connection_id: null, admins_only: true }), aiUse({ key: 'avatar_voice', label: 'Avatar voice', kind: 'voice', waiting_for: 'the avatar studio', connection_id: null })],
  usage: { uses: { profile_chat: { today: 3, week: 12 } }, top: [{ name: 'Robin Test', calls: 9 }, { name: 'Kim Other', calls: 1 }] },
});
const page = (state = {}) => harness({ access: systemAdmin(), state: { screen: 'adminAi', aiAdmin: admin(), ...state } });
const ev = (value: string) => ({ target: { value } }) as never;

beforeEach(() => { stubWindow(); vi.clearAllMocks(); vi.mocked(store.loadAiAdmin).mockResolvedValue(admin()); vi.mocked(store.loadLiveUses).mockResolvedValue(['profile_chat']); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('who sees the AI connections page', () => {
  it('only a System Admin gets the nav item and the page', () => {
    expect(page().vm()).toMatchObject({ showAi: true, navAi: true });
    expect(page().vm().ai).not.toBeNull();
    for (const access of [generalAdmin(), domainAdmin(['Audit']), member()]) {
      const h = harness({ access, state: { screen: 'adminAi', aiAdmin: admin() } });
      expect(h.vm().showAi).toBe(false);
      expect(h.vm().ai).toBeNull();
    }
  });
  it('sends anyone else to the map', () => {
    const h = harness({ access: generalAdmin() });
    h.L().go('adminAi');
    expect(h.state.screen).toBe('map');
    const sa = page({ screen: 'map' });
    sa.vm().goAi();
    expect(sa.state.screen).toBe('adminAi');
    expect(sa.vm().headerTitle).toBe('AI connections');
  });
  it('loads the page data for a System Admin only', async () => {
    const h = page({ aiAdmin: null });
    expect(h.vm().ai!.loading).toBe(true);
    await loadAiPage(h.L());
    expect(h.state.aiAdmin).toEqual(admin());
    vi.mocked(store.loadAiAdmin).mockClear();
    await loadAiPage(harness({ access: domainAdmin(['Audit']) }).L());
    expect(store.loadAiAdmin).not.toHaveBeenCalled();
  });
  it('shows a load error with a retry', async () => {
    vi.mocked(store.loadAiAdmin).mockRejectedValueOnce(new Error('permission denied'));
    const h = page({ aiAdmin: null });
    await loadAiPage(h.L());
    expect(h.vm().ai!.error).toBe('permission denied');
    h.vm().ai!.retry(); await flush();
    expect(h.state.aiError).toBeNull();
    expect(h.state.aiAdmin).toEqual(admin());
  });
});

describe('the connections list', () => {
  it('shows each connection with its key hint, never a key, and what it serves', () => {
    const [c1, c2] = page().vm().ai!.connections;
    expect(c1).toMatchObject({ name: 'Claude', provider: 'Anthropic (Claude)', meta: 'api.anthropic.com · default model claude-opus-5-5 · global', keyLabel: 'Key ····abcd', usedBy: 'Serves Talk it through', canTest: true });
    expect(c2).toMatchObject({ keyLabel: 'No key stored', usedBy: 'Serves no use yet', canTest: false, testNote: 'Stored for later · the app does not call it yet' });
    expect(page().vm().ai!.summary).toBe('1 of 3 uses live · 2 connections');
  });
  it('adds a connection, stores its key and clears the key field', async () => {
    const h = page();
    h.vm().ai!.addConnection();
    const f = () => h.vm().ai!.form!;
    expect(f().title).toBe('Add a connection');
    f().setName(ev('Mistral EU')); f().setProvider(ev('openai_compatible')); f().setUrl(ev('https://api.mistral.ai/v1')); f().setModel(ev('mistral-large-latest')); f().setKey(ev('mi-key-123456'));
    expect(f().providerNote).toMatch(/Mistral/);
    await f().save(); await flush();
    expect(store.saveConnection).toHaveBeenCalledWith(expect.objectContaining({ id: null, name: 'Mistral EU', provider: 'openai_compatible', key: 'mi-key-123456' }));
    expect(store.setKey).toHaveBeenCalledWith('c9', 'mi-key-123456');
    expect(h.state.aiForm).toBeNull();
    expect(h.lastToast()).toBe('Added Mistral EU · key stored in the vault');
    expect(store.loadLiveUses).toHaveBeenCalled();
  });
  it('keeps the stored key when the field stays empty, and says what is missing', async () => {
    const h = page();
    h.vm().ai!.connections[0].edit();
    expect(h.vm().ai!.form!.keyLabel).toBe('Replace the key (stored key ends ····abcd)');
    h.vm().ai!.form!.setName(ev(''));
    await h.vm().ai!.form!.save();
    expect(h.lastToast()).toBe('Name the connection');
    h.vm().ai!.form!.setName(ev('Claude EU'));
    await h.vm().ai!.form!.save(); await flush();
    expect(store.saveConnection).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', name: 'Claude EU', key: '' }));
    expect(store.setKey).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Saved Claude EU');
  });
  it('keeps the form, with the saved id, when the key is refused', async () => {
    vi.mocked(store.setKey).mockRejectedValueOnce(new Error('That does not look like an API key'));
    const h = page();
    h.vm().ai!.addConnection();
    h.vm().ai!.form!.setName(ev('New')); h.vm().ai!.form!.setKey(ev('sk-something-long'));
    await h.vm().ai!.form!.save(); await flush();
    expect(h.lastToast()).toBe('That does not look like an API key');
    expect(h.state.aiForm).toMatchObject({ id: 'c9', name: 'New' });
    expect(h.state.aiBusy).toBe(false);
  });
  it('tests a connection and shows the provider\'s answer', async () => {
    vi.mocked(store.testConnection).mockResolvedValueOnce({ ok: true, model: 'claude-opus-5-5' }).mockResolvedValueOnce({ ok: false, error: 'The provider answered 401: invalid x-api-key' });
    const h = page();
    const p = h.vm().ai!.connections[0].test();
    expect(h.vm().ai!.connections[0].testing).toBe(true);
    await p;
    expect(h.vm().ai!.connections[0]).toMatchObject({ testText: 'Connection works · claude-opus-5-5', testTone: 'green' });
    await h.vm().ai!.connections[0].test();
    expect(h.vm().ai!.connections[0]).toMatchObject({ testText: 'The provider answered 401: invalid x-api-key', testTone: 'orange' });
    vi.mocked(store.testConnection).mockRejectedValueOnce(new Error('Only a System Admin can test a connection'));
    await h.vm().ai!.connections[0].test();
    expect(h.vm().ai!.connections[0].testText).toBe('Only a System Admin can test a connection');
  });
  it('removes a connection after confirming', async () => {
    const h = page();
    h.vm().ai!.connections[0].remove();
    expect(h.vm().ai!.connections[0].confirming).toBe(true);
    h.vm().ai!.connections[0].cancelRemove();
    expect(h.vm().ai!.connections[0].confirming).toBe(false);
    h.vm().ai!.connections[0].remove();
    h.vm().ai!.connections[0].confirmRemove(); await flush(10);
    expect(store.deleteConnection).toHaveBeenCalledWith('c1');
    expect(h.lastToast()).toBe('Removed Claude and its key · Talk it through now use the scripted reply');
  });
});

describe('the uses list', () => {
  it('groups uses by kind with their status and only fitting connections', () => {
    const g = page().vm().ai!.groups;
    expect(g.map((x) => x.label)).toEqual(['Text and assistants', 'Voices']);
    const [chat, kb] = g[0].uses;
    expect(chat).toMatchObject({ statusLabel: 'Live', status: 'accepted', connValue: 'c1', modelPlaceholder: 'claude-opus-5-5 (default)' });
    expect(kb).toMatchObject({ statusLabel: 'Scripted · no connection', adminsOnly: 'Admins only' });
    expect(chat.connOptions.map((o) => o.label)).toEqual(['No connection', 'Claude']);
    expect(g[1].uses[0]).toMatchObject({ statusLabel: 'Waiting for the avatar studio', waiting: true });
    expect(g[1].uses[0].connOptions.map((o) => o.label)).toEqual(['No connection', 'Voices (no key)']);
  });
  it('sets the connection, the model and on/off of a use', async () => {
    const h = page();
    const kb = () => h.vm().ai!.groups[0].uses[1];
    kb().setConn(ev('c1')); await flush(10);
    expect(store.updateUse).toHaveBeenCalledWith('kb_answer', { connection_id: 'c1' });
    expect(h.lastToast()).toBe('Test retrieval answer · uses Claude');
    kb().saveModel({ target: { value: ' claude-haiku-5-5 ' } } as never); await flush(10);
    expect(store.updateUse).toHaveBeenCalledWith('kb_answer', { model: 'claude-haiku-5-5' });
    vi.mocked(store.updateUse).mockClear();
    kb().saveModel({ target: { value: '' } } as never);
    expect(store.updateUse).not.toHaveBeenCalled();
    kb().toggle(); await flush(10);
    expect(store.updateUse).toHaveBeenCalledWith('kb_answer', { enabled: false });
    expect(h.lastToast()).toBe('Test retrieval answer switched off');
  });
  it('does one write at a time', async () => {
    let done!: () => void;
    vi.mocked(store.updateUse).mockImplementationOnce(() => new Promise<void>((r) => { done = r; }));
    const h = page();
    h.vm().ai!.groups[0].uses[0].toggle();
    expect(h.vm().ai!.busy).toBe(true);
    h.vm().ai!.groups[0].uses[1].toggle();
    expect(store.updateUse).toHaveBeenCalledTimes(1);
    done(); await flush(10);
    expect(h.state.aiBusy).toBe(false);
  });
});

describe('labels and the live path in the app', () => {
  it('learns the live uses, and keeps scripted replies when that fails', async () => {
    const h = harness();
    await refreshAiLive(h.L());
    expect(h.state.aiLive).toEqual(['profile_chat']);
    vi.mocked(store.loadLiveUses).mockRejectedValueOnce(new Error('offline'));
    await refreshAiLive(h.L());
    expect(h.state.aiLive).toEqual([]);
  });
  it('answers the profile chat through the connection and says so', async () => {
    vi.mocked(store.askAi).mockResolvedValueOnce('{"reply":"Tell me more.","interests":[],"ambition":null}');
    const h = harness({ config: { liveAssistant: true }, state: { aiLive: ['profile_chat'] } });
    expect(h.vm().chatSub).toMatch(/^AI assistant · /);
    await h.L().send('I like data');
    expect(store.askAi).toHaveBeenCalledWith('profile_chat', expect.objectContaining({ max_tokens: 600, messages: [{ role: 'user', content: 'I like data' }] }));
    expect(h.state.chat.at(-1)).toEqual({ role: 'assistant', text: 'Tell me more.' });
    expect(h.vm().chatSub).toMatch(/^AI assistant · /);
  });
  it('falls back to the scripted reply and says the AI did not answer', async () => {
    vi.mocked(store.askAi).mockRejectedValueOnce(new Error('The provider answered 401'));
    const h = harness({ config: { liveAssistant: true }, state: { aiLive: ['profile_chat'] } });
    await h.L().send('Where could I be in five years?');
    expect(h.state.chat.at(-1)!.text).toMatch(/^Picture a normal week/);
    expect(h.vm().chatSub).toMatch(/^Scripted assistant · AI did not answer · /);
  });
  it('labels a use without a connection as scripted, without calling anything', async () => {
    const h = harness({ access: systemAdmin(), config: { liveAssistant: true }, state: { screen: 'adminMap', aiLive: ['profile_chat'] } });
    expect(h.vm().chatSub).toMatch(/^AI assistant/);
    expect(h.vm().cpMode).toBe('Scripted assistant');
    await h.L().askCp('Where does a learning arrive twice?');
    expect(store.askAi).not.toHaveBeenCalled();
    expect(h.state.cpReply).toMatch(/twice|Nothing arrives twice/);
  });
  it('sends the copilot through its connection when live', async () => {
    vi.mocked(store.askAi).mockResolvedValueOnce('{"reply":"Add negotiation.","ops":[]}');
    const h = harness({ access: systemAdmin(), config: { liveAssistant: true }, state: { screen: 'adminMap', aiLive: ['curriculum_copilot'] } });
    await h.L().askCp('What do Energy seniors still miss?');
    expect(vi.mocked(store.askAi).mock.calls[0][0]).toBe('curriculum_copilot');
    expect(h.state.cpReply).toBe('Add negotiation.');
    expect(h.vm().cpMode).toBe('AI assistant');
  });
});

describe('guard rails on the page and in the app', () => {
  it('shows calls per use and the heaviest users, never content', () => {
    const ai = page().vm().ai!;
    expect(ai.groups[0].uses[0].usageLine).toBe('3 calls today · 12 in 7 days · limit 50 a day per person');
    expect(ai.groups[0].uses[1].usageLine).toBe('0 calls today · 0 in 7 days · limit 50 a day per person');
    expect(ai.groups[1].uses[0].usageLine).toBe('');
    expect(ai.usageTop).toEqual([{ name: 'Robin Test', calls: '9 calls' }, { name: 'Kim Other', calls: '1 call' }]);
  });
  it('edits a use\'s fixed instruction and daily limit', async () => {
    const h = page();
    expect(h.vm().ai!.groups[0].uses[0].instruction).toBe('No fixed instruction');
    h.vm().ai!.groups[0].uses[0].editInstruction();
    const e = () => h.vm().ai!.useEdit!;
    expect(e()).toMatchObject({ title: 'Talk it through · instruction and limit', limit: '50', preamble: '' });
    e().setLimit(ev('lots'));
    await e().save();
    expect(h.lastToast()).toBe('The daily limit is a whole number from 0 to 10000');
    e().setLimit(ev('20')); e().setPreamble(ev(' Only discuss learning. '));
    await e().save(); await flush();
    expect(store.updateUse).toHaveBeenCalledWith('profile_chat', { preamble: 'Only discuss learning.', daily_limit: 20 });
    expect(h.state.aiUseEdit).toBeNull();
    expect(h.lastToast()).toBe('Talk it through · instruction and daily limit saved');
  });
  it('keeps the editor open when the save is refused', async () => {
    vi.mocked(store.updateUse).mockRejectedValueOnce(new Error('Only a System Admin can change AI uses'));
    const h = page();
    h.vm().ai!.groups[0].uses[0].editInstruction();
    await h.vm().ai!.useEdit!.save(); await flush();
    expect(h.state.aiUseEdit).not.toBeNull();
    expect(h.lastToast()).toBe('Only a System Admin can change AI uses');
  });
  it('says when the daily limit is reached and gives the scripted reply', async () => {
    const msg = 'Daily AI limit reached (50 a day per person for this use); the scripted reply is used until tomorrow (UTC)';
    vi.mocked(store.askAi).mockRejectedValueOnce(new Error(msg));
    const h = harness({ config: { liveAssistant: true }, state: { aiLive: ['profile_chat'] } });
    await h.L().send('Where could I be in five years?');
    expect(h.toasts()).toContain(msg);
    expect(h.state.chat.at(-1)!.text).toMatch(/^Picture a normal week/);
    expect(h.vm().chatSub).toMatch(/^Scripted assistant · AI did not answer/);
  });
});
