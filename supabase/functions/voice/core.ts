// The pure part of the `voice` edge function: reading a request, the ElevenLabs with-timestamps call, when each mark
// falls, and the whole speak and sample answers with their outside steps (database, Vault, Storage) passed in, so
// Vitest tests them (src/lib/voiceCore.test.ts). index.ts wires those steps to Supabase. Copied from Horizon's
// server/voice.ts (markTimes, the with-timestamps call and its reading).
// The key is only ever put in a request header to ElevenLabs; errors are scrubbed of it before they leave.
import { fail, scrub } from '../_shared/aiGuard.ts';
import { CUE_MARK, NEXT_MARK, spoken, spokenWords } from '../_shared/narrationText.ts';
import type { Mark } from '../_shared/narrationText.ts';
import { CLIP_SECONDS_MAX, VOICE_ID, VOICE_USE } from '../_shared/voiceRules.ts';

export { VOICE_ID, VOICE_USE };
export const ELEVENLABS = 'https://api.elevenlabs.io';
export const VOICE_LIMITS = {
  chars: 5000, // per call (studios rule); longer narration is split by the caller
  body: 20_000, // characters in the raw request
  timeoutMs: 60_000,
  audioBytes: 25 * 1024 * 1024, // an audio file in `media` (MEDIA_KINDS.mp3 in src/logic/mediaFiles.ts)
  sampleBytes: 5_000_000,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// EU AI Act Art. 50 marking, as Taxatar's: on every answer the voice made.
export const AI_HEADER = { 'X-AI-Generated': 'true' } as const;

export type { Mark };
export type Speak = { contributionId: string; voiceId: string; text: string };
export type VoiceTarget = { key: string; baseUrl: string | null; model: string };
type Read<T> = { ok: true } & T | { ok: false; error: string };

const record = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;

// { contributionId, voiceId, text }: a saved contribution, a voice id and up to 5,000 characters with words.
export function readSpeak(body: unknown): Read<{ speak: Speak }> {
  const b = record(body);
  const contributionId = typeof b.contributionId === 'string' ? b.contributionId : '';
  if (!UUID.test(contributionId)) return { ok: false, error: 'Save the contribution before voicing it' };
  const voiceId = typeof b.voiceId === 'string' ? b.voiceId : '';
  if (!VOICE_ID.test(voiceId)) return { ok: false, error: 'Choose a stock voice' };
  const text = typeof b.text === 'string' ? b.text : '';
  if (text.length > VOICE_LIMITS.chars) return { ok: false, error: 'At most 5,000 characters per call · split longer narration' };
  if (!spoken(text)) return { ok: false, error: 'Write the words to voice first' };
  return { ok: true, speak: { contributionId, voiceId, text } };
}

// When each mark falls: its place in the spoken text (the start of what follows it), as ElevenLabs timed that
// character; past the timings, at the end. Kept within [0, seconds].
export function markTimes(text: string, starts: number[], seconds: number): Mark[] {
  const parts = text.split(/(⟨next⟩|⟨cue⟩)/), whole = spoken(text), out: Mark[] = [];
  parts.forEach((p, i) => {
    if (p !== NEXT_MARK && p !== CUE_MARK) return;
    let k = spoken(parts.slice(0, i).join('')).length;
    if (k > 0 && whole[k] === ' ') k++;
    const at = k < starts.length ? starts[k] : seconds;
    out.push({ kind: p === NEXT_MARK ? 'next' : 'cue', at: Math.min(seconds, Math.max(0, at)) });
  });
  return out;
}

// When each spoken word starts: its first character as ElevenLabs timed it; past the timings (or where a timing is not a
// number), the word before's time, or the end for a word past the timings. In milliseconds, non-decreasing within [0, seconds].
// One per word of spoken(text), as private.spoken_words counts them. (Positions are UTF-16 units, as markTimes' are.)
export function wordTimes(text: string, starts: number[], seconds: number): number[] {
  let last = 0, k = 0;
  return spokenWords(text).map((w) => {
    const s = starts[k];
    const at = k >= starts.length ? seconds : Number.isFinite(s) ? s : last;
    k += w.length + 1;
    last = Math.max(last, Math.floor(Math.min(seconds, Math.max(0, at)) * 1000) / 1000);
    return last;
  });
}

// The file's name follows the voice and the spoken words: voicing the same words again replaces the file.
export async function voiceFileName(voiceId: string, text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(voiceId + '\n' + spoken(text))));
  return 'voice-' + [...hash.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join('') + '.mp3';
}

