// @vitest-environment jsdom
// The course panel (E-learning Studio, Task 1.4): the one panel for the learner's detail page, the Studio's preview and a reviewer's view. The lesson on show,
// the blocks as a learner works them, the score line, and what the preview never does: save anything.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from '../data';
import * as store from '../lib/contributionStore';
import { parseFormatContent } from '../lib/contentStore';
import * as learner from '../lib/learnerStore';
import * as reflections from '../lib/reflectionStore';
import { COMPLETION_QUESTION } from '../logic/courseContent';
import { emptyParts } from '../logic/contribution';
import type { StudioEntry } from '../logic/studios';
import { initState, Logic } from '../model';
import { cfg, harness, member, person } from '../test/harness';
import type { AppState, CourseContent, Learn } from '../types';
import { DetailScreen } from './Library';
import { Preview, SavedContent } from './studioPreviews';

vi.mock('../lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}), acceptLearning: vi.fn(),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));
vi.mock('../lib/reflectionStore', () => ({ REFLECTION_MAX: 2000, loadReflections: vi.fn(async () => ({})), saveReflectionSoon: vi.fn() }));
vi.mock('../lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));

const Q = { t: 'Place of supply', q: 'Where is the VAT due?', o: ['Belgium', 'Germany, reverse charge', 'Nowhere', 'Both'], a: 1, why: 'The customer accounts for it.' };
const lessons = [
  { title: 'Where is a service taxed?', blocks: [{ block: 'text', id: 'b0001', h: 'Where?', t: 'Where the customer is.' }, { block: 'check', id: 'b0002', question: Q, fin: false }] },
  { title: 'Reverse charge', blocks: [{ block: 'branch', id: 'b0003', q: 'A private person asks for no VAT.', choices: [['Agree', 'Wrong: B2C applies.', false], ['Charge VAT', 'Right.', true]] },
    { block: 'exercise', id: 'b0004', q: 'VAT on 12,000 at 21 %?', a: 2520, tol: 1, unit: '€' }] },
  { title: 'Reporting it', blocks: [{ block: 'accordion', id: 'b0005', panels: [['The B2B rule', 'The customer taxes it.'], ['The B2C rule', 'The supplier taxes it.']] }, { block: 'reflect', id: 'b0006', p: 'Which client?' }] },
];
const ROW: Learn = ['L997', 'Place of supply', 'reg', 2, 'E-learning', 'Peer contribution', 0.5, 0, '', ''];
const COURSE = parseFormatContent({ kind: 'course', lessons, rule: 'seen' }) as CourseContent;
beforeAll(() => { LEARN.push(ROW); LEARN_BY.L997 = ROW; LEARN_META.L997 = { line: null, status: 'published', content: COURSE }; });
afterAll(() => { LEARN.splice(LEARN.indexOf(ROW), 1); delete LEARN_BY.L997; delete LEARN_META.L997; });
beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

function Live({ readOnly = false, saved = {} as Record<string, string> }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'detail', detailId: 'L997', reflections: saved, reflectionsSaved: saved }));
  const subject = person(readOnly ? { id: 'p2', name: 'Kim Learner', readOnly: true } : {});
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg,
    { toastTimer: { current: undefined }, drag: { current: null }, file: { current: null }, chat: { current: null } }, member(subject.id), subject, async () => {}, async () => {}).renderVals();
  return <DetailScreen vm={vm} />;
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const bar = () => screen.getByRole('progressbar').getAttribute('aria-valuenow');

