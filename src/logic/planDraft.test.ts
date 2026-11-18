// Drafting a placeholder's material (Studios Phase 7, Task 7.5): which studio, the draft the module's brief gives it, the lines the AI is told, and
// the creation grant a placeholder gives its trajectory's editors (mirrors private.plan_draft_matches).
import { describe, expect, it } from 'vitest';
import type { Bundle } from '../types';
import { briefBundleIds, briefDraft, briefLines, placeholderRules, studioFor } from './planDraft';
import { mayCreate } from './contribution';
import { emptyPlan, refKey } from './trajectoryPlan';
import type { PlanModule, PlanSource, SourceRef } from './trajectoryPlan';
import type { Trajectory, TrjStep } from './trajectory';
import { blankTrajectory } from './trajectoryEdit';

const bundle = (over: Partial<Bundle> = {}): Bundle => ({
  id: 'b1', name: 'VAT basics', owner: 'x', topic: 't', topics2: [], desc: '', access: 'all', fresh: '12', status: 'live', updated: '', usedBy: 0, tags: [], sugg: [], models: [], concepts: [],
  sources: [['Guide', 'upload', '1 file', 2, '1 Jan', 'internal'], ['Client file', 'upload', '1 file', 1, '1 Jan', 'client']],
  chunks: [[0, 'VAT on exports is zero rated'], [1, 'VAT secret client matter']], ...over,
});
const source: PlanSource = { id: 's1', trajectoryId: 'T1', name: 'syllabus.pdf', path: null, pages: 1, chars: 10, flags: [], addedBy: 'u', addedAt: '', passages: [[1, 'x'.repeat(900)]] };
const kb = (chunk: number, bundleId = 'b1'): { ref: SourceRef; label: string; quote: string } => ({ ref: { kind: 'kb', bundleId, chunk }, label: 'Guide · VAT basics', quote: 'q' });
const mod = (over: Partial<PlanModule> = {}): PlanModule => ({ id: 'mx', title: 'VAT cards', depth: 'applied', goals: ['Apply the VAT rate rules', 'Spot the exemptions'], hours: 2,
  material: [{ kind: 'studio', format: 'Flash cards', reason: 'r' }], sources: [kb(0)], checks: [], accepted: true, ...over });
const step: TrjStep = { id: 'm1', k: 'make', title: 'VAT cards', fmt: 'Flash cards', hours: 2, win: 3, req: true, pre: null, from: 'p:mx' };
const T: Trajectory = { ...blankTrajectory('Tax & Legal'), id: 'T1', steps: [step] };
const args = (over = {}) => ({ t: T, step, module: mod(), plan: { ...emptyPlan(), modules: [mod()] }, line: 'Consulting', bundles: [bundle()], sources: [source], key: 'k1', ...over });

describe('studioFor', () => {
  it('names the studio that makes a format, and none for a manual format', () => {
    expect(studioFor('Flash cards')).toBe('flash');
    expect(studioFor('Practice exam')).toBe('flash');
    expect(studioFor('Animated flow')).toBe('motion');
    expect(studioFor('Book')).toBeNull();
  });
});

