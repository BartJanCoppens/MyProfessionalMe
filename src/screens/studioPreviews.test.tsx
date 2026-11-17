// @vitest-environment jsdom
// The Preview & test step of the Job Aid Studio and the Case Studio (studios plan, Task 2.1): the learner's own panel,
// in play-test mode. Ticks live in the preview only; nothing is saved, nothing counts as progress.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from '../lib/contributionStore';
import * as learner from '../lib/learnerStore';
import { emptyParts } from '../logic/contribution';
import { EVIDENCE_QUESTION } from '../logic/studioContent';
import type { StudioItem } from '../logic/studios';
import { harness, member, person } from '../test/harness';
import { Preview } from './studioPreviews';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));
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
