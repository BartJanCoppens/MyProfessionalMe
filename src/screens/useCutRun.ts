// One cut's run for a screen (the Slides video now, the Reel Studio's build step next): idle, running with its percent, failed
// with the reason in words, or done. Cancel aborts; leaving the screen aborts too, and a stopped or failed cut saves nothing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { renderCut } from '../reel/compositor';
import type { AudioLike, CutResult } from '../reel/compositor';
import { CutError } from '../reel/cutRules';
import type { Cut } from '../reel/cutRules';

export type CutState = { kind: 'idle' | 'done' } | { kind: 'running'; pct: number } | { kind: 'failed'; message: string };

export function useCutRun() {
  const [state, setState] = useState<CutState>({ kind: 'idle' }), abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  // `build` makes the cut (it may fetch fresh links first); `context` is the audio context opened in the click (prepareAudio).
  const run = useCallback(async (build: () => Promise<Cut>, context?: AudioLike): Promise<CutResult | null> => {
    const ctl = new AbortController();
    let live = true;
    abort.current = ctl;
    setState({ kind: 'running', pct: 0 });
    try {
      const cut = await build();
      const result = await renderCut(cut, { signal: ctl.signal, context, onProgress: (pct) => { if (live) setState({ kind: 'running', pct }); } });
      setState({ kind: 'done' });
      return result;
    } catch (e) {
      if (!ctl.signal.aborted || e instanceof CutError) setState({ kind: 'failed', message: e instanceof CutError ? e.message : 'The video could not be made · ' + (e as Error).message });
      return null;
    } finally { live = false; }
  }, []);
  return { state, run, cancel: () => abort.current?.abort() };
}
