import { describe, expect, it } from 'vitest';
import { initState, Logic } from './model';
import type { Config } from './config';
import type { Subject } from './lib/useSubject';

const cfg: Config = { businessLine: 'Consulting', startScreen: 'map', homeView: 'constellation', showMarks: true, liveAssistant: false, motion: false };
const ref = <T,>(current: T) => ({ current });

export function newcomer(overrides: Partial<Subject> = {}): Subject {
  return {
    id: 'u1', name: 'New Person', email: 'new.person@example.com', businessLine: 'Consulting', stage: 'Consultant', counsellor: null, readOnly: false,
    data: { progress: {}, ambitions: [], interests: [], prefs: { initials: '', color: '' } }, photo: null, ...overrides,
  };
}

const viewModel = (subject: Subject) =>
  new Logic(initState(cfg), () => {}, cfg, { toastTimer: ref(undefined), drag: ref(null), file: ref(null), chat: ref(null) }, { isSystem: false, domains: [] }, subject, async () => {}).renderVals();

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
