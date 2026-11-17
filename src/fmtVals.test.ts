// The v4 formats' covers and detail panels: flash deck, practice exam, case, teach-back, stretch, webinar, job aid.
// Seed data has no content (it comes from the database), so each test injects content parsed like the database's.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
import { LEARN_META } from './data';
import { parseFormatContent } from './lib/contentStore';
import * as learner from './lib/learnerStore';
import * as store from './lib/aiStore';
import { flush, harness, member, person, stubWindow, withProgress } from './test/harness';
import type { LearningDetail } from './types';
import type { LearnState } from './logic/learner';

vi.mock('./lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('./lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));
vi.mock('./lib/aiStore', () => ({
  loadAiAdmin: vi.fn(), loadLiveUses: vi.fn(async () => []), saveConnection: vi.fn(), setKey: vi.fn(), deleteConnection: vi.fn(), updateUse: vi.fn(), testConnection: vi.fn(), askAi: vi.fn(),
}));

const CONTENT: Record<string, unknown> = {
  L60: { kind: 'flash', total: 40, due: 3, next: 'Thu 19 Nov', cards: [['Q one', 'A one'], ['Q two', 'A two'], ['Q three', 'A three']] },
  L61: { kind: 'exam', bank: 40, real: 'The real exam has 50 questions', qs: [
    { t: 'Rates', q: 'First?', o: ['a', 'b', 'c', 'd'], a: 1, why: 'Because b' }, { t: 'SMEs', q: 'Second?', o: ['a', 'b', 'c', 'd'], a: 0, why: 'Because a' }] },
  L64: { kind: 'case', brief: 'A carve-out.', deliv: ['A plan', 'A risk list'], rubric: ['Clear', 'Complete'], reviewer: 'Reviewed by your counsellor or a peer.' },
  L65: { kind: 'teach', prompt: 'Explain double materiality.', crit: [['Impact', 'impact|people'], ['Financial', 'financ|risk'], ['Both', 'both|two'], ['Plain language', null]] },
  L66: { kind: 'stretch', brief: 'Lead a meeting.', checks: ['Agree scope', 'Run it', 'Reflect'] },
  L67: { kind: 'webinar', mon: 'DEC', day: '4', time: '12:30–13:30', when: 'Fri 4 Dec 2026 · 12:30–13:30 CET · online', speakers: 'Two partners', agenda: ['Changes', 'Questions'] },
  L68: { kind: 'aid', items: ['Scope', 'Price', 'Terms'] },
};
const saved: Record<string, unknown> = {};
beforeAll(() => { Object.entries(CONTENT).forEach(([id, raw]) => { saved[id] = LEARN_META[id]; LEARN_META[id] = { line: null, status: 'published', content: parseFormatContent(raw) }; }); });
afterAll(() => { Object.keys(CONTENT).forEach((id) => { if (saved[id]) LEARN_META[id] = saved[id] as never; else delete LEARN_META[id]; }); });
beforeEach(() => { stubWindow(); vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-17T10:00:00Z') }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const coach = { id: 'c1', name: 'Sam Coach' };
const field = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLTextAreaElement>;
type Rows = Parameters<typeof withProgress>[0];
function on(id: string, rows: Rows = {}, detail: Record<string, LearningDetail> = {}, extra: Parameters<typeof harness>[0] = {}) {
  const data = withProgress(rows);
  Object.entries(detail).forEach(([k, d]) => { data.progress[k] = { ...(data.progress[k] || { state: 'not-started' as LearnState, pct: 0, chosen: false }), detail: d }; });
  return harness({ subject: person({ counsellor: coach, data }), state: { screen: 'detail', detailId: id }, ...extra });
}
const viewAs = (id: string, rows: Rows = {}) =>
  harness({ subject: person({ id: 'p2', name: 'Kim Learner', readOnly: true, counsellor: coach, data: withProgress(rows) }), access: member('c1'), state: { screen: 'detail', detailId: id } });

describe('panels need content', () => {
  it('shows no panel for a learning without content', () => {
    const det = on('L1').vm().det;
    expect([det.isFlash, det.isExam, det.isCase, det.isTeach, det.isStretch, det.isWebinar, det.isAid]).toEqual([false, false, false, false, false, false, false]);
  });
  it('shows one panel per format', () => {
    const flags = (id: string) => { const d = on(id).vm().det; return [d.isFlash, d.isExam, d.isCase, d.isTeach, d.isStretch, d.isWebinar, d.isAid].map(Number).join(''); };
    expect(['L60', 'L61', 'L64', 'L65', 'L66', 'L67', 'L68'].map(flags)).toEqual(['1000000', '0100000', '0010000', '0001000', '0000100', '0000010', '0000001']);
  });
});

describe('completion copy for the formats that complete in their panel', () => {
  it('says what the panel needs, not "mark it as completed", when the learning has content', async () => {
    const h = on('L60', { L60: ['in-progress', 100], L68: ['in-progress', 100] });
    const vm = h.vm();
    expect(vm.det.approvalNote).toBe('Review every card once to complete it. It counts right away; no acceptance needed.');
    expect(vm.done.note).toBe('Review every card once to complete it. It counts right away; no acceptance needed.');
    expect(vm.done.mark).toBeNull();
    expect(vm.libItems.find((i) => i.id === 'L60')!.stateLabel).toBe('All hours logged · review every card once');
    expect(vm.libItems.find((i) => i.id === 'L68')!.stateLabel).toBe('All hours logged · tick every item');
    expect(on('L61').vm().done.note).toBe('Finish one round to complete it. It counts right away; no acceptance needed.');
    expect(on('L65').vm().done.note).toBe('Send your explanation to complete it. It counts right away; no acceptance needed.');
  });
  it('tells the learner what is left when the last hour is logged', async () => {
    const h = on('L68', { L68: ['in-progress', 0] });
    h.vm().logHours();
    await flush();
    expect(h.lastToast()).toBe('All hours logged · tick every item to complete it');
  });
  it('keeps the mark text for a learning of these formats without content', () => {
    const vm = on('L62').vm();
    expect(vm.done.note).toBe('Mark it as completed when you have finished the course. It counts right away; no acceptance needed.');
    expect(vm.done.mark).not.toBeNull();
  });
});

describe('flash cards', () => {
  it('states the real deck size, the cards that get completed', () => {
    expect(on('L60').vm().det.fl!.sub).toBe('3 cards · 3 due now · spaced repetition');
  });
  it('starts on the front of the first due card, flips, and shows three ratings', () => {
    const h = on('L60');
    expect(h.vm().det.fl!).toMatchObject({ active: true, pos: '1 / 3', face: 'Q one', side: 'Question', showFlip: true, showRate: false });
    h.vm().det.fl!.flip();
    expect(h.vm().det.fl!).toMatchObject({ face: 'A one', side: 'Answer', showRate: true, showFlip: false });
  });
  it('queues only the cards due now', () => {
    const h = on('L60', { L60: ['in-progress', 0] }, { L60: { due: { '0': '2026-11-20T10:00:00.000Z' } } });
    expect(h.vm().det.fl!).toMatchObject({ pos: '1 / 2', face: 'Q two' });
  });
  it('writes the next review into detail.due through persist() and goes on to the next card', async () => {
    const h = on('L60');
    h.vm().det.fl!.flip();
    h.vm().det.fl!.good();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L60', { detail: { due: { '0': '2026-11-20T10:00:00.000Z' } } });
    expect(h.reloadSubject).toHaveBeenCalled();
    expect(h.vm().det.fl!).toMatchObject({ pos: '2 / 3', face: 'Q two', side: 'Question' });
  });
  it('puts an "again" card back at the end of the queue, due in 10 minutes', async () => {
    const h = on('L60');
    h.vm().det.fl!.again();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L60', { detail: { due: { '0': '2026-11-17T10:10:00.000Z' } } });
    expect(h.vm().det.fl!.pos).toBe('2 / 4');
  });
  it('completes the learning once every card has been rated at least once, and says what is next', async () => {
    const h = on('L60', { L60: ['in-progress', 0] }, { L60: { due: { '0': '2026-11-20T10:00:00.000Z', '1': '2026-11-20T10:00:00.000Z' } } });
    h.vm().det.fl!.easy();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L60', expect.objectContaining({ state: 'accepted', pct: 100, detail: { due: expect.objectContaining({ '2': '2026-11-25T10:00:00.000Z' }) } }));
    expect(h.vm().det.fl!).toMatchObject({ finished: true, summary: expect.stringContaining('1 known, 0 to repeat') });
  });
  it('does not complete while a card has not been rated', async () => {
    const h = on('L60');
    h.vm().det.fl!.good();
    await flush();
    expect(vi.mocked(learner.saveProgress).mock.calls[0][2]).not.toHaveProperty('state');
  });
  it('can restart the deck after it is finished', () => {
    const h = on('L60', { L60: 'accepted' }, { L60: { due: { '0': '2026-11-20T10:00:00.000Z', '1': '2026-11-20T10:00:00.000Z', '2': '2026-11-20T10:00:00.000Z' } } });
    expect(h.vm().det.fl!.finished).toBe(true);
    h.vm().det.fl!.restart();
    expect(h.vm().det.fl!).toMatchObject({ active: true, pos: '1 / 3' });
  });
});

describe('practice exam', () => {
  const answer = (h: ReturnType<typeof on>, picks: number[]) => {
    picks.forEach((p) => { h.vm().det.ex!.opts[p].pick(); h.vm().det.ex!.main(); h.vm().det.ex!.main(); });
  };
  it('walks through a question with feedback', () => {
    const h = on('L61');
    expect(h.vm().det.ex!).toMatchObject({ pos: 'Question 1 of 2', topic: 'Rates', q: 'First?', mainLabel: 'Check answer', mainOff: true, hasFb: false });
    h.vm().det.ex!.opts[0].pick();
    h.vm().det.ex!.main();
    expect(h.vm().det.ex!).toMatchObject({ hasFb: true, fbHead: 'Not quite.', why: 'Because b', mainLabel: 'Next question' });
  });
  it('finishes with the score, the verdict and the topics, and completes the learning', async () => {
    const h = on('L61');
    answer(h, [1, 0]);
    await flush();
    expect(h.vm().det.ex!).toMatchObject({ finished: true, scoreLabel: '100 %', verdict: 'Ready to book the real exam', frac: 1 });
    expect(h.vm().det.ex!.topics.map((t: { label: string; v: string }) => t.label + ' ' + t.v)).toEqual(['Rates 100 %', 'SMEs 100 %']);
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L61', { state: 'accepted', pct: 100, detail: { best: 100 } });
  });
  it('advises when below 70 % but still completes the round: the verdict never locks anything', async () => {
    const h = on('L61', {}, { L61: { best: 50 } });
    answer(h, [0, 1]);
    await flush();
    expect(h.vm().det.ex!).toMatchObject({ scoreLabel: '0 % · best 50 %', verdict: 'Not ready yet: aim for 70 % before you book' });
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L61', { state: 'accepted', pct: 100, detail: { best: 50 } });
  });
  it('offers another round', () => {
    const h = on('L61');
    answer(h, [1, 0]);
    h.vm().det.ex!.restart();
    expect(h.vm().det.ex!).toMatchObject({ active: true, pos: 'Question 1 of 2' });
  });
});

describe('teach-back', () => {
  const full = 'Impact on people, and financial risk; both count, in plain words.';
  it('checks by keyword when AI is not live, says so, and completes on send', async () => {
    const h = on('L65');
    h.vm().det.tb!.setText(field(full));
    await h.vm().det.tb!.send();
    await flush();
    expect(store.askAi).not.toHaveBeenCalled();
    expect(h.vm().det.tb!).toMatchObject({ hasRes: true, by: 'Checked by keyword', scoreLabel: 'Understanding · 4 of 4' });
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L65', { state: 'accepted', pct: 100, detail: { text: full, score: 4, ai: false } });
  });
  it('completes even with a low score: the score is advice', async () => {
    const h = on('L65');
    h.vm().det.tb!.setText(field('Not sure.'));
    await h.vm().det.tb!.send();
    await flush();
    expect(h.vm().det.tb!.scoreLabel).toBe('Understanding · 1 of 4');
    expect(vi.mocked(learner.saveProgress).mock.calls[0][2]).toMatchObject({ state: 'accepted' });
  });
  it('asks the teach_back use when it is live and says "AI assistant" only when it answered', async () => {
    vi.mocked(store.askAi).mockResolvedValueOnce('{"met":[true,true,false,true],"feedback":"Good.","follow":"Why?"}');
    const h = on('L65', {}, {}, { config: { liveAssistant: true }, state: { screen: 'detail', detailId: 'L65', aiLive: ['teach_back'] } });
    h.vm().det.tb!.setText(field(full));
    await h.vm().det.tb!.send();
    await flush();
    expect(store.askAi).toHaveBeenCalledWith('teach_back', expect.objectContaining({ messages: [expect.objectContaining({ role: 'user' })] }));
    expect(h.vm().det.tb!).toMatchObject({ by: 'AI assistant', scoreLabel: 'Understanding · 3 of 4', feedback: 'Good.', follow: 'Why?' });
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L65', expect.objectContaining({ detail: { text: full, score: 3, ai: true } }));
  });
  it('falls back to the keyword check, labelled as such, when AI does not answer', async () => {
    vi.mocked(store.askAi).mockRejectedValueOnce(new Error('401'));
    const h = on('L65', {}, {}, { config: { liveAssistant: true }, state: { screen: 'detail', detailId: 'L65', aiLive: ['teach_back'] } });
    h.vm().det.tb!.setText(field(full));
    await h.vm().det.tb!.send();
    await flush();
    expect(h.vm().det.tb!.by).toBe('Checked by keyword');
  });
  it('asks for an explanation first', async () => {
    const h = on('L65');
    await h.vm().det.tb!.send();
    expect(h.lastToast()).toBe('Write your explanation first');
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
  it('counts words and shows the saved explanation again', () => {
    const h = on('L65', { L65: 'accepted' }, { L65: { text: 'Two words', score: 2, ai: false } });
    expect(h.vm().det.tb!).toMatchObject({ text: 'Two words', count: '2 of 150 words', hasRes: true, scoreLabel: 'Understanding · 2 of 4', by: 'Checked by keyword' });
  });
});

describe('case exercise', () => {
  it('hands in through the evidence flow, with the link, to the counsellor', async () => {
    const h = on('L64', { L64: ['in-progress', 50] }, {}, { state: { screen: 'detail', detailId: 'L64', evDraft: { key: 'u1|L64', note: '', link: 'https://example.com/case.pdf', ref: '' } } });
    expect(h.vm().det.ce!).toMatchObject({ brief: 'A carve-out.', submitLabel: 'Hand in', handed: false });
    h.vm().det.ce!.submit();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L64', { state: 'submitted', pct: 100, note: '', link: 'https://example.com/case.pdf', ref: '' });
  });
  it('refuses without a link and says what is missing; nothing is faked', async () => {
    const h = on('L64', { L64: ['in-progress', 50] });
    h.vm().det.ce!.submit();
    await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Add a link to your deliverable to submit');
  });
  it('shows it as handed in once submitted', () => {
    expect(on('L64', { L64: 'submitted' }).vm().det.ce!).toMatchObject({ handed: true, submitLabel: 'Handed in', note: 'Sent to Sam Coach for review.' });
  });
});

describe('stretch assignment', () => {
  it('saves the ticked checkpoints in detail.stretch.checks', async () => {
    const h = on('L66', {}, { L66: { checks: [0] } });
    expect(h.vm().det.sa!.checks.map((c: { on: boolean }) => c.on)).toEqual([true, false, false]);
    h.vm().det.sa!.checks[2].toggle();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L66', { detail: { checks: [0, 2] } });
  });
  it('agrees with the counsellor through the evidence flow, needing a 140-character reflection', async () => {
    const note = 'x'.repeat(140);
    const h = on('L66', { L66: ['in-progress', 30] }, {}, { state: { screen: 'detail', detailId: 'L66', evDraft: { key: 'u1|L66', note, link: '', ref: '' } } });
    expect(h.vm().det.sa!.agreeLabel).toBe('Agree with Sam');
    h.vm().det.sa!.agree();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L66', { state: 'submitted', pct: 100, note, link: '', ref: '' });
  });
  it('refuses a short reflection', async () => {
    const h = on('L66', { L66: ['in-progress', 30] });
    h.vm().det.sa!.agree();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Add a reflection of at least 140 characters to submit');
  });
  it('says "your counsellor" when there is none', () => {
    const h = harness({ subject: person(), state: { screen: 'detail', detailId: 'L66' } });
    expect(h.vm().det.sa!.agreeLabel).toBe('Agree with your counsellor');
  });
});

describe('webinar', () => {
  it('registers and unregisters through detail.webinar', async () => {
    const h = on('L67');
    expect(h.vm().det.wb!).toMatchObject({ mon: 'DEC', day: '4', time: '12:30–13:30', regLabel: 'I’ll attend', registered: false });
    h.vm().det.wb!.register();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L67', { detail: { registered: true } });
    vi.mocked(learner.saveProgress).mockClear();
    const again = on('L67', {}, { L67: { registered: true } });
    expect(again.vm().det.wb!).toMatchObject({ regLabel: 'I’ll attend ✓', registered: true });
    again.vm().det.wb!.register();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L67', { detail: { registered: false } });
  });
  it('builds a calendar file from the date, and offers none when the date cannot be read', () => {
    expect(on('L67').vm().det.wb!.ics).toContain('DTSTART;TZID=Europe/Brussels:20261204T123000');
    LEARN_META.L67 = { line: null, status: 'published', content: parseFormatContent({ ...(CONTENT.L67 as object), when: 'Soon' }) };
    expect(on('L67').vm().det.wb!.ics).toBeNull();
    LEARN_META.L67 = { line: null, status: 'published', content: parseFormatContent(CONTENT.L67) };
  });
});

describe('the generic mark button', () => {
  it('is hidden for the four auto-completing formats that have a panel, and stays for e-learning', () => {
    expect(['L60', 'L61', 'L65', 'L68'].map((id) => on(id).vm().done.mark)).toEqual([null, null, null, null]);
    expect(on('L17').vm().done.mark).not.toBeNull();
  });
});

describe('stretch in View as', () => {
  it('does not tell the viewer to write a reflection', () => {
    expect(viewAs('L66').vm().det.sa!.note).toBe('0 of 3 checkpoints done. Not handed in yet.');
  });
});

describe('job aid', () => {
  it('ticks items into detail.aid and counts them', async () => {
    const h = on('L68', {}, { L68: { ticks: [0] } });
    expect(h.vm().det.ja!).toMatchObject({ count: '1 of 3 ticked' });
    h.vm().det.ja!.items[1].toggle();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L68', { detail: { ticks: [0, 1] } });
  });
  it('completes when every item is ticked', async () => {
    const h = on('L68', {}, { L68: { ticks: [0, 2] } });
    h.vm().det.ja!.items[1].toggle();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L68', { state: 'accepted', pct: 100, detail: { ticks: [0, 1, 2] } });
  });
  it('clears the ticks without undoing a completion', async () => {
    const h = on('L68', { L68: 'accepted' }, { L68: { ticks: [0, 1, 2] } });
    h.vm().det.ja!.reset();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L68', { detail: { ticks: [] } });
  });
});

describe('View as', () => {
  it('writes nothing and shows no action in any panel', async () => {
    const flags = ['L60', 'L61', 'L64', 'L65', 'L66', 'L67', 'L68'].map((id) => viewAs(id).vm().det);
    expect(flags.every((d) => [d.fl, d.ex, d.ce, d.tb, d.sa, d.wb, d.ja].some((p) => p?.ro))).toBe(true);
    const [fl, ex, ce, tb, sa, wb, ja] = flags;
    expect(fl.fl).toMatchObject({ active: false, showRate: false, showFlip: false });
    expect(ex.ex).toMatchObject({ active: false, finished: false });
    ce.ce!.submit(); sa.sa!.agree(); sa.sa!.checks[0].toggle(); wb.wb!.register(); ja.ja!.items[0].toggle(); fl.fl!.good(); ex.ex!.main();
    await tb.tb!.send();
    await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
});

describe('covers', () => {
  const cover = (id: string, rows: Rows = {}, detail: Record<string, LearningDetail> = {}) => on(id, rows, detail).vm().libItems.find((i) => i.id === id)!;
  it('draws each of the seven covers with its meta lines', () => {
    expect(cover('L60')).toMatchObject({ cvFlash: true, cvMeta: '3 cards', cvMeta2: '3 due today' });
    expect(cover('L61')).toMatchObject({ cvExam: true, cvMeta: '40 Q', cvMeta2: 'Not taken yet' });
    expect(cover('L64')).toMatchObject({ cvCase: true, cvMeta: '2 deliverables', cvMeta2: 'Reviewed by your counsellor' });
    expect(cover('L65')).toMatchObject({ cvTeach: true, cvMeta: 'Explain it back', cvMeta2: 'Feedback on your answer' });
    expect(cover('L66')).toMatchObject({ cvStretch: true, cvMeta: '0 of 3 checkpoints', cvMeta2: 'On the job' });
    expect(cover('L67')).toMatchObject({ cvWebinar: true, cvMeta: '4 Dec · 12:30–13:30', cvMeta2: 'Live, then recorded' });
    expect(cover('L68')).toMatchObject({ cvAid: true, cvMeta: '3-point checklist', cvMeta2: 'One page · PDF' });
  });
  it('reflects the learner\'s progress', () => {
    expect(cover('L61', {}, { L61: { best: 80 } })).toMatchObject({ cvMeta: '80%', cvMeta2: 'Best score' });
    expect(cover('L60', { L60: 'accepted' })).toMatchObject({ cvMeta2: 'All reviewed' });
    expect(cover('L65', { L65: 'accepted' }, { L65: { text: 'x', score: 3 } })).toMatchObject({ cvMeta2: 'Score 3 of 4' });
    expect(cover('L66', { L66: 'submitted' }, { L66: { checks: [0, 1] } })).toMatchObject({ cvMeta: '2 of 3 checkpoints', cvMeta2: 'Agreed with Sam' });
    expect(cover('L67', {}, { L67: { registered: true } })).toMatchObject({ cvMeta2: 'You plan to attend' });
    expect(cover('L64', { L64: 'submitted' })).toMatchObject({ cvMeta2: 'Handed in' });
  });
});
