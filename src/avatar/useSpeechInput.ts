// Push-to-talk speech input (studios plan, Task 6.6), a hold-only port of Taxatar's useSpeechRecognition. The browser's recogniser turns speech into text (in
// Chrome and Edge the audio goes to Google or Microsoft to do that); nothing is recorded here. Browsers end a session at the first pause, so while the button is
// held the recogniser is reopened and the fragments are buffered, then given once on release. A closed session is inert (a generation counter), so a late result
// never reaches the composer.
import { useCallback, useEffect, useRef, useState } from 'react';

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; start(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
type RecognitionCtor = new () => Recognition;
type SpeechWindow = { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
const ctorOf = () => (typeof window === 'undefined' ? undefined : (window as unknown as SpeechWindow).SpeechRecognition ?? (window as unknown as SpeechWindow).webkitSpeechRecognition);
/** Errors the recogniser can never recover from by reopening the microphone. */
const FATAL = ['not-allowed', 'service-not-allowed', 'audio-capture'];

type Options = { lang: string; onFinal: (text: string) => void; onError: (error: string) => void };

export function useSpeechInput({ lang, onFinal, onError }: Options) {
  const supported = !!ctorOf();
  const [listening, setListening] = useState(false), [interim, setInterim] = useState('');
  const rec = useRef<Recognition | null>(null), reopen = useRef<() => void>(() => {}), holding = useRef(false), buffer = useRef<string[]>([]), partial = useRef(''), generation = useRef(0);
  const handlers = useRef({ lang, onFinal, onError });
  useEffect(() => { handlers.current = { lang, onFinal, onError }; });

  const close = useCallback(() => {
    generation.current += 1;
    const r = rec.current;
    rec.current = null;
    if (r) { r.onresult = null; r.onerror = null; r.onend = null; try { r.abort(); } catch { /* already closed */ } }
  }, []);
  const settle = useCallback(() => { holding.current = false; partial.current = ''; setListening(false); setInterim(''); }, []);

  const open = useCallback(() => {
    const Ctor = ctorOf();
    if (!Ctor) return;
    const r = new Ctor(), mine = generation.current;
    r.lang = handlers.current.lang; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    r.onresult = (e) => {
      if (mine !== generation.current) return;
      let said = '', heard = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) said += e.results[i][0].transcript; else heard += e.results[i][0].transcript; }
      if (heard) { partial.current = heard; setInterim(heard); }
      if (said) { buffer.current.push(said.trim()); partial.current = ''; setInterim(''); }
    };
    r.onerror = (e) => {
      if (mine !== generation.current || !FATAL.includes(e?.error)) return; // anything else: onend reopens it while held
      close(); settle();
      handlers.current.onError(e.error);
    };
    r.onend = () => {
      if (mine !== generation.current) return;
      if (holding.current) { close(); try { reopen.current(); } catch { settle(); } } else settle();
    };
    rec.current = r;
    try { r.start(); } catch { close(); settle(); }
  }, [close, settle]);

  useEffect(() => { reopen.current = open; });

  const hold = useCallback(() => {
    if (!supported || holding.current) return;
    close(); buffer.current = []; partial.current = '';
    holding.current = true; setListening(true);
    open();
  }, [supported, close, open]);

  // Closes the microphone and gives everything heard during the hold, once (also to onFinal when there is something).
  const release = useCallback((): string => {
    if (!holding.current) return '';
    const text = [...buffer.current, partial.current].map((s) => s.trim()).filter(Boolean).join(' ');
    buffer.current = [];
    close(); settle();
    if (text) handlers.current.onFinal(text);
    return text;
  }, [close, settle]);

  // Closes the microphone and drops what was heard.
  const cancel = useCallback(() => { buffer.current = []; close(); settle(); }, [close, settle]);
  useEffect(() => () => { generation.current += 1; rec.current?.abort(); }, []);

  return { supported, listening, interim, hold, release, cancel };
}
