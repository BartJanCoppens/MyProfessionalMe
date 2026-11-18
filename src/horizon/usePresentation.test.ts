// @vitest-environment jsdom
// The present loop (studios plan, Task 3.3): start at the first slide, next and previous along the route, a jump to a
// slide (the narration's), cues, the camera's move between slides (a fade with motion off), and the last slide of the
// route told once (completion).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import garden from './fixtures/Garden tour.horizon?raw';
import { readDeck } from './readDeck';
import { usePresentation } from './usePresentation';

const deck = readDeck(garden);
const start = (still = false, onLast = vi.fn()) => ({ onLast, ...renderHook(() => usePresentation(deck, { still, onLast })) });

describe('the present loop', () => {
  it('starts at the first slide of the route', () => {
    const { result } = start();
    expect(result.current.step.frame.id).toBe('g1');
    expect(result.current.place).toBe('Slide 1 of 3');
    expect(result.current.first).toBe(true);
  });
  it('steps along next and back, and stops at the ends', () => {
    const { result } = start();
    act(() => result.current.next());
    expect(result.current.step.frame.id).toBe('g2');
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.step.frame.id).toBe('g3');
    expect(result.current.last).toBe(true);
    act(() => result.current.previous());
    expect(result.current.step.frame.id).toBe('g2');
  });
  it('tells the last slide of the route once, however often it is reached', () => {
    const { result, onLast } = start();
    act(() => result.current.next());
    expect(onLast).not.toHaveBeenCalled();
    act(() => result.current.next());
    expect(onLast).toHaveBeenCalledTimes(1);
    act(() => result.current.previous());
    act(() => result.current.next());
    expect(onLast).toHaveBeenCalledTimes(1);
  });
  it('goes to a slide by its id (the narration does), and ignores one that is not on the route', () => {
    const { result, onLast } = start();
    act(() => result.current.show('g3'));
    expect(result.current.step.frame.id).toBe('g3');
    expect(onLast).toHaveBeenCalledTimes(1);
    act(() => result.current.show('nowhere'));
    expect(result.current.step.frame.id).toBe('g3');
  });
  it('counts cues, and a new arrival on every move', () => {
    const { result } = start();
    const first = result.current.arrival;
    act(() => result.current.cue());
    expect(result.current.cues).toBe(1);
    act(() => result.current.next());
    expect(result.current.arrival).not.toBe(first);
  });
  it('flies the camera from slide to slide, and fades instead with motion off', () => {
    const fly = start().result;
    act(() => fly.current.next());
    expect(fly.current.move).toMatchObject({ kind: 'fly', from: { x: 400, y: 225 }, to: { x: 400, y: -415 }, seconds: 1.6 });
    const fade = start(true).result;
    act(() => fade.current.next());
    expect(fade.current.move).toMatchObject({ kind: 'fade' });
  });
});
