// The Reel Studio's build step on screen (studios plan, Task 5.5): the four build steps, and the final cut's progress, time left and Cancel while it
// renders (the tab must stay open and in front). The cut runs on this screen's useCutRun, so a step that did not finish says why in its row and nothing is
// stored. Below: how the reel is told, what the cut was made from and the AI mark.
import type { CSSProperties } from 'react';
import type { VM } from '../model';
import { CUT_FAILED } from '../studioReel';
import CutProgress from './CutProgress';
import StudioBuild from './StudioBuild';
import { useCutRun } from './useCutRun';

type ST = NonNullable<VM['create']>['studio'];
const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };

export default function ReelBuild({ st }: { st: ST }) {
  const { state, run, cancel, failure } = useCutRun(), reel = st.reel!;
  const runner = reel.runner({ run: async (build, context) => { const made = await run(build, context); if (!made) throw new Error(failure() ?? CUT_FAILED); return made; } });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <StudioBuild steps={st.build!.steps} onChange={st.build!.set} runner={runner} readOnly={st.readOnly} />
      <CutProgress state={state.kind === 'running' ? state : { kind: 'idle' }} seconds={reel.seconds} onCancel={cancel} onRetry={() => {}} />
      <div style={muted}>{reel.line}</div>
      <div style={muted}>{reel.cut}</div>
      <div style={muted}>The cut is made in your browser and takes as long as the reel. The music is made in code. A reel the AI voiced or drafted carries a “Made with AI” mark in the corner.</div>
    </div>
  );
}
