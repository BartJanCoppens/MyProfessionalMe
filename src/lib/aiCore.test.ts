// The pure core of the `ai` edge function (supabase/functions/ai/core.ts): request checks and caps, provider
// requests for Anthropic and OpenAI-compatible services, reply and error parsing, and that the key never leaks.
import { describe, expect, it, vi } from 'vitest';
import { ANTHROPIC_MIN_TOKENS, ANTHROPIC_VERSION, buildRequest, callProvider, LIMITS, parseReply, readAsk, scrub, TEST_ASK } from '../../supabase/functions/ai/core.ts';
import type { Target } from '../../supabase/functions/ai/core.ts';

const user = (content: string) => ({ role: 'user', content });
const claude: Target = { provider: 'anthropic', baseUrl: null, model: 'claude-test', key: 'sk-ant-secret-1234' };
const mistral: Target = { provider: 'openai_compatible', baseUrl: 'https://api.mistral.ai/v1/', model: 'mistral-large-latest', key: 'mi-secret-5678' };

describe('readAsk', () => {
  it('accepts a use, an optional system prompt and messages, and defaults max_tokens', () => {
    expect(readAsk({ use: 'profile_chat', system: 'Be brief', messages: [user('Hi')] })).toEqual({ ok: true, use: 'profile_chat', ask: { system: 'Be brief', messages: [{ role: 'user', content: 'Hi' }], max_tokens: LIMITS.defaultTokens } });
  });
  it('caps max_tokens', () => {
    const r = readAsk({ use: 'kb_answer', messages: [user('Q')], max_tokens: 99999 });
    expect(r.ok && r.ask.max_tokens).toBe(LIMITS.maxTokens);
  });
  it('refuses what is malformed or too large', () => {
    expect(readAsk(null)).toEqual({ ok: false, error: 'Name the AI use' });
    expect(readAsk({ use: 'Drop table', messages: [user('x')] }).ok).toBe(false);
    expect(readAsk({ use: 'kb_answer', messages: [] })).toEqual({ ok: false, error: 'Send at least one message' });
    expect(readAsk({ use: 'kb_answer', messages: [{ role: 'system', content: 'x' }] }).ok).toBe(false);
    expect(readAsk({ use: 'kb_answer', messages: [{ role: 'assistant', content: 'x' }] })).toEqual({ ok: false, error: 'The first message must be from the user' });
    expect(readAsk({ use: 'kb_answer', system: 3, messages: [user('x')] })).toEqual({ ok: false, error: 'system must be text' });
    expect(readAsk({ use: 'kb_answer', messages: Array.from({ length: LIMITS.messages + 1 }, () => user('x')) }).ok).toBe(false);
    expect(readAsk({ use: 'kb_answer', messages: [user('x'.repeat(LIMITS.chars + 1))] })).toMatchObject({ ok: false, error: expect.stringContaining('too long') });
  });
});

describe('buildRequest', () => {
  it('calls the Anthropic Messages API with the key in a header and room for thinking', () => {
    const r = buildRequest(claude, { system: 'S', messages: [{ role: 'user', content: 'Q' }], max_tokens: 300 });
    expect(r.url).toBe('https://api.anthropic.com/v1/messages');
    expect(r.init.headers).toEqual({ 'content-type': 'application/json', 'x-api-key': claude.key, 'anthropic-version': ANTHROPIC_VERSION });
    expect(JSON.parse(r.init.body)).toEqual({ model: 'claude-test', max_tokens: ANTHROPIC_MIN_TOKENS, system: 'S', messages: [{ role: 'user', content: 'Q' }] });
    expect(r.init.body).not.toContain(claude.key);
  });
  it('uses an Anthropic base URL when one is set', () => {
    expect(buildRequest({ ...claude, baseUrl: 'https://proxy.example.eu/' }, TEST_ASK).url).toBe('https://proxy.example.eu/v1/messages');
  });
  it('calls OpenAI-compatible chat completions with the system prompt as the first message', () => {
    const r = buildRequest(mistral, { system: 'S', messages: [{ role: 'user', content: 'Q' }], max_tokens: 300 });
    expect(r.url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(r.init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer ' + mistral.key });
    expect(JSON.parse(r.init.body)).toEqual({ model: 'mistral-large-latest', max_tokens: 300, messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'Q' }] });
  });
  it('adds the api-key header for Azure OpenAI', () => {
    const r = buildRequest({ ...mistral, baseUrl: 'https://firm-eu.openai.azure.com/openai/v1' }, TEST_ASK);
    expect(r.init.headers['api-key']).toBe(mistral.key);
  });
  it('refuses storage-only providers and an OpenAI-compatible connection without a URL', () => {
    expect(() => buildRequest({ ...claude, provider: 'elevenlabs' }, TEST_ASK)).toThrow('A elevenlabs connection does not answer text');
    expect(() => buildRequest({ ...mistral, baseUrl: null }, TEST_ASK)).toThrow('needs a base URL');
  });
});