describe('briefDraft', () => {
  it('fills the draft from the module: title, first goal as the takeaway, goals as the outline, depth as the level, the trajectory\'s line', () => {
    const nw = briefDraft(args());
    expect([nw.type, nw.title, nw.take, nw.outline, nw.lvl, nw.line]).toEqual(['Flash cards', 'VAT cards', 'Apply the VAT rate rules', ['Apply the VAT rate rules', 'Spot the exemptions'], '3', 'Tax & Legal']);
    expect(nw.sources).toEqual(['Guide · VAT basics']);
    expect(nw.key).toBe('k1');
    expect(nw.brief).toMatchObject({ trajectoryId: 'T1', stepId: 'm1', depth: 'applied', goals: ['Apply the VAT rate rules', 'Spot the exemptions'] });
  });
  it('takes the stage of the plan\'s brief, else Consultant; the domain of the step, else prof; the admin\'s line for a firm-wide trajectory', () => {
    const brief = { ...emptyPlan(), brief: { goal: '', credential: '', issuer: '', audience: '', stage: 'Manager', line: null, level: '', hoursBudget: null, deadline: null, bodyRules: '', constraints: '', domain: 'reg' } };
    expect(briefDraft(args({ plan: brief })).stage).toBe('Manager');
    expect(briefDraft(args({ step: { ...step, dom: 'reg' } })).dom).toBe('reg');
    expect(briefDraft(args()).stage).toBe('Consultant');
    expect(briefDraft(args()).dom).toBe('prof');
    expect(briefDraft(args({ t: { ...T, business_line: null } })).line).toBe('Consulting');
  });
  it('keeps at most 8 passages of 700 characters from the cited sources, unmarked, and the labels', () => {
    const cited = [kb(0), { ref: { kind: 'file', sourceId: 's1', page: 1, passage: 0 } as SourceRef, label: 'syllabus.pdf · p. 1', quote: 'q' }, ...Array.from({ length: 9 }, () => kb(0))];
    const nw = briefDraft(args({ module: mod({ sources: cited }) }));
    expect(nw.brief!.passages.length).toBeLessThanOrEqual(8);
    expect(nw.brief!.passages.every((p) => p.length <= 700 && !p.includes('<<<'))).toBe(true);
    expect(nw.brief!.passages[0]).toBe('VAT on exports is zero rated');
    expect(nw.brief!.passages[1]).toHaveLength(700);
    expect(nw.brief!.sources).toContain('syllabus.pdf · p. 1');
  });
  it('drops a cited passage that is client or licensed, or whose file is gone', () => {
    const nw = briefDraft(args({ module: mod({ sources: [kb(1), { ...kb(0), ref: { kind: 'file', sourceId: 'gone', page: 1, passage: 0 } }] }), sources: [] }));
    expect(nw.brief!.passages).toEqual([]);
  });
  it('has the goals as the takeaway only when there is one', () => {
    expect(briefDraft(args({ module: mod({ goals: [] }) })).take).toBe('');
  });
});

describe('briefBundleIds', () => {
  it('picks the cited bundles a creator may use: never one that is for admins only, nor another line\'s Tax & Legal bundle', () => {
    const b1 = bundle(), b2 = bundle({ id: 'b2', access: 'admins' }), b3 = bundle({ id: 'b3', access: 'tl' });
    const m = mod({ sources: [kb(0, 'b1'), kb(0, 'b2'), kb(0, 'b3'), kb(0, 'b1')] });
    expect(briefBundleIds(m, [b1, b2, b3], 'Consulting')).toEqual(['b1']);
    expect(briefBundleIds(m, [b1, b2, b3], 'Tax & Legal')).toEqual(['b1', 'b3']);
  });
  it('is the bundle, not the sensitivity of a passage, that a cited client chunk belongs to (its text is not sent)', () => {
    expect(refKey(kb(1).ref)).toBe('kb:b1#1');
  });
});

describe('briefLines', () => {
  it('holds each goal between markers and the depth', () => {
    const text = briefLines(briefDraft(args()));
    expect(text).toBe('Learning goals:\n<<<Apply the VAT rate rules>>>\n<<<Spot the exemptions>>>\nDepth: applied');
  });
  it('is empty without a brief, or without goals', () => {
    expect(briefLines({ ...briefDraft(args()), brief: undefined })).toBe('');
    expect(briefLines(briefDraft(args({ module: mod({ goals: [] }) })))).toBe('');
  });
});

describe('placeholderRules', () => {
  const rules = (t = T, id = 'm1', format = 'Flash cards') => placeholderRules(t, id, format);
  it('is one rule: the trajectory\'s line, the placeholder\'s format and its domain', () => {
    expect(rules()).toEqual([{ lines: ['Tax & Legal'], formats: ['Flash cards'], domains: ['prof'], audiences: [] }]);
    expect(mayCreate(rules(), { line: 'Tax & Legal', format: 'Flash cards', domain: 'prof', audience: null })).toBe(true);
    expect(mayCreate(rules(), { line: 'Tax & Legal', format: 'Flash cards', domain: 'reg', audience: null })).toBe(false);
    expect(mayCreate(rules(), { line: 'Audit', format: 'Flash cards', domain: 'reg', audience: null })).toBe(false);
    expect(mayCreate(rules(), { line: 'Tax & Legal', format: 'Reel', domain: 'reg', audience: null })).toBe(false);
  });
  it('is none for a step that is not a placeholder, another step, or another format', () => {
    expect(rules({ ...T, steps: [{ ...step, k: 'learn' }] })).toEqual([]);
    expect(rules(T, 'zz')).toEqual([]);
    expect(rules(T, 'm1', 'Reel')).toEqual([]);
  });
  it('leaves the line open for a firm-wide trajectory', () => {
    expect(rules({ ...T, business_line: null })[0].lines).toEqual([]);
  });
});
