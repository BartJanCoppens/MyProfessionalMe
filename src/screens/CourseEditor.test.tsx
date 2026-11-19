// @vitest-environment jsdom
// The E-learning Studio's course editor (E-learning Studio plan, Task 1.3): the outline, the blocks, the inspector and the shelf, and View as.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateData } from '../logic/contribution';
import type { CourseBlock } from '../logic/courseContent';
import { initState, Logic } from '../model';
import { LEARN, LEARN_BY, LEARN_META } from '../data';
import * as store from '../lib/contributionStore';
import { cfg, member, person } from '../test/harness';
import type { Learn } from '../types';
import type { AppState } from '../types';
import CreateScreen from './Create';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));

const Q = { t: 'Place', q: 'Where is it taxed?', o: ['Here', 'There', 'Nowhere', 'Both'], a: 1, why: 'Because.' };
const text = (id: string, lesson: number, h: string): CourseBlock => ({ block: 'text', id, lesson, h, t: 'Words of ' + h });
const ITEMS = [['Lesson 1', 'Place of supply', 'Where'], ['Lesson 2', 'The invoice', 'What'], text('b0001', 0, 'Intro'), text('b0002', 0, 'Rules'), { block: 'check', id: 'b0003', lesson: 0, question: Q }, text('b0004', 1, 'Fields')];
const rule = { id: 1, user_id: 'u1', lines: ['Consulting'], formats: [], domains: [], audiences: [] };
const data = (formats: string[] = []): CreateData => ({ contributions: [], reviews: [], rules: [{ ...rule, formats }], policies: [], peers: 3 });
const nw = { line: 'Consulting', aud: '', type: 'E-learning', title: 'VAT', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'Know where VAT is due.', outline: [], sources: [], ai: false, aiNote: '',
  items: { list: ITEMS as never, how: 'manual' as const, problems: [], note: '' } };