describe('parseReply', () => {
  it('reads Anthropic text blocks and skips thinking', () => {
    expect(parseReply('anthropic', 200, { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Hello ' }, { type: 'text', text: 'there' }], stop_reason: 'end_turn' })).toEqual({ ok: true, text: 'Hello there' });
  });
  it('says when Anthropic declined or ran out of tokens', () => {
    expect(parseReply('anthropic', 200, { content: [], stop_reason: 'refusal' })).toEqual({ ok: false, error: 'The model declined to answer' });
    expect(parseReply('anthropic', 200, { content: [{ type: 'thinking', thinking: '' }], stop_reason: 'max_tokens' })).toEqual({ ok: false, error: 'The model ran out of tokens before answering' });
  });
  it('reads OpenAI-compatible content as text or parts', () => {
    expect(parseReply('openai_compatible', 200, { choices: [{ message: { content: ' OK ' } }] })).toEqual({ ok: true, text: 'OK' });
    expect(parseReply('openai_compatible', 200, { choices: [{ message: { content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] } }] })).toEqual({ ok: true, text: 'AB' });
    expect(parseReply('openai_compatible', 200, { choices: [{ message: { content: '' }, finish_reason: 'length' }] })).toEqual({ ok: false, error: 'The model ran out of tokens before answering' });
  });
  it('turns provider errors into one line', () => {
    expect(parseReply('anthropic', 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })).toEqual({ ok: false, error: 'The provider answered 401: invalid x-api-key' });
    expect(parseReply('openai_compatible', 422, { message: 'Invalid model' })).toEqual({ ok: false, error: 'The provider answered 422: Invalid model' });
    expect(parseReply('openai_compatible', 500, null)).toEqual({ ok: false, error: 'The provider answered 500' });
  });
});

describe('callProvider', () => {
  const reply = (status: number, json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;
  it('returns the text', async () => {
    const f = reply(200, { content: [{ type: 'text', text: 'OK' }] });
    expect(await callProvider(claude, TEST_ASK, f)).toEqual({ ok: true, text: 'OK' });
    expect(vi.mocked(f).mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
  });
  it('never returns the key, also when the provider echoes it', async () => {
    const out = await callProvider(mistral, TEST_ASK, reply(401, { error: { message: 'Incorrect API key provided: ' + mistral.key } }));
    expect(out).toEqual({ ok: false, error: 'The provider answered 401: Incorrect API key provided: [key]' });
    const down = await callProvider(mistral, TEST_ASK, vi.fn(async () => { throw new Error('dns failed for ' + mistral.key); }) as unknown as typeof fetch);
    expect(down).toEqual({ ok: false, error: 'Could not reach the provider: dns failed for [key]' });
  });
  it('gives up after the timeout', async () => {
    const hang = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    expect(await callProvider(claude, TEST_ASK, hang, 5)).toEqual({ ok: false, error: 'The provider did not answer within 0 s' });
  });
  it('reports a provider that cannot answer text without calling it', async () => {
    const f = reply(200, {});
    expect(await callProvider({ ...claude, provider: 'heygen' }, TEST_ASK, f)).toEqual({ ok: false, error: 'A heygen connection does not answer text' });
    expect(f).not.toHaveBeenCalled();
  });
  it('scrubs only real keys', () => {
    expect(scrub('abc', '')).toBe('abc');
    expect(scrub('xx-secret-xx', 'secret')).toBe('xx-[key]-xx');
  });
});
