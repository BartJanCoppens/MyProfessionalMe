// The single AI path of the app (src/lib/ai.ts) and the AI store (src/lib/aiStore.ts): the fallback order
// Claude Design → ai edge function (live uses only) → scripted, and what the store sends to Supabase. Supabase is a fake.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canComplete, complete } from './ai';
import { askAi, deleteConnection, loadAiAdmin, loadLiveUses, saveConnection, setKey, testConnection, updateUse } from './aiStore';
import { db, has, op } from '../test/fakeSupabase';
import { blankForm } from '../logic/ai';

const req = { system: 'S', messages: [{ role: 'user' as const, content: 'Q' }], max_tokens: 100 };
const live = { enabled: true, live: ['profile_chat'] };

beforeEach(() => { db.reset(); vi.stubGlobal('window', {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('complete: the fallback order', () => {
  it('uses Claude Design first, even when the use is live', async () => {
    const design = vi.fn(async () => 'from design');
    vi.stubGlobal('window', { claude: { complete: design } });
    const ask = vi.fn(async () => 'from connection');
    expect(await complete('profile_chat', req, { ...live, ask })).toEqual({ text: 'from design', via: 'design' });
    expect(design).toHaveBeenCalledWith(req);
    expect(ask).not.toHaveBeenCalled();
  });
  it('calls the ai function for a live use outside Claude Design', async () => {
    const ask = vi.fn(async () => 'from connection');
    expect(await complete('profile_chat', req, { ...live, ask })).toEqual({ text: 'from connection', via: 'connection' });
    expect(ask).toHaveBeenCalledWith('profile_chat', req);
  });
  it('returns null (scripted) for a use that is not live, without calling anything', async () => {
    const ask = vi.fn(async () => 'x');
    expect(await complete('kb_answer', req, { ...live, ask })).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });
  it('returns null when switched off with ?live=off', async () => {
    vi.stubGlobal('window', { claude: { complete: vi.fn(async () => 'x') } });
    expect(await complete('profile_chat', req, { enabled: false, live: ['profile_chat'] })).toBeNull();
  });
  it('returns null when a source fails, and never falls through to the other', async () => {
    const ask = vi.fn(async () => 'x');
    vi.stubGlobal('window', { claude: { complete: vi.fn(async () => { throw new Error('offline'); }) } });
    expect(await complete('profile_chat', req, { ...live, ask })).toBeNull();
    expect(ask).not.toHaveBeenCalled();
    vi.stubGlobal('window', {});
    expect(await complete('profile_chat', req, { ...live, ask: vi.fn(async () => { throw new Error('502'); }) })).toBeNull();
  });
  it('gives up after the timeout', async () => {
    expect(await complete('profile_chat', req, { ...live, timeoutMs: 5, ask: () => new Promise<string>(() => {}) })).toBeNull();
  });
  it('says beforehand whether AI would answer', () => {
    expect(canComplete('profile_chat', live)).toBe(true);
    expect(canComplete('kb_answer', live)).toBe(false);
    expect(canComplete('profile_chat', { enabled: false, live: ['profile_chat'] })).toBe(false);
    vi.stubGlobal('window', { claude: { complete: async () => '' } });
    expect(canComplete('kb_answer', live)).toBe(true);
  });
  it('reaches the ai edge function through the store by default', async () => {
    db.client.functions.invoke.mockImplementation(async () => ({ data: { text: 'Hello' }, error: null }));
    expect(await complete('profile_chat', req, live)).toEqual({ text: 'Hello', via: 'connection' });
    expect(db.client.functions.invoke).toHaveBeenCalledWith('ai', { body: { use: 'profile_chat', ...req } });
  });
});

describe('the AI store', () => {
  it('asks the ai function and reads its error message', async () => {
    db.client.functions.invoke.mockImplementation(async () => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: 'This AI use is not live' }), { status: 409 }) } }));
    await expect(askAi('kb_answer', req)).rejects.toThrow('This AI use is not live');
    db.client.functions.invoke.mockImplementation(async () => ({ data: {}, error: null }));
    await expect(askAi('kb_answer', req)).rejects.toThrow('The AI function returned no text');
  });
  it('tests a connection through the ai function', async () => {
    db.client.functions.invoke.mockImplementation(async () => ({ data: { ok: true, model: 'm1' }, error: null }));
    expect(await testConnection('c1')).toEqual({ ok: true, model: 'm1' });
    expect(db.client.functions.invoke).toHaveBeenCalledWith('ai', { body: { action: 'test', connection_id: 'c1' } });
  });
  it('loads connections without any key column, and the uses in order', async () => {
    db.answer((c) => ({ data: c.table === 'ai_connections' ? [{ id: 'c1' }] : c.table === 'rpc:ai_usage_summary' ? { uses: { profile_chat: { today: 1, week: 2 } } } : [{ key: 'profile_chat' }] }));
    expect(await loadAiAdmin()).toEqual({ connections: [{ id: 'c1' }], uses: [{ key: 'profile_chat' }], usage: { uses: { profile_chat: { today: 1, week: 2 } }, top: [] } });
    const sel = db.on('ai_connections')[0].steps[0][1][0] as string;
    expect(sel).toContain('key_hint');
    expect(sel).not.toContain('secret');
    expect(has(db.on('ai_uses')[0], 'order', 'sort')).toBe(true);
  });
  it('throws a load error', async () => {
    db.answer(() => ({ error: { message: 'permission denied' } }));
    await expect(loadAiAdmin()).rejects.toThrow('permission denied');
    await expect(loadLiveUses()).rejects.toThrow('permission denied');
  });
  it('reads the live uses', async () => {
    db.answer((c) => ({ data: c.table === 'rpc:ai_live_uses' ? ['profile_chat'] : null }));
    expect(await loadLiveUses()).toEqual(['profile_chat']);
  });
  it('adds and edits a connection without its key, and stores the key on its own', async () => {
    db.answer(() => ({ data: [{ id: 'c9' }] }));
    const f = { ...blankForm(), name: ' Mistral EU ', provider: 'openai_compatible' as const, base_url: 'https://api.mistral.ai/v1', key: 'secret-key-1234' };
    expect(await saveConnection(f)).toBe('c9');
    const ins = db.on('ai_connections')[0];
    expect(ins.steps[0]).toEqual(['insert', [{ name: 'Mistral EU', provider: 'openai_compatible', base_url: 'https://api.mistral.ai/v1', default_model: null, region: null }]]);
    expect(JSON.stringify(ins.steps)).not.toContain('secret-key');
    await saveConnection({ ...f, id: 'c9' });
    expect(op(db.on('ai_connections')[1])).toBe('update');
    expect(has(db.on('ai_connections')[1], 'eq', 'id', 'c9')).toBe(true);
    await setKey('c9', ' secret-key-1234 ');
    expect(db.on('rpc:ai_set_key')[0].steps[0]).toEqual(['args', [{ p_connection: 'c9', p_key: 'secret-key-1234' }]]);
  });
  it('says when RLS refused a write', async () => {
    db.answer(() => ({ data: [] }));
    await expect(saveConnection({ ...blankForm(), name: 'X' })).rejects.toThrow('Only a System Admin can change AI connections');
    await expect(deleteConnection('c1')).rejects.toThrow('Only a System Admin can remove AI connections');
    await expect(updateUse('kb_answer', { enabled: false })).rejects.toThrow('Only a System Admin can change AI uses');
  });
  it('updates a use', async () => {
    db.answer(() => ({ data: [{ key: 'kb_answer' }] }));
    await updateUse('kb_answer', { connection_id: 'c1', model: null });
    expect(db.on('ai_uses')[0].steps[0]).toEqual(['update', [{ connection_id: 'c1', model: null }]]);
  });
});
