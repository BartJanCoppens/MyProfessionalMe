// @vitest-environment jsdom
// The generic studio spine: the hub over all ten studios, the step bodies, build retry and View as (Task 1.2).
// Podcast is marked available here (by overriding the data in this file only) to reach the generic path.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as store from '../lib/contributionStore';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initState, Logic } from '../model';
import { cfg, member, person } from '../test/harness';
import type { CreateData } from '../logic/contribution';
import type { AppState } from '../types';
import { runBuild, startBuild } from '../logic/studioBuild';
import type { BuildStepState } from '../logic/studioBuild';
import { harness } from '../test/harness';
import CreateScreen from './Create';
import StudioBuild from './StudioBuild';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(), removePolicy: vi.fn(),
  checkContribution: vi.fn() }));
vi.mock('../studioData', async (orig) => {
  const real = await orig<typeof import('../studioData')>();
  return { ...real, STUDIOS: real.STUDIOS.map((s) => (s.id === 'podcast' ? { ...s, available: true } : s)) };
});

function Live({ state, readOnly = false }: { state: Partial<AppState>; readOnly?: boolean }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'create', ...state }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, member('u1'), person({ readOnly }), async () => {}).renderVals();
  return <>{vm.create && <CreateScreen c={vm.create} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
const rule = (formats: string[]) => ({ id: 1, user_id: 'u1', lines: ['Consulting'], formats, domains: [], audiences: [] });
const data = (formats: string[] = []): CreateData => ({ contributions: [], reviews: [], rules: [rule(formats)], policies: [], peers: 3 });
const nw = { line: 'Consulting', aud: '', type: 'Podcast', title: 'Pillar Two', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'One takeaway.', outline: [], sources: [], ai: false, aiNote: '' };
const atStep = (step: number, readOnly = false) => <Live readOnly={readOnly} state={{ create: data(), createTab: 'new', nw, studio: { view: 'studio', step, id: 'podcast' } }} />;
// StudioBuild is controlled (the steps live on the draft); this holds them the way the draft does.
function Held({ initial, ...rest }: { initial: BuildStepState[]; runner: Parameters<typeof StudioBuild>[0]['runner']; readOnly?: boolean }) {
  const [steps, setSteps] = useState(initial);
  return <StudioBuild steps={steps} onChange={setSteps} {...rest} />;
}
const card = (name: RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

describe('the hub', () => {
  it('lists all ten studios; unbuilt ones are greyed with "Coming in a later release"', () => {
    render(<Live state={{ create: data(), createTab: 'new', studio: { view: 'hub', step: 0 } }} />);
    ['Avatar Studio', 'Reel Studio', 'Podcast Studio', 'Game Studio', 'Slides Studio', 'Motion Studio', 'Explainer Studio', 'Job Aid Studio', 'Flash card & Exam Studio', 'Case Studio']
      .forEach((n) => expect(screen.getByRole('button', { name: new RegExp(n) })).toBeTruthy());
    expect(card(/Reel Studio/).disabled).toBe(true);
    expect(card(/Reel Studio/).textContent).toContain('Coming in a later release');
    expect(card(/Flash card & Exam Studio/).disabled).toBe(false);
    expect(screen.getAllByText('Coming in a later release')).toHaveLength(8);
  });
  it('greys an available studio the creation rules do not allow, with the reason', () => {
    render(<Live state={{ create: data(['Flash cards']), createTab: 'new', studio: { view: 'hub', step: 0 } }} />);
    expect(card(/Podcast Studio/).disabled).toBe(true);
    expect(card(/Podcast Studio/).textContent).toContain('Not in your creation rules');
    expect(card(/Flash card & Exam Studio/).disabled).toBe(false);
  });
  it('opens an available studio the rules allow', () => {
    render(<Live state={{ create: data(['Podcast']), createTab: 'new', studio: { view: 'hub', step: 0 } }} />);
    expect(card(/Flash card & Exam Studio/).textContent).toContain('Not in your creation rules');
    fireEvent.click(card(/Podcast Studio/));
    ['Idea & sources', 'Shape it', 'Draft', 'Produce', 'Preview & test', 'Check & send'].forEach((x) => expect(screen.getAllByText(x).length).toBeGreaterThan(0));
  });
});

describe('the steps', () => {
  it('stores the shape answers on the draft as chips', () => {
    render(atStep(1));
    const chip = () => screen.getByRole('button', { name: 'Two AI hosts' });
    expect(chip().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip());
    expect(chip().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '20 min' }));
    expect(screen.getByRole('button', { name: '20 min' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('edits items as label, text and text 2 rows and shows what is wrong inline', () => {
    render(atStep(2));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/Add at least 3 items/);
    fireEvent.change(screen.getByLabelText('Label of item 1'), { target: { value: 'Chapter 1 · 0:00' } });
    fireEvent.change(screen.getByLabelText('Text of item 1'), { target: { value: 'Why it lands in the close' } });
    fireEvent.change(screen.getByLabelText('Text 2 of item 1'), { target: { value: 'Host: why is it a close problem?' } });
    expect((screen.getByLabelText('Label of item 1') as HTMLInputElement).value).toBe('Chapter 1 · 0:00');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByLabelText('Label of item 1')).toBeNull();
  });
  it('offers produce rows and stock looks and voices as chips, with nothing to play yet', () => {
    render(atStep(3));
    fireEvent.click(screen.getByRole('button', { name: 'Short jingle' }));
    expect(screen.getByRole('button', { name: 'Short jingle' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('button', { name: 'Warm · Flemish English' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /HR director/ })).toBeNull();
  });
  it('says a preview comes with the studio when its kind is not registered', () => {
    render(atStep(4));
    expect(screen.getByText('Preview comes with this studio')).toBeTruthy();
  });
});

describe('Check & send', () => {
  it('keeps Send for review closed until the automatic check passes, and lists what it found', async () => {
    vi.mocked(store.loadCreate).mockResolvedValue(data());
    vi.mocked(store.saveDraft).mockResolvedValue('p1');
    vi.mocked(store.checkContribution).mockResolvedValue({ passed: false, reasons: ['Add the items first'] });
    render(atStep(5));
    const send = screen.getByRole('button', { name: 'Send for review' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.getByText('Saves your draft and checks it on the server. Send for review opens when it passes.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run the automatic check' }));
    expect(await screen.findByText('Add the items first')).toBeTruthy();
    expect(store.checkContribution).toHaveBeenCalledWith('p1');
    expect((screen.getByRole('button', { name: 'Send for review' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('View as', () => {
  it('hides every action in each step', () => {
    for (const [step, gone] of [[1, 'Two AI hosts'], [2, 'Add item'], [3, 'Short jingle'], [5, 'Send for review']] as const) {
      render(atStep(step, true));
      expect(screen.queryByRole('button', { name: gone }), 'step ' + step).toBeNull();
      cleanup();
    }
    render(atStep(5, true));
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run the automatic check' })).toBeNull();
  });
  it('hides Open on the hub cards', () => {
    render(<Live readOnly state={{ create: data(), createTab: 'new', studio: { view: 'hub', step: 0 } }} />);
    expect(card(/Flash card & Exam Studio/).disabled).toBe(true);
  });
});

describe('build steps', () => {
  const names = ['Writing the script', 'Voicing host and guest'];
  it('shows a Retry on the failed step only and runs just that step', async () => {
    const calls: number[] = []; let fail = true;
    const runner = async (_n: string, i: number) => { calls.push(i); if (i === 1 && fail) throw new Error('Voice service unavailable'); };
    const failed = await runBuild(startBuild(names), runner, () => {});
    render(<Held runner={runner} initial={failed} />);
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
    expect(screen.getByText('Voice service unavailable')).toBeTruthy();
    calls.length = 0; fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findAllByText('Done');
    expect(calls).toEqual([1]);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
  it('is honest when no builder exists for the studio', () => {
    render(<Held runner={undefined} initial={startBuild(names)} />);
    expect(screen.getByText('Building comes with this studio')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
  });
  it('hides Start and Retry in View as', () => {
    render(<Held runner={async () => {}} readOnly initial={startBuild(names)} />);
    expect(screen.queryByRole('button', { name: /Start|Retry/ })).toBeNull();
  });
});

describe('one draft', () => {
  const open = () => {
    const h = harness({ access: member('u1'), state: { screen: 'create', create: data(), createTab: 'new', nw, nwKb: [], studio: { view: 'studio', step: 2, id: 'podcast' } } });
    return Object.assign(h, { st: () => h.vm().create!.studio });
  };
  it('keeps a studio\'s rows in nw.items with their provenance, and marks AI items as AI-assisted', () => {
    const h = open();
    h.st().add();
    h.st().rows[0].edit(0, 'Chapter 1 · 0:00');
    expect(h.state.nw.items).toMatchObject({ how: 'manual', list: [['Chapter 1 · 0:00', '', '']] });
    expect(h.st().itemsLabel).toBe('');
    h.L().setState({ nw: { ...h.state.nw, items: { ...h.state.nw.items!, how: 'ai' } } });
    expect(h.st().itemsLabel).toBe('Made with AI');
  });
  it('keeps the build state on the draft so it survives Back and Next', () => {
    const h = open();
    const steps: BuildStepState[] = [{ name: 'Writing the script', status: 'done' }, { name: 'Voicing host and guest', status: 'failed', error: 'x' }, { name: 'Mixing and chapter marks', status: 'todo' }];
    h.st().build!.set(steps);
    h.L().setState({ studio: { view: 'studio', step: 1, id: 'podcast' } });
    h.L().setState({ studio: { view: 'studio', step: 3, id: 'podcast' } });
    expect(h.st().build!.steps).toEqual(steps);
  });
});

describe('the Idea step', () => {
  const idea = (formats: string[]) => render(<Live state={{ create: data(formats), createTab: 'new', nw: { ...nw, type: 'Flash cards' }, studio: { view: 'studio', step: 0 } }} />);
  it('asks what you are making only when more than one format is reachable', () => {
    idea([]);
    expect(screen.getByText('What are you making?')).toBeTruthy();
    cleanup();
    idea(['Flash cards']);
    expect(screen.queryByText('What are you making?')).toBeNull();
  });
});