const base = (t: VoiceTarget) => (t.baseUrl || ELEVENLABS).replace(/\/+$/, '');
export function ttsRequest(t: VoiceTarget, voiceId: string, text: string) {
  return {
    url: base(t) + '/v1/text-to-speech/' + voiceId + '/with-timestamps?output_format=mp3_44100_128',
    init: { method: 'POST' as const, headers: { 'xi-api-key': t.key, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ text: spoken(text), model_id: t.model }) },
  };
}

// ElevenLabs' detail as words: text, { message }, or a list of { msg } (validation errors); nothing else.
function detailText(d: unknown): string {
  const one = (x: unknown) => (typeof x === 'string' ? x : x && typeof x === 'object' ? String((x as Record<string, unknown>).message ?? (x as Record<string, unknown>).msg ?? '') : '');
  return Array.isArray(d) ? d.map(one).filter(Boolean).join('; ') : one(d);
}

type Called = { ok: true; json: Record<string, any> } | { ok: false; status: number; error: string };
// One JSON call to ElevenLabs with a timeout: its answer, or a refusal in words with the key scrubbed out.
async function callElevenLabs(t: VoiceTarget, url: string, init: RequestInit, fetchFn: typeof fetch): Promise<Called> {
  try {
    const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(VOICE_LIMITS.timeoutMs) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, json };
    if (res.status === 401 || res.status === 403) return { ok: false, status: 502, error: 'ElevenLabs refused the key: a System Admin checks it in Administration · AI connections' };
    const msg = detailText(json?.detail).slice(0, 200);
    return { ok: false, status: 502, error: scrub('ElevenLabs refused it' + (msg ? ': ' + msg : ''), t.key) };
  } catch (err) {
    const timedOut = (err as Error)?.name === 'TimeoutError';
    return { ok: false, status: timedOut ? 504 : 502, error: timedOut ? 'ElevenLabs did not answer within ' + VOICE_LIMITS.timeoutMs / 1000 + ' s' : scrub('Could not reach ElevenLabs: ' + (err as Error).message, t.key) };
  }
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export type SpeakDeps = {
  callerId: string;
  live: () => Promise<boolean>; // studio_voice is in ai_live_uses()
  voiceOnList: (voiceId: string) => Promise<boolean>; // an active stock_voices row
  canWrite: (path: string) => Promise<boolean>; // public.can_write_media, asked with the caller's token
  count: (chars: number) => Promise<'ok' | 'limit' | 'error'>; // ai_count_call
  target: () => Promise<VoiceTarget | null>; // the use's connection with its key; null without a key
  upload: (path: string, bytes: Uint8Array) => Promise<string | null>; // Storage's refusal, or null
  log: (line: Record<string, unknown>) => void;
  fetch?: typeof fetch;
};

