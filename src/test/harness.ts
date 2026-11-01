// Test harness for the view-model: builds a Logic over a state, applies its setState patches in place
// (like the class component's merged setState), and records every patch and toast.
// Names here stay neutral: noPersona.test.ts scans every non-test source file for seeded people.
import { vi } from 'vitest';
import { initState, Logic } from '../model';
import type { Config } from '../config';
import type { Subject } from '../lib/useSubject';
import type { LearnerData } from '../lib/learnerStore';
import type { LearnState } from '../logic/learner';
import type { Access, AppState } from '../types';

export const cfg: Config = { businessLine: 'Consulting', startScreen: 'map', homeView: 'constellation', showMarks: true, liveAssistant: false, motion: false };

export const emptyData = (): LearnerData => ({ progress: {}, ambitions: [], interests: [], prefs: { initials: '', color: '' } });

export function person(overrides: Partial<Subject> = {}): Subject {
  return {
    id: 'u1', name: 'Robin Test', email: 'robin.test@example.com', businessLine: 'Consulting', stage: 'Consultant', counsellor: null, readOnly: false,
    data: emptyData(), photo: null, ...overrides,
  };
}

// Progress rows: { L1: 'accepted', L2: ['in-progress', 50, true] }
export function withProgress(rows: Record<string, LearnState | [LearnState, number, boolean?]>, rest: Partial<LearnerData> = {}): LearnerData {
  const progress: LearnerData['progress'] = {};
  Object.entries(rows).forEach(([id, v]) => {
    const [state, pct, chosen] = Array.isArray(v) ? v : [v, v === 'accepted' || v === 'submitted' ? 100 : 0, false];
    progress[id] = { state, pct, chosen: !!chosen };
  });
  return { ...emptyData(), progress, ...rest };
}

export const member = (userId = 'u1'): Access => ({ isSystem: false, domains: [], userId });
export const systemAdmin = (userId = 'u1'): Access => ({ isSystem: true, domains: [], userId });
export const generalAdmin = (userId = 'u1'): Access => ({ isSystem: false, isGeneral: true, domains: [], userId });
export const domainAdmin = (lines: string[], userId = 'u1'): Access => ({ isSystem: false, domains: lines, userId });

type Opts = {
  subject?: Subject; access?: Access; state?: Partial<AppState>; config?: Partial<Config>;
  reloadSubject?: () => Promise<void>; reloadContent?: (sent?: string[]) => Promise<void>;
};

export function harness(opts: Opts = {}) {
  const subject = opts.subject || person();
  const access = opts.access || member(subject.id);
  const config = { ...cfg, ...opts.config };
  let st: AppState = { ...initState(config), ...opts.state };
  const patches: Partial<AppState>[] = [];
  const set = (p: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
    const patch = typeof p === 'function' ? p(st) : p;
    patches.push(patch); st = { ...st, ...patch };
  };
  const refs = { toastTimer: { current: undefined as number | undefined }, drag: { current: null as string | null }, file: { current: null as HTMLInputElement | null }, chat: { current: null as HTMLDivElement | null } };
  const reloadSubject = opts.reloadSubject || vi.fn(async () => {});
  const reloadContent = opts.reloadContent || vi.fn(async () => {});
  const L = () => new Logic(st, set, config, refs, access, subject, reloadSubject, reloadContent);
  return {
    L, vm: () => L().renderVals(), patches, refs, subject, access, reloadSubject, reloadContent,
    get state() { return st; },
    toasts: () => patches.filter((p) => 'toast' in p && p.toast).map((p) => p.toast as string),
    lastToast: () => patches.filter((p) => 'toast' in p && p.toast).map((p) => p.toast as string).pop(),
    wrote: (key: keyof AppState) => patches.some((p) => key in p),
  };
}

// The browser globals Logic touches, forwarding timers so vi.useFakeTimers() applies to them.
export function stubWindow(extra: Record<string, unknown> = {}) {
  vi.stubGlobal('window', {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id?: number) => clearTimeout(id),
    scrollTo: () => {},
    ...extra,
  });
}

// Flushes pending promise callbacks (several hops, for chained awaits).
export const flush = async (n = 5) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

export const deferred = <T = void>() => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
