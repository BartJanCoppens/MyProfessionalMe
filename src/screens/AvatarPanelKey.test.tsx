// @vitest-environment jsdom
// The practice panel belongs to one learning and one subject: opening another avatar learning, or switching View as, starts it afresh (no old transcript, score or run).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from '../data';
import * as store from '../lib/avatarStore';
import { harness, person } from '../test/harness';
import type { Learn } from '../types';
import { DetailScreen } from './Library';

vi.mock('../lib/avatarStore', () => ({ startAvatarRun: vi.fn(async () => 'run-1'), sayToCharacter: vi.fn(), endAvatarRun: vi.fn(), scoreAvatarRun: vi.fn(), shareAvatarRun: vi.fn(), withdrawAvatarRun: vi.fn(), myAvatarRuns: vi.fn(async () => []) }));
vi.mock('../lib/learnerStore', () => ({ saveProgress: vi.fn(), loadLearner: vi.fn() }));

const ids = ['L961', 'L962'];
const content = (name: string) => ({ kind: 'avatar' as const, persona: name, situation: 'You pitch.', opening: 'Convince me, ' + name + '.', points: [{ id: 'lp-1', text: 'Asks first', weight: 100 }], quiz: [], look: null, voice: null,
  language: 'English' as const, difficulty: 'Realistic' as const, minutes: 10 as const, scoring: 'Practice only' as const, counterpart: 'A client executive', made: 'ai' as const });
const rows: Learn[] = ids.map((id) => [id, 'Scenario ' + id, 'prof', 3, 'Avatar', 'Peer contribution', 0.25, 0, '', '']);
beforeAll(() => { rows.forEach((r) => { LEARN.push(r); LEARN_BY[r[0]] = r; LEARN_META[r[0]] = { line: null, status: 'published', content: content('Persona ' + r[0]) }; }); });
afterAll(() => { rows.forEach((r) => { LEARN.splice(LEARN.indexOf(r), 1); delete LEARN_BY[r[0]]; delete LEARN_META[r[0]]; }); });
afterEach(cleanup);

const vm = (detailId: string, readOnly = false) => harness({ subject: person(readOnly ? { id: 'p2', name: 'Kim Learner', readOnly: true } : {}), config: { liveAssistant: true }, state: { screen: 'detail', detailId, aiLive: ['avatar_conversation'] } }).vm();

describe('the avatar panel on the detail page', () => {
  it('starts afresh for another learning', async () => {
    const view = render(<DetailScreen vm={vm('L961')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start a practice run' }));
    expect(await screen.findByText('Convince me, Persona L961.')).toBeTruthy();
    view.rerender(<DetailScreen vm={vm('L962')} />);
    expect(screen.queryByText('Convince me, Persona L961.')).toBeNull();
    expect(screen.queryByRole('log')).toBeNull();
    expect(screen.getByRole('button', { name: 'Start a practice run' })).toBeTruthy();
    expect(store.startAvatarRun).toHaveBeenCalledTimes(1);
  });
  it('starts afresh, and read only, when switching to View as', async () => {
    const view = render(<DetailScreen vm={vm('L961')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start a practice run' }));
    await screen.findByText('Convince me, Persona L961.');
    view.rerender(<DetailScreen vm={vm('L961', true)} />);
    expect(screen.queryByRole('log')).toBeNull();
    expect(screen.getByText('Viewing someone else: practising saves nothing')).toBeTruthy();
  });
});