describe('the learner\'s course', () => {
  it('shows the lesson and its position, and Next lesson moves the progress bar', () => {
    render(<Live />);
    expect(screen.getByText('Lesson 1 of 3')).toBeTruthy();
    expect(screen.getByText('Where the customer is.')).toBeTruthy();
    expect(bar()).toBe('33');
    click('Next lesson ›');
    expect(screen.getByText('Lesson 2 of 3')).toBeTruthy();
    expect(bar()).toBe('67');
    click('‹ Previous lesson');
    expect(screen.getByText('Lesson 1 of 3')).toBeTruthy();
  });
  it('says Correct. or Not quite. with the explanation, and Try again starts the question over', () => {
    render(<Live />);
    fireEvent.click(screen.getByRole('radio', { name: /^Nowhere/ }));
    click('Check answer');
    expect(screen.getByText('Not quite.')).toBeTruthy();
    expect(screen.getByText(/The customer accounts for it\./)).toBeTruthy();
    click('Try again');
    fireEvent.click(screen.getByRole('radio', { name: /^Germany, reverse charge/ }));
    click('Check answer');
    expect(screen.getByText('Correct.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check answer' })).toBeNull();
  });
  it('shows what a branching choice leads to, and lets the learner try another', () => {
    render(<Live />);
    click('Next lesson ›');
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    expect(screen.getByText('Not the best choice. Wrong: B2C applies.')).toBeTruthy();
    click('Try another choice');
    fireEvent.click(screen.getByRole('button', { name: 'Charge VAT' }));
    expect(screen.getByText('A good choice. Right.')).toBeTruthy();
  });
  it('checks a calculation and says the right answer when it is not', () => {
    render(<Live />);
    click('Next lesson ›');
    fireEvent.change(screen.getByRole('textbox', { name: /VAT on 12,000/ }), { target: { value: '2,000' } });
    click('Check');
    expect(screen.getByText('Not quite. The answer is 2520 € (± 1).')).toBeTruthy();
  });
  it('checks a calculation on Enter too', () => {
    render(<Live />);
    click('Next lesson ›');
    const box = screen.getByRole('textbox', { name: /VAT on 12,000/ });
    fireEvent.change(box, { target: { value: '2520' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByText('Correct.')).toBeTruthy();
  });
  it('opens an accordion panel', () => {
    render(<Live />);
    click('Next lesson ›'); click('Next lesson ›');
    expect(screen.queryByText('The customer taxes it.')).toBeNull();
    expect(screen.getByRole('button', { name: /The B2B rule/ }).getAttribute('aria-controls')).toBeNull();
    click(/The B2B rule/);
    const body = screen.getByText('The customer taxes it.');
    expect(screen.getByRole('button', { name: /The B2B rule/ }).getAttribute('aria-controls')).toBe(body.id);
    expect(screen.queryByRole('button', { name: 'Next lesson ›' }) as HTMLButtonElement | null).toMatchObject({ disabled: true });
  });
});

describe('reflections in the learner\'s course', () => {
  const atReflection = () => { click('Next lesson ›'); click('Next lesson ›'); };
  it('shows what the learner saved, and says only they can read it', () => {
    render(<Live saved={{ 'L997|b0006': 'The Delcroix file.' }} />);
    atReflection();
    expect((screen.getByRole('textbox', { name: 'Which client?' }) as HTMLTextAreaElement).value).toBe('The Delcroix file.');
    expect(screen.getByText('Saved · only you can read this')).toBeTruthy();
  });
  it('saves what the learner types soon, and only claims "Saved" once it is', () => {
    render(<Live />);
    atReflection();
    expect(screen.getByText('Only you can read this')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Which client?' }), { target: { value: 'A note.' } });
    expect(reflections.saveReflectionSoon).toHaveBeenCalledWith('L997', 'b0006', 'A note.', expect.any(Function), 800, expect.any(Function));
    expect(screen.getByText('Only you can read this')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Which client?' }) as HTMLTextAreaElement).value).toBe('A note.');
    act(() => (vi.mocked(reflections.saveReflectionSoon).mock.calls[0][5] as () => void)());
    expect(screen.getByText('Saved · only you can read this')).toBeTruthy();
  });
  it('limits the text to the cap', () => {
    render(<Live />);
    atReflection();
    expect(screen.getByRole('textbox', { name: 'Which client?' }).getAttribute('maxlength')).toBe('2000');
  });
  it('in View as says reflections are private and shows no text, and loads and saves nothing', () => {
    render(<Live readOnly saved={{ 'L997|b0006': 'Secret.' }} />);
    atReflection();
    expect(screen.getByText('Which client?')).toBeTruthy();
    expect(screen.getByText('Reflections are private: nothing is shown in View as')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Which client?' })).toBeNull();
    expect(screen.queryByText('Secret.')).toBeNull();
    expect(reflections.saveReflectionSoon).not.toHaveBeenCalled();
    expect(reflections.loadReflections).not.toHaveBeenCalled();
  });
});

const items: StudioEntry[] = [['Lesson 1', 'Where is a service taxed?', ''], ['Lesson 2', 'Reverse charge', ''], ['Lesson 3', 'Reporting it', ''],
  ...lessons.flatMap((l, k) => l.blocks.map((b) => ({ ...b, lesson: k }))) as never[]];
const studioPreview = () => harness({ access: member('u1'), subject: person(), state: { screen: 'create', createTab: 'new', nwKb: [], studio: { view: 'studio', step: 3, id: 'elearn' },
  create: { contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 },
  nw: { line: 'Consulting', aud: '', type: 'E-learning', title: 'T', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'x', outline: [], sources: [], ai: false, aiNote: '',
    shape: { [COMPLETION_QUESTION]: 'All lessons viewed' }, items: { list: items as never, how: 'manual', problems: [], note: '' } } } });

describe('the E-learning Studio preview', () => {
  it('is the learner\'s panel as a play-test: stepping and answering are never saved', () => {
    const h = studioPreview();
    render(<Preview kind="elearn" c={h.vm().create!} />);
    expect(screen.getByText('A play-test, as learners will see it: nothing is saved or counted.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /^Germany, reverse charge/ }));
    click('Check answer');
    expect(screen.getByText('Correct.')).toBeTruthy();
    click('Next lesson ›'); click('Next lesson ›');
    expect(screen.getByText('Lesson 3 of 3')).toBeTruthy();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(h.patches).toHaveLength(0);
  });
  it('shows a reflection as "Preview: not saved" and saves nothing', () => {
    render(<Preview kind="elearn" c={studioPreview().vm().create!} />);
    click('Next lesson ›'); click('Next lesson ›');
    expect(screen.getByText('Preview: not saved')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Which client?' }) as HTMLTextAreaElement).readOnly).toBe(true);
    expect(reflections.saveReflectionSoon).not.toHaveBeenCalled();
  });
  it('narrows the player to a phone, and Start over clears the answers and goes back to lesson 1', () => {
    render(<Preview kind="elearn" c={studioPreview().vm().create!} />);
    const player = () => screen.getByRole('group', { name: 'Course player' });
    expect(player().style.maxWidth).toBe('');
    click('Phone');
    expect(player().style.maxWidth).toBe('380px');
    click('Desktop');
    expect(player().style.maxWidth).toBe('');
    fireEvent.click(screen.getByRole('radio', { name: /^Germany, reverse charge/ }));
    click('Check answer');
    click('Next lesson ›');
    click('Start over');
    expect(screen.getByText('Lesson 1 of 3')).toBeTruthy();
    expect(screen.queryByText('Correct.')).toBeNull();
  });
  it('has no Desktop or Phone toggle or Start over for the learner', () => {
    render(<Live />);
    expect(screen.queryByRole('button', { name: 'Phone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull();
    expect(screen.queryByText(/LMS/)).toBeNull();
  });
  it('shows a reviewer the same panel, and an AI-drafted course carries Made with AI', () => {
    render(<SavedContent t={{ key: 'c1', content: COURSE, hours: 0.5, still: false, drafted: true }} />);
    expect(screen.getByText('Try it: nothing is saved or counted.')).toBeTruthy();
    expect(screen.getByText('Made with AI')).toBeTruthy();
    expect(screen.getByText('Lesson 1 of 3')).toBeTruthy();
  });
});
