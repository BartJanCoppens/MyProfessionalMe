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
    expect((screen.getByLabelText('Business line') as HTMLSelectElement).value).toBe('Consulting');
    expect(screen.getByText('Your creation rules: Consulting.')).toBeTruthy();
    expect(screen.getByText('Who will review it')).toBeTruthy();
  });
});
