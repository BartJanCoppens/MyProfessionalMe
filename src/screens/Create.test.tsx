// @vitest-environment jsdom
// The Create & share screen over a live view-model: tabs, the no-grant banner, the stepper and the rubric gate (FT-CS-UI).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initState, Logic } from '../model';
import { cfg, member, person } from '../test/harness';
import { contribution, review } from '../test/contributions';
import type { CreateData } from '../logic/contribution';
import type { AppState } from '../types';
import CreateScreen from './Create';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(), removePolicy: vi.fn() }));

function Live({ state }: { state: Partial<AppState> }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'create', ...state }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, member('u1'), person(), async () => {}).renderVals();
  return <>{vm.create && <CreateScreen c={vm.create} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
const data = (o: Partial<CreateData> = {}): CreateData => ({ contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', lines: ['Consulting'], formats: [], domains: [], audiences: [] }], policies: [], peers: 3, ...o });

beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

describe('Create & share screen', () => {
  it('asks for creation rights and keeps New content closed without a grant', () => {
    render(<Live state={{ create: data({ rules: [] }) }} />);
    expect(screen.getByText('Ask an admin for creation rights')).toBeTruthy();
    expect((screen.getByRole('button', { name: '+ New content' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'New content' }));
    expect(screen.getByRole('status').textContent).toBe('Ask an admin for creation rights first');
  });
  it('shows a contribution with the stepper of its route', () => {
    const d = data({ contributions: [contribution({ status: 'review', step: 3, submitted_at: '2026-10-30T09:00:00Z' })], reviews: [review({ step: 3, reviewer_name: 'Lee Quality' })] });
    render(<Live state={{ create: d }} />);
    ['Draft', 'Quality & risk', 'Published'].forEach((s) => expect(screen.getAllByText(s).length).toBeGreaterThan(0));
    expect(screen.getByText('Lee Quality')).toBeTruthy();
  });
  it('enables Approve once all four rubric items are ticked', () => {
    const d = data({ contributions: [contribution({ id: 'r1', author_id: 'u5', author_name: 'Kim Author', status: 'review', step: 1 })], reviews: [review({ contribution_id: 'r1', reviewer_id: 'u1' })] });
    render(<Live state={{ create: d, createTab: 'review' }} />);
    const approve = () => screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement;
    expect(approve().disabled).toBe(true);
    screen.getAllByRole('checkbox').forEach((c) => fireEvent.click(c));
    expect(approve().disabled).toBe(false);
  });
  it('shows the line picker from the person\'s rules in New content', () => {
    render(<Live state={{ create: data() }} />);
    fireEvent.click(screen.getByRole('button', { name: 'New content' }));
    fireEvent.click(screen.getByText('Upload something you already made →'));
    expect((screen.getByLabelText('Business line') as HTMLSelectElement).value).toBe('Consulting');
    expect(screen.getByText('Your creation rules: Consulting.')).toBeTruthy();
    expect(screen.getByText('Who will review it')).toBeTruthy();
  });
  it('imports a CSV into a flash card deck, shows the checklist line and enables submit', () => {
    const nw = { line: 'Consulting', aud: '', type: 'Flash cards', title: 'Rates', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'One fact per card.', outline: [], sources: [], ai: false, aiNote: '' };
    render(<Live state={{ create: data(), createTab: 'new', nw, studio: { view: 'form', step: 0 } }} />);
    expect(screen.getByText('Generate with AI or import a CSV')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Submit for review' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('CSV lines'), { target: { value: 'What is the rate?,25 %\nbroken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    expect(screen.getByText('1 card imported from a CSV · check each one')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Line 2: expected front,back');
    expect(screen.getByText('What is the rate?')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Submit for review' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Generate with AI or import a CSV')).toBeTruthy();
  });
  it('opens New content on the Studios hub with one studio and walks through it without saving', () => {
    const nw = { line: 'Consulting', aud: '', type: 'Flash cards', title: 'Rates', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'One fact per card.', outline: [], sources: [], ai: false, aiNote: '' };
    render(<Live state={{ create: data(), nw }} />);
    fireEvent.click(screen.getByRole('button', { name: 'New content' }));
    expect(screen.getByText('Studios')).toBeTruthy();
    expect(screen.getAllByText('Flash card & Exam Studio')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Flash card & Exam Studio/ }));
    ['Idea & sources', 'Draft', 'Preview & test', 'Check & send'].forEach((x) => expect(screen.getAllByText(x).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Next: Draft' }));
    fireEvent.change(screen.getByLabelText('CSV lines'), { target: { value: 'What is the rate?,25 %' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next: Preview & test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Flip the card' }));
    expect(screen.getAllByText('25 %').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next: Check & send' }));
    expect(screen.getByRole('button', { name: 'Send for review' })).toBeTruthy();
    expect(screen.getByText('Who will review it')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Flip the card')).toBeTruthy();
  });
});
