// @vitest-environment jsdom
// The E-learning Studio's course editor (E-learning Studio plan, Task 1.3): the outline, the blocks, the inspector and the shelf, and View as.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Live } from '../test/courseEditorLive';
import { ITEMS, click } from '../test/courseEditorFixtures';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));

beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

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
    expect(within(screen.getByRole('group', { name: 'Blocks' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['¶Text', '!Callout', '≡Accordion', '▣Image']);
    expect(within(screen.getByRole('group', { name: 'Interactions' })).getAllByRole('button').map((b) => b.textContent?.slice(1))).toEqual(['Knowledge check', 'Sort into groups', 'Hotspot image', 'Branching scenario', 'Reflection', 'Calculation exercise']);
    ['AI tutor', 'Calculators and graphs', 'coming'].forEach((w) => expect(screen.queryByText(new RegExp(w, 'i'))).toBeNull());
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
