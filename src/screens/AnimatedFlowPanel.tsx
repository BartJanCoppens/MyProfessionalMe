// The Animated flow's panel (studios plan, Task 2.3), for the learner on the detail page and as the Motion Studio's
// preview: the drawing (only through SafeSvg) with Play, Pause, Replay and a scrubber on the shared clock (useClock),
// which drives the SVG's own SMIL clock (pauseAnimations, unpauseAnimations, setCurrentTime, as Horizon's HeldVisual
// does), the caption of the stage in focus, and the text version one click away. With motion off it holds the last frame and shows the text version. It reads
// the view-model (fmtMotion.ts); the clock is the only state it keeps.
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, Card, LinkButton } from '../ds';
import type { FlowView } from '../fmtMotion';
import SafeSvg from './SafeSvg';
import { useClock } from './useClock';

const col: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };
const box: CSSProperties = { border: '1px solid #e1e5dc', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#fafbf8' };

// The drawing on the shared clock: the SVG's own SMIL clock follows it.
function useFlowClock(fl: FlowView) {
  const svg = useRef<SVGSVGElement>(null);
  const c = useClock(fl.seconds, fl.still ? fl.seconds : 0, {
    onSeek: (v) => svg.current?.setCurrentTime?.(v), onPlay: () => svg.current?.unpauseAnimations?.(), onPause: () => svg.current?.pauseAnimations?.(), onEnd: () => fl.onEnd(),
  });
  // A drawing waits at its first frame (or, with motion off, holds its last one) until it is played.
  useLayoutEffect(() => { svg.current?.pauseAnimations?.(); svg.current?.setCurrentTime?.(fl.still ? fl.seconds : 0); }, [fl.svg, fl.still, fl.seconds]);
  return { svg, ...c };
}

// Another drawing (or length, or motion setting) starts a new player: its clock at the first frame, stopped, wherever
// the last one was.
export default function AnimatedFlowPanel({ fl }: { fl: FlowView }) {
  return <Player key={fl.svg + '|' + fl.seconds + '|' + fl.still} fl={fl} />;
}

function Player({ fl }: { fl: FlowView }) {
  const c = useFlowClock(fl), [text, setText] = useState(fl.still), cap = fl.caption(c.t);
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
