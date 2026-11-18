// @vitest-environment jsdom
// The first save of a draft made from a placeholder (Studios Phase 7, Task 7.5): saved without a creation rule, it sets the step's cid once, through the
// editor's one write path; a refused link still saves the draft and says so. Stores are faked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveDraft } from './lib/contributionStore';
import * as trajectoryStore from './lib/trajectoryStore';
import { harness, domainAdmin, person } from './test/harness';
import { blankTrajectory } from './logic/trajectoryEdit';
import { noItems } from './logic/items';
import { blankDraft, saveForm } from './createSave';
import type { Trajectory } from './logic/trajectory';
import type { AppState } from './types';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(async () => ({ contributions: [], reviews: [], rules: [], policies: [], peers: 0 })), saveDraft: vi.fn(async () => 'new1'),
  removeDraft: vi.fn(), submitContribution: vi.fn(), checkContribution: vi.fn(), decideReview: vi.fn(),
}));
vi.mock('./lib/trajectoryStore', async (orig) => ({ ...(await orig<object>()), saveTrajectorySoon: vi.fn() }));
const save = vi.mocked(saveDraft), soon = vi.mocked(trajectoryStore.saveTrajectorySoon);

const T: Trajectory = { ...blankTrajectory('Consulting'), id: 'T1', steps: [{ id: 'm1', k: 'make', title: 'VAT cards', fmt: 'Flash cards', hours: 1, win: 3, req: true, pre: null }] };
const brief = { trajectoryId: 'T1', stepId: 'm1', goals: [], depth: 'applied' as const, passages: [], sources: [] };
const draft = () => ({ ...blankDraft(null, 'Consulting'), type: 'Flash cards', title: 'VAT cards', take: 'Know the rates.', dom: 'prof', line: 'Consulting', items: noItems(), brief });
const setup = (state: Partial<AppState> = {}, access = domainAdmin(['Consulting'])) => harness({ subject: person({ id: 'u1' }), access: { ...access, userId: 'u1' },
  state: { screen: 'create', createTab: 'new', trjs: [T], nw: draft(), nwKb: [], create: { contributions: [], reviews: [], rules: [], policies: [], peers: 0 }, studio: { view: 'studio', step: 0 }, ...state } });
const cidOf = (h: ReturnType<typeof setup>) => h.state.trjs[0].steps[0].cid;

beforeEach(() => { vi.clearAllMocks(); });

describe('saving a draft made from a placeholder', () => {
  it('saves it without a creation rule, names the placeholder on insert, and sets the step\'s cid to the new id once', async () => {
    const h = setup();
    await saveForm(h.L(), false);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ for_trajectory: 'T1', for_step: 'm1', studio: 'flash', type: 'Flash cards' }), null);
    expect(cidOf(h)).toBe('new1');
    expect(soon).toHaveBeenCalledTimes(1);
  });
  it('does not link on a second save of the same draft, and does not name the placeholder again', async () => {
    const h = setup({ nw: { ...draft(), savedId: 'new1' }, trjs: [{ ...T, steps: [{ ...T.steps[0], cid: 'new1' }] }] });
    await saveForm(h.L(), false);
    expect(save.mock.calls[0][0]).not.toHaveProperty('for_step');
    expect(soon).not.toHaveBeenCalled();
  });
  it('links again when the step\'s cid is not one of the admin\'s own contributions (the draft was deleted)', async () => {
    const h = setup({ trjs: [{ ...T, steps: [{ ...T.steps[0], cid: 'gone' }] }] });
    await saveForm(h.L(), false);
    expect(cidOf(h)).toBe('new1');
  });
  it('refuses a second draft for a step that already has an own draft (one draft per placeholder), and keeps the link', async () => {
    const own = { id: 'old', author_id: 'u1' };
    const h = setup({ trjs: [{ ...T, steps: [{ ...T.steps[0], cid: 'old' }] }], create: { contributions: [own as never], reviews: [], rules: [], policies: [], peers: 0 } });
    await saveForm(h.L(), false);
    expect(save).not.toHaveBeenCalled();
    expect(cidOf(h)).toBe('old');
  });
  it('saves the draft that already is the step\'s own again', async () => {
    const own = { id: 'new1', author_id: 'u1' };
    const h = setup({ nw: { ...draft(), savedId: 'new1' }, trjs: [{ ...T, steps: [{ ...T.steps[0], cid: 'new1' }] }], create: { contributions: [own as never], reviews: [], rules: [], policies: [], peers: 0 } });
    await saveForm(h.L(), false);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('names no audience: a draft made from a trajectory with one is refused', async () => {
    const h = setup({ nw: { ...draft(), aud: 'ind:energy' } });
    await saveForm(h.L(), false);
    expect(save).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('A draft made from a trajectory names no audience');
  });
  it('without the right to change the trajectory there is no grant: nothing is saved', async () => {
    const h = setup({}, domainAdmin(['Audit']));
    await saveForm(h.L(), false);
    expect(save).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('This placeholder cannot be drafted by you now: it already has a draft, or you may not change its trajectory');
  });
  it('a link refused after the save still saves the draft and says it is not linked', async () => {
    const h = setup();
    save.mockImplementationOnce(async () => { h.L().setState({ trjs: [{ ...T, status: 'live', maps: [['Consulting', 'Analyst', 'mandatory']] }] }); return 'new1'; });
    await saveForm(h.L(), false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(soon).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Saved · not linked to the trajectory step: Not changed · a live trajectory with a mandatory map is changed by a General or System Admin');
  });
  it('without a placeholder behind the brief nothing is allowed without a rule', async () => {
    const h = setup({ trjs: [{ ...T, steps: [{ ...T.steps[0], k: 'learn' as const }] }] });
    await saveForm(h.L(), false);
    expect(save).not.toHaveBeenCalled();
  });
});
