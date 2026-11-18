// Where the slides are presented (studios plan, Task 3.3): the level's slides lie on the canvas at their x and y, and
// the camera flies to the slide in focus (a 2D flight with Horizon's easing, pulling back on long flights at the
// presentation's World animation level), or, for a fade (motion off, or into or out of a section), the slide alone
// fades in, as Horizon's FlatStage does. Only the slide in focus plays its visuals and speaks, once the camera has
// arrived; at Slide animation High it builds in (SlideBuild.tsx); at Low, or with motion off, its visuals stand still at
// their end. Horizon's 3D worlds are not part of the player.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { EYE, FLIGHT_EASING, slideMotion } from './motion';
import { BuildIn } from './SlideBuild';
import { SlideFace } from './SlideFace';
import { canvasLook } from './slideTheme';
import type { Deck, Frame } from './types';
import type { Presentation } from './usePresentation';

const num = (i: number) => String(i + 1).padStart(2, '0');
// The camera on a point of the canvas, at a zoom, for a stage `k` times the slide's size (the slide in focus fills it).
const camera = (k: number, x: number, y: number, z = 1) => `translate(${400 * k}px, ${225 * k}px) scale(${k * z}) translate(${-x}px, ${-y}px)`;

// The stage's width in px, which sets how large a slide is drawn (800 wide in jsdom, which measures nothing).
function useWidth() {
  const box = useRef<HTMLDivElement>(null), [w, setW] = useState(800);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 800));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { box, k: w / 800 };
}

export function Stage({ deck, p }: { deck: Deck; p: Presentation }) {
  const { box, k } = useWidth(), plane = useRef<HTMLDivElement>(null), m = p.move, f = p.step.frame;
  const [arrived, setArrived] = useState(p.arrival), now = useRef({ m, k });
  useLayoutEffect(() => { now.current = { m, k }; });
  // The camera's flight, once per arrival (not again when the stage is resized): from the slide left, pulled back
  // halfway on a long one, to the slide in focus. The slide plays once the camera is there.
  useLayoutEffect(() => {
    const { m: f, k: s } = now.current, el = plane.current;
    if (f?.kind !== 'fly' || !el || typeof el.animate !== 'function') return;
    const mid = { x: (f.from.x + f.to.x) / 2, y: (f.from.y + f.to.y) / 2 }, z = EYE / (EYE + f.pull);
    const frames = [{ transform: camera(s, f.from.x, f.from.y) }, ...(f.pull ? [{ transform: camera(s, mid.x, mid.y, z), offset: 0.5 }] : []), { transform: camera(s, f.to.x, f.to.y) }];
    const a = el.animate(frames, { duration: f.seconds * 1000, easing: FLIGHT_EASING });
    return () => a.cancel();
  }, [p.arrival]);
  useEffect(() => {
    const f = now.current.m, t = window.setTimeout(() => setArrived(p.arrival), f?.kind === 'fly' ? f.seconds * 1000 : 0);
    return () => window.clearTimeout(t);
  }, [p.arrival]);
  const here = arrived === p.arrival, live = here ? { run: p.arrival, cue: p.cues } : null, build = slideMotion(deck.theme) === 'high' && m?.kind === 'fly';
  const hold = p.still || slideMotion(deck.theme) === 'low';
  const faceOf = (g: Frame, i: number, on: boolean) => {
    const face = <SlideFace f={g} n={num(i)} theme={deck.theme} media={deck.media} live={on ? live : null} build={on && build} hold={hold} />;
    return on && build ? <BuildIn run={here ? 'build' : 'hold'} seed={g.id} at={p.arrival}>{face}</BuildIn> : face;
  };
  const room: CSSProperties = { position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 8, ...canvasLook(deck.theme) };
  return (
    <div ref={box} style={room} data-stage={m?.kind ?? 'start'}>
      {m?.kind === 'fly' ? (
        <div ref={plane} style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: camera(k, m.to.x, m.to.y) }}>
          {p.step.level.map((g) => (
            <div key={g.id} style={{ position: 'absolute', left: g.x, top: g.y }} aria-hidden={g.id !== f.id || undefined}>
              {faceOf(g, p.route.findIndex((s) => s.frame.id === g.id), g.id === f.id)}
            </div>
          ))}
        </div>
      ) : (
        <div key={f.id + '|' + p.arrival} style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `scale(${k})`, animation: m ? 'pmFade .45s ease-out' : undefined }}>
          {faceOf(f, p.index, true)}
        </div>
      )}
    </div>
  );
}
