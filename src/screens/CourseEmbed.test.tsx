// @vitest-environment jsdom
// Embedded learnings in a course (E-learning Studio, Tasks 2.1 and 2.2): the learner's card and inline panel, the Studio's play-test, View as, and the panel
// being built only while its embed is open.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from '../data';
import { parseFormatContent } from '../lib/contentStore';
import * as learner from '../lib/learnerStore';
import { COMPLETION_QUESTION } from '../logic/courseContent';
import { emptyParts } from '../logic/contribution';
import { initState, Logic } from '../model';
import { cfg, harness, member, person } from '../test/harness';
import { Live as EditorLive } from '../test/courseEditorLive';
import { ITEMS, data } from '../test/courseEditorFixtures';
import * as store from '../lib/contributionStore';
import type { AppState, CourseContent, Learn } from '../types';
import { DetailScreen } from './Library';
import { courseView, NEW_RUN } from '../fmtCourse';
import CoursePanel from './CoursePanel';
import { Preview } from './studioPreviews';

vi.mock('../lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}), acceptLearning: vi.fn(),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));
vi.mock('../lib/reflectionStore', () => ({ REFLECTION_MAX: 2000, loadReflections: vi.fn(async () => ({})), saveReflectionSoon: vi.fn() }));
vi.mock('../lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));

beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

function Live({ readOnly = false, id = 'L997', backTo = null as string | null }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'detail', detailId: id, backTo }));
  const subject = person(readOnly ? { id: 'p2', name: 'Kim Learner', readOnly: true } : {});
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg,
    { toastTimer: { current: undefined }, drag: { current: null }, file: { current: null }, chat: { current: null } }, member(subject.id), subject, async () => {}, async () => {}).renderVals();
  return <DetailScreen vm={vm} />;
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const studioPreview = () => harness({ access: member('u1'), subject: person(), state: { screen: 'create', createTab: 'new', nwKb: [], studio: { view: 'studio', step: 3, id: 'elearn' },
  create: { contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 },
  nw: { line: 'Consulting', aud: '', type: 'E-learning', title: 'T', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'x', outline: [], sources: [], ai: false, aiNote: '',
    shape: { [COMPLETION_QUESTION]: 'All lessons viewed' }, items: { list: [['Lesson 1', 'One', ''], ['Lesson 2', 'Two', '']] as never, how: 'manual', problems: [], note: '' } } } });

