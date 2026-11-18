// The pure core of the `voice` edge function (supabase/functions/voice/core.ts): the request checks, the ElevenLabs
// with-timestamps call, the marks' times, and the whole speak and sample answers with their outside steps as fakes.
// The key never leaves; every answer made by the voice is marked X-AI-Generated.
import { describe, expect, it, vi } from 'vitest';
import { AI_HEADER, ELEVENLABS, markTimes, readSpeak, sampleResponse, speakResponse, ttsRequest, VOICE_LIMITS, voiceFileName, wordTimes } from '../../supabase/functions/voice/core.ts';
import type { SampleDeps, SpeakDeps } from '../../supabase/functions/voice/core.ts';
import { MEDIA_KINDS, MEDIA_PATH } from '../logic/mediaFiles';
import { CLIP_SECONDS_MAX } from '../logic/voiceItem';

const KEY = 'xi-secret-key-4321';
const UID = '0f8fad5b-d9cb-469f-a165-70867728950e', CID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const ask = (over: Record<string, unknown> = {}) => ({ contributionId: CID, voiceId: 'tVoiceWarm01', text: 'Hello there. ⟨next⟩ Second part.', ...over });
const b64 = (s: string) => btoa(s);
const ok = (json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }));
const STARTS = Array.from({ length: 25 }, (_, i) => i / 10); // one per spoken character of ask().text
const SPEECH = { audio_base64: b64('mp3-bytes'), alignment: { character_start_times_seconds: STARTS, character_end_times_seconds: STARTS.map((s) => s + 0.1) } };

function deps(over: Partial<SpeakDeps> = {}): SpeakDeps & { uploads: [string, Uint8Array][]; lines: Record<string, unknown>[] } {
  const uploads: [string, Uint8Array][] = [], lines: Record<string, unknown>[] = [];
  return {
    callerId: UID, live: async () => true, voiceOnList: async () => true, canWrite: async () => true, count: async () => 'ok',
    target: async () => ({ key: KEY, baseUrl: null, model: 'eleven_multilingual_v2' }),
    upload: async (path, bytes) => { uploads.push([path, bytes]); return null; },
    log: (l) => lines.push(l), fetch: ok(SPEECH), uploads, lines, ...over,
  };
}
const body = async (r: Response) => JSON.parse(await r.text());

describe('readSpeak', () => {
  it('takes a saved contribution, a voice id and up to 5,000 characters with words', () => {
    expect(readSpeak(ask())).toEqual({ ok: true, speak: { contributionId: CID, voiceId: 'tVoiceWarm01', text: 'Hello there. ⟨next⟩ Second part.' } });
    expect(readSpeak(ask({ text: 'x'.repeat(VOICE_LIMITS.chars) })).ok).toBe(true);
    expect(VOICE_LIMITS.chars).toBe(5000);
  });
  it('refuses more than 5,000 characters, no words, an unknown shape of voice id and a missing contribution', () => {
    expect(readSpeak(ask({ text: 'x'.repeat(5001) }))).toEqual({ ok: false, error: 'At most 5,000 characters per call · split longer narration' });
    expect(readSpeak(ask({ text: ' ⟨next⟩ ' })).ok).toBe(false);
    expect(readSpeak(ask({ voiceId: '../x' })).ok).toBe(false);
    expect(readSpeak(ask({ contributionId: undefined }))).toEqual({ ok: false, error: 'Save the contribution before voicing it' });
    expect(readSpeak(ask({ contributionId: 'C1' })).ok).toBe(false);
    expect(readSpeak(null).ok).toBe(false);
  });
});

describe('markTimes (copied from Horizon)', () => {
  it('puts each mark at the start time of the character that follows it, within the audio', () => {
    // spoken: "Hello there. Second part." — "Second" starts at character 13
    expect(markTimes('Hello there. ⟨next⟩ Second part.', STARTS, 2.5)).toEqual([{ kind: 'next', at: 1.3 }]);
    expect(markTimes('Go ⟨cue⟩', STARTS.slice(0, 2), 0.4)).toEqual([{ kind: 'cue', at: 0.4 }]);
  });
});

