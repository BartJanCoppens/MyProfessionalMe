// The build-in around a slide (studios plan, Task 3.3), copied from Horizon's SlideBuild.tsx: held while the camera flies
// to it, built on arrival, done when left. `at` changes with each arrival, so every arrival builds afresh. Named
// SlideBuild: BuildIn.tsx would clash with buildIn.ts on macOS.
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { endBuild, holdBuild, runBuild } from './buildIn';

export type BuildRun = 'hold' | 'build' | 'done';

export function BuildIn({ run, seed, at, children }: { run: BuildRun | null; seed: string; at: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null), was = useRef('');
  useLayoutEffect(() => {
    const el = box.current, now = `${run}|${at}`;
    if (!el || now === was.current) return;
    const fresh = !was.current;
    was.current = now;
    if (run === 'hold') holdBuild(el, fresh);
    else if (run === 'build') runBuild(el, seed);
    else endBuild(el);
  });
  useEffect(() => { const el = box.current; return () => { if (el) endBuild(el); }; }, []);
  return <div ref={box} data-build-root="" style={{ display: 'contents' }}>{children}</div>;
}
