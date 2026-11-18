// The narration step player that Slides, Podcast and Horizon presentations share (studios plan, Task 3.2): Previous,
// Play or Pause, and Next over a run of steps (src/logic/narration.ts). Each step runs on the shared clock (useClock);
// its audio, when it has some, plays along and follows the clock; a timed step (no audio) simply runs at its pace. At
// the end of a step the next one plays. onEnd is told once, when every step has been played through on the clock (in any order):
// Next, Previous and jumps navigate freely but do not count a step as played, so the last step alone never completes. What a step shows is the caller's: it gets
// the step, its place, the time and the marks passed so far (⟨next⟩ to move on inside a slide, ⟨cue⟩ to build).
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Button } from '../ds';
import type { RunMark, RunStep } from '../logic/narration';
import { useClock } from './useClock';

// jump: go to another step (a chapter's first), playing on when this one was playing.
export type StepAt = { step: RunStep; index: number; t: number; marks: RunMark[]; jump: (index: number) => void };
type Props = { steps: RunStep[]; note?: string; onEnd?: () => void; children?: (at: StepAt) => ReactNode };

// The one speed control of every stepped item: audio plays at it (playbackRate) and a clock-only step runs at it.
const SPEEDS = [1, 1.5, 2];
const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };

export default function StepPlayer({ steps, note, onEnd, children }: Props) {
  const [at, setAt] = useState({ index: 0, auto: false }), [speed, setSpeed] = useState(1), played = useRef(new Set<number>()), told = useRef(false);
  const index = Math.min(at.index, Math.max(steps.length - 1, 0));
  if (!steps.length) return <div style={muted}>Nothing to play yet</div>;
  const go = (i: number, auto: boolean) => setAt({ index: Math.max(0, Math.min(steps.length - 1, i)), auto });
  // Another step is a new run of the clock: it starts at 0, playing when the last one was.
  return <StepRun key={index} step={steps[index]} index={index} count={steps.length} auto={at.auto} note={note} speed={speed} setSpeed={setSpeed}
    go={go} onPlayed={(i) => { played.current.add(i); if (!told.current && played.current.size >= steps.length) { told.current = true; onEnd?.(); } }} show={children} />;
}

type RunProps = { step: RunStep; index: number; count: number; auto: boolean; note?: string; speed: number; setSpeed: (s: number) => void; go: (i: number, auto: boolean) => void; onPlayed: (index: number) => void; show?: Props['children'] };

function StepRun({ step, index, count, auto, note, speed, setSpeed, go, onPlayed, show }: RunProps) {
  const sound = useRef<HTMLAudioElement | null>(null), [held, setHeld] = useState(false);
  const audio = () => (step.audio ? (sound.current ??= new Audio(step.audio)) : null);
  const tune = (a: HTMLAudioElement | null) => { if (a) a.playbackRate = speed; return a; };
  const c = useClock(step.seconds, 0, {
    rate: speed,
    onSeek: (v) => { const a = audio(); if (a) a.currentTime = v; },
    onPlay: () => { setHeld(false); tune(audio())?.play()?.catch(() => { c.pause(); setHeld(true); }); },
    onPause: () => sound.current?.pause(),
    onEnd: () => { onPlayed(index); if (index < count - 1) go(index + 1, true); },
  });
  // A step reached by playing on starts playing, once; leaving a step silences it.
  const start = useRef(auto ? c.play : null);
  useEffect(() => { start.current?.(); return () => sound.current?.pause(); }, []);
  useEffect(() => { if (sound.current) sound.current.playbackRate = speed; }, [speed]);
  const marks = step.marks.filter((m) => m.at <= c.t);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {show?.({ step, index, t: c.t, marks, jump: (i) => go(i, c.playing) })}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" onClick={() => go(index - 1, c.playing)} disabled={index === 0}>Previous</Button>
        {c.playing ? <Button size="sm" variant="secondary" onClick={c.pause}>Pause</Button> : <Button size="sm" onClick={c.play}>Play</Button>}
        <Button size="sm" variant="secondary" onClick={() => go(index + 1, c.playing)} disabled={index === count - 1}>Next</Button>
        <Button size="sm" variant="secondary" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>Speed {speed}×</Button>
        <span style={{ ...muted, fontVariantNumeric: 'tabular-nums' }}>Step {index + 1} of {count} · {Math.floor(c.t)} / {Math.round(step.seconds)} s</span>
      </div>
      {note && <div style={muted}>{note}</div>}
      {held && <div role="status" style={muted}>The browser held the sound back · press Play again</div>}
    </div>
  );
}