describe('wordTimes', () => {
  const S16 = Array.from({ length: 16 }, (_, i) => i / 10 + 0.05); // one per character of "Hello big world."
  it('gives the start of each spoken word: the time of its first character', () => {
    expect(wordTimes('Hello ⟨cue⟩ big world.', S16, 1.2)).toEqual([S16[0], S16[6], S16[10]]);
  });
  it('puts words past the timings at the end of the audio', () => {
    expect(wordTimes('Hello ⟨cue⟩ big world.', S16.slice(0, 7), 1.2)).toEqual([S16[0], S16[6], 1.2]);
  });
  it('never lets a missing or non-numeric start poison the later words', () => {
    const bad = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, NaN, 1.1, 1.2, 1.3, 1.4, 1.5] as unknown as number[];
    const t = wordTimes('Hello big world.', bad, 1.6);
    expect(t.every(Number.isFinite)).toBe(true);
    expect(t).toEqual([0, 0.6, 0.6]); // a start that is not a number takes the word before's time
  });
  it('stores times to the millisecond, never past the audio, still non-decreasing', () => {
    expect(wordTimes('Hello big world.', Array.from({ length: 16 }, (_, i) => i * 0.0743), 1.0005)).toEqual([0, 0.445, 0.743]);
    expect(wordTimes('a b', [0, 0, 0.9999999], 0.9999999)).toEqual([0, 0.999]);
  });
  it('lifts a start that goes back to the one before, and keeps every start within the audio', () => {
    expect(wordTimes('Hello big world.', [0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0.2, 0, 0, 0, 0, 0], 1.2)).toEqual([0, 0.9, 0.9]);
    expect(wordTimes('Hi there', [-1, 0, 0, 5, 0, 0, 0, 0], 1.2)).toEqual([0, 1.2]);
  });
});

describe('ttsRequest', () => {
  it('calls ElevenLabs with-timestamps with the key in a header only and the spoken text without marks', () => {
    const r = ttsRequest({ key: KEY, baseUrl: null, model: 'eleven_multilingual_v2' }, 'tVoiceWarm01', 'Hi ⟨cue⟩ there');
    expect(r.url).toBe(ELEVENLABS + '/v1/text-to-speech/tVoiceWarm01/with-timestamps?output_format=mp3_44100_128');
    expect(r.init.headers['xi-api-key']).toBe(KEY);
    expect(JSON.parse(r.init.body)).toEqual({ text: 'Hi there', model_id: 'eleven_multilingual_v2' });
    expect(r.url + r.init.body).not.toContain(KEY);
  });
});

describe('voiceFileName', () => {
  it('names the file after the voice and the words, so voicing the same text again replaces it', async () => {
    const a = await voiceFileName('tVoiceWarm01', 'Hello ⟨next⟩ there'), b = await voiceFileName('tVoiceWarm01', 'Hello there');
    expect(a).toMatch(/^voice-[0-9a-f]{16}\.mp3$/);
    expect(a).toBe(b);
    expect(await voiceFileName('tVoiceCalm02', 'Hello there')).not.toBe(a);
    expect(MEDIA_PATH.test(UID + '/' + CID + '/' + a)).toBe(true);
  });
});

