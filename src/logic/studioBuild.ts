// A studio's build steps (Reel: "Writing the voice-over", "Final cut"...) as a small state machine, GameStudio's pattern:
// each step is todo, running, done or failed; a failed step can be retried alone. The runner does the real work of one
// step; a studio without a runner cannot build (the UI says so, it never shows a made-up success).
export type StepStatus = 'todo' | 'running' | 'done' | 'failed';
export type BuildStepState = { name: string; status: StepStatus; error?: string };
export type BuildRunner = (name: string, index: number) => Promise<void>;
type OnChange = (steps: BuildStepState[]) => void;

export const startBuild = (names: string[]): BuildStepState[] => names.map((name) => ({ name, status: 'todo' }));

const replace = (steps: BuildStepState[], index: number, next: BuildStepState) => steps.map((s, k) => (k === index ? next : s));

async function runStep(steps: BuildStepState[], index: number, runner: BuildRunner, onChange: OnChange): Promise<BuildStepState[]> {
  const running = replace(steps, index, { name: steps[index].name, status: 'running' });
  onChange(running);
  let result: BuildStepState;
  try { await runner(steps[index].name, index); result = { name: steps[index].name, status: 'done' }; }
  catch (e) { result = { name: steps[index].name, status: 'failed', error: e instanceof Error ? e.message : 'The step failed' }; }
  const next = replace(running, index, result);
  onChange(next);
  return next;
}

// Runs every step that is not done yet, in order, and stops at the first failure.
export async function runBuild(steps: BuildStepState[], runner: BuildRunner, onChange: OnChange): Promise<BuildStepState[]> {
  let cur = steps;
  for (let k = 0; k < cur.length; k++) {
    if (cur[k].status === 'done') continue;
    cur = await runStep(cur, k, runner, onChange);
    if (cur[k].status === 'failed') break;
  }
  return cur;
}

// Runs one failed step again; every other step is left exactly as it was. Any other step is returned unchanged.
export async function retryStep(steps: BuildStepState[], index: number, runner: BuildRunner, onChange: OnChange): Promise<BuildStepState[]> {
  return steps[index]?.status === 'failed' ? runStep(steps, index, runner, onChange) : steps;
}
