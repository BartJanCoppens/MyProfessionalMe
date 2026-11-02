// The pure part of the `ai` edge function: reading and capping a request, building the provider call, reading the
// reply. No Deno and no Supabase here, so Vitest tests it (src/lib/aiCore.test.ts).
//
// Providers that answer text:
//   anthropic          Messages API at <base URL or https://api.anthropic.com>/v1/messages, key in x-api-key.
//   openai_compatible  Chat completions at <base URL>/chat/completions, key as a bearer token (and api-key for
//                      Azure). Covers OpenAI, Azure OpenAI and EU-hosted OpenAI-compatible services such as Mistral.
// The key is only ever put in a request header; errors are scrubbed of it before they leave the function.

export type Provider = 'anthropic' | 'openai_compatible' | 'elevenlabs' | 'heygen' | 'other';
export const TEXT_PROVIDERS: Provider[] = ['anthropic', 'openai_compatible'];
export type Msg = { role: 'user' | 'assistant'; content: string };
export type Ask = { system?: string; messages: Msg[]; max_tokens: number };
export type Target = { provider: Provider; baseUrl: string | null; model: string; key: string };
export type Outcome = { ok: true; text: string } | { ok: false; error: string };

export const LIMITS = {
  body: 100_000, // characters in the raw request
  chars: 60_000, // characters across system and messages
  messages: 40,
  maxTokens: 1024, // what a caller may ask for
  defaultTokens: 600,
  timeoutMs: 30_000,
};
// Thinking models (current Claude models think by default) count their reasoning toward max_tokens, so a short
// answer still needs room. The prompts keep the visible answer short; this is the ceiling, not the length.
export const ANTHROPIC_MIN_TOKENS = 4096;
export const ANTHROPIC_VERSION = '2026-10-21';
// The connection test: one tiny call.
export const TEST_ASK: Ask = { messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 16 };

// Checks and caps an answer request: { use, system?, messages, max_tokens? }.
export function readAsk(body: unknown): { ok: true; use: string; ask: Ask } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const use = typeof b.use === 'string' ? b.use : '';
  if (!/^[a-z_]{1,40}$/.test(use)) return { ok: false, error: 'Name the AI use' };
  if (b.system !== undefined && typeof b.system !== 'string') return { ok: false, error: 'system must be text' };
  const msgs = Array.isArray(b.messages) ? b.messages : [];
  if (!msgs.length) return { ok: false, error: 'Send at least one message' };
  if (msgs.length > LIMITS.messages) return { ok: false, error: 'Too many messages (at most ' + LIMITS.messages + ')' };
  const messages: Msg[] = [];
  for (const m of msgs) {
    const r = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    if ((r.role !== 'user' && r.role !== 'assistant') || typeof r.content !== 'string' || !r.content.trim()) return { ok: false, error: 'Each message needs a role (user or assistant) and text' };
    messages.push({ role: r.role, content: r.content });
  }
  if (messages[0].role !== 'user') return { ok: false, error: 'The first message must be from the user' };
  const chars = (b.system as string | undefined || '').length + messages.reduce((a, m) => a + m.content.length, 0);
  if (chars > LIMITS.chars) return { ok: false, error: 'The request is too long (at most ' + LIMITS.chars + ' characters)' };
  const n = Number(b.max_tokens);
  const max_tokens = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), LIMITS.maxTokens) : LIMITS.defaultTokens;
  return { ok: true, use, ask: { ...(b.system ? { system: b.system as string } : {}), messages, max_tokens } };
}

// The use's fixed instruction (ai_uses.preamble, set by the System Admin) always comes first; the app's system text,
// built from app data, follows it. The client cannot replace or drop the preamble.
export function withPreamble(ask: Ask, preamble: string | null | undefined): Ask {
  const system = [(preamble || '').trim(), (ask.system || '').trim()].filter(Boolean).join('\n\n');
  const { system: _drop, ...rest } = ask;
  return system ? { ...rest, system } : rest;
}
// Characters sent to the model, counted per person and day (ai_usage.input_chars).
export const inputChars = (ask: Ask) => (ask.system || '').length + ask.messages.reduce((a, m) => a + m.content.length, 0);
// The database refuses a call beyond the use's daily limit with this message.
export const isLimitError = (message: string | undefined) => /daily ai limit reached/i.test(message || '');
export const limitMessage = (limit: number | null) => 'Daily AI limit reached' + (limit != null ? ' (' + limit + ' a day per person for this use)' : '') + '; the scripted reply is used until tomorrow (UTC)';

