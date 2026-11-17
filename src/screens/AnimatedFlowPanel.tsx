// The Animated flow's panel (studios plan, Task 2.3), for the learner on the detail page and as the Motion Studio's
// preview: the drawing (only through SafeSvg) with Play, Pause, Replay and a scrubber on its own SMIL clock
// (pauseAnimations, unpauseAnimations, setCurrentTime, as Horizon's HeldVisual does), the caption of the stage in focus,
// and the text version one click away. With motion off it holds the last frame and shows the text version. It reads
// the view-model (fmtMotion.ts); the clock is the only state it keeps.
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, Card, LinkButton } from '../ds';
import type { FlowView } from '../fmtMotion';
import SafeSvg from './SafeSvg';

const TICK_MS = 200;
const col: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };
const box: CSSProperties = { border: '1px solid #e1e5dc', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#fafbf8' };

// The drawing's clock: where it is, whether it runs, and the controls that move it.
function useClock(fl: FlowView) {
  const svg = useRef<SVGSVGElement>(null), timer = useRef<number | null>(null);
  const [t, setT] = useState(fl.still ? fl.seconds : 0), [playing, setPlaying] = useState(false);
  const halt = () => { if (timer.current !== null) window.clearInterval(timer.current); timer.current = null; };
  const seek = (v: number) => { svg.current?.setCurrentTime?.(v); setT(v); };
  const pause = () => { halt(); svg.current?.pauseAnimations?.(); setPlaying(false); };
  // A drawing waits at its first frame (or, with motion off, holds its last one) until it is played.
  useLayoutEffect(() => { svg.current?.pauseAnimations?.(); svg.current?.setCurrentTime?.(fl.still ? fl.seconds : 0); return halt; }, [fl.svg, fl.still, fl.seconds]);
  const play = (from: number) => {
    halt(); seek(from); svg.current?.unpauseAnimations?.(); setPlaying(true);
    const since = Date.now();
    timer.current = window.setInterval(() => {
      const now = from + (Date.now() - since) / 1000;
      if (now < fl.seconds) { setT(now); return; }
      pause(); seek(fl.seconds); fl.onEnd();
    }, TICK_MS);
  };
  return { svg, t, playing, pause, play: () => play(t >= fl.seconds ? 0 : t), replay: () => play(0),
    scrub: (v: number) => { if (playing) play(v); else { svg.current?.pauseAnimations?.(); seek(v); } } };
}

export default function AnimatedFlowPanel({ fl }: { fl: FlowView }) {
  const c = useClock(fl), [text, setText] = useState(fl.still), cap = fl.caption(c.t);
  return (
    <Card title="Watch the flow" subtitle={fl.sub}>
      <div style={col}>
        <SafeSvg svg={fl.svg} label={fl.alt} svgRef={c.svg} />
        {fl.still ? <div style={muted}>{fl.stillNote}</div> : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {c.playing ? <Button size="sm" variant="secondary" onClick={c.pause}>Pause</Button> : <Button size="sm" onClick={c.play}>Play</Button>}
              <Button size="sm" variant="secondary" onClick={c.replay}>Replay</Button>
              <input type="range" min={0} max={fl.seconds} step={0.1} value={c.t} aria-label="Position in the flow" onChange={(e) => c.scrub(+e.target.value)}
                style={{ flex: '1 1 160px', accentColor: '#86BC25' }} />
              <span style={{ ...muted, fontVariantNumeric: 'tabular-nums' }}>{Math.floor(c.t)} / {fl.seconds} s</span>
            </div>
            <div aria-live="polite" style={{ fontSize: 13 }}><b>{cap.pos}</b><div style={{ textWrap: 'pretty' }}>{cap.text}</div></div>
          </>
        )}
        {!fl.still && <div><LinkButton onClick={() => setText(!text)}>{text ? 'Hide the text version' : 'Show the text version'}</LinkButton></div>}
        {text && (
          <div style={box}>
            <div style={{ fontSize: 13, textWrap: 'pretty' }}>{fl.alt}</div>
            {fl.read && <div><Button size="sm" variant="secondary" onClick={fl.read.run}>{fl.read.label}</Button></div>}
          </div>
        )}
      </div>
    </Card>
  );
}
