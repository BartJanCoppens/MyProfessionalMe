// @vitest-environment jsdom
// The generic studio spine: the hub over all ten studios, the step bodies, build retry and View as (Task 1.2).
// Reel is marked available here (by overriding the data in this file only) to reach the generic path: a studio with three-text rows,
// produce rows, a stock look and no build runner yet.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as store from '../lib/contributionStore';
import { studioById } from '../logic/studios';
import type { StudioRow } from '../logic/items';
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

function Live({ state, readOnly = false }: { state: Partial<AppState>; readOnly?: boolean }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'create', ...state }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, member('u1'), person({ readOnly }), async () => {}).renderVals();
  return <>{vm.create && <CreateScreen c={vm.create} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
const rule = (formats: string[]) => ({ id: 1, user_id: 'u1', lines: ['Consulting'], formats, domains: [], audiences: [] });
const data = (formats: string[] = []): CreateData => ({ contributions: [], reviews: [], rules: [rule(formats)], policies: [], peers: 3 });
const nw = { line: 'Consulting', aud: '', type: 'Reel', title: 'Pillar Two', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'One takeaway.', outline: [], sources: [], ai: false, aiNote: '' };
const looks = [{ id: 'l1', name: 'HR director · 50s', portrait: 'p1' as const, color: '#8a5a8c', licence: 'Drawn in code', active: true }];
const atStep = (step: number, readOnly = false, extra: Partial<AppState['nw']> = {}) => <Live readOnly={readOnly} state={{ create: data(), createTab: 'new', nw: { ...nw, ...extra }, stockLooks: looks, studio: { view: 'studio', step, id: 'reel' } }} />;
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
    expect(card(/Avatar Studio/).disabled).toBe(true);
    expect(card(/Avatar Studio/).textContent).toContain('Coming in a later release');
    expect(card(/Flash card & Exam Studio/).disabled).toBe(false);
    expect(screen.getAllByText('Coming in a later release')).toHaveLength(1);
  });
  it('greys an available studio the creation rules do not allow, with the reason', () => {
    render(<Live state={{ create: data(['Flash cards']), createTab: 'new', studio: { view: 'hub', step: 0 } }} />);
    expect(card(/Podcast Studio/).disabled).toBe(true);
    expect(card(/Podcast Studio/).textContent).toContain('Not in your creation rules');
    expect(card(/Flash card & Exam Studio/).disabled).toBe(false);
  });
  it('offers the Reel Studio on the hub (it is built)', () => {
    render(<Live state={{ create: data(['Reel']), createTab: 'new', studio: { view: 'hub', step: 0 } }} />);
    expect(card(/Reel Studio/).disabled).toBe(false);
    expect(card(/Reel Studio/).textContent).not.toContain('Coming in a later release');
  });
  it('opens an available studio the rules allow', () => {
    render(<Live state={{ create: data(['Reel']), createTab: 'new', studio: { view: 'hub', step: 0 } }} />);
    expect(card(/Flash card & Exam Studio/).textContent).toContain('Not in your creation rules');
    fireEvent.click(card(/Reel Studio/));
    ['Idea & sources', 'Shape it', 'Draft', 'Produce', 'Preview & test', 'Check & send'].forEach((x) => expect(screen.getAllByText(x).length).toBeGreaterThan(0));
  });
});