function Live({ readOnly = false, shape, studio, items, formats }: { formats?: string[]; readOnly?: boolean; shape?: Record<string, string>; studio?: Partial<AppState['studio']>; items?: unknown[] }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'create', create: data(formats), createTab: 'new', nw: { ...nw, shape, items: { ...nw.items, list: (items ?? ITEMS) as never } }, studio: { view: 'studio', step: 3, id: 'elearn', ...studio } }));
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
    expect(within(screen.getByRole('group', { name: 'Interactions' })).getAllByRole('button').map((b) => b.textContent?.slice(1))).toEqual(['Knowledge check', 'Sort into groups', 'Branching scenario', 'Reflection', 'Calculation exercise']);
    ['AI tutor', 'Calculators and graphs', 'Image', 'coming'].forEach((w) => expect(screen.queryByText(new RegExp(w, 'i'))).toBeNull());
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
  it('the right answer offers Answer A to D, and a check has no final-check switch', () => {
    render(<Live />);
    fireEvent.click(screen.getByRole('button', { name: 'Select knowledge check' }));
    const right = screen.getByRole('combobox', { name: 'Right answer' });
    expect(within(right).getAllByRole('option').map((o) => o.textContent)).toEqual(['Answer A', 'Answer B', 'Answer C', 'Answer D']);
    expect(right).toHaveProperty('value', '1');
    expect(screen.queryByRole('combobox', { name: 'Final check' })).toBeNull();
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
    render(<Live shape={{ 'How is completion decided?': 'Score of 80 % or more' }} items={ITEMS.filter((i) => Array.isArray(i) || (i as { block: string }).block === 'text')} />);
    expect(screen.getByText(/Add a block that scores/)).toBeTruthy();
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
  it('takes a decimal comma: "2,5" is the answer 2.5, "0,5" a tolerance of 0.5', () => {
    render(<Live items={exercise} />);
    fireEvent.click(screen.getByText(/The invoice/));
    fireEvent.click(screen.getByRole('button', { name: 'Select calculation exercise' }));
    fireEvent.change(number(), { target: { value: '2,5' } });
    expect(screen.getByText(/Answer 2.5/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Tolerance' }), { target: { value: '0,5' } });
    expect(screen.getByText(/\(± 0.5\)/)).toBeTruthy();
  });
  it('says why a negative tolerance is not taken, and takes 0 or more', () => {
    render(<Live items={exercise} />);
    fireEvent.click(screen.getByText(/The invoice/));
    fireEvent.click(screen.getByRole('button', { name: 'Select calculation exercise' }));
    const tol = screen.getByRole('textbox', { name: 'Tolerance' }) as HTMLInputElement;
    fireEvent.change(tol, { target: { value: '-1' } });
    expect(screen.getByRole('alert').textContent).toBe('A tolerance cannot be negative: use 0 or more.');
    expect(screen.getByText(/\(± 0\)/)).toBeTruthy();
    fireEvent.change(tol, { target: { value: '0.5' } });
    expect(screen.queryByText(/cannot be negative/)).toBeNull();
    expect(screen.getByText(/\(± 0.5\)/)).toBeTruthy();
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

describe('the studio step changes', () => {
  it('drops a pending "remove lesson" question: it does not come back on the next visit', () => {
    render(<Live studio={{ ask: { lesson: 0 } }} />);
    expect(screen.getByRole('alert').textContent).toMatch(/This removes 3 blocks with lesson 1/);
    click('Back');
    click('Next: Produce');
    expect(screen.queryByText(/This removes/)).toBeNull();
  });
});

describe('focus', () => {
  it('moves to the inspector when a block is selected', () => {
    render(<Live />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Select text' })[0]);
    expect(screen.getByRole('region', { name: 'Edit text' }).contains(document.activeElement)).toBe(true);
  });
});

// Embedded learnings (Task 2.2): the shelf groups, the Source picker over the library, "Make a new one in the … Studio", and View as.
describe('an embedded learning in the editor', () => {
  const row = (id: string, title: string, format: string): Learn => [id, title, 'reg', 2, format, 'Peer contribution', 0.25, 0, '', ''];
  const rows = [row('L9101', 'Old reel', 'Reel'), row('L9103', 'New reel', 'Reel'), row('L9102', 'Draft reel', 'Reel'), row('L9104', 'A podcast', 'Podcast'), row('L9105', 'A course', 'E-learning')];
  beforeEach(() => {
    rows.forEach((r) => { LEARN.push(r); LEARN_BY[r[0]] = r; });
    LEARN_META.L9102 = { line: null, status: 'draft' };
  });
  afterEach(() => { rows.forEach((r) => { LEARN.splice(LEARN.indexOf(r), 1); delete LEARN_BY[r[0]]; delete LEARN_META[r[0]]; }); });

  it('groups the shelf as the design does', () => {
    render(<Live />);
    expect(within(screen.getByRole('group', { name: 'From the studios' })).getAllByRole('button').map((b) => b.textContent?.replace(/^\S+(?=[A-Z])/, ''))).toHaveLength(7);
    expect(within(screen.getByRole('group', { name: 'Practice and reference' })).getAllByRole('button')).toHaveLength(4);
    ['Avatar conversation', 'Reel', 'Explainer', 'Flash cards', 'Case exercise'].forEach((n) => expect(screen.getByRole('button', { name: new RegExp(n) })).toBeTruthy());
  });
  it('the Reel item adds an embed and opens its Source, listing only published reels, newest first', () => {
    render(<Live />);
    fireEvent.click(within(screen.getByRole('group', { name: 'From the studios' })).getByRole('button', { name: /Reel/ }));
    const source = screen.getByRole('combobox', { name: 'Source' }) as HTMLSelectElement;
    const names = Array.from(source.options).map((o) => o.textContent);
    expect(names.slice(0, 3)).toEqual(['Pick from the library…', 'New reel', 'Old reel']);
    ['Draft reel', 'A podcast', 'A course'].forEach((n) => expect(names).not.toContain(n));
    expect(screen.getByText('Only published learnings can be added. A new one appears here once it is published.')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Lesson 1 · Reel: pick the learning from the library');
    fireEvent.change(source, { target: { value: 'L9103' } });
    expect(screen.getAllByText('New reel').length).toBeGreaterThan(1);
    expect(screen.queryByText('Lesson 1 · Reel: pick the learning from the library')).toBeNull();
  });
  it('says so when the library has none of that format', () => {
    const games = LEARN.filter((r) => r[4] === 'Game').map((r) => r[0]), kept = games.map((id) => LEARN_META[id]);
    games.forEach((id) => { LEARN_META[id] = { line: null, status: 'draft' }; });
    render(<Live />);
    fireEvent.click(within(screen.getByRole('group', { name: 'From the studios' })).getByRole('button', { name: /Game/ }));
    expect(Array.from((screen.getByRole('combobox', { name: 'Source' }) as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Nothing in the library yet']);
    games.forEach((id, i) => { if (kept[i]) LEARN_META[id] = kept[i]; else delete LEARN_META[id]; });
  });
  it('"Make a new one in the Reel Studio" saves the course, opens the Reel Studio and shows the banner', async () => {
    vi.mocked(store.saveDraft).mockResolvedValue('c1'); vi.mocked(store.loadCreate).mockResolvedValue(data());
    render(<Live />);
    fireEvent.click(within(screen.getByRole('group', { name: 'From the studios' })).getByRole('button', { name: /Reel/ }));
    click('Make a new one in the Reel Studio');
    expect((await screen.findByRole('note')).textContent).toBe('Your course “VAT” is saved in My contributions · open it there to continue');
    expect(store.saveDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Reel Studio')).toBeTruthy();
  });
  it('without a Reel rule it refuses and saves nothing', () => {
    vi.mocked(store.saveDraft).mockClear();
    render(<Live formats={['E-learning']} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'From the studios' })).getByRole('button', { name: /Reel/ }));
    click('Make a new one in the Reel Studio');
    expect(screen.getByRole('status').textContent).toBe('No creation rule for Reel in Consulting');
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
  it('View as shows no shelf and no Source', () => {
    render(<Live readOnly items={[...ITEMS, { block: 'embed', id: 'b0009', lesson: 0, format: 'Reel', learning: 'L9103' }]} />);
    expect(screen.getByText('New reel')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'From the studios' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Source' })).toBeNull();
  });
});

