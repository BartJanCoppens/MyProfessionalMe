// @vitest-environment jsdom
// The narration step player that Slides, Podcast and Horizon share (studios plan, Task 3.2): Play, Pause, Previous and
// Next over a run of steps on the shared clock, each step's audio played with it, a timed step (no audio) at its pace,
// the passed marks handed to what the step shows, and the end told once.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunStep } from '../logic/narration';
import StepPlayer from './StepPlayer';

const STEPS: RunStep[] = [
  { part: 's1', seconds: 3, marks: [{ kind: 'next', at: 1.5 }], audio: 'blob:first' },
  { part: 's2', seconds: 2, marks: [], audio: 'blob:second' },
];
const TIMED: RunStep[] = [{ part: 't1', seconds: 4, marks: [{ kind: 'cue', at: 2 }] }];
const audio = { play: vi.fn(), pause: vi.fn() };
let sources: string[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  sources = [];
  audio.play.mockReset().mockImplementation(async function (this: HTMLAudioElement) { sources.push(this.src); });
  audio.pause.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(audio.play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(audio.pause);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const click = (name: string) => act(() => { fireEvent.click(screen.getByRole('button', { name })); });
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const show = (at: { step: RunStep; index: number; marks: { kind: string }[] }) => <div>Showing {at.step.part} · {at.marks.length} marks passed</div>;

describe('the step player', () => {
  it('waits at the first step; Play runs the clock and the step\'s audio together', async () => {
    render(<StepPlayer steps={STEPS}>{show}</StepPlayer>);
    expect(screen.getByText('Step 1 of 2 · 0 / 3 s')).toBeTruthy();
    expect(audio.play).not.toHaveBeenCalled();
    click('Play');
    expect(sources).toEqual(['blob:first']);
    tick(1000);
    expect(screen.getByText('Step 1 of 2 · 1 / 3 s')).toBeTruthy();
    expect(screen.getByText('Showing s1 · 0 marks passed')).toBeTruthy();
    tick(1000);
    expect(screen.getByText('Showing s1 · 1 marks passed')).toBeTruthy();
    click('Pause');
    expect(audio.pause).toHaveBeenCalled();
    tick(3000);
    expect(screen.getByText('Step 1 of 2 · 2 / 3 s')).toBeTruthy();
  });
  it('moves on to the next step at the end of one and keeps playing; tells the end once, after the last', () => {
    const onEnd = vi.fn();
    render(<StepPlayer steps={STEPS} onEnd={onEnd}>{show}</StepPlayer>);
    click('Play');
    tick(3200);
    expect(screen.getByText('Showing s2 · 0 marks passed')).toBeTruthy();
    expect(sources).toEqual(['blob:first', 'blob:second']);
    tick(2200);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    tick(5000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
  it('does not tell the end for skipping to the last step and playing only that one; every step played through, in any order, does', () => {
    const onEnd = vi.fn();
    render(<StepPlayer steps={STEPS} onEnd={onEnd}>{show}</StepPlayer>);
    click('Next');
    click('Play');
    tick(2200);
    expect(onEnd).not.toHaveBeenCalled();
    click('Previous');
    click('Play');
    tick(3200);
    expect(onEnd).toHaveBeenCalledTimes(1);
    tick(5000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
  it('steps back and forth, stopped, within the run', () => {
    render(<StepPlayer steps={STEPS}>{show}</StepPlayer>);
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true);
    click('Next');
    expect(screen.getByText('Step 2 of 2 · 0 / 2 s')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    expect(audio.play).not.toHaveBeenCalled();
    click('Previous');
    expect(screen.getByText('Showing s1 · 0 marks passed')).toBeTruthy();
  });
  it('plays a timed step without audio, at its pace, and says how it is timed', () => {
    render(<StepPlayer steps={TIMED} note="Timed at 140 words a minute · no voice">{show}</StepPlayer>);
    expect(screen.getByText('Timed at 140 words a minute · no voice')).toBeTruthy();
    click('Play');
    tick(2100);
    expect(screen.getByText('Showing t1 · 1 marks passed')).toBeTruthy();
    expect(audio.play).not.toHaveBeenCalled();
  });
  it('stops and says so when the browser holds the sound back', async () => {
    audio.play.mockImplementation(async () => { throw new Error('NotAllowedError'); });
    render(<StepPlayer steps={STEPS}>{show}</StepPlayer>);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })); });
    expect(screen.getByText('The browser held the sound back · press Play again')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });
  it('has one speed control (1x, 1.5x, 2x) that sets the clock rate and keeps across steps', () => {
    render(<StepPlayer steps={TIMED} note="n">{show}</StepPlayer>);
    expect(screen.getAllByRole('button', { name: /^Speed/ })).toHaveLength(1);
    click('Speed 1×');
    click('Play');
    tick(2000);
    expect(screen.getByText('Step 1 of 1 · 3 / 4 s')).toBeTruthy();
    click('Speed 1.5×');
    click('Speed 2×');
    expect(screen.getByRole('button', { name: 'Speed 1×' })).toBeTruthy();
  });
  it('sets the audio element\'s playbackRate and counts a step finished at 2x as played', () => {
    const rates: number[] = [];
    audio.play.mockImplementation(async function (this: HTMLAudioElement) { rates.push(this.playbackRate); });
    const onEnd = vi.fn();
    render(<StepPlayer steps={STEPS} onEnd={onEnd}>{show}</StepPlayer>);
    click('Speed 1×'); click('Speed 1.5×');
    click('Play');
    expect(rates).toEqual([2]);
    tick(1700);
    expect(screen.getByText('Showing s2 · 0 marks passed')).toBeTruthy();
    expect(rates).toEqual([2, 2]);
    tick(1200);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
  it('says when there is nothing to play', () => {
    render(<StepPlayer steps={[]}>{show}</StepPlayer>);
    expect(screen.getByText('Nothing to play yet')).toBeTruthy();
  });
});
