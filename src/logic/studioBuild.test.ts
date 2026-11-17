import { describe, expect, it } from 'vitest';
import { retryStep, runBuild, startBuild } from './studioBuild';
import type { BuildRunner } from './studioBuild';

const NAMES = ['Writing the script', 'Voicing host and guest', 'Mixing and chapter marks'];
const statuses = (steps: { status: string }[]) => steps.map((s) => s.status);

describe('studio build steps', () => {
  it('starts with every step to do', () => { expect(statuses(startBuild(NAMES))).toEqual(['todo', 'todo', 'todo']); });

  it('runs the steps in order and marks each done', async () => {
    const seen: string[] = [];
    const runner: BuildRunner = async (name) => { seen.push(name); };
    const done = await runBuild(startBuild(NAMES), runner, () => {});
    expect(seen).toEqual(NAMES);
    expect(statuses(done)).toEqual(['done', 'done', 'done']);
  });

  it('shows a step as running while it runs', async () => {
    const trail: string[][] = [];
    await runBuild(startBuild(NAMES.slice(0, 1)), async () => {}, (s) => trail.push(statuses(s)));
    expect(trail).toEqual([['running'], ['done']]);
  });

  it('stops at the first failure with its message and leaves later steps to do', async () => {
    const runner: BuildRunner = async (_n, i) => { if (i === 1) throw new Error('Voice service unavailable'); };
    const out = await runBuild(startBuild(NAMES), runner, () => {});
    expect(statuses(out)).toEqual(['done', 'failed', 'todo']);
    expect(out[1].error).toBe('Voice service unavailable');
  });

  it('retries a failed step alone and leaves the others untouched', async () => {
    let fail = true; const calls: number[] = [];
    const runner: BuildRunner = async (_n, i) => { calls.push(i); if (i === 1 && fail) throw new Error('boom'); };
    const failed = await runBuild(startBuild(NAMES), runner, () => {});
    calls.length = 0; fail = false;
    const after = await retryStep(failed, 1, runner, () => {});
    expect(calls).toEqual([1]);
    expect(statuses(after)).toEqual(['done', 'done', 'todo']);
    expect(after[0]).toBe(failed[0]);
    expect(after[2]).toBe(failed[2]);
  });

  it('refuses to retry a step that has not failed', async () => {
    const calls: number[] = [];
    const steps = await runBuild(startBuild(NAMES), async () => {}, () => {});
    const after = await retryStep(steps, 0, async (_n, i) => { calls.push(i); }, () => {});
    expect(calls).toEqual([]);
    expect(after).toBe(steps);
  });

  it('keeps a step failed, with the new message, when the retry fails again', async () => {
    const failing: BuildRunner = async (_n, i) => { if (i === 0) throw new Error('first'); };
    const once = await runBuild(startBuild(NAMES), failing, () => {});
    const twice = await retryStep(once, 0, async () => { throw new Error('second'); }, () => {});
    expect(statuses(twice)).toEqual(['failed', 'todo', 'todo']);
    expect(twice[0].error).toBe('second');
  });
});
