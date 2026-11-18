// @vitest-environment jsdom
// Push-to-talk speech input (ported from Taxatar's useSpeechRecognition hold tests): fragments are buffered and given once on release.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpeechInput } from './useSpeechInput';

type Rec = { start: () => void; abort: () => void; continuous: boolean; lang: string; onresult: ((e: unknown) => void) | null; onerror: ((e: unknown) => void) | null; onend: (() => void) | null };
const made: Rec[] = [];
function FakeRecognition(this: Rec) { Object.assign(this, { start: vi.fn(), abort: vi.fn(), continuous: false, lang: '', onresult: null, onerror: null, onend: null }); made.push(this); }
const final = (r: Rec, text: string) => r.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: true }] });
const win = window as unknown as Record<string, unknown>;

beforeEach(() => { made.length = 0; win.webkitSpeechRecognition = FakeRecognition; });
afterEach(() => { delete win.webkitSpeechRecognition; delete win.SpeechRecognition; });

describe('useSpeechInput (hold to talk)', () => {
  it('gives two fragments once, on release, as "first second"', () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useSpeechInput({ lang: 'en-GB', onFinal, onError: vi.fn() }));
    act(() => result.current.hold());
    expect(made[0].lang).toBe('en-GB');
    act(() => final(made[0], 'first'));
    act(() => made[0].onend?.()); // a pause ends the session: the microphone is reopened while held
    act(() => final(made[1], 'second'));
    expect(onFinal).not.toHaveBeenCalled();
    let text = '';
    act(() => { text = result.current.release(); });
    expect(text).toBe('first second');
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith('first second');
  });
  it('gives an empty string, and no line, when nothing was captured', () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useSpeechInput({ lang: 'en-GB', onFinal, onError: vi.fn() }));
    act(() => result.current.hold());
    let text = 'x';
    act(() => { text = result.current.release(); });
    expect(text).toBe('');
    expect(onFinal).not.toHaveBeenCalled();
  });
  it('reports not-allowed and stops listening', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useSpeechInput({ lang: 'en-GB', onFinal: vi.fn(), onError }));
    act(() => result.current.hold());
    expect(result.current.listening).toBe(true);
    act(() => made[0].onerror?.({ error: 'not-allowed' }));
    expect(onError).toHaveBeenCalledWith('not-allowed');
    expect(result.current.listening).toBe(false);
  });
  it('drops what was heard on cancel', () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useSpeechInput({ lang: 'en-GB', onFinal, onError: vi.fn() }));
    act(() => result.current.hold());
    act(() => final(made[0], 'never sent'));
    act(() => result.current.cancel());
    expect(result.current.listening).toBe(false);
    expect(onFinal).not.toHaveBeenCalled();
  });
  it('is unsupported without webkitSpeechRecognition', () => {
    delete win.webkitSpeechRecognition;
    const { result } = renderHook(() => useSpeechInput({ lang: 'en-GB', onFinal: vi.fn(), onError: vi.fn() }));
    expect(result.current.supported).toBe(false);
    act(() => result.current.hold());
    expect(result.current.listening).toBe(false);
  });
});
