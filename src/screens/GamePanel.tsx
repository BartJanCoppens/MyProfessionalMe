// A game's panel (studios plan, Task 4.3), for the learner on the detail page and, in a play-test, as the Game Studio's preview and
// for the author and reviewers (studioPreviews.tsx): Play starts a run, the sealed frame (src/game) plays it and reports the
// score, the leaderboard lists finished runs by first name and initial. It reads the view-model (fmtGame.ts); the run's state
// (which run, the score) lives here, as a run ends with the panel.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Banner, Button, Card } from '../ds';
import type { GameView } from '../fmtGame';
import { rowLine } from '../fmtGame';
import { GameFrame } from '../game/GameFrame';
import type { LeaderRow } from '../game/protocol';
import type { Best } from '../lib/gameStore';
import { fmtTime } from '../logic/media';

const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };
type Run = { phase: 'idle' | 'starting' | 'playing' | 'done'; id: string | null; score: number | null; error: string };
const IDLE: Run = { phase: 'idle', id: null, score: null, error: '' };

// The leaderboard and the player's best, loaded on arrival and again after a run (a failure leaves the old rows). The view's
// closures are new on every render, so the latest are kept and a new load starts only when gm.key changes.
function useStandings(gm: GameView) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null), [best, setBest] = useState<Best | null>(null), [failed, setFailed] = useState(false);
  const latest = useRef(gm);
  useEffect(() => { latest.current = gm; });
  const refresh = useCallback(() => {
    latest.current.board?.().then((r) => { setRows(r); setFailed(false); }, () => setFailed(true));
    latest.current.best?.().then(setBest, () => {});
  }, []);
  useEffect(refresh, [refresh, gm.key]);
  return { rows, best, failed, refresh };
}

export default function GamePanel({ gm }: { gm: GameView }) {
  const [run, setRun] = useState<Run>(IDLE);
  const { rows, best, failed, refresh } = useStandings(gm);
  const play = async () => {
    setRun({ ...IDLE, phase: 'starting' });
    try { setRun({ ...IDLE, phase: 'playing', id: await gm.start() }); } catch (e) { setRun({ ...IDLE, error: (e as Error).message || 'The run could not be started' }); }
  };
  const ended = (score: number | null) => { setRun((r) => ({ ...r, phase: 'done', score })); refresh(); };
  return (
    <Card title="Play the game" subtitle={gm.sub}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={muted}>{gm.note}</div>
        {gm.roleNote && <div style={muted}>{gm.roleNote}</div>}
        <div style={muted}>{gm.completion}</div>
        {run.error && <div role="alert"><Banner tone="warning">{run.error}</Banner></div>}
        {run.phase === 'playing' && (
          <GameFrame files={gm.files} test={gm.test} runId={run.id} data={gm.data} player={gm.player} height={460} leaderboard={gm.board} askAI={gm.ask(run.id)}
            onScore={async (score) => { if (run.id) await gm.finish(run.id, score); }} onFinished={ended} />
        )}
        {run.phase === 'done' && <div style={{ fontWeight: 600 }}>{run.score === null ? 'The game ended without a score.' : 'Your score: ' + run.score}</div>}
        {run.phase !== 'playing' && <div><Button onClick={play} disabled={run.phase === 'starting'}>{run.phase === 'done' ? 'Play again' : 'Play'}</Button></div>}
        {best && <div style={muted}>Your best: {best.score} · {fmtTime(best.seconds)}</div>}
        {gm.board && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' }}>Best finished runs · first name and initial</div>
            {failed && <div style={muted}>The leaderboard could not be loaded.</div>}
            {rows && !rows.length && !failed && <div style={muted}>No finished runs yet.</div>}
            {!!rows?.length && <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3 }}>{rows.map((r) => <li key={r.rank}>{rowLine(r)}</li>)}</ol>}
          </div>
        )}
      </div>
    </Card>
  );
}