describe('the steps', () => {
  it('stores the shape answers on the draft as chips', () => {
    render(atStep(1));
    const chip = () => screen.getByRole('button', { name: 'Energetic' });
    expect(chip().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip());
    expect(chip().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '60 s' }));
    expect(screen.getByRole('button', { name: '60 s' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('offers Draft with AI on the Draft step', () => {
    render(atStep(2));
    expect(screen.getByRole('button', { name: 'Draft with AI' })).toBeTruthy();
  });
  it('edits items as label, text and text 2 rows and shows what is wrong inline', () => {
    render(atStep(2));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/Add at least 3 items/);
    fireEvent.change(screen.getByLabelText('Scene, or Check of item 1'), { target: { value: 'Hook' } });
    fireEvent.change(screen.getByLabelText('Voice-over, or the check question of item 1'), { target: { value: 'Your project is drifting.' } });
    fireEvent.change(screen.getByLabelText(/^On-screen text, or the options/), { target: { value: 'three signs' } });
    expect((screen.getByLabelText('Scene, or Check of item 1') as HTMLInputElement).value).toBe('Hook');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByLabelText('Scene, or Check of item 1')).toBeNull();
  });
  it('offers produce rows and, for the stock presenter, stock looks as chips, with nothing to play yet', () => {
    render(atStep(3, false, { shape: { 'Who presents?': 'Stock presenter and AI voice' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Upbeat' }));
    expect(screen.getByRole('button', { name: 'Upbeat' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /HR director/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Warm · Flemish English' })).toBeNull();
  });
  it('says a preview comes with the studio when its kind is not registered', () => {
    render(<Live state={{ create: data(), createTab: 'new', nw, studio: { view: 'studio', step: 4, id: 'avatar' } }} />);
    expect(screen.getByText('Preview comes with this studio')).toBeTruthy();
  });
});

describe('Check & send', () => {
  it('keeps the check closed while the studio itself sees a problem', () => {
    render(atStep(5));
    expect((screen.getByRole('button', { name: 'Run the automatic check' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('keeps Send for review closed until the automatic check passes, and lists what it found', async () => {
    vi.mocked(store.loadCreate).mockResolvedValue(data());
    vi.mocked(store.saveDraft).mockResolvedValue('p1');
    vi.mocked(store.checkContribution).mockResolvedValue({ passed: false, reasons: ['Add the items first'] });
    const rows = studioById('aid')!.items.map((r) => [...r]) as StudioRow[];
    render(<Live state={{ create: data(), createTab: 'new', nw: { ...nw, type: 'Job aid', items: { list: rows, how: 'manual', problems: [], note: '' } }, studio: { view: 'studio', step: 5, id: 'aid' } }} />);
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
    for (const [step, gone] of [[1, 'Energetic'], [2, 'Add item'], [2, 'Draft with AI'], [3, 'Upbeat'], [5, 'Send for review']] as const) {
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
  it('continues with the steps still to do after a retried step, and runs only those', async () => {
    const three = [...names, 'Mixing'], calls: number[] = []; let fail = true;
    const runner = async (_n: string, i: number) => { calls.push(i); if (i === 1 && fail) throw new Error('Voice service unavailable'); };
    render(<Held runner={runner} initial={await runBuild(startBuild(three), runner, () => {})} />);
    expect(screen.queryByRole('button', { name: /building/ })).toBeNull();
    calls.length = 0; fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue building' }));
    await waitFor(() => expect(screen.getAllByText('Done')).toHaveLength(3));
    expect(calls).toEqual([1, 2]);
    expect(screen.queryByRole('button', { name: /building/ })).toBeNull();
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
    const h = harness({ access: member('u1'), state: { screen: 'create', create: data(), createTab: 'new', nw, nwKb: [], studio: { view: 'studio', step: 2, id: 'reel' } } });
    return Object.assign(h, { st: () => h.vm().create!.studio });
  };
  it('keeps a studio\'s rows in nw.items with their provenance, and marks AI items as AI-assisted', () => {
    const h = open();
    h.st().add();
    h.st().rows[0].edit(0, 'Hook');
    expect(h.state.nw.items).toMatchObject({ how: 'manual', list: [['Hook', '', '']] });
    expect(h.st().itemsLabel).toBe('');
    h.L().setState({ nw: { ...h.state.nw, items: { ...h.state.nw.items!, how: 'ai' } } });
    expect(h.st().itemsLabel).toBe('Made with AI');
  });
  it('keeps the build state on the draft so it survives Back and Next', () => {
    const h = open();
    const steps: BuildStepState[] = [{ name: 'Writing the voice-over', status: 'todo' }, { name: 'No voice · text and music only', status: 'failed', error: 'x' }, { name: 'Adding visuals and captions', status: 'todo' }];
    h.st().build!.set(steps);
    h.L().setState({ studio: { view: 'studio', step: 1, id: 'reel' } });
    h.L().setState({ studio: { view: 'studio', step: 3, id: 'reel' } });
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

describe('the Motion Studio\'s Produce step', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><rect width="9" height="9"><animate attributeName="opacity" dur="1s"/></rect></svg>';
  const stages = [['Order', 'a'], ['Deliver', 'b'], ['Collect', 'c']];
  const produce = (extra: unknown[] = [], readOnly = false) => render(<Live readOnly={readOnly} state={{ create: data(), createTab: 'new', studio: { view: 'studio', step: 3, id: 'motion' },
    nw: { ...nw, type: 'Animated flow', items: { list: [...stages, ...extra] as never, how: 'manual', problems: [], note: '' } } }} />);
  it('says why the flow will be scripted while AI is off, before anything is built', () => {
    produce();
    expect(screen.getByText('AI is not switched on, so the build animates a scripted flow of boxes and arrows from your stages.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /Text alternative/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start building' })).toBeTruthy();
  });
  it('shows who made the animation, the text alternative to edit and a way to build it again', () => {
    produce([{ svg: SVG, alt: 'Three stages.', made: 'ai', seconds: 45 }]);
    expect(screen.getByText('Made with AI')).toBeTruthy();
    const alt = screen.getByRole('textbox', { name: /Text alternative/ }) as HTMLTextAreaElement;
    expect(alt.value).toBe('Three stages.');
    fireEvent.change(alt, { target: { value: '' } });
    expect(screen.getByText(/Write the text alternative in Produce/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Build it again' }));
    expect(screen.queryByRole('textbox', { name: /Text alternative/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start building' })).toBeTruthy();
  });
  it('offers the scripted flow as a button after a failed AI step, and uses it only when pressed', () => {
    render(<Live state={{ create: data(), createTab: 'new', studio: { view: 'studio', step: 3, id: 'motion' }, nw: { ...nw, type: 'Animated flow',
      build: [{ name: 'Drawing the flow', status: 'done' }, { name: 'Animating each stage', status: 'failed', error: 'AI did not return a usable animation · retry this step' }, { name: 'Writing the text alternative', status: 'todo' }],
      items: { list: [...stages, { svg: SVG, alt: '', made: 'layout', seconds: 45 }] as never, how: 'manual', problems: [], note: '' } } }} />);
    expect(screen.getByText('Not animated yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use the scripted flow instead' }));
    expect(screen.getByText('Scripted · boxes and arrows')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use the scripted flow instead' })).toBeNull();
    expect((screen.getByRole('textbox', { name: /Text alternative/ }) as HTMLTextAreaElement).value).toMatch(/^An animated flow in 3 stages/);
  });
  it('shows the text alternative as plain text in View as, with nothing to change', () => {
    produce([{ svg: SVG, alt: 'Three stages.', made: 'scripted', seconds: 45 }], true);
    expect(screen.getByText('Three stages.')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Build it again' })).toBeNull();
  });
});
