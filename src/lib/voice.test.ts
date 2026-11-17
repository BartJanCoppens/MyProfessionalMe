// @vitest-environment jsdom
// The voice adapter in the app (src/lib/voice.ts): speak() goes to the `voice` function only and answers stored audio
// made by the voice, or the function's refusal in words; it never falls through to the browser. speakInBrowser() is the
// browser's speechSynthesis for a preview, always labelled "Browser voice · not saved", with a watchdog for a browser
// that never starts speaking.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../test/fakeSupabase';
import { BROWSER_VOICE, hearStockVoice, speak, speakInBrowser, voiceLive } from './voice';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));
const CID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const STORED = { path: 'u/' + CID + '/voice-0123456789abcdef.mp3', seconds: 4.2, marks: [{ kind: 'next', at: 2 }] };
const refusal = (status: number, error: string) => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error }), { status }) } });

// A speechSynthesis stand-in: records what it is asked to say; the test decides whether it starts and ends.
class Utterance { text: string; lang = ''; onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(t: string) { this.text = t; } }
const synth = { speak: vi.fn(), cancel: vi.fn() };
beforeEach(() => {
  db.reset(); synth.speak.mockReset(); synth.cancel.mockReset();
  vi.stubGlobal('speechSynthesis', synth); vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('speak', () => {
  it('asks the voice function and answers the stored audio, marked as made by the voice', async () => {
    db.client.functions.invoke.mockResolvedValueOnce({ data: STORED, error: null });
    expect(await speak({ contributionId: CID, voiceId: 'tVoiceWarm01', text: 'Hello ⟨next⟩ there' })).toEqual({ ...STORED, made: 'voice' });
    expect(db.client.functions.invoke).toHaveBeenCalledWith('voice', { body: { contributionId: CID, voiceId: 'tVoiceWarm01', text: 'Hello ⟨next⟩ there' } });
  });
  it('says the function\'s refusal in words, and never falls through to the browser voice', async () => {
    db.client.functions.invoke.mockResolvedValueOnce(refusal(422, 'That voice is not on the stock list'));
    await expect(speak({ contributionId: CID, voiceId: 'nope', text: 'Hi' })).rejects.toThrow('That voice is not on the stock list');
    db.client.functions.invoke.mockResolvedValueOnce({ data: {}, error: null });
    await expect(speak({ contributionId: CID, voiceId: 'tVoiceWarm01', text: 'Hi' })).rejects.toThrow('The voice function returned no audio');
    expect(synth.speak).not.toHaveBeenCalled();
  });
  it('knows whether the voice is live from the live uses', () => {
    expect(voiceLive(['profile_chat', 'studio_voice'])).toBe(true);
    expect(voiceLive(['profile_chat'])).toBe(false);
  });
});

describe('hearStockVoice', () => {
  it('asks the function for a stock voice\'s sample', async () => {
    db.client.functions.invoke.mockResolvedValueOnce({ data: { audio: 'data:audio/mpeg;base64,AAA' }, error: null });
    expect(await hearStockVoice('tVoiceWarm01')).toBe('data:audio/mpeg;base64,AAA');
    expect(db.client.functions.invoke).toHaveBeenCalledWith('voice', { body: { action: 'sample', voiceId: 'tVoiceWarm01' } });
  });
});

describe('speakInBrowser', () => {
  it('is labelled as the browser voice, not saved, and says the words without their marks', async () => {
    const b = speakInBrowser('Hello ⟨next⟩ there ⟨cue⟩.', { lang: 'en-GB' });
    expect(b.label).toBe('Browser voice · not saved');
    expect(BROWSER_VOICE).toBe('Browser voice · not saved');
    const u = synth.speak.mock.calls[0][0] as Utterance;
    expect(u.text).toBe('Hello there.');
    expect(u.lang).toBe('en-GB');
    u.onstart?.(); u.onend?.();
    expect(await b.done).toBe('ended');
  });
  it('gives up when the browser never starts speaking, and says so', async () => {
    vi.useFakeTimers();
    const b = speakInBrowser('Hello', { startMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(await b.done).toBe('blocked');
    expect(synth.cancel).toHaveBeenCalled();
  });
  it('reports a failure and stops on request', async () => {
    const b = speakInBrowser('Hello');
    (synth.speak.mock.calls[0][0] as Utterance).onerror?.();
    expect(await b.done).toBe('failed');
    speakInBrowser('Again').stop();
    expect(synth.cancel).toHaveBeenCalled();
  });
  it('says when the browser has no voice at all', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    expect(await speakInBrowser('Hello').done).toBe('unsupported');
  });
});
