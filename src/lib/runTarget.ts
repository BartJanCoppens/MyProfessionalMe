// What a run is on: a published learning (a real run) or a contribution (a play-test or practice run by its author or an assigned reviewer).
// The one shape Game runs (gameStore) and Avatar runs (avatarStore) both start from.
export type RunTarget = { learningId: string } | { contributionId: string };

/** The insert row of a run on this target; a run on a contribution is a test, and a test never counts. */
export const runRow = (target: RunTarget): { contribution_id?: string; learning_id?: string; test: boolean } =>
  'contributionId' in target ? { contribution_id: target.contributionId, test: true } : { learning_id: target.learningId, test: false };
