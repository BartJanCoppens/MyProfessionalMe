// What the learner's trajectory view-models share: the subject's enrolments and credentials, who the counsellor is, and
// the one way an action writes (through Logic.persist, so View as refuses it) and reloads the subject's data.
import { loadCredentials, loadEnrolments } from './lib/trajectoryStore';
import { effectiveEnrolment } from './logic/trajectoryLearner';
import type { TrjMine } from './logic/trajectoryLearner';
import type { Credential, Enrolment, Trajectory } from './logic/trajectory';
import type { Item, Logic } from './model';
import type { Screen } from './types';

export type Ctx = {
  L: Logic; byId: Record<string, Item>; me: string; ro: boolean; now: Date; boss: string; bossFirst: string;
  person: { line: string | null; stage: string | null }; enrols: Record<string, Enrolment>; creds: Credential[];
};

// Data loaded for another person (the viewed person changed meanwhile) is never shown.
export const mineOf = (L: Logic): TrjMine | null => (L.state.trjMine?.userId === L.subject.id ? L.state.trjMine : null);

export function context(L: Logic, byId: Record<string, Item>): Ctx {
  const mine = mineOf(L);
  return {
    L, byId, me: L.subject.id, ro: L.subject.readOnly, now: new Date(), boss: L.counsellorFull(), bossFirst: L.counsellorFirst(),
    person: { line: L.subject.businessLine, stage: L.subject.stage }, enrols: mine?.enrols ?? {}, creds: mine?.creds ?? [],
  };
}

// This person's enrolment: the stored row, or a mandatory auto-enrolment that has none yet.
export const enrolmentOf = (c: Ctx, t: Trajectory) => effectiveEnrolment(t, c.enrols[t.id], c.person, c.now);
// Live trajectories, plus any the person is enrolled in (a retired one still lets them finish).
export const visibleTo = (c: Ctx) => c.L.state.trjs.filter((t) => t.status === 'live' || !!c.enrols[t.id]);

export async function loadMine(L: Logic) {
  const userId = L.subject.id;
  const [enrols, creds] = await Promise.all([loadEnrolments(userId), loadCredentials(userId)]);
  L.setState({ trjMine: { userId, enrols, creds } });
}

// One write: refused in View as, a refusal (returned as `error`) becomes a toast, success reloads the subject's data.
export function act(c: Ctx, write: () => Promise<{ error: string | null }>, done: string, after?: () => void) {
  return c.L.persist(async () => {
    const { error } = await write();
    if (error) throw new Error(error);
    await loadMine(c.L);
    after?.();
  }, done);
}

export function openTrajectory(L: Logic, id: string, origin: Screen) {
  L.setState({ screen: 'trajectory', trjView: id, trjOrigin: origin, sel: null }); window.scrollTo(0, 0);
}
