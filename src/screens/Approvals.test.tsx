// @vitest-environment jsdom
// Practice runs shared with the signed-in person, as the second kind of row of "Waiting for you" (Task 6.4): the AI's reading with each point's comment, the
// transcript with held lines marked, the counsellor's note and confirmation. Text only; a score is advice, never a grade or progress.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Band } from '../../supabase/functions/_shared/avatarScore.ts';
import type { SharedRun } from '../lib/avatarStore';
import * as store from '../lib/avatarStore';
import { harness, member, person } from '../test/harness';
import ApprovalsScreen from './Approvals';

const turns = [{ who: 'learner', text: '', guard: 'meta_or_injection' }, { who: 'character', text: 'Let us stay on the topic.', guard: 'meta_or_injection' },
  { who: 'learner', text: 'What worries you most?', guard: null }, { who: 'character', text: 'The cost.', guard: null }];
vi.mock('../lib/avatarStore', async (orig) => ({ ...(await orig<typeof import('../lib/avatarStore')>()), confirmAvatarRun: vi.fn(async () => {}), sharedAvatarRuns: vi.fn(async () => ({ runs: [], total: 0 })), sharedRunTurns: vi.fn(async () => turns) }));
vi.mock('../lib/recordStore', () => ({ loadQueue: vi.fn(async () => []), decideLearning: vi.fn(async () => 'accepted') }));

const point = (id: string, text: string, score: number, band: Band, comment: string) => ({ id, text, weight: 50, score, band, comment, turns: [1] });
const run: SharedRun = {
  runId: 'run-1', userId: 'p2', name: 'Kim Learner', learningId: 'L70', title: 'Selling an HR system', sharedAt: '2026-11-18T10:00:00Z',
  score: { overall: 50, band: 'Mediocre', version: '1.0.0', strengths: ['Asked first'], missed: ['No numbers'], summary: 'A fair start.',
    points: [point('lp-1', 'Asks about her concerns', 70, 'Very good', 'Asked what worries her in turn 1.'), point('lp-2', 'Names the cost of doing nothing', 30, 'Needs improvement', 'No quotable line on cost.')] }
};
const view = (runs: SharedRun[], total?: number) => {
  const h = harness({ subject: person({ id: 'c1' }), access: member('c1'), state: { screen: 'approvals', queue: [], sharedRuns: runs, sharedTotal: total ?? runs.length } });
  const shown = () => <ApprovalsScreen appr={h.vm().appr!} onOpen={vi.fn()} />;
  const r = render(shown());
  // the Shell renders again after every state change
  return { h, vm: h.vm(), container: r.container, refresh: () => r.rerender(shown()) };
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('a shared avatar practice on the approvals screen', () => {
  it('says what it is, with its score and band, each point\'s comment, and that the AI made it', () => {
    view([run]);
    expect(screen.getByText('Avatar practice shared · Selling an HR system · 50 · Mediocre')).toBeTruthy();
    expect(screen.getByText('Asked what worries her in turn 1.')).toBeTruthy();
    expect(screen.getByText('No quotable line on cost.')).toBeTruthy();
    expect(screen.getByText('Made with AI')).toBeTruthy();
    expect(screen.getByText(/advice, never progress/)).toBeTruthy();
    expect(screen.queryByText('Nothing waits for you')).toBeNull();
  });
  it('reads the transcript only when it is opened, and marks the held lines without any text', async () => {
    const { container } = view([run]);
    expect(store.sharedRunTurns).not.toHaveBeenCalled();
    const details = container.querySelector('details')!;
    details.open = true;
    await act(async () => { fireEvent(details, new Event('toggle')); });
    expect(store.sharedRunTurns).toHaveBeenCalledWith('run-1');
    expect(within(details).getByText(/Transcript · 4 lines/)).toBeTruthy();
    expect(within(details).getByText('What worries you most?')).toBeTruthy();
    expect(within(details).getAllByText(/Held back by the guardrail/)).toHaveLength(2);
  });
  it('asks to confirm the AI\'s reading with a note that goes to the learner, and sends the note once', async () => {
    const { h, refresh } = view([run]);
    expect(screen.getByText('Confirm the AI’s reading · your note goes to Kim')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Note for Kim Learner'), { target: { value: '  A fair reading.  ' } });
        expect(h.state.decideNote['run|run-1']).toBe('  A fair reading.  ');
    refresh();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await vi.waitFor(() => expect(store.confirmAvatarRun).toHaveBeenCalledTimes(1));
    expect(store.confirmAvatarRun).toHaveBeenCalledWith('run-1', 'A fair reading.');
    expect(store.sharedAvatarRuns).toHaveBeenCalledTimes(1);
  });
  it('counts every run waiting on the badge, and lists no confirmed run (the database leaves them out)', () => {
    expect(view([run]).vm.approvalsBadge).toBe(1);
    expect(harness({ access: member('c1'), state: { queue: [], sharedRuns: [run, { ...run, runId: 'run-2' }], sharedTotal: 2 } }).vm().approvalsBadge).toBe(2);
    expect(screen.queryByText(/^Confirmed/)).toBeNull();
  });
  it('mentions no audio and no grade: it is the words and an advice score', () => {
    const { container } = view([run]);
    expect(container.textContent).not.toMatch(/audio|recording|voice|grade|appeal/i);
  });
  it('says so when the shared runs did not load', () => {
    const h = harness({ subject: person({ id: 'c1' }), access: member('c1'), state: { screen: 'approvals', queue: [], sharedRuns: null, sharedError: 'permission denied' } });
    render(<ApprovalsScreen appr={h.vm().appr!} onOpen={vi.fn()} />);
    expect(screen.getByText('The shared practice runs did not load')).toBeTruthy();
  });
  it('says when more runs wait than are listed, and the badge counts the true number', () => {
    const { vm } = view([run], 73);
    expect(screen.getByText('Showing the oldest 1 of 73 shared practice runs')).toBeTruthy();
    expect(vm.approvalsBadge).toBe(73);
  });
  it('says the learner withdrew the run, and reloads the list, when the confirmation finds it no longer shared', async () => {
    vi.mocked(store.confirmAvatarRun).mockRejectedValueOnce(new Error('That run is not shared'));
    const { h } = view([run]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await vi.waitFor(() => expect(store.sharedAvatarRuns).toHaveBeenCalledTimes(1));
    expect(h.lastToast()).toBe('The learner withdrew this run');
  });
});
