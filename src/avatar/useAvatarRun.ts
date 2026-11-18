// One practice run's state (studios plan, Task 6.6): the opening line first, the learner's lines and the character's answers, one call at a time (busy guard), and
// the end. The store calls are injected (fmtAvatar.ts binds the real ones). Ending an AI-scored run SCORES it: recording the score is what ends the run, and a run
// already finished can no longer be scored, so finish_avatar_run is never called first. A failed score leaves the run open; "end without a score" then finishes it.
import { useCallback, useRef, useState } from 'react';
import type { AvatarScore } from '../../supabase/functions/_shared/avatarScore.ts';
import type { CharacterReply } from '../lib/avatarStore';

export type RunLine = { who: 'learner' | 'character'; text: string; held: boolean };
export type RunDeps = {
  start(): Promise<string>; say(runId: string, text: string): Promise<CharacterReply>; end(runId: string): Promise<void>; score(runId: string): Promise<AvatarScore>;
  share(runId: string): Promise<void>; withdraw(runId: string): Promise<void>;
};
type Busy = 'starting' | 'sending' | 'ending' | 'sharing';
/** The character's line the stage should speak (`opening`: the scenario's first line, read by the portrait voice from the scenario on the server). */
export type Heard = { n: number; text: string; opening: boolean };
type State = { phase: 'idle' | 'live' | 'ended'; runId: string | null; lines: RunLine[]; score: AvatarScore | null; scoreFailed: boolean; shared: boolean; error: string; busy: Busy | null; heard: Heard | null };
const IDLE: State = { phase: 'idle', runId: null, lines: [], score: null, scoreFailed: false, shared: false, error: '', busy: null, heard: null };

export function useAvatarRun({ opening, scored, deps }: { opening: string; scored: boolean; deps: RunDeps }) {
  const [s, setS] = useState<State>(IDLE);
  const busy = useRef(false), heardN = useRef(0), runId = useRef<string | null>(null);
  // Every call is guarded by busy and, after its await, writes through the functional setState.
  const guarded = useCallback(async <T,>(what: Busy, work: () => Promise<T>, done: (r: T) => (cur: State) => State): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setS((cur) => ({ ...cur, busy: what, error: '' }));
    try { const r = await work(); setS((cur) => ({ ...done(r)(cur), busy: null })); return true; } catch (e) {
      setS((cur) => ({ ...cur, busy: null, error: (e as Error).message || 'That did not work · try again' }));
      return false;
    } finally { busy.current = false; }
  }, []);

  const start = useCallback(() => guarded('starting', deps.start, (id) => () => {
    runId.current = id;
    return { ...IDLE, phase: 'live', runId: id, lines: [{ who: 'character', text: opening, held: false }], heard: { n: ++heardN.current, text: opening, opening: true } };
  }), [guarded, deps, opening]);

  const send = useCallback((text: string) => guarded('sending', () => deps.say(runId.current!, text), (r) => (cur) => ({
    ...cur, lines: [...cur.lines, { who: 'learner', text, held: r.held }, { who: 'character', text: r.say, held: false }], heard: { n: ++heardN.current, text: r.say, opening: false },
  })), [guarded, deps]);

  const end = useCallback(async () => {
    const ok = await guarded('ending', () => (scored ? deps.score(runId.current!) : deps.end(runId.current!).then(() => null)), (score) => (cur) => ({ ...cur, phase: 'ended', score, scoreFailed: false }));
    if (!ok && scored) setS((cur) => ({ ...cur, scoreFailed: true })); // only a failed score offers "End without a score"
    return ok;
  }, [guarded, deps, scored]);
  const endWithoutScore = useCallback(() => guarded('ending', () => deps.end(runId.current!), () => (cur) => ({ ...cur, phase: 'ended', score: null })), [guarded, deps]);
  const share = useCallback(() => guarded('sharing', () => deps.share(runId.current!), () => (cur) => ({ ...cur, shared: true })), [guarded, deps]);
  const withdraw = useCallback(() => guarded('sharing', () => deps.withdraw(runId.current!), () => (cur) => ({ ...cur, shared: false })), [guarded, deps]);

  return { ...s, start, send, end, endWithoutScore, share, withdraw };
}
