// @vitest-environment jsdom
// The interactive explainer's panel (studios plan, Task 2.2) on the detail page and as the Explainer Studio's preview:
// stepping, the check, completion for the learner, nothing saved in the preview, and every step drawing sanitised.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from '../data';
import * as store from '../lib/contributionStore';
import { parseFormatContent } from '../lib/contentStore';
import * as learner from '../lib/learnerStore';
import { emptyParts } from '../logic/contribution';
import { END_CHECK, END_QUESTION } from '../logic/studioContent';
import type { StudioEntry } from '../logic/studios';
import { initState, Logic } from '../model';
import { cfg, harness, member, person } from '../test/harness';
import type { AppState, Learn } from '../types';
import { DetailScreen } from './Library';
import { Preview } from './studioPreviews';

vi.mock('../lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}), acceptLearning: vi.fn(),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));
vi.mock('../lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));

const ATTACK = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 640 320" onload="alert(1)">'
  + '<script>alert(2)</script><rect id="box" width="40" height="20" onclick="alert(3)" fill="#86BC25"/><use href="https://evil.example/x.svg#a"/><image href="https://evil.example/p.png"/></svg>';
const STEPS = [{ label: 'Supplier', text: 'Creates the invoice.', svg: ATTACK }, { label: 'Access point', text: 'Checks the format.' }, { label: 'Customer', text: 'Gets the invoice.' }];
const Q = (k: number) => ({ t: 'Peppol', q: 'Question ' + k + '?', o: ['w', 'x', 'y', 'z'], a: 1, why: 'Because x.' });
const ROW: Learn = ['L993', 'How a Peppol e-invoice travels', 'reg', 2, 'Interactive explainer', 'Peer contribution', 0.25, 0, '', ''];
beforeAll(() => { LEARN.push(ROW); LEARN_BY.L993 = ROW; LEARN_META.L993 = { line: null, status: 'published', content: parseFormatContent({ kind: 'explainer', style: 'Step-through', depth: 'Overview', steps: STEPS, end: 'A summary card' }) }; });
afterAll(() => { LEARN.splice(LEARN.indexOf(ROW), 1); delete LEARN_BY.L993; delete LEARN_META.L993; });
beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

function Live() {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'detail', detailId: 'L993' }));
  const subject = person();
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg,
    { toastTimer: { current: undefined }, drag: { current: null }, file: { current: null }, chat: { current: null } }, member(subject.id), subject, async () => {}, async () => {}).renderVals();
  return <DetailScreen vm={vm} />;
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('the learner\'s explainer', () => {
  it('draws a step\'s SVG only through the sanitiser: no script, handler or outside link reaches the page', () => {
    const { container } = render(<Live />);
    const drawing = screen.getByRole('img', { name: 'Supplier' });
    expect(drawing.querySelector('rect')).not.toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('image')).toBeNull();
    expect(container.innerHTML).not.toMatch(/alert|onload|onclick|evil\.example/);
  });
  it('steps through with Next and the numbered pills, and completes on the last step', () => {
    render(<Live />);
    click('Next ›');
    expect(screen.getByText('Checks the format.')).toBeTruthy();
    click('3 · Customer');
    expect(screen.getByText('Step 3 of 3')).toBeTruthy();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L993', { state: 'accepted', pct: 100, detail: { last: true } });
    click('See the summary ›');
    expect(screen.getByText('In short')).toBeTruthy();
    click('‹ Previous');
    expect(screen.getByText('Gets the invoice.')).toBeTruthy();
  });
});

describe('the Explainer Studio preview', () => {
  it('is the learner\'s panel with the check; stepping and answering are never saved', () => {
    const list: StudioEntry[] = [['Supplier', 'Creates the invoice.'], ['Access point', 'Checks the format.'], ['Customer', 'Gets the invoice.'], Q(1), Q(2), Q(3)];
    const h = harness({ access: member('u1'), subject: person(), state: { screen: 'create', createTab: 'new', nwKb: [], studio: { view: 'studio', step: 3, id: 'explainer' },
      create: { contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 },
      nw: { line: 'Consulting', aud: '', type: 'Interactive explainer', title: 'T', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'x', outline: [], sources: [], ai: false, aiNote: '',
        shape: { [END_QUESTION]: END_CHECK }, items: { list: list as never, how: 'manual', problems: [], note: '' } } } });
    render(<Preview kind="explainer" c={h.vm().create!} />);
    expect(screen.getByText(/play-test/i)).toBeTruthy();
    click('Check');
    [0, 1, 2].forEach(() => { fireEvent.click(screen.getByRole('radio', { name: /x$/ })); click('Check answer'); click(/Next question|See my result/); });
    expect(screen.getByText('3 of 3 right')).toBeTruthy();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(h.patches).toHaveLength(0);
  });
});