// Voices the text, stores the mp3 in `media` at <caller>/<contribution>/voice-<hash>.mp3 and answers
// { path, seconds, marks, words }. Every check that costs nothing comes before the count; the count comes before the call.
export async function speakResponse(body: unknown, d: SpeakDeps): Promise<Response> {
  const started = Date.now();
  const r = readSpeak(body);
  if (!r.ok) return fail(400, r.error);
  const { contributionId, voiceId, text } = r.speak;
  if (!(await d.live())) return fail(409, 'The AI voice is not live: a System Admin sets its ElevenLabs connection in Administration · AI connections');
  if (!(await d.voiceOnList(voiceId))) return fail(422, 'That voice is not on the stock list');
  const path = d.callerId + '/' + contributionId + '/' + (await voiceFileName(voiceId, text));
  if (!(await d.canWrite(path))) return fail(403, 'Voice is stored with your own draft, or one with changes requested: this contribution is not there or not open to changes');
  const chars = spoken(text).length;
  const counted = await d.count(chars);
  if (counted === 'limit') return fail(429, 'Daily voice limit reached for you today (UTC); the browser voice can still preview it, not saved');
  if (counted === 'error') return fail(500, 'Could not count the call');
  const t = await d.target();
  if (!t) return fail(409, 'The voice connection has no key');
  const req = ttsRequest(t, voiceId, text);
  const out = await callElevenLabs(t, req.url, req.init, d.fetch || fetch);
  const done = (ok: boolean) => d.log({ use: VOICE_USE, ok, chars, ms: Date.now() - started });
  if (!out.ok) { done(false); return fail(out.status, out.error); }
  const b64 = typeof out.json.audio_base64 === 'string' ? out.json.audio_base64 : '';
  if (!b64 || Math.floor(b64.length * 3 / 4) > VOICE_LIMITS.audioBytes) { done(false); return fail(502, b64 ? 'The audio is too long to store · split the narration' : 'ElevenLabs sent no audio'); }
  const a = out.json.alignment ?? {};
  const starts: number[] = Array.isArray(a.character_start_times_seconds) ? a.character_start_times_seconds : [];
  const ends: number[] = Array.isArray(a.character_end_times_seconds) ? a.character_end_times_seconds : [];
  const seconds = ends.length ? +ends[ends.length - 1] : 0;
  if (!(seconds > 0) || seconds > CLIP_SECONDS_MAX) {
    done(false);
    return fail(502, seconds > 0 ? 'The voice ran longer than ' + CLIP_SECONDS_MAX + ' seconds · split the narration' : 'ElevenLabs sent no timing for the audio · try again');
  }
  const refused = await d.upload(path, fromBase64(b64));
  if (refused) { done(false); return fail(/row-level security|unauthorized/i.test(refused) ? 403 : 500, 'The audio could not be stored: ' + refused); }
  done(true);
  return Response.json({ path, seconds, marks: markTimes(text, starts, seconds), words: wordTimes(text, starts, seconds) }, { headers: AI_HEADER });
}

export type SampleDeps = {
  voiceAdmin: boolean; // System or General Admin
  onList: (voiceId: string) => Promise<boolean>; // any stock_voices row, active or not
  live: () => Promise<boolean>;
  target: () => Promise<VoiceTarget | null>;
  fetch?: typeof fetch;
};

// { action: 'sample', voiceId }: a stock voice's own preview from ElevenLabs, for the admins who manage the list.
// Costs no characters; the preview is fetched here so the page needs no other host, and without the key.
export async function sampleResponse(body: unknown, d: SampleDeps): Promise<Response> {
  if (!d.voiceAdmin) return fail(403, 'Only System and General Admins hear voice samples');
  const voiceId = String(record(body).voiceId || '');
  if (!VOICE_ID.test(voiceId) || !(await d.onList(voiceId))) return fail(422, 'That voice is not on the stock list');
  if (!(await d.live())) return fail(409, 'The AI voice is not live: a System Admin sets its ElevenLabs connection in Administration · AI connections');
  const t = await d.target();
  if (!t) return fail(409, 'The voice connection has no key');
  const fetchFn = d.fetch || fetch;
  const v = await callElevenLabs(t, base(t) + '/v1/voices/' + voiceId, { headers: { 'xi-api-key': t.key, accept: 'application/json' } }, fetchFn);
  if (!v.ok) return fail(v.status, v.error);
  const url = v.json.preview_url;
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return fail(502, 'ElevenLabs has no sample of that voice');
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(VOICE_LIMITS.timeoutMs) });
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!res.ok || !bytes.length || bytes.length > VOICE_LIMITS.sampleBytes) return fail(502, 'The sample could not be fetched');
    return Response.json({ audio: 'data:audio/mpeg;base64,' + toBase64(bytes) }, { headers: AI_HEADER });
  } catch { return fail(502, 'The sample could not be fetched'); }
}
