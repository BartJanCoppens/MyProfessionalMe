// Editing a trajectory in the admin screen: new trajectories, step ids, adding, moving and removing steps, mapping.
// Pure: each function returns the new value. Step ids are s<number> and never change when steps move.
import { BLS } from '../data';
import type { StepKind, Trajectory, TrjStep } from './trajectory';

// Step ids are never derived from the current steps: an enrolment keeps its state by step id, so an id freed by a removed step
// must not come back. Seed ids (s1...) stay; new ones are s + time + two random characters, regenerated on a clash.
export function nextStepId(steps: TrjStep[]): string {
  const taken = new Set(steps.map((s) => s.id));
  for (;;) {
    const id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4).padEnd(2, '0');
    if (!taken.has(id)) return id;
  }
}

// The database refuses an empty name or credential, so a trajectory with either is kept on screen but not saved.
export const saveable = (t: Trajectory) => t.name.trim() !== '' && t.credential.trim() !== '';

export function blankTrajectory(line: string | null): Trajectory {
  return {
    id: '', name: 'New trajectory', issuer: 'Internal academy', credential: 'New credential', enrol: 'open', months: 12, valid_months: null, renewal: '', cost: '',
    status: 'draft', business_line: line, published_at: null, maps: [],
    steps: [{ id: 's1', k: 'exam', title: 'Final assessment', hours: 2, win: 12, req: true, pre: null }],
  };
}

type NewStep = { k: StepKind; lid?: string };
// The design's defaults: the window of the last step; a sign-off and an exam wait for the step before them.
export function addStep(steps: TrjStep[], what: NewStep, months: number): TrjStep[] {
  const win = steps.length ? steps[steps.length - 1].win || 1 : 1, last = steps.length ? steps[steps.length - 1].id : null, id = nextStepId(steps);
  const base = { id, win, req: true, pre: null };
  const made: Record<StepKind, TrjStep> = {
    learn: { ...base, k: 'learn', lid: what.lid },
    elect: { ...base, k: 'elect', opts: [], pick: 1 },
    evidence: { ...base, k: 'evidence', title: 'Describe the evidence', hours: 0 },
    check: { ...base, k: 'check', title: 'Counsellor sign-off', hours: 0, pre: last },
    exam: { ...base, k: 'exam', title: 'Exam', hours: 2, win: Math.max(win, months), pre: last },
  };
  return steps.concat([made[what.k]]);
}

// A prerequisite must come earlier; after a move one that no longer does is cleared.
const fixPre = (steps: TrjStep[]) => steps.map((s, i) => (s.pre && !steps.slice(0, i).some((x) => x.id === s.pre) ? { ...s, pre: null } : s));

export function moveStep(steps: TrjStep[], id: string, dir: -1 | 1): TrjStep[] {
  const i = steps.findIndex((s) => s.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= steps.length) return steps;
  const out = steps.slice(); [out[i], out[j]] = [out[j], out[i]];
  return fixPre(out);
}

export const removeStep = (steps: TrjStep[], id: string): TrjStep[] => steps.filter((s) => s.id !== id).map((s) => (s.pre === id ? { ...s, pre: null } : s));

export function earlierSteps(steps: TrjStep[], id: string): TrjStep[] {
  const i = steps.findIndex((s) => s.id === id);
  return i < 0 ? [] : steps.slice(0, i);
}

// Mandatory only for a business-line audience on an auto-enrol trajectory; everything else is advised. null: already mapped.
export function addMap(t: Trajectory, aud: string, stage: string): Trajectory | null {
  if (t.maps.some((m) => m[0] === aud && m[1] === stage)) return null;
  return { ...t, maps: t.maps.concat([[aud, stage, BLS.includes(aud) && t.enrol === 'auto' ? 'mandatory' : 'advised']]) };
}
