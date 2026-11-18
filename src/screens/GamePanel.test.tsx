// @vitest-environment jsdom
// The Game panel (studios plan, Task 4.3): Play starts a run, the frame's score finishes it (never a progress write), the
// leaderboard shows first name and initial, score and time, View as and a play-test start no counted run, and the completion
// stays the counsellor-accepted reflection.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameView } from '../fmtGame';
import * as store from '../lib/gameStore';
import * as learner from '../lib/learnerStore';
import { completionOf, completionText } from '../logic/record';
import type { GameContent } from '../types';
import GamePanel from './GamePanel';
import { SavedContent } from './studioPreviews';

vi.mock('../lib/gameStore', () => ({ startRun: vi.fn(), finishRun: vi.fn(), leaderboard: vi.fn(), myBest: vi.fn() }));
vi.mock('../lib/learnerStore', () => ({ saveProgress: vi.fn() }));
// The sealed frame is tested in src/game; here a stand-in that reports what the panel handed it.
const frame = vi.hoisted(() => ({ props: null as null | Record<string, any> }));
vi.mock('../game/GameFrame', () => ({ GameFrame: (p: Record<string, any>) => { frame.props = p; return <div data-testid="frame" data-run={String(p.runId)} data-test={String(p.test)} />; } }));

const CONTENT: GameContent = { kind: 'game', concept: 'You audit a supplier.', win: 'Find four flaws.', rounds: [{ text: 'No VAT number.', answer: 'VAT missing' }], role: null,
  leaderboard: 'Firm-wide', files: { 'index.html': '<main></main>', 'game.js': 'GameStudio.ready();' }, made: 'ai' };
const view = (o: Partial<Parameters<typeof gameView>[1]> = {}, c: Partial<GameContent> = {}) =>
  gameView({ ...CONTENT, ...c }, { ro: false, learningId: 'L60', contributionId: null, player: 'Jan P.', accepter: 'Kim Counsel', ...o });

beforeEach(() => {
  vi.clearAllMocks(); frame.props = null;
  vi.mocked(store.startRun).mockResolvedValue('run-1');
  vi.mocked(store.finishRun).mockResolvedValue();
  vi.mocked(store.leaderboard).mockResolvedValue([{ rank: 1, name: 'Jan P.', score: 90, seconds: 90 }]);
  vi.mocked(store.myBest).mockResolvedValue(null);
});
afterEach(cleanup);

const play = async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })); await screen.findByTestId('frame'); };

describe('Game panel', () => {
  it('Play starts a run on the learning and shows the frame with that run', async () => {
    render(<GamePanel gm={view()} />);
    await play();
    expect(store.startRun).toHaveBeenCalledWith({ learningId: 'L60' });
    expect(screen.getByTestId('frame').dataset.run).toBe('run-1');
    expect(screen.getByTestId('frame').dataset.test).toBe('false');
    expect(frame.props!.data).toEqual({ concept: 'You audit a supplier.', win: 'Find four flaws.', rounds: [{ text: 'No VAT number.', answer: 'VAT missing' }] });
    expect(frame.props!.player).toBe('Jan P.');
  });
  it('the frame\'s score finishes the run and never writes progress', async () => {
    render(<GamePanel gm={view()} />);
    await play();
    await act(async () => { await frame.props!.onScore(90); });
    expect(store.finishRun).toHaveBeenCalledWith('run-1', 90);
    expect(learner.saveProgress).toHaveBeenCalledTimes(0);
    act(() => frame.props!.onFinished(90));
    expect(await screen.findByText(/Your score: 90/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy();
    expect(learner.saveProgress).toHaveBeenCalledTimes(0);
  });
  it('shows the leaderboard as first name and initial, score and time', async () => {
    render(<GamePanel gm={view()} />);
    expect(await screen.findByText('Jan P. · 90 · 1:30')).toBeTruthy();
    expect(screen.getByText(/Best finished runs · first name and initial/)).toBeTruthy();
    expect(store.leaderboard).toHaveBeenCalledWith('L60');
  });
  it('shows the player\'s own best when there is one', async () => {
    vi.mocked(store.myBest).mockResolvedValue({ score: 80, seconds: 75 });
    render(<GamePanel gm={view()} />);
    expect(await screen.findByText(/Your best: 80 · 1:15/)).toBeTruthy();
  });
  it('"None" shows no leaderboard and does not ask for one', async () => {
    render(<GamePanel gm={view({}, { leaderboard: 'None' })} />);
    await play();
    expect(screen.queryByText(/Best finished runs/)).toBeNull();
    expect(store.leaderboard).not.toHaveBeenCalled();
    expect(frame.props!.leaderboard).toBeNull();
  });
  it('View as starts no run and says playing saves nothing', async () => {
    render(<GamePanel gm={view({ ro: true })} />);
    expect(screen.getByText('Viewing someone else: playing saves nothing')).toBeTruthy();
    await play();
    expect(store.startRun).not.toHaveBeenCalled();
    expect(screen.getByTestId('frame').dataset.run).toBe('null');
    expect(store.myBest).not.toHaveBeenCalled();
  });
  it('a play-test of a contribution starts a test run; an unsaved preview starts none', async () => {
    const { unmount } = render(<GamePanel gm={view({ learningId: null, contributionId: 'c-1' })} />);
    await play();
    expect(store.startRun).toHaveBeenCalledWith({ contributionId: 'c-1' });
    expect(screen.getByTestId('frame').dataset.test).toBe('true');
    expect(store.leaderboard).not.toHaveBeenCalled();
    unmount();
    vi.mocked(store.startRun).mockClear();
    render(<GamePanel gm={view({ learningId: null, contributionId: null })} />);
    await play();
    expect(store.startRun).not.toHaveBeenCalled();
    expect(screen.getByText(/A play-test: nothing is saved or counted/)).toBeTruthy();
  });
  it('a saved contribution\'s game, as its author or a reviewer sees it, plays a test run on that contribution', async () => {
    render(<SavedContent t={{ key: 'c-1', contributionId: 'c-1', content: CONTENT, hours: 0.25, still: false }} />);
    await play();
    expect(store.startRun).toHaveBeenCalledWith({ contributionId: 'c-1' });
    expect(screen.getByTestId('frame').dataset.test).toBe('true');
    expect(frame.props!.player).toBe('Player');
  });
  it('says why when a run could not be started', async () => {
    vi.mocked(store.startRun).mockRejectedValue(new Error('row-level security'));
    render(<GamePanel gm={view()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy());
    expect(screen.queryByTestId('frame')).toBeNull();
  });
  it('the completion text stays the counsellor-accepted reflection', () => {
    expect(completionOf('Game')).toBe('acceptance');
    render(<GamePanel gm={view()} />);
    expect(screen.getByText(completionText('Game', 'Kim Counsel', true))).toBeTruthy();
  });
});
