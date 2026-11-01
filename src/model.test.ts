import { describe, expect, it } from 'vitest';
import { initState, Logic } from './model';
import type { Config } from './config';
import type { Subject } from './lib/useSubject';
import type { Access, AppState } from './types';

const cfg: Config = { businessLine: 'Consulting', startScreen: 'map', homeView: 'constellation', showMarks: true, liveAssistant: false, motion: false };
const ref = <T,>(current: T) => ({ current });

export function newcomer(overrides: Partial<Subject> = {}): Subject {
  return {
    id: 'u1', name: 'New Person', email: 'new.person@example.com', businessLine: 'Consulting', stage: 'Consultant', counsellor: null, readOnly: false,
    data: { progress: {}, ambitions: [], interests: [], prefs: { initials: '', color: '' } }, photo: null, ...overrides,
  };
}

const viewModel = (subject: Subject, access: Access = { isSystem: false, domains: [], userId: subject.id }, state: Partial<AppState> = {}) =>
  new Logic({ ...initState(cfg), ...state }, () => {}, cfg, { toastTimer: ref(undefined), drag: ref(null), file: ref(null), chat: ref(null) }, access, subject, async () => {}).renderVals();

describe('a person with no learning data yet', () => {
  it('renders the view model with zero readiness and hours', () => {
    const vm = viewModel(newcomer());
    expect(vm.readiness).toBe(0);
    expect(vm.hoursYear).toBe(0);
  });
  it('renders without a business line or stage', () => {
    expect(() => viewModel(newcomer({ businessLine: null, stage: null }))).not.toThrow();
  });
});

describe('the person card in the sidebar', () => {
  it('describes stage, line, next stage and counsellor', () => {
    const vm = viewModel(newcomer({ counsellor: { id: 'c1', name: 'Ann Peeters' } }));
    expect(vm.who).toMatchObject({ name: 'New Person', roleLine: 'Consultant · Consulting', nextStage: 'Senior consultant', counsellorLine: 'Counsellor: Ann Peeters', readOnly: false });
  });
  it('says what is missing for a person without line, stage or counsellor', () => {
    const vm = viewModel(newcomer({ businessLine: null, stage: null }));
    expect(vm.who).toMatchObject({ roleLine: 'No business line yet', nextStage: 'Consultant', counsellorLine: 'No counsellor' });
  });
});

describe('marks', () => {
  it('are none for a newcomer', () => { expect(viewModel(newcomer()).marks).toEqual([]); });
  it('include a first certification once one is accepted', () => {
    const vm = viewModel(newcomer({ data: { progress: { L23: { state: 'accepted', pct: 100, chosen: false } }, ambitions: [], interests: [], prefs: { initials: '', color: '' } } }));
    expect(vm.marks).toEqual(['First certification']);
  });
});

const submitted = { progress: { L10: { state: 'submitted' as const, pct: 100, chosen: false } }, ambitions: [], interests: [], prefs: { initials: '', color: '' } };

describe('accepting a submitted learning', () => {
  it('is offered to the counsellor viewing the counsellee', () => {
    const vm = viewModel(newcomer({ readOnly: true, counsellor: { id: 'c1', name: 'Ann Peeters' }, data: submitted }), { isSystem: false, domains: [], userId: 'c1' }, { detailId: 'L10' });
    expect(vm.det.canAcceptIt).toBe(true);
  });
  it('is not offered to an unrelated viewer or to the learner', () => {
    expect(viewModel(newcomer({ readOnly: true, data: submitted }), { isSystem: false, domains: [], userId: 'x9' }, { detailId: 'L10' }).det.canAcceptIt).toBe(false);
    expect(viewModel(newcomer({ data: submitted }), undefined, { detailId: 'L10' }).det.canAcceptIt).toBe(false);
  });
});

describe('the assistant chat', () => {
  it('belongs to the person it was started for', () => {
    const vm = viewModel(newcomer(), undefined, { chat: [{ role: 'user', text: 'about someone else' }], chatFor: 'other', proposal: { interests: [{ label: 'Tax', domain: 'reg' }], ambition: null } });
    expect(vm.chat).toHaveLength(1);
    expect(vm.hasProposal).toBe(false);
  });
});

describe('a person without a business line', () => {
  it('gets a notice on the map', () => {
    expect(viewModel(newcomer({ businessLine: null })).noLineNote).toMatch(/business line/);
    expect(viewModel(newcomer()).noLineNote).toBe('');
  });
});
