// What the learner's trajectory view-models share: the subject's enrolments, credentials and industry and technology
// memberships, who the counsellor is, and
// the one way an action writes (through Logic.persist, so View as refuses it) and reloads the subject's data.
import { loadAudiences } from './lib/membershipStore';
import { loadCredentials, loadEnrolments } from './lib/trajectoryStore';
import { audienceKeys } from './logic/membership';
import { effectiveEnrolment } from './logic/trajectoryLearner';
import type { TrjMine } from './logic/trajectoryLearner';
import type { Credential, Enrolment, Trajectory } from './logic/trajectory';
import type { Item, Logic } from './model';
import type { AppState, Screen } from './types';

export type Ctx = {
  L: Logic; byId: Record<string, Item>; me: string; ro: boolean; now: Date; boss: string; bossFirst: string;
  person: { line: string | null; stage: string | null; audiences: string[] }; enrols: Record<string, Enrolment>; creds: Credential[];
};

// Data loaded for another person (the viewed person changed meanwhile) is never shown.
export const mineOf = (L: Logic): TrjMine | null => (L.state.trjMine?.userId === L.subject.id ? L.state.trjMine : null);

export function context(L: Logic, byId: Record<string, Item>): Ctx {
  const mine = mineOf(L);
  return {
    L, byId, me: L.subject.id, ro: L.subject.readOnly, now: new Date(), boss: L.counsellorFull(), bossFirst: L.counsellorFirst(),
    person: { line: L.subject.businessLine, stage: L.subject.stage, audiences: mine?.audiences ?? [] }, enrols: mine?.enrols ?? {}, creds: mine?.creds ?? [],
  };
}

// The subject's industry and technology memberships (none until loaded, never another person's).
export const audiencesOf = (L: Logic): string[] => mineOf(L)?.audiences ?? [];
// The audience keys trajectories are matched on: the business line, then the memberships.
export const keysOf = (c: Ctx): string[] => audienceKeys(c.L.bl(), c.person.audiences);

// This person's enrolment: the stored row, or a mandatory auto-enrolment that has none yet.
export const enrolmentOf = (c: Ctx, t: Trajectory) => effectiveEnrolment(t, c.enrols[t.id], c.person, c.now);
// Live trajectories, plus any the person is enrolled in (a retired one still lets them finish).
export const visibleTo = (c: Ctx) => c.L.state.trjs.filter((t) => t.status === 'live' || !!c.enrols[t.id]);

// A confirmed, unexpired credential from this trajectory: the only proof that it ended in one (as on My team).
export const credentialEarned = (c: Ctx, t: Trajectory) => {
  const today = c.now.toISOString().slice(0, 10);
  return c.creds.some((cr) => cr.trajectory_id === t.id && cr.status === 'confirmed' && (cr.expires_on == null || cr.expires_on >= today));
};

// current: whether the loaded data may still be written, given the state when it lands.
export async function loadMine(L: Logic, current: (s: AppState) => boolean = () => true) {
  const userId = L.subject.id;
  const [enrols, creds, audiences] = await Promise.all([loadEnrolments(userId), loadCredentials(userId), loadAudiences(userId)]);
  L.setState((s) => (current(s) ? { trjMine: { userId, enrols, creds, audiences } } : {}));
}

// Writes in flight, per key (one trajectory or one credential of one person): a second click waits for the first.
const BUSY = new Set<string>();
// One write: refused in View as, a refusal (returned as `error`) becomes a toast, success reloads the subject's data.
// The reload never replaces another person's data (the viewed person changed while the write was on its way).
export async function act(c: Ctx, write: () => Promise<{ error: string | null }>, done: string, after?: () => void, key?: string) {
  if (key && BUSY.has(key)) return;
  if (key) BUSY.add(key);
  const userId = c.me;
  try {
    await c.L.persist(async () => {
      const { error } = await write();
      if (error) throw new Error(error);
      await loadMine(c.L, (s) => !s.trjMine || s.trjMine.userId === userId);
      after?.();
    }, done);
  } finally { if (key) BUSY.delete(key); }
}

export function openTrajectory(L: Logic, id: string, origin: Screen) {
  L.setState({ screen: 'trajectory', trjView: id, trjOrigin: origin, sel: null }); window.scrollTo(0, 0);
}
