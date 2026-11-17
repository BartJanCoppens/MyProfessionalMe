import { describe, expect, it, vi } from 'vitest';
import { blankTrajectory } from './trajectoryEdit';
import { trajectoryProgress } from './trajectory';
import type { Enrolment, Trajectory, TrjStep } from './trajectory';
import { certConstellation, certDockRows, certRadar, certRoadLanes } from './certLayer';
import type { CertEntry } from './certLayer';

const learn = (id: string, lid: string, over: Partial<TrjStep> = {}): TrjStep => ({ id, k: 'learn', lid, win: 2, req: true, pre: null, ...over });
const trj = (steps: TrjStep[], over: Partial<Trajectory> = {}): Trajectory => ({ ...blankTrajectory('Audit'), id: 'T1', name: 'Tax certificate', credential: 'Certified adviser', issuer: 'ITAA', status: 'live', months: 12, steps, ...over });
const START = 2026 * 12 + 9;
const enrolled: Enrolment = { status: 'enrolled', start_month: START, steps: {} };
const lib = (state: 'accepted' | 'not-started' = 'not-started') => ({ hours: 4, cpd: 0, state, pct: 0 });
const entry = (t: Trajectory, byId: Record<string, ReturnType<typeof lib>>, earned = false, e: Enrolment = enrolled, open = vi.fn()): CertEntry =>
  ({ t, e, pg: trajectoryProgress(t, e, byId), earned, open });
const pos = { A: { x: 100, y: 100, r: 8 }, B: { x: 300, y: 120, r: 8 }, C: { x: 500, y: 90, r: 8 } };

describe('certConstellation', () => {
  const t = trj([learn('s1', 'A'), learn('s2', 'GONE'), learn('s3', 'C'), learn('s4', 'B')]);
  const byId = { A: lib(), B: lib(), C: lib() };
  it('draws one thread through the learning nodes in step order, skipping learnings without a node', () => {
    const { threads } = certConstellation([entry(t, byId)], pos, 1);
    expect(threads).toHaveLength(1);
    expect(threads[0].points.split(' ').slice(0, 3)).toEqual(['100.0,100.0', '500.0,90.0', '300.0,120.0']);
  });
  it('ends the thread on the credential diamond and rings each node', () => {
    const l = certConstellation([entry(t, byId)], pos, 1);
    const last = threads_last(l.threads[0].points);
    expect(last).toEqual([l.creds[0].x.toFixed(1), l.creds[0].y.toFixed(1)]);
    expect(l.rings.map((r) => [r.x, r.y])).toEqual([[100, 100], [500, 90], [300, 120]]);
  });
  it('fills the diamond only for a confirmed credential, not merely a complete trajectory', () => {
    const done = { A: lib('accepted'), B: lib('accepted'), C: lib('accepted') };
    const complete = entry(trj([learn('s1', 'A'), learn('s3', 'C'), learn('s4', 'B')]), done, false);
    expect(complete.pg.complete).toBe(true);
    expect(certConstellation([complete], pos, 1).creds[0].filled).toBe(false);
    expect(certConstellation([{ ...complete, earned: true }], pos, 1).creds[0].filled).toBe(true);
  });
  it('has nothing for a trajectory whose learnings have no node, and nothing for no trajectories', () => {
    expect(certConstellation([entry(t, byId)], {}, 1)).toEqual({ threads: [], rings: [], creds: [], labels: [] });
    expect(certConstellation([], pos, 1).threads).toEqual([]);
  });
  it('opens the trajectory from the diamond and the label, and passes the dim level on', () => {
    const open = vi.fn();
    const l = certConstellation([entry(t, byId, false, enrolled, open)], pos, 0.25);
    l.creds[0].onClick(); l.labels[0].onClick();
    expect(open).toHaveBeenCalledTimes(2);
    expect([l.threads[0].op, l.creds[0].op, l.labels[0].op, l.rings[0].op]).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(l.labels[0].label).toBe('◆ Tax certificate');
  });
  it('keeps two diamonds apart', () => {
    const t2 = trj(t.steps, { id: 'T2', name: 'Other' });
    const l = certConstellation([entry(t, byId), entry(t2, byId)], pos, 1);
    expect(Math.hypot(l.creds[0].x - l.creds[1].x, l.creds[0].y - l.creds[1].y)).toBeGreaterThanOrEqual(40);
  });
});
function threads_last(points: string) { return points.split(' ').pop()!.split(','); }

