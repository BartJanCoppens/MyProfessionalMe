// The one adapter for the AI voice (studios plan, Task 3.2). speak() calls the `voice` edge function, which voices the
// words in an active stock voice through the ElevenLabs connection of the use studio_voice and stores the mp3 with the
// author's own draft; a failure is thrown in words and nothing else is tried. speakInBrowser() is the browser's own
// speechSynthesis, for a preview only, never stored and always labelled "Browser voice · not saved"; the caller chooses
// it (the voice is not live, or the creator only wants to hear it), it is never substituted for a stored voice.
import { invokeFunction } from './aiStore';
import { spoken } from '../logic/narration';
import type { RunMark } from '../logic/narration';
import { VOICE_USE } from '../../supabase/functions/_shared/voiceRules.ts';

export { VOICE_USE };
export const BROWSER_VOICE = 'Browser voice · not saved';
// Stored audio made by the voice: its path in `media`, its length, and when its marks fall.
export type StoredVoice = { path: string; seconds: number; marks: RunMark[]; made: 'voice' };
export type SpeakRequest = { contributionId: string; voiceId: string; text: string };

// Whether the AI voice answers now (the use is in ai_live_uses()).
export const voiceLive = (live: readonly string[]) => live.includes(VOICE_USE);
// ... and not switched off for this session (?live=off): what every studio and the AI connections page ask (Logic.aiOpts).
export const voiceOn = (o: { enabled: boolean; live: readonly string[] }) => o.enabled && voiceLive(o.live);

export async function speak(req: SpeakRequest): Promise<StoredVoice> {
  const data = await invokeFunction<Partial<StoredVoice>>('voice', { ...req });
  if (!data || typeof data.path !== 'string' || typeof data.seconds !== 'number') throw new Error('The voice function returned no audio');
  return { path: data.path, seconds: data.seconds, marks: Array.isArray(data.marks) ? data.marks : [], made: 'voice' };
}

// A stock voice's own sample, as a data URL to play (System and General Admins, when the voice is live).
export async function hearStockVoice(voiceId: string): Promise<string> {
  const data = await invokeFunction<{ audio?: string }>('voice', { action: 'sample', voiceId });
  if (!data || typeof data.audio !== 'string') throw new Error('The voice function returned no sample');
  return data.audio;
}

export type BrowserOutcome = 'ended' | 'stopped' | 'blocked' | 'failed' | 'unsupported';
export type BrowserSpeech = { label: typeof BROWSER_VOICE; done: Promise<BrowserOutcome>; stop: () => void };

// Says the words with the browser's voice. A browser that never starts (no voices, autoplay rules) is given up after
// startMs and reported as blocked, as Taxatar's watchdog does, instead of pretending it spoke.
export function speakInBrowser(text: string, opts: { lang?: string; startMs?: number } = {}): BrowserSpeech {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return { label: BROWSER_VOICE, done: Promise.resolve('unsupported'), stop: () => {} };
  let settle: (o: BrowserOutcome) => void = () => {};
  const done = new Promise<BrowserOutcome>((resolve) => { settle = resolve; });
  const u = new SpeechSynthesisUtterance(spoken(text));
  if (opts.lang) u.lang = opts.lang;
  let started = false;
  const watchdog = setTimeout(() => { if (!started) { synth.cancel(); settle('blocked'); } }, opts.startMs ?? 4000);
  const finish = (o: BrowserOutcome) => { clearTimeout(watchdog); settle(o); };
  u.onstart = () => { started = true; clearTimeout(watchdog); };
  u.onend = () => finish('ended');
  u.onerror = () => finish('failed');
  synth.cancel();
  synth.speak(u);
  return { label: BROWSER_VOICE, done, stop: () => { synth.cancel(); finish('stopped'); } };
}