describe('speakResponse', () => {
  it('voices the text, stores the mp3 under the caller and contribution, and answers path, seconds and marks, marked as AI', async () => {
    const d = deps();
    const r = await speakResponse(ask(), d);
    expect(r.status).toBe(200);
    expect(r.headers.get('X-AI-Generated')).toBe('true');
    expect(AI_HEADER).toEqual({ 'X-AI-Generated': 'true' });
    const out = await body(r);
    expect(out.path).toMatch(new RegExp('^' + UID + '/' + CID + '/voice-[0-9a-f]{16}\\.mp3$'));
    expect(out.seconds).toBeCloseTo(2.5);
    expect(out.marks).toEqual([{ kind: 'next', at: 1.3 }]);
    expect(d.uploads).toHaveLength(1);
    expect(d.uploads[0][0]).toBe(out.path);
    expect(new TextDecoder().decode(d.uploads[0][1])).toBe('mp3-bytes');
    expect(d.lines).toEqual([{ use: 'studio_voice', ok: true, chars: 25, ms: expect.any(Number) }]);
  });
  it('answers when each spoken word starts, one per word, and stays marked as AI', async () => {
    const r = await speakResponse(ask({ text: 'Hello ⟨cue⟩ big world.' }), deps({ fetch: ok({ ...SPEECH, alignment: { character_start_times_seconds: STARTS.slice(0, 16), character_end_times_seconds: STARTS.slice(0, 16).map((s) => s + 0.1) } }) }));
    expect(r.headers.get('X-AI-Generated')).toBe('true');
    const out = await body(r);
    expect(out.words).toEqual([STARTS[0], STARTS[6], STARTS[10]]);
  });
  it('refuses a voice that is not an active stock voice with 422, before anything is counted or sent', async () => {
    const count = vi.fn(async () => 'ok' as const), d = deps({ voiceOnList: async () => false, count });
    const r = await speakResponse(ask(), d);
    expect(r.status).toBe(422);
    expect((await body(r)).error).toBe('That voice is not on the stock list');
    expect(count).not.toHaveBeenCalled();
    expect(d.fetch).not.toHaveBeenCalled();
  });
  it('refuses more than 5,000 characters with 400 and calls nothing', async () => {
    const d = deps();
    expect((await speakResponse(ask({ text: 'y'.repeat(5001) }), d)).status).toBe(400);
    expect(d.fetch).not.toHaveBeenCalled();
  });
  it('refuses a missing or someone else\'s contribution (the media write rule) with 403, before anything is counted or sent', async () => {
    const canWrite = vi.fn(async (_path: string) => false), count = vi.fn(async () => 'ok' as const), d = deps({ canWrite, count });
    const r = await speakResponse(ask(), d);
    expect(r.status).toBe(403);
    expect((await body(r)).error).toMatch(/your own draft/);
    expect(canWrite.mock.calls[0][0]).toMatch(new RegExp('^' + UID + '/' + CID + '/voice-'));
    expect(count).not.toHaveBeenCalled();
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.uploads).toHaveLength(0);
  });
  it('answers 409 when the voice use is not live, and 429 at the daily limit', async () => {
    expect((await speakResponse(ask(), deps({ live: async () => false }))).status).toBe(409);
    const d = deps({ count: async () => 'limit' });
    const r = await speakResponse(ask(), d);
    expect(r.status).toBe(429);
    expect((await body(r)).error).toMatch(/Daily voice limit reached/);
    expect(d.fetch).not.toHaveBeenCalled();
  });
  it('never returns or logs the key, even when ElevenLabs echoes it', async () => {
    const echo = vi.fn(async () => new Response(JSON.stringify({ detail: { message: 'bad key ' + KEY } }), { status: 400 }));
    const d = deps({ fetch: echo });
    const r = await speakResponse(ask(), d);
    expect(r.status).toBe(502);
    const text = await r.text();
    expect(text).not.toContain(KEY);
    expect(text).toContain('[key]');
    expect(JSON.stringify(d.lines)).not.toContain(KEY);
    expect(r.headers.get('X-AI-Generated')).toBeNull();
  });
  it('says ElevenLabs\' refusal in words, whatever shape its detail has', async () => {
    const refuse = (detail: unknown) => deps({ fetch: vi.fn(async () => new Response(JSON.stringify({ detail }), { status: 422 })) });
    expect((await body(await speakResponse(ask(), refuse([{ loc: ['body', 'text'], msg: 'field required' }, { msg: 'too long' }])))).error).toBe('ElevenLabs refused it: field required; too long');
    expect((await body(await speakResponse(ask(), refuse({ status: 'quota_exceeded', message: 'Quota exceeded' })))).error).toBe('ElevenLabs refused it: Quota exceeded');
    expect((await body(await speakResponse(ask(), refuse({ status: 'odd' })))).error).toBe('ElevenLabs refused it');
    expect((await body(await speakResponse(ask(), refuse([{ msg: 'bad ' + KEY }])))).error).toBe('ElevenLabs refused it: bad [key]');
  });
  it('says the key was refused in words, and stores nothing when no audio came', async () => {
    const r = await speakResponse(ask(), deps({ fetch: vi.fn(async () => new Response('{}', { status: 401 })) }));
    expect(r.status).toBe(502);
    expect((await body(r)).error).toMatch(/ElevenLabs refused the key/);
    const d = deps({ fetch: ok({ alignment: {} }) });
    expect((await speakResponse(ask(), d)).status).toBe(502);
    expect(d.uploads).toHaveLength(0);
  });
  it('refuses audio larger than an audio file may be', async () => {
    const big = ok({ ...SPEECH, audio_base64: 'A'.repeat(Math.ceil(MEDIA_KINDS.mp3.maxBytes / 3) * 4 + 8) });
    const d = deps({ fetch: big });
    expect((await speakResponse(ask(), d)).status).toBe(502);
    expect(d.uploads).toHaveLength(0);
    expect(VOICE_LIMITS.audioBytes).toBe(MEDIA_KINDS.mp3.maxBytes);
  });
  it('refuses audio without timing (0 s) or longer than a clip may be, and stores nothing', async () => {
    const noTiming = deps({ fetch: ok({ audio_base64: b64('mp3-bytes') }) });
    const r1 = await speakResponse(ask(), noTiming);
    expect(r1.status).toBe(502);
    expect((await body(r1)).error).toMatch(/no timing/);
    const long = deps({ fetch: ok({ audio_base64: b64('mp3'), alignment: { character_start_times_seconds: [0], character_end_times_seconds: [CLIP_SECONDS_MAX + 1] } }) });
    const r2 = await speakResponse(ask(), long);
    expect(r2.status).toBe(502);
    expect((await body(r2)).error).toMatch(/longer than 180 seconds/);
    expect(noTiming.uploads).toEqual([]);
    expect(long.uploads).toEqual([]);
    const edge = deps({ fetch: ok({ audio_base64: b64('mp3'), alignment: { character_start_times_seconds: [0], character_end_times_seconds: [CLIP_SECONDS_MAX] } }) });
    expect((await speakResponse(ask(), edge)).status).toBe(200);
  });
  it('answers the store\'s refusal when the upload fails', async () => {
    const r = await speakResponse(ask(), deps({ upload: async () => 'new row violates row-level security policy' }));
    expect(r.status).toBe(403);
  });
});