describe('certRadar', () => {
  const domains: [string, string][] = [['tax', 'Tax'], ['tech', 'Tech'], ['prof', 'Prof']], cur = [1, 2, 3], target = [5, 5, 5];
  const learning = { A: { dom: 'tax', lvl: 4 }, B: { dom: 'tech', lvl: 1 } };
  const t = trj([learn('s1', 'A'), { id: 'e', k: 'elect', opts: ['B'], pick: 1, win: 3, req: true, pre: null }]);
  const byId = { A: lib(), B: lib() };
  it('lifts the level of every domain a trajectory teaches, never lowers one, and focuses the first by default', () => {
    const [r] = certRadar([entry(t, byId)], learning, domains, cur, target, null);
    expect(r.focus).toBe(true);
    expect(r.legend).toBe('◆ Tax certificate lifts Tax to L4');
    expect(r.points.split(' ')).toHaveLength(3);
  });
  it('says so when it adds no new level, and focuses the chosen trajectory', () => {
    const t2 = trj([learn('s1', 'B')], { id: 'T2', name: 'Small' });
    const rows = certRadar([entry(t, byId), entry(t2, byId)], learning, domains, cur, target, 'T2');
    expect(rows.map((r) => r.focus)).toEqual([false, true]);
    expect(rows[1].legend).toBe('◆ Small adds no new level');
  });
  it('marks a closed gap and falls back to the first when the focus is unknown', () => {
    const rows = certRadar([entry(t, byId)], { A: { dom: 'tax', lvl: 3 } }, domains, cur, [3, 3, 3], 'nope');
    expect(rows[0].legend).toBe('◆ Tax certificate lifts Tax to L3 (gap closed)');
    expect(rows[0].focus).toBe(true);
  });
  it('selects through the callback', () => {
    const select = vi.fn();
    certRadar([entry(t, byId)], learning, domains, cur, target, null, select)[0].select();
    expect(select).toHaveBeenCalledWith('T1');
  });
});

describe('certRoadLanes', () => {
  const titleOf = (id: string) => 'Learning ' + id;
  const t = trj([learn('s1', 'A', { win: 1 }), { id: 'x', k: 'exam', title: 'Final exam', hours: 2, win: 11, req: true, pre: 's1' }]);
  it('puts open steps in the quarter of their window and the credential in the quarter it is due', () => {
    const [lane] = certRoadLanes([entry(t, { A: lib() })], titleOf, 'Sam');
    expect(lane.label).toBe('◆ Tax certificate');
    expect(lane.cells[0].items.map((i) => i.title)).toEqual(['Learning A']);
    expect(lane.cells[3].items.map((i) => i.title)).toEqual(['Final exam', '◆ Certified adviser']);
    expect(lane.cells[3].items[0].sub).toBe('Exam · after step 1');
    expect(lane.sub).toBe('0 of 2 required steps · credential by ' + 'Oct 2027');
  });
  it('leaves done steps out and the lane out once the trajectory is complete', () => {
    const [lane] = certRoadLanes([entry(t, { A: lib('accepted') })], titleOf, 'Sam');
    expect(lane.cells.flatMap((c) => c.items).map((i) => i.title)).toEqual(['Final exam', '◆ Certified adviser']);
    const e: Enrolment = { status: 'enrolled', start_month: START, steps: { x: { state: 'done' } } };
    expect(certRoadLanes([entry(t, { A: lib('accepted') }, false, e)], titleOf, 'Sam')).toEqual([]);
  });
  it('names the counsellor on a submitted step and clamps a late window to the last quarter', () => {
    const t2 = trj([{ id: 'ev', k: 'evidence', title: 'Portfolio', win: 40, req: true, pre: null }]);
    const e: Enrolment = { status: 'enrolled', start_month: START, steps: { ev: { state: 'submitted' } } };
    const [lane] = certRoadLanes([entry(t2, {}, false, e)], titleOf, 'Sam');
    expect(lane.cells[3].items[0].sub).toContain('with Sam');
  });
  it('opens the trajectory from the lane and every item', () => {
    const open = vi.fn();
    const [lane] = certRoadLanes([entry(t, { A: lib() }, false, enrolled, open)], titleOf, 'Sam');
    lane.select(); lane.cells[0].items[0].onClick();
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe('certDockRows', () => {
  const titleOf = (id: string) => 'Learning ' + id;
  const t = trj([learn('s1', 'A'), learn('s2', 'B')]);
  it('lists progress and the next step', () => {
    const [row] = certDockRows([entry(t, { A: lib('accepted'), B: lib() })], titleOf, 'Sam');
    expect(row).toMatchObject({ name: '◆ Tax certificate', barW: '50%', prog: '1 of 2 required steps', next: 'Next: Learning B' });
    expect(row.sub).toBe('Certified adviser · expected Oct 2027');
  });
  it('says when every step is done, and when the next step waits on someone', () => {
    const done = { A: lib('accepted'), B: lib('accepted') };
    expect(certDockRows([entry(t, done)], titleOf, 'Sam')[0].next).toBe('All steps done');
    const t2 = trj([learn('s1', 'GONE')]);
    expect(certDockRows([entry(t2, {})], titleOf, 'Sam')[0].next).toBe('Waiting on Sam or a prerequisite');
  });
  it('shows a confirmed credential', () => {
    const done = { A: lib('accepted'), B: lib('accepted') };
    expect(certDockRows([entry(t, done, true)], titleOf, 'Sam')[0].next).toBe('Credential earned');
  });
});
