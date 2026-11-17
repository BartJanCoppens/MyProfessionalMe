// Studio step "Produce", build part: the studio's build steps with a status each and a Retry on a failed step only
// (GameStudio's pattern). The state machine is src/logic/studioBuild.ts; without a runner nothing can be built, and it says so.
import { useState } from 'react';
import { Button, Tag } from '../ds';
import { retryStep, runBuild } from '../logic/studioBuild';
import type { BuildRunner, BuildStepState, StepStatus } from '../logic/studioBuild';

const WORD: Record<StepStatus, string> = { todo: 'To do', running: 'Running', done: 'Done', failed: 'Failed' };
const TONE: Record<StepStatus, 'muted' | 'blue' | 'green' | 'amber'> = { todo: 'muted', running: 'blue', done: 'green', failed: 'amber' };

// Controlled: the steps' state lives on the draft (nw.build), so it survives Back and Next.
export default function StudioBuild({ steps, onChange, runner, readOnly }: { steps: BuildStepState[]; onChange: (steps: BuildStepState[]) => void; runner: BuildRunner | undefined; readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!runner) return <div style={{ fontSize: 12.5, color: '#5a6058' }}>Building comes with this studio</div>;
  const go = async (job: () => Promise<unknown>) => { setBusy(true); try { await job(); } finally { setBusy(false); } };
  const start = () => go(() => runBuild(steps, runner, onChange));
  const retry = (k: number) => go(() => retryStep(steps, k, runner, onChange));
  const started = steps.some((s) => s.status !== 'todo');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 500 }}>Build</div>
      {steps.map((s, k) => (
        <div key={s.name} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, border: '1px solid #eef0ea', borderRadius: 5, padding: '6px 10px' }}>
          <span style={{ flex: '1 1 200px' }}>{k + 1}. {s.name}</span>
          <Tag tone={TONE[s.status]}>{WORD[s.status]}</Tag>
          {s.error && <span role="alert" style={{ color: '#7a5000' }}>{s.error}</span>}
          {s.status === 'failed' && !readOnly && <Button size="sm" variant="secondary" onClick={() => retry(k)} disabled={busy}>Retry</Button>}
        </div>
      ))}
      {!readOnly && !started && <div><Button size="sm" onClick={start} disabled={busy}>Start building</Button></div>}
    </div>
  );
}