const trimUrl = (u: string) => u.replace(/\/+$/, '');

export function buildRequest(t: Target, ask: Ask): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  if (t.provider === 'anthropic') {
    return {
      url: trimUrl(t.baseUrl || 'https://api.anthropic.com') + '/v1/messages',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': t.key, 'anthropic-version': ANTHROPIC_VERSION },
        body: JSON.stringify({ model: t.model, max_tokens: Math.max(ask.max_tokens, ANTHROPIC_MIN_TOKENS), ...(ask.system ? { system: ask.system } : {}), messages: ask.messages }),
      },
    };
  }
  if (t.provider === 'openai_compatible') {
    if (!t.baseUrl) throw new Error('This connection needs a base URL');
    const headers: Record<string, string> = { 'content-type': 'application/json', authorization: 'Bearer ' + t.key };
    if (/\.azure\.com$/i.test(new URL(t.baseUrl).hostname)) headers['api-key'] = t.key;
    const messages = (ask.system ? [{ role: 'system', content: ask.system }] : []).concat(ask.messages);
    return { url: trimUrl(t.baseUrl) + '/chat/completions', init: { method: 'POST', headers, body: JSON.stringify({ model: t.model, max_tokens: ask.max_tokens, messages }) } };
  }
  throw new Error('A ' + t.provider + ' connection does not answer text');
}

// The provider's reply as text, or its error in one line.
export function parseReply(provider: Provider, status: number, json: unknown): Outcome {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, any>;
  if (status < 200 || status >= 300) {
    const msg = j.error?.message || (typeof j.error === 'string' ? j.error : '') || j.message || j.detail?.message || (typeof j.detail === 'string' ? j.detail : '');
    return { ok: false, error: 'The provider answered ' + status + (msg ? ': ' + String(msg).slice(0, 300) : '') };
  }
  if (provider === 'anthropic') {
    if (j.stop_reason === 'refusal') return { ok: false, error: 'The model declined to answer' };
    const text = (Array.isArray(j.content) ? j.content : []).filter((c: any) => c && c.type === 'text').map((c: any) => String(c.text)).join('').trim();
    return text ? { ok: true, text } : { ok: false, error: j.stop_reason === 'max_tokens' ? 'The model ran out of tokens before answering' : 'The model returned no text' };
  }
  const c = j.choices?.[0]?.message?.content;
  const text = (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: any) => (p && typeof p.text === 'string' ? p.text : '')).join('') : '').trim();
  return text ? { ok: true, text } : { ok: false, error: j.choices?.[0]?.finish_reason === 'length' ? 'The model ran out of tokens before answering' : 'The model returned no text' };
}

// Removes the key from any text that leaves the function (a provider may echo part of it in an error).
export function scrub(text: string, key: string) {
  return key && key.length >= 4 ? text.split(key).join('[key]') : text;
}

// One call: build, send with a timeout, read. fetchFn is injectable for tests.
export async function callProvider(t: Target, ask: Ask, fetchFn: typeof fetch = fetch, timeoutMs = LIMITS.timeoutMs): Promise<Outcome> {
  let req;
  try { req = buildRequest(t, ask); } catch (err) { return { ok: false, error: (err as Error).message }; }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(req.url, { ...req.init, signal: ctl.signal });
    let json: unknown = null;
    try { json = await res.json(); } catch { json = null; }
    const out = parseReply(t.provider, res.status, json);
    return out.ok ? out : { ok: false, error: scrub(out.error, t.key) };
  } catch (err) {
    return { ok: false, error: ctl.signal.aborted ? 'The provider did not answer within ' + Math.round(timeoutMs / 1000) + ' s' : scrub('Could not reach the provider: ' + (err as Error).message, t.key) };
  } finally { clearTimeout(timer); }
}
