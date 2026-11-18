// Only the slide in focus animates (studios plan, Task 3.3), copied from Horizon's HeldVisual.tsx: `play` runs a
// slide's SMIL visuals afresh on arrival; `still` pauses every other slide's, where they were if they played, else at
// their settled state (charts drawn), so the camera's flights do not stutter.
import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** Where a paused visual that has not played yet stands: late enough for any entry animation to have finished. */
export const SETTLED_S = 30;
const runOf = new WeakMap<SVGSVGElement, 'play' | 'still'>();

export function HeldVisual({ run, children }: { run: 'play' | 'still'; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    box.current?.querySelectorAll('svg').forEach((svg) => {
      const was = runOf.get(svg);
      if (was === run) return;
      runOf.set(svg, run);
      if (run === 'play') { svg.setCurrentTime?.(0); svg.unpauseAnimations?.(); return; }
      svg.pauseAnimations?.();
      if (was !== 'play') svg.setCurrentTime?.(SETTLED_S);
    });
  });
  return <div ref={box} style={{ display: 'contents' }}>{children}</div>;
}
