// The Game panel as view-model (studios plan, Task 4.3): a published game on the sealed frame (src/game), its runs and its
// leaderboard (first name and initial, S11). A finished run is a score and a time, never progress: the learning completes as
// a Game always did, by the reflection the counsellor accepts (no progress write here, completionText). View as plays but
// saves nothing; a play-test (a studio's preview, or an author or reviewer on a saved contribution) is a test run or none,
// and never counts. The Game Studio's preview and the review views run the same view (studioPreviews.tsx).
import { firstNameInitial } from './game/protocol';
import type { LeaderRow } from './game/protocol';
import { finishRun, leaderboard, myBest, startRun } from './lib/gameStore';
import type { RunTarget } from './lib/gameStore';
import { fmtTime } from './logic/media';
import { completionText } from './logic/record';
import type { Item, Logic } from './model';
import type { GameContent } from './types';

// learningId: the learner's game (a real run); contributionId: a saved contribution's play-test (a test run); neither: an unsaved
// preview (no run). ro: View as.
export type GameOpts = { ro: boolean; learningId: string | null; contributionId: string | null; player: string; accepter: string };

export const rowLine = (r: LeaderRow) => r.name + ' · ' + r.score + ' · ' + fmtTime(r.seconds);

export function gameView(c: GameContent, o: GameOpts) {
  const target: RunTarget | null = o.ro ? null : o.learningId ? { learningId: o.learningId } : o.contributionId ? { contributionId: o.contributionId } : null;
  const learning = o.learningId;
  return {
    // Changes when the standings to show change (the learning, View as); the closures below are new on every render.
    key: (learning ?? '') + (o.ro ? ':ro' : ''), content: c, files: c.files, player: o.player, test: !learning,
    data: { concept: c.concept, win: c.win, rounds: c.rounds },
    sub: c.rounds.length + ' rounds · ' + (c.role ? 'an AI plays ' + c.role.kind.toLowerCase() : 'no AI role') + ' · ' + (c.leaderboard === 'None' ? 'no leaderboard' : c.leaderboard + ' leaderboard') + ' · Made with AI',
    note: o.ro ? 'Viewing someone else: playing saves nothing' : !learning ? 'A play-test never counts and never shows on a leaderboard.'
      : c.leaderboard === 'None' ? 'There is no leaderboard; only your reflection completes the learning.' : 'A finished run goes on the leaderboard; only your reflection completes the learning.',
    completion: completionText('Game', o.accepter, true),
    // The run to play on: null when nothing is saved.
    start: async (): Promise<string | null> => (target ? startRun(target) : null),
    finish: finishRun,
    // In View as the board would be the viewer's (a team is relative to the signed-in person), so it is not shown.
    board: learning && !o.ro && c.leaderboard !== 'None' ? () => leaderboard(learning) : null,
    best: learning && !o.ro ? () => myBest(learning) : null,
  };
}
export type GameView = ReturnType<typeof gameView>;

export const gameVals = (L: Logic, it: Item, c: GameContent) =>
  gameView(c, { ro: L.subject.readOnly, learningId: it.id, contributionId: null, player: firstNameInitial(L.subject.name), accepter: L.counsellorFull() });
