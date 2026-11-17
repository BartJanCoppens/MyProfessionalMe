// @vitest-environment jsdom
// A studio contribution's content in My contributions and in Review for peers (Phase 2 review, item 2): reviewers and
// the author see it in the same learner panel as the studio's preview (studioPreviews.tsx), read only: trying it
// saves nothing and counts as nothing.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as learner from '../lib/learnerStore';
import * as store from '../lib/contributionStore';
import type { CreateData } from '../logic/contribution';
import { initState, Logic } from '../model';
import { cfg, member, person } from '../test/harness';
import { contribution, review } from '../test/contributions';
import type { AppState } from '../types';
import CreateScreen from './Create';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(), removePolicy: vi.fn() }));
vi.mock('../lib/learnerStore', () => ({ saveProgress: vi.fn(), loadLearner: vi.fn(), acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), savePrefs: vi.fn() }));

function Live({ state }: { state: Partial<AppState> }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'create', ...state }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), { ...cfg, motion: true }, { toastTimer, drag, file, chat }, member('u1'), person(), async () => {}).renderVals();
  return <>{vm.create && <CreateScreen c={vm.create} />}</>;
}
const data = (o: Partial<CreateData> = {}): CreateData => ({ contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', lines: ['Consulting'], formats: [], domains: [], audiences: [] }], policies: [], peers: 3, ...o });
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><rect width="9" height="9"><animate attributeName="opacity" from="0" to="1" dur="1s" fill="freeze"/></rect></svg>';
const STAGES = [['Order', 'The customer orders.'], ['Deliver', 'Goods leave.'], ['Collect', 'Payment arrives.']];
const FLOW = contribution({ id: 'r1', author_id: 'u5', author_name: 'Kim Author', status: 'review', step: 1, type: 'Animated flow', studio: 'motion', shape: { 'Length?': '20 s' },
  items: [...STAGES, { svg: SVG, alt: 'Order, deliver, collect.', made: 'ai', seconds: 20 }] });
const toReview = (c = FLOW) => data({ contributions: [c], reviews: [review({ contribution_id: c.id, reviewer_id: 'u1' })] });

beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

describe('a studio contribution\'s content for its reviewers and its author', () => {
  it('lets a reviewer watch an Animated flow in the learner\'s panel, saving nothing', () => {
    render(<Live state={{ create: toReview(), createTab: 'review' }} />);
    expect(screen.getByText('As learners will see it')).toBeTruthy();
    expect(screen.getByText('Watch the flow')).toBeTruthy();
    expect(screen.getByText('3 stages · 20 s · Made with AI')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show the text version' }));
    expect(screen.getAllByText('Order, deliver, collect.')).toHaveLength(2); // the reviewer's row and the text version
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
  it('shows a reviewer the explainer\'s steps in the learner\'s panel', () => {
    const c = contribution({ ...FLOW, type: 'Interactive explainer', studio: 'explainer', shape: { 'End with?': 'A summary card' }, items: STAGES });
    render(<Live state={{ create: toReview(c), createTab: 'review' }} />);
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next ›' }));
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
  });
  it('shows a reviewer the case as the learner gets it, without a hand-in', () => {
    const c = contribution({ ...FLOW, type: 'Case exercise', studio: 'case', shape: { 'How long should it take?': 'A full day' },
      items: [['Brief', 'Two companies merged.'], ['Deliverable', 'A roadmap'], ['Criterion', 'Realism'], ['Criterion', 'Clarity']] });
    render(<Live state={{ create: toReview(c), createTab: 'review' }} />);
    expect(screen.getByText(/^8 h · anonymised/)).toBeTruthy();
    expect(screen.getAllByText('Two companies merged.')).toHaveLength(2); // the reviewer's row and the brief
    expect(screen.queryByRole('button', { name: 'Hand in' })).toBeNull();
  });
  it('shows the author their job aid as the learner\'s checklist in My contributions; ticks are not saved', () => {
    const c = contribution({ type: 'Job aid', studio: 'aid', items: [['Before', 'Objectives agreed'], ['Before', 'Stakeholder map'], ['During', 'Who signs off'], ['After', 'Minutes out']] });
    render(<Live state={{ create: data({ contributions: [c] }), createTab: 'mine' }} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Before · Objectives agreed' }));
    expect(screen.getByText('1 of 4 ticked')).toBeTruthy();
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
  it('shows no panel for a contribution from the upload form, or a studio piece whose rows are not complete', () => {
    render(<Live state={{ create: data({ contributions: [contribution({ type: 'Job aid' })] }), createTab: 'mine' }} />);
    expect(screen.queryByText('As learners will see it')).toBeNull();
    cleanup();
    render(<Live state={{ create: toReview(contribution({ ...FLOW, items: STAGES })), createTab: 'review' }} />);
    expect(screen.queryByText('As learners will see it')).toBeNull();
  });
});