// A course that embeds two learnings (Task 2.1): a flash deck and a practice exam, which play through their own panels inside the course.
describe('an embedded learning in the learner\'s course', () => {
  const EMBEDS = { kind: 'course', rule: 'seen', lessons: [{ title: 'Practise', blocks: [{ block: 'embed', id: 'b0001', format: 'Flash cards', learning: 'L60' }, { block: 'embed', id: 'b0002', format: 'Practice exam', learning: 'L61' }] },
    { title: 'Done', blocks: [{ block: 'text', id: 'b0003', h: '', t: 'The end.' }] }] } as CourseContent;
  const DECK = { kind: 'flash', total: 40, due: 3, next: 'Thu 19 Nov', cards: [['Q one', 'A one'], ['Q two', 'A two']] };
  const EXAM = { kind: 'exam', bank: 40, real: 'x', qs: [{ t: 'Rates', q: 'First?', o: ['a', 'b', 'c', 'd'], a: 1, why: 'Because b' }, { t: 'SMEs', q: 'Second?', o: ['a', 'b', 'c', 'd'], a: 0, why: 'Because a' }] };
  const ROW2: Learn = ['L994', 'Practise it', 'reg', 2, 'E-learning', 'Peer contribution', 0.5, 0, '', ''];
  const kept = { L60: LEARN_META.L60, L61: LEARN_META.L61 };
  beforeAll(() => {
    LEARN.push(ROW2); LEARN_BY.L994 = ROW2; LEARN_META.L994 = { line: null, status: 'published', content: EMBEDS };
    LEARN_META.L60 = { line: null, status: 'published', content: parseFormatContent(DECK) }; LEARN_META.L61 = { line: null, status: 'published', content: parseFormatContent(EXAM) };
  });
  afterAll(() => {
    LEARN.splice(LEARN.indexOf(ROW2), 1); delete LEARN_BY.L994; delete LEARN_META.L994;
    ([['L60', kept.L60], ['L61', kept.L61]] as const).forEach(([id, m]) => { if (m) LEARN_META[id] = m; else delete LEARN_META[id]; });
  });

  it('shows each embed as a card with its title and length, and nothing of it plays until opened', () => {
    render(<Live id="L994" />);
    expect(screen.getByText('ITAA flash cards: corporate tax essentials')).toBeTruthy();
    expect(screen.getByText(/^Flash cards · /)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Flip the card' })).toBeNull();
    expect(screen.queryByText(/Prototype/)).toBeNull();
    expect(screen.queryByText(/SCORM/)).toBeNull();
  });
  it('plays the format\'s own panel inline, and finishing it saves progress on that learning only', () => {
    render(<Live id="L994" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Flip the card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Good · 3 days' }));
    expect(learner.saveProgress).toHaveBeenCalledTimes(1);
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L60', { detail: { due: { '0': expect.any(String) } } });
  });
  it('opening a second embed closes the first', () => {
    render(<Live id="L994" />);
    const open = screen.getAllByRole('button', { name: 'Open' });
    fireEvent.click(open[0]);
    expect(screen.getByRole('button', { name: 'Flip the card' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByRole('button', { name: 'Flip the card' })).toBeNull();
    expect(screen.getByText('Practice exam')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
  });
  it('goes back to the course from a learning opened from it, with "← Back to the course"', () => {
    render(<Live id="L38" backTo="L994" />);
    click('← Back to the course');
    expect(screen.getByText('Practise')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '← Back to the course' })).toBeNull();
  });
  it('View as: the embedded panel is read only and nothing is saved (ELM-08)', () => {
    render(<Live id="L994" readOnly />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Good · 3 days' })).toBeNull();
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
  it('builds an embed\'s panel only while it is open', () => {
    const renderEmbed = vi.fn(() => <div>panel</div>);
    const co = courseView(EMBEDS, NEW_RUN, () => {}, { ro: false, seen: [], done: false, onProgress: () => {}, preview: false });
    const { rerender } = render(<CoursePanel co={co} renderEmbed={renderEmbed} />);
    expect(renderEmbed).not.toHaveBeenCalled();
    rerender(<CoursePanel co={courseView(EMBEDS, { ...NEW_RUN, open: 'b0001' }, () => {}, { ro: false, seen: [], done: false, onProgress: () => {}, preview: false })} renderEmbed={renderEmbed} />);
    expect(renderEmbed).toHaveBeenCalledTimes(1);
    expect(renderEmbed).toHaveBeenCalledWith('L60');
  });
  it('says a retired learning is no longer available, blocks nothing and the course still completes by its lessons', () => {
    LEARN_META.L61 = { line: null, status: 'review', content: parseFormatContent(EXAM) };
    render(<Live id="L994" />);
    expect(screen.getByText('This learning is no longer available')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(1);
    click('Next lesson ›');
    expect(vi.mocked(learner.saveProgress)).toHaveBeenLastCalledWith('u1', 'L994', { state: 'accepted', pct: 100, detail: { seen: [0, 1] } });
    LEARN_META.L61 = { line: null, status: 'published', content: parseFormatContent(EXAM) };
  });
});

describe('the E-learning Studio preview with an embed', () => {
  it('plays an embedded explainer as a play-test and writes nothing', () => {
    const row: Learn = ['L992', 'How an e-invoice travels', 'reg', 2, 'Interactive explainer', 'Peer contribution', 0.25, 0, '', ''];
    LEARN.push(row); LEARN_BY.L992 = row;
    LEARN_META.L992 = { line: null, status: 'published', content: parseFormatContent({ kind: 'explainer', style: 'Step-through', depth: 'Overview', end: 'A summary card',
      steps: [{ label: 'Supplier', text: 'Creates the invoice.' }, { label: 'Access point', text: 'Checks the format.' }, { label: 'Customer', text: 'Gets the invoice.' }] }) };
    try {
      const h = studioPreview(), c = h.vm().create!;
      const content = { kind: 'course', rule: 'seen', lessons: [{ title: 'One', blocks: [{ block: 'embed', id: 'b0009', format: 'Interactive explainer', learning: 'L992' }] }] } as CourseContent;
      render(<Preview kind="elearn" c={{ ...c, studio: { ...c.studio, content } }} />);
      click('Open');
      click('Next ›'); click('Next ›');
      expect(screen.getByText('Gets the invoice.')).toBeTruthy();
      expect(learner.saveProgress).not.toHaveBeenCalled();
      expect(h.patches).toHaveLength(0);
    } finally { LEARN.splice(LEARN.indexOf(row), 1); delete LEARN_BY.L992; delete LEARN_META.L992; }
  });
  it('says a flash deck or an exam plays on the learner\'s page: Open leaves no blank panel', () => {
    LEARN_META.L60 = { line: null, status: 'published', content: parseFormatContent({ kind: 'flash', total: 40, due: 3, next: 'Thu 19 Nov', cards: [['Q one', 'A one'], ['Q two', 'A two']] }) };
    const h = studioPreview(), c = h.vm().create!;
    const content = { kind: 'course', rule: 'seen', lessons: [{ title: 'One', blocks: [{ block: 'embed', id: 'b0008', format: 'Flash cards', learning: 'L60' }] }] } as CourseContent;
    render(<Preview kind="elearn" c={{ ...c, studio: { ...c.studio, content } }} />);
    click('Open');
    expect(screen.getByText(/Plays on the learner's page/)).toBeTruthy();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    delete LEARN_META.L60;
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
    render(<EditorLive />);
    expect(within(screen.getByRole('group', { name: 'From the studios' })).getAllByRole('button').map((b) => b.textContent?.replace(/^\S+(?=[A-Z])/, ''))).toHaveLength(7);
    expect(within(screen.getByRole('group', { name: 'Practice and reference' })).getAllByRole('button')).toHaveLength(4);
    ['Avatar conversation', 'Reel', 'Explainer', 'Flash cards', 'Case exercise'].forEach((n) => expect(screen.getByRole('button', { name: new RegExp(n) })).toBeTruthy());
  });
  it('the Reel item adds an embed and opens its Source, listing only published reels, newest first', () => {
    render(<EditorLive />);
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
    render(<EditorLive />);
    fireEvent.click(within(screen.getByRole('group', { name: 'From the studios' })).getByRole('button', { name: /Game/ }));
    expect(Array.from((screen.getByRole('combobox', { name: 'Source' }) as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Nothing in the library yet']);
    games.forEach((id, i) => { if (kept[i]) LEARN_META[id] = kept[i]; else delete LEARN_META[id]; });
  });
  it('"Make a new one in the Reel Studio" saves the course, opens the Reel Studio and shows the banner', async () => {
    vi.mocked(store.saveDraft).mockResolvedValue('c1'); vi.mocked(store.loadCreate).mockResolvedValue(data());
    render(<EditorLive />);
    fireEvent.click(within(screen.getByRole('group', { name: 'From the studios' })).getByRole('button', { name: /Reel/ }));
    click('Make a new one in the Reel Studio');
    expect((await screen.findByRole('note')).textContent).toBe('Your course “VAT” is saved in My contributions · open it there to continue');
    expect(store.saveDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Reel Studio')).toBeTruthy();
  });
  it('without a Reel rule it refuses and saves nothing', () => {
    vi.mocked(store.saveDraft).mockClear();
    render(<EditorLive formats={['E-learning']} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'From the studios' })).getByRole('button', { name: /Reel/ }));
    click('Make a new one in the Reel Studio');
    expect(screen.getByRole('status').textContent).toBe('No creation rule for Reel in Consulting');
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
  it('View as shows no shelf and no Source', () => {
    render(<EditorLive readOnly items={[...ITEMS, { block: 'embed', id: 'b0009', lesson: 0, format: 'Reel', learning: 'L9103' }]} />);
    expect(screen.getByText('New reel')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'From the studios' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Source' })).toBeNull();
  });
});
