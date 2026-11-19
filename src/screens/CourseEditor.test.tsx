// @vitest-environment jsdom
// The E-learning Studio's course editor (E-learning Studio plan, Task 1.3): the outline, the blocks, the inspector and the shelf, and View as.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateData } from '../logic/contribution';
import type { CourseBlock } from '../logic/courseContent';
import { initState, Logic } from '../model';
import { cfg, member, person } from '../test/harness';
import type { AppState } from '../types';
import CreateScreen from './Create';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));

const Q = { t: 'Place', q: 'Where is it taxed?', o: ['Here', 'There', 'Nowhere', 'Both'], a: 1, why: 'Because.' };
const text = (id: string, lesson: number, h: string): CourseBlock => ({ block: 'text', id, lesson, h, t: 'Words of ' + h });
const ITEMS = [['Lesson 1', 'Place of supply', 'Where'], ['Lesson 2', 'The invoice', 'What'], text('b0001', 0, 'Intro'), text('b0002', 0, 'Rules'), { block: 'check', id: 'b0003', lesson: 0, question: Q, fin: false }, text('b0004', 1, 'Fields')];
const rule = { id: 1, user_id: 'u1', lines: ['Consulting'], formats: [], domains: [], audiences: [] };
const data = (): CreateData => ({ contributions: [], reviews: [], rules: [rule], policies: [], peers: 3 });
const nw = { line: 'Consulting', aud: '', type: 'E-learning', title: 'VAT', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'Know where VAT is due.', outline: [], sources: [], ai: false, aiNote: '',
  items: { list: ITEMS as never, how: 'manual' as const, problems: [], note: '' } };

function Live({ readOnly = false, shape, studio, items }: { readOnly?: boolean; shape?: Record<string, string>; studio?: Partial<AppState['studio']>; items?: unknown[] }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'create', create: data(), createTab: 'new', nw: { ...nw, shape, items: { ...nw.items, list: (items ?? ITEMS) as never } }, studio: { view: 'studio', step: 3, id: 'elearn', ...studio } }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, member('u1'), person({ readOnly }), async () => {}).renderVals();
  return <>{vm.create && <CreateScreen c={vm.create} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);
const click = (name: string | RegExp, role = 'button') => fireEvent.click(screen.getByRole(role, { name }));

describe('the outline and the canvas', () => {
  it('shows lesson 1\'s blocks and the count, and lesson 2\'s when it is picked', () => {
    render(<Live />);
    expect(screen.getByText('2 lessons · 4 blocks · 1 scored')).toBeTruthy();
    expect(screen.getByText('Words of Intro')).toBeTruthy();
    expect(screen.queryByText('Words of Fields')).toBeNull();
    fireEvent.click(screen.getByText(/The invoice/));
    expect(screen.getByText('Words of Fields')).toBeTruthy();
    expect(screen.queryByText('Words of Intro')).toBeNull();
  });
  it('a lesson moves down with its blocks and the shown lesson follows it', () => {
    render(<Live />);
    click('Move lesson 1 down');
    expect(screen.getByRole('textbox', { name: 'Lesson title' })).toHaveProperty('value', 'Place of supply');
    expect(screen.getByText('2. Place of supply')).toBeTruthy();
    expect(screen.getByText('1. The invoice')).toBeTruthy();
  });
  it('adds a lesson, and refuses to remove one below two', () => {
    render(<Live />);
    click('Add lesson');
    expect(screen.getByText('3. New lesson')).toBeTruthy();
    click('Remove lesson');
    expect(screen.getByText('2 lessons · 4 blocks · 1 scored')).toBeTruthy();
    click('Remove lesson');
    expect(screen.getByRole('status').textContent).toBe('A course needs at least two lessons');
  });
});