describe('sampleResponse', () => {
  const sdeps = (over: Partial<SampleDeps> = {}): SampleDeps => ({
    voiceAdmin: true, onList: async () => true, live: async () => true, target: async () => ({ key: KEY, baseUrl: null, model: 'm' }),
    fetch: vi.fn(async (url: string | URL | Request) => String(url).startsWith(ELEVENLABS)
      ? new Response(JSON.stringify({ voice_id: 'tVoiceWarm01', preview_url: 'https://storage.example/preview.mp3' }))
      : new Response(new Uint8Array([1, 2, 3]))), ...over,
  });
  it('plays a stock voice\'s own preview to a System or General Admin, marked as AI, without sending the key to the preview\'s host', async () => {
    const d = sdeps();
    const r = await sampleResponse({ action: 'sample', voiceId: 'tVoiceWarm01' }, d);
    expect(r.status).toBe(200);
    expect(r.headers.get('X-AI-Generated')).toBe('true');
    expect((await body(r)).audio).toBe('data:audio/mpeg;base64,' + btoa('\x01\x02\x03'));
    const calls = vi.mocked(d.fetch!).mock.calls;
    expect(String(calls[0][0])).toBe(ELEVENLABS + '/v1/voices/tVoiceWarm01');
    expect(JSON.stringify(calls[1][1] || {})).not.toContain(KEY);
  });
  it('refuses anyone else, a voice not on the list, and a use that is not live', async () => {
    expect((await sampleResponse({ voiceId: 'tVoiceWarm01' }, sdeps({ voiceAdmin: false }))).status).toBe(403);
    expect((await sampleResponse({ voiceId: 'tVoiceWarm01' }, sdeps({ onList: async () => false }))).status).toBe(422);
    expect((await sampleResponse({ voiceId: 'tVoiceWarm01' }, sdeps({ live: async () => false }))).status).toBe(409);
  });
});
