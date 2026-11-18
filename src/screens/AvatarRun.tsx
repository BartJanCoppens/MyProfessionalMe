// One practice run on screen (studios plan, Task 6.6): the stage, the conversation as it goes, how to answer, and the end. A line the guardrail held shows the marker,
// never the line or the guard's code; the character's in-role answer shows as it was said. An ended run shows the AI's score (a practice-only run shows nothing).
import { Banner, Button } from '../ds';
import type { useAvatarRun } from '../avatar/useAvatarRun';
import type { AvatarVals } from '../fmtAvatar';
import { LANGUAGES } from '../../supabase/functions/_shared/avatarRules.ts';
import AvatarInput from './AvatarInput';
import AvatarStage from './AvatarStage';
import { HELD_MARKER } from './AvatarScoreCard';
import { ScoreView, ShareRow } from './AvatarRuns';

type Run = ReturnType<typeof useAvatarRun>;
const small = { fontSize: 12.5, color: '#5a6058' } as const;

export default function AvatarRun({ av, run }: { av: AvatarVals; run: Run }) {
  const open = run.phase === 'live', working = run.busy !== null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {open && <AvatarStage av={av} runId={run.runId!} heard={run.heard} />}
      <ol aria-label="The conversation" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
        {run.lines.map((l, k) => (
          <li key={k} style={{ alignSelf: l.who === 'learner' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: l.who === 'learner' ? '#eef0ec' : '#f6f9ef', borderRadius: 8, padding: '7px 11px' }}>
            {l.held ? <i style={small}>{HELD_MARKER}</i> : l.text}
          </li>
        ))}
      </ol>
      {run.error && <div role="alert"><Banner tone="warning">{run.error}</Banner></div>}
      {open && <AvatarInput lang={LANGUAGES[av.language].speech} disabled={working} onSend={run.send} />}
      {open && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => void run.end()} disabled={working}>{av.scored ? 'End and score' : 'End the run'}</Button>
          {av.scored && run.error && <Button variant="secondary" onClick={() => void run.endWithoutScore()} disabled={working}>End without a score</Button>}
        </div>
      )}
      {run.phase === 'ended' && !run.score && <div style={small}>The run has ended{av.scored ? ' without a score' : ' · practice only, nothing is scored'}.</div>}
      {run.score && <ScoreView score={run.score} />}
      {run.score && !av.test && !av.ro && <ShareRow counsellor={av.counsellor} shared={run.shared} confirmed={false} busy={working} share={() => void run.share()} withdraw={() => void run.withdraw()} />}
    </div>
  );
}