describe('the shelf and the inspector', () => {
  it('offers the blocks and interactions that work, and nothing "coming"', () => {
    render(<Live />);
    expect(within(screen.getByRole('group', { name: 'Blocks' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['¶Text', '!Callout', '≡Accordion']);
    expect(within(screen.getByRole('group', { name: 'Interactions' })).getAllByRole('button').map((b) => b.textContent?.slice(1))).toEqual(['Knowledge check', 'Drag and sort', 'Branching scenario', 'Reflection', 'Calculation exercise']);
    ['AI tutor', 'Calculators and graphs', 'From the studios', 'Image', 'coming'].forEach((w) => expect(screen.queryByText(new RegExp(w, 'i'))).toBeNull());
  });
  it('"Knowledge check" adds a check after the selected block and opens it with what is missing', () => {
    render(<Live />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Select text' })[0]);
    click(/Knowledge check/);
    const blocks = screen.getAllByRole('button', { name: /^Select / }).map((b) => b.getAttribute('aria-label'));
    expect(blocks).toEqual(['Select text', 'Select knowledge check', 'Select text', 'Select knowledge check']);
    expect(screen.getByRole('textbox', { name: 'Question' })).toHaveProperty('value', '');
    expect(screen.getAllByText('Write the question').length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: 'Answer D' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Blocks' })).toBeTruthy();
  });
  it('the right answer offers Answer A to D, and the final check is a select', () => {
    render(<Live />);
    fireEvent.click(screen.getByRole('button', { name: 'Select knowledge check' }));
    const right = screen.getByRole('combobox', { name: 'Right answer' });
    expect(within(right).getAllByRole('option').map((o) => o.textContent)).toEqual(['Answer A', 'Answer B', 'Answer C', 'Answer D']);
    expect(right).toHaveProperty('value', '1');
    const fin = screen.getByRole('combobox', { name: 'Final check' });
    expect(within(fin).getAllByRole('option').map((o) => o.textContent)).toEqual(['Knowledge check', 'Final check']);
    fireEvent.change(fin, { target: { value: 'final' } });
    expect(screen.getAllByText('Final check').length).toBeGreaterThan(1);
  });
  it('typing in a field changes the block and caps its length', () => {
    render(<Live />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Select text' })[0]);
    const heading = screen.getByRole('textbox', { name: 'Heading' });
    expect(heading.getAttribute('maxlength')).toBe('120');
    fireEvent.change(heading, { target: { value: 'New heading' } });
    expect(screen.getByText('New heading')).toBeTruthy();
  });
  it('↑ and ↓ move the block within its lesson, Remove removes it and Done closes the inspector', () => {
    render(<Live />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Select text' })[1]);
    click('Move block up');
    const heads = () => screen.getAllByRole('button', { name: 'Select text' }).map((b) => b.textContent);
    expect(heads()[0]).toMatch(/Rules/);
    expect(screen.getByRole('button', { name: 'Move block down' })).toBeTruthy();
    click('Remove block');
    expect(screen.queryByText('Words of Rules')).toBeNull();
    expect(screen.getByRole('group', { name: 'Blocks' })).toBeTruthy();
  });
  it('shows the problems of the course under the editor', () => {
    render(<Live shape={{ 'How is completion decided?': 'Final check of 80 % or more' }} />);
    expect(screen.getByText(/Add a final check/)).toBeTruthy();
  });
});

describe('View as', () => {
  it('shows the course with no shelf, no inspector, no lesson buttons and no editing', () => {
    render(<Live readOnly />);
    expect(screen.getByText('Words of Intro')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Select text' })[0]);
    ['Blocks', 'Interactions'].forEach((g) => expect(screen.queryByRole('group', { name: g })).toBeNull());
    ['Add lesson', 'Remove lesson', 'Move lesson 1 down', 'Move block up', 'Done'].forEach((n) => expect(screen.queryByRole('button', { name: n })).toBeNull());
    expect(screen.queryByRole('textbox', { name: 'Lesson title' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Heading' })).toBeNull();
  });
});

describe('a number is typed as text', () => {
  const exercise = [...ITEMS, { block: 'exercise', id: 'b0005', lesson: 1, q: 'Rate?', a: 1, tol: 0, unit: '%' }];
  const number = () => screen.getByRole('textbox', { name: 'Right number' }) as HTMLInputElement;
  it('keeps "2.5", "-3" and an empty field as typed', () => {
    render(<Live items={exercise} />);
    fireEvent.click(screen.getByText(/The invoice/));
    fireEvent.click(screen.getByRole('button', { name: 'Select calculation exercise' }));
    ['2.', '2.5', '-', '-3', ''].forEach((v) => { fireEvent.change(number(), { target: { value: v } }); expect(number().value).toBe(v); });
    fireEvent.change(number(), { target: { value: '2.5' } });
    expect(screen.getByText(/Answer 2.5/)).toBeTruthy();
    fireEvent.change(number(), { target: { value: '-3' } });
    expect(screen.getByText(/Answer -3/)).toBeTruthy();
  });
});

describe('asking before blocks go', () => {
  const ask = () => screen.getAllByRole('alert').find((a) => /^This removes/.test(a.textContent ?? ''))!;
  const three = [ITEMS[0], ITEMS[1], ['Lesson 3', 'Empty', ''], ...ITEMS.slice(2)];
  it('Remove lesson with blocks asks, Cancel keeps it and Continue removes it with its blocks', () => {
    render(<Live items={three} />);
    click('Remove lesson');
    expect(ask().textContent).toMatch(/This removes 3 blocks with lesson 1/);
    click('Cancel');
    expect(screen.getByText('3 lessons · 4 blocks · 1 scored')).toBeTruthy();
    click('Remove lesson');
    expect(document.activeElement).toBe(ask());
    click('Continue');
    expect(screen.getByText('2 lessons · 1 block · 0 scored')).toBeTruthy();
  });
  it('a lesson without blocks goes at once', () => {
    render(<Live items={three} />);
    fireEvent.click(screen.getByText(/3\. Empty/));
    click('Remove lesson');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('a redraft that would remove blocks shows the same ask in Draft, with Continue and Cancel', () => {
    const out = { list: [ITEMS[0]] as never, how: 'scripted' as const, problems: [], note: '' };
    render(<Live studio={{ step: 2, ask: { draft: out } }} />);
    expect(screen.getByRole('alert').textContent).toMatch(/This removes 1 block from lessons the new draft no longer has/);
    click('Cancel');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('focus', () => {
  it('moves to the inspector when a block is selected', () => {
    render(<Live />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Select text' })[0]);
    expect(screen.getByRole('region', { name: 'Edit text' }).contains(document.activeElement)).toBe(true);
  });
});
