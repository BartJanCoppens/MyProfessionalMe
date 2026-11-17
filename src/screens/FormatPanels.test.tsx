// @vitest-environment jsdom
// The v4 covers (library) and panels (detail) over a live view-model: what the learner sees and can click.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN_META } from '../data';
import { parseFormatContent } from '../lib/contentStore';
import * as learner from '../lib/learnerStore';
import { initState, Logic } from '../model';
import { cfg, member, person, withProgress } from '../test/harness';
import type { Subject } from '../lib/useSubject';
import type { AppState } from '../types';
import { DetailScreen, LibraryScreen } from './Library';

vi.mock('../lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('../lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));
vi.mock('../lib/attendanceStore', () => ({ loadRoster: vi.fn(async () => []), registerAttendance: vi.fn(async () => 0) }));

const CONTENT: Record<string, unknown> = {
  L60: { kind: 'flash', total: 40, due: 3, next: 'Thu 19 Nov', cards: [['Q one', 'A one'], ['Q two', 'A two'], ['Q three', 'A three'], ['Q four', 'A four'], ['Q five', 'A five'], ['Q six', 'A six']] },
  L61: { kind: 'exam', bank: 40, real: 'x', qs: [{ t: 'Rates', q: 'First?', o: ['a', 'b', 'c', 'd'], a: 1, why: 'Because b' }, { t: 'SMEs', q: 'Second?', o: ['a', 'b', 'c', 'd'], a: 0, why: 'Because a' }] },
  L64: { kind: 'case', brief: 'A carve-out.', deliv: ['A plan', 'A risk list'], rubric: ['Clear'], reviewer: 'Reviewed by a peer.' },
  L65: { kind: 'teach', prompt: 'Explain it.', crit: [['Impact', 'impact'], ['Plain language', null]] },
  L66: { kind: 'stretch', brief: 'Lead a meeting.', checks: ['Agree scope', 'Run it'] },
  L67: { kind: 'webinar', mon: 'DEC', day: '4', time: '12:30–13:30', when: 'Fri 4 Dec 2026 · 12:30–13:30 CET · online', speakers: 'Two partners', agenda: ['Changes'] },
  L68: { kind: 'aid', items: ['Scope', 'Price'] },
};
const saved: Record<string, unknown> = {};
beforeAll(() => { Object.entries(CONTENT).forEach(([id, raw]) => { saved[id] = LEARN_META[id]; LEARN_META[id] = { line: null, status: 'published', content: parseFormatContent(raw) }; }); });
afterAll(() => { Object.keys(CONTENT).forEach((id) => { if (saved[id]) LEARN_META[id] = saved[id] as never; else delete LEARN_META[id]; }); });
beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(() => cleanup());

function Live({ id, subject, state }: { id: string; subject: Subject; state: Partial<AppState> }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: id ? 'detail' : 'library', detailId: id || null, ...state }));
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg,
    { toastTimer: { current: undefined }, drag: { current: null }, file: { current: null }, chat: { current: null } }, member(subject.id), subject, async () => {}, async () => {}).renderVals();
  return id ? <DetailScreen vm={vm} /> : <LibraryScreen vm={vm} />;
}
const show = (id: string, subject: Subject = person(), state: Partial<AppState> = {}) => render(<Live id={id} subject={subject} state={state} />);
const viewAs = () => person({ id: 'p2', name: 'Kim Learner', readOnly: true, data: withProgress({}) });

describe('the seven covers', () => {
  it.each([
    ['6 cards', '3 due today'], ['40 Q', 'Not taken yet'], ['2 deliverables', 'Reviewed by your counsellor'], ['Explain it back', 'Feedback on your answer'],
    ['0 of 2 checkpoints', 'On the job'], ['4 Dec · 12:30–13:30', 'Live, then recorded'], ['2-point checklist', 'One page · PDF'],
  ])('renders the line %s on the library card', (meta, meta2) => {
    show('', person(), { libFormat: 'all' });
    expect(screen.getAllByText(meta).length).toBeGreaterThan(0);
    expect(screen.getAllByText(meta2).length).toBeGreaterThan(0);
  });
});

describe('the flash deck panel', () => {
  it('shows the first card, flips it and rates it', () => {
    show('L60');
    expect(screen.getByText('1 / 6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Flip the card' }));
    expect(screen.getByText('A one')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Good · 3 days' }));
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L60', { detail: { due: { '0': expect.any(String) } } });
    expect(screen.getByText('Q two')).toBeTruthy();
  });
  it('shows no action in View as', () => {
    show('L60', viewAs());
    expect(screen.queryByRole('button', { name: /Flip the card|Again|Good|Easy/ })).toBeNull();
    expect(screen.getByText(/Only Kim can study this deck/)).toBeTruthy();
  });
});

describe('the exam panel', () => {
  it('ends with the score ring and the topics', () => {
    show('L61');
    ['b', 'a'].forEach((label) => {
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(label + '$') }));
      fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
      fireEvent.click(screen.getByRole('button', { name: /Next question|See my score/ }));
    });
    expect(screen.getByText('By topic')).toBeTruthy();
    expect(screen.getByText('Ready to book the real exam')).toBeTruthy();
  });
});

describe('the work panels', () => {
  it('lets the learner tick the job aid and prints it', () => {
    window.print = vi.fn();
    show('L68');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Scope' }));
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L68', { detail: { ticks: [0] } });
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(window.print).toHaveBeenCalled();
  });
  it('shows the case, with the hand-in in the learner view and none in View as', () => {
    show('L64');
    expect(screen.getByText('A carve-out.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hand in' })).toBeTruthy();
    cleanup();
    show('L64', viewAs());
    expect(screen.queryByRole('button', { name: 'Hand in' })).toBeNull();
  });
  it('offers the calendar file for a webinar', () => {
    show('L67');
    expect(screen.getByRole('button', { name: 'I’ll attend' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeTruthy();
  });
  it('shows nothing extra for a learning without content', () => {
    show('L1');
    expect(screen.queryByText('Study the deck')).toBeNull();
  });
});
