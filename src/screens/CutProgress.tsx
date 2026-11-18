// What a cut in progress or a failed one shows (studios plan, Task 5.4), for the Slides video and the Reel's build step: the
// percent, the time left, the plain instruction to keep the tab open and in front (a hidden tab stops it), and Cancel; after a
// failure the reason with Retry and that nothing was saved. Nothing here is stored.
import { Button } from '../ds';
import { timeLeft } from '../reel/cutRules';
import type { CutState } from './useCutRun';

const muted = { fontSize: 12.5, color: '#5a6058' };

export default function CutProgress({ state, seconds, onCancel, onRetry }: { state: CutState; seconds: number; onCancel: () => void; onRetry: () => void }) {
  if (state.kind === 'running') {
    return (
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={muted}>Rendering {state.pct} % · about {timeLeft(seconds, state.pct)} left · keep this tab open and in front</div>
        <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: '#e1e5dc', overflow: 'hidden' }}><div style={{ width: state.pct + '%', height: '100%', background: '#86BC25' }} /></div>
        <div><Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button></div>
      </div>
    );
  }
  if (state.kind !== 'failed') return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div role="alert" style={{ ...muted, color: '#7a5000' }}>{state.message}</div>
      {!/nothing was saved/i.test(state.message) && <div style={muted}>Nothing was saved</div>}
      <div><Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button></div>
    </div>
  );
}
