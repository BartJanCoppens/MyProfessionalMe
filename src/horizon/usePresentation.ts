// The present loop (studios plan, Task 3.3). In Horizon it lives in App.tsx; here it is one small hook: start at the
// first slide of the route (route.ts), next and previous along it, a jump to a slide (the narration moves the talk on),
// cues (⟨cue⟩ in the narration, or the Cue button, as Horizon's E key), and the camera's move to each slide: a flight
// across the canvas from the frames' x and y, pulling back on long flights (motion.ts), or a fade when motion is off
// (?motion=off or reduced motion) or the talk enters or leaves a section. Reaching the last slide is told once.
import { useEffect, useMemo, useRef, useState } from 'react';
import { flightSeconds, pullOf, worldMotion } from './motion';
import { routeOf } from './route';
import type { Deck } from './types';

type Point = { x: number; y: number };
export type Move = { kind: 'fade' } | { kind: 'fly'; from: Point; to: Point; seconds: number; pull: number };
const centre = (f: { x: number; y: number }): Point => ({ x: f.x + 400, y: f.y + 225 });

export function usePresentation(deck: Deck, o: { still: boolean; onLast?: () => void }) {
  const route = useMemo(() => routeOf(deck.frames), [deck]);
  const [at, setAt] = useState({ index: 0, from: -1, arrival: 1 });
  const [cues, setCues] = useState(0);
  const told = useRef(false), latest = useRef(o.onLast);
  useEffect(() => { latest.current = o.onLast; });
  const go = (i: number) => setAt((cur) => (i < 0 || i >= route.length || i === cur.index ? cur : { index: i, from: cur.index, arrival: cur.arrival + 1 }));
  const index = Math.min(at.index, route.length - 1), step = route[index], prev = at.from >= 0 ? route[at.from] : null;
  useEffect(() => {
    if (index === route.length - 1 && !told.current) { told.current = true; latest.current?.(); }
  }, [index, route.length]);
  const level = worldMotion(deck.theme), far = prev ? Math.round(Math.hypot(step.frame.x - prev.frame.x, step.frame.y - prev.frame.y) / 900) : 0;
  const move: Move | null = !prev ? null : o.still || prev.levelKey !== step.levelKey ? { kind: 'fade' }
    : { kind: 'fly', from: centre(prev.frame), to: centre(step.frame), seconds: flightSeconds(level), pull: pullOf(level, far) };
  return {
    route, step, index, move, arrival: String(at.arrival), cues,
    first: index === 0, last: index === route.length - 1, place: 'Slide ' + (index + 1) + ' of ' + route.length,
    next: () => go(index + 1), previous: () => go(index - 1),
    show: (id: string) => go(route.findIndex((s) => s.frame.id === id)),
    cue: () => setCues((n) => n + 1),
  };
}
export type Presentation = ReturnType<typeof usePresentation>;
