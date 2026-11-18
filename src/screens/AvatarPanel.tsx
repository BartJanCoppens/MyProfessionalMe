// The practice panel (studios plan, Task 6.6): the learner's avatar on the detail page (the seeded L38 to L41, or a studio scenario) and the Avatar Studio's preview
// (a test run on a saved draft; the same panel, never counted). It reads the view-model (fmtAvatar.ts); the run's state lives here (useAvatarRun). A run never writes
// progress: a learning completes by its quiz, the AI's score is advice and the counsellor's confirmation a note.
import { Button, Card } from '../ds';
import { useAvatarRun } from '../avatar/useAvatarRun';
import { PRACTICE_NEEDS_AI, PRIVACY_NOTE } from '../fmtAvatar';
import type { AvatarVals } from '../fmtAvatar';
import AiMadeTag from './AiMadeTag';
import AvatarRun from './AvatarRun';
import AvatarRuns from './AvatarRuns';

const small = { fontSize: 12.5, color: '#5a6058' } as const;
const caps = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' } as const;
export const VIEW_AS_NOTE = 'Viewing someone else: practising saves nothing';
export const SAVE_FIRST = 'Save the draft to practise with it';

function Skills({ av }: { av: Extract<AvatarVals, { seeded: true }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={caps}>Best scores · the target is 4 of 5 on every skill</div>
      {av.skills.map((sk) => (
        <div key={sk.name} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) 44px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
          <span>{sk.name}</span>
          <div style={{ position: 'relative', height: 8, borderRadius: 999, background: '#eef0ec' }}>
            <div style={{ height: '100%', borderRadius: 999, width: sk.w, background: sk.color, transition: 'width .3s' }} />
            <div style={{ position: 'absolute', top: -3, bottom: -3, left: sk.tgt, width: 2, background: '#1a1d18' }} />
          </div>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#5a6058' }}>{sk.val}</span>
        </div>
      ))}
    </div>
  );
}

// Why there is no Start, or the Start itself.
function startState(av: AvatarVals): string {
  if (av.seeded) return av.note;
  if (av.ro) return VIEW_AS_NOTE;
  if (!av.conversation) return PRACTICE_NEEDS_AI;
  return av.test && !av.learningId && !av.contributionId ? SAVE_FIRST : '';
}

export default function AvatarPanel({ av }: { av: AvatarVals }) {
  const run = useAvatarRun({ opening: av.opening, scored: av.scored, deps: av.deps });
  const why = startState(av);
  return (
    <Card title="Practise with the avatar" subtitle={av.sub}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{av.persona}</div>
            {av.role && av.role !== av.persona && <div style={small}>{av.role}</div>}
            <p style={{ margin: '6px 0 0', textWrap: 'pretty' }}>{av.brief}</p>
            {!av.seeded && <div style={{ ...small, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}><AiMadeTag on /><span>The character is played by AI · Made with AI</span></div>}
          </div>
          {!why && run.phase === 'idle' && <Button onClick={() => void run.start()} disabled={run.busy !== null}>Start a practice run</Button>}
          {!why && run.phase === 'ended' && <Button variant="secondary" onClick={() => void run.start()} disabled={run.busy !== null}>Start a practice run</Button>}
        </div>
        {why && <div style={small}>{why}</div>}
        {run.phase === 'idle' && run.error && <div role="alert" style={{ ...small, color: '#a33' }}>{run.error}</div>}
        {av.seeded ? <Skills av={av} /> : av.points.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={caps}>What you practise</div>
            {av.points.map((p) => <div key={p.text} style={{ fontSize: 12.5 }}>{p.text} · {p.weight} %</div>)}
          </div>
        )}
        {run.phase !== 'idle' && <AvatarRun av={av} run={run} />}
        {!av.seeded && av.learningId && !av.ro && <AvatarRuns learningId={av.learningId} skip={run.runId} counsellor={av.counsellor} />}
        {!av.test && <div style={{ fontSize: 12, color: '#8b918a', textWrap: 'pretty' }}>{PRIVACY_NOTE}</div>}
      </div>
    </Card>
  );
}
