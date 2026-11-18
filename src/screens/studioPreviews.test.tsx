// @vitest-environment jsdom
// The Preview & test step of the Job Aid Studio and the Case Studio (studios plan, Task 2.1): the learner's own panel,
// in play-test mode. Ticks live in the preview only; nothing is saved, nothing counts as progress.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from '../lib/contributionStore';
import * as gameStore from '../lib/gameStore';
import * as learner from '../lib/learnerStore';
import { emptyParts } from '../logic/contribution';
import { reviewBasis } from '../logic/gameContent';
import type { GameReviewStatus } from '../logic/gameContent';
import { GAME_PLAYTEST } from './studioPreviews';
import { EVIDENCE_QUESTION } from '../logic/studioContent';
import type { StudioItem } from '../logic/studios';
import { harness, member, person } from '../test/harness';
import { Preview } from './studioPreviews';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));
vi.mock('../lib/gameStore', () => ({ startRun: vi.fn(async () => 'run-1'), finishRun: vi.fn(), leaderboard: vi.fn(async () => []), myBest: vi.fn(async () => null), loadGameReview: vi.fn() }));
const frame = vi.hoisted(() => ({ props: null as null | Record<string, any> }));
vi.mock('../game/GameFrame', () => ({ GameFrame: (p: Record<string, any>) => { frame.props = p; return <div data-testid="frame" /> } }));
vi.mock('../lib/learnerStore', () => ({ saveProgress: vi.fn(), loadLearner: vi.fn(), acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), savePrefs: vi.fn() }));

const AID: StudioItem[] = [['Before', 'Objectives agreed'], ['Before', 'Stakeholder map'], ['During', 'Who signs off'], ['After', 'Minutes in 24 hours']];
const CASE: StudioItem[] = [['Brief', 'Two companies merged.'], ['Deliverable', 'A roadmap'], ['Deliverable', 'Three decisions'], ['Criterion', 'Realism']];
const at = (id: 'aid' | 'case', type: string, list: StudioItem[], shape = {}) => {
  const h = harness({ access: member('u1'), subject: person(), state: { screen: 'create', createTab: 'new', nwKb: [], studio: { view: 'studio', step: 0, id },
    create: { contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 },
    nw: { line: 'Consulting', aud: '', type, title: 'T', dom: 'prof', lvl: '2', stage: 'Analyst', take: 'x', outline: [], sources: [], ai: false, aiNote: '', shape, items: { list, how: 'manual', problems: [], note: '' } } } });
  render(<Preview kind={id} c={h.vm().create!} />);
  return h;
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('Job Aid preview', () => {
  it('is the learner\'s checklist; ticking and clearing stay in the preview', () => {
    const h = at('aid', 'Job aid', AID);
    expect(screen.getByText(/play-test/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Before · Objectives agreed' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'During · Who signs off' }));
    expect(screen.getByText('2 of 4 ticked')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear ticks' }));
    expect(screen.getByText('0 of 4 ticked')).toBeTruthy();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(h.patches).toHaveLength(0);
    expect(screen.queryByText(/saved with your progress/)).toBeNull();
  });
});

describe('Case preview', () => {
  it('is the learner\'s case, without a hand-in', () => {
    const h = at('case', 'Case exercise', CASE, { [EVIDENCE_QUESTION]: 'Yes', 'How long should it take?': 'A full day' });
    expect(screen.getByText(/^8 h · anonymised/)).toBeTruthy();
    expect(screen.getByText('Two companies merged.')).toBeTruthy();
    expect(screen.getByText('Three decisions')).toBeTruthy();
    expect(screen.getByText('Realism')).toBeTruthy();
    expect(screen.getByText('Reviewed by your counsellor.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hand in' })).toBeNull();
    expect(h.patches).toHaveLength(0);
  });
  it('says what is missing instead of a panel while the rows are not valid', () => {
    at('case', 'Case exercise', CASE.slice(0, 2));
    expect(screen.getByText(/fix the items/i)).toBeTruthy();
  });
});

describe('Flash studio preview of a practice exam', () => {
  it('runs the shared question round with its state in the preview only', () => {
    const q = (k: number) => ({ t: 'Rates', q: 'Question ' + k + '?', o: ['a', 'b', 'c', 'd'], a: 1, why: 'Because b.' });
    const h = harness({ access: member('u1'), subject: person(), state: { screen: 'create', createTab: 'new', nwKb: [], studio: { view: 'studio', step: 2 },
      create: { contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 },
      nw: { line: 'Consulting', aud: '', type: 'Practice exam', title: 'T', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'x', outline: [], sources: [], ai: false, aiNote: '', items: { list: [q(1), q(2)], how: 'manual', problems: [], note: '' } } } });
    render(<Preview kind="flash" c={h.vm().create!} />);
    [0, 1].forEach(() => {
      fireEvent.click(screen.getByRole('radio', { name: /b$/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
      expect(screen.getByText('Because b.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /Next question|See the score/ }));
    });
    expect(screen.getByText('100 %')).toBeTruthy();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(h.patches).toHaveLength(0);
  });
});

describe('Game preview', () => {
  const ROWS: StudioItem[] = [['Concept', 'You audit a supplier.', 'Find two flaws'], ['Round 1', 'No VAT number.', 'VAT missing'], ['Round 2', 'No date.', 'Date missing']];
  const GAME = { kind: 'game', files: { 'index.html': '<main></main>', 'game.js': 'GameStudio.ready();' }, for: { role: 'No AI role' } };
  const game = (o: { savedId?: string; review?: GameReviewStatus | null } = {}) => {
    const h = harness({ access: member('u1'), subject: person(), state: { screen: 'create', createTab: 'new', nwKb: [], studio: { view: 'studio', step: 4, id: 'game' },
      create: { contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 },
      nw: { line: 'Consulting', aud: '', type: 'Game', title: 'T', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'x', outline: [], sources: [], ai: false, aiNote: '', shape: { 'Does the AI play a role?': 'No AI role' },
        savedId: o.savedId, gameReview: o.review, gameReviewFor: reviewBasis('T', [...ROWS, GAME] as never, { 'Does the AI play a role?': 'No AI role' }), items: { list: [...ROWS, GAME] as never, how: 'manual', problems: [], note: '' } } } });
    render(<Preview kind="game" c={h.vm().create!} />);
    return h;
  };
  const play = async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })); await screen.findByTestId('frame'); };
  it('is a play-test: it says nothing is saved or counted, and a saved draft starts a test run on it', async () => {
    game({ savedId: 'c-1' });
    expect(screen.getByText(GAME_PLAYTEST)).toBeTruthy();
    await play();
    expect(gameStore.startRun).toHaveBeenCalledWith({ contributionId: 'c-1' });
    expect(frame.props!.test).toBe(true);
  });
  it('plays an unsaved draft with no run at all', async () => {
    game();
    await play();
    expect(gameStore.startRun).not.toHaveBeenCalled();
    expect(frame.props!.runId).toBeNull();
  });
  it('says so when the server\'s house-rules verdict failed or is out of date, and not when it passed or is unknown', () => {
    game({ review: { passed: false, reasons: ['Round 2 names a real company'], current: true } });
    expect(screen.getByRole('status').textContent).toBe('The house-rules check has not passed: Round 2 names a real company');
    cleanup();
    game({ review: { passed: true, reasons: [], current: false } });
    expect(screen.getByRole('status').textContent).toBe('Run the house-rules check again');
    cleanup();
    game({ review: { passed: true, reasons: [], current: true } });
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    game();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
