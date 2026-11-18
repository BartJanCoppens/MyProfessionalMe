// A scored run's actions and the learner's earlier runs (studios plan, Task 6.6). The score is the AI's reading, shown with the learner note; sharing is the learner's
// own choice of a scored real run (never a practice in the studio), withdrawn until the counsellor confirms it.
import { useCallback, useEffect, useState } from 'react';
import { Button, Tag } from '../ds';
import type { AvatarScore } from '../../supabase/functions/_shared/avatarScore.ts';
import { myAvatarRuns, shareAvatarRun, withdrawAvatarRun } from '../lib/avatarStore';
import type { AvatarRunRow } from '../lib/avatarStore';
import { AvatarScoreCard, AvatarTranscript, LEARNER_SCORE_NOTE } from './AvatarScoreCard';

const small = { fontSize: 12.5, color: '#5a6058' } as const;

// Share with the counsellor, or withdraw it again until it is confirmed. `busy` and the two actions come from whoever owns the run.
export function ShareRow({ counsellor, shared, confirmed, busy, share, withdraw }: { counsellor: string; shared: boolean; confirmed: boolean; busy: boolean; share: () => void; withdraw: () => void }) {
  if (confirmed) return <Tag tone="green">Confirmed by {counsellor}</Tag>;
  return shared
    ? <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span style={small}>Shared with {counsellor}</span><Button size="sm" variant="secondary" onClick={withdraw} disabled={busy}>Withdraw</Button></div>
    : <div><Button size="sm" variant="secondary" onClick={share} disabled={busy}>Share with {counsellor}</Button></div>;
}

export function ScoreView({ score }: { score: Omit<AvatarScore, 'flags'> }) {
  return <AvatarScoreCard score={score} note={LEARNER_SCORE_NOTE} />;
}

function PastRun({ run, counsellor, reload }: { run: AvatarRunRow; counsellor: string; reload: () => void }) {
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  const act = (f: (id: string) => Promise<void>) => () => { setBusy(true); setProblem(''); f(run.id).then(reload, (e) => setProblem((e as Error).message)).finally(() => setBusy(false)); };
  return (
    <details style={{ borderTop: '1px solid #eef0ea', padding: '8px 0', fontSize: 12.5 }}>
      <summary style={{ cursor: 'pointer' }}>{new Date(run.started_at).toLocaleDateString()} · {run.score ? run.score.overall + ' · ' + run.score.band : 'Ended without a score'}{run.test ? ' · practice in the studio' : ''}</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
        {run.score && <ScoreView score={run.score} />}
        {run.score && !run.test && <ShareRow counsellor={counsellor} shared={!!run.shared_at} confirmed={!!run.confirmed_at} busy={busy} share={act(shareAvatarRun)} withdraw={act(withdrawAvatarRun)} />}
        {problem && <div role="alert" style={{ color: '#a33' }}>{problem}</div>}
        <AvatarTranscript turns={run.turns} />
      </div>
    </details>
  );
}

// My earlier runs on this learning, except the one on screen. Not in View as, by decision: a counsellor sees the formal track only, and a run reaches them only when the learner
// shares it, so the subject's practice runs are never listed to whoever views as them (decisions.md, Task 6.6). A run left open is not listed until it is finished.
export default function AvatarRuns({ learningId, skip, counsellor }: { learningId: string; skip: string | null; counsellor: string }) {
  const [runs, setRuns] = useState<AvatarRunRow[]>([]);
  const load = useCallback(() => { void myAvatarRuns(learningId).then(setRuns, () => {}); }, [learningId]);
  useEffect(load, [load, skip]);
  const shown = runs.filter((r) => r.id !== skip && r.finished_at);
  if (!shown.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' }}>Your earlier runs</div>
      {shown.map((r) => <PastRun key={r.id} run={r} counsellor={counsellor} reload={load} />)}
    </div>
  );
}
