// What the content and learner stores send to Supabase and how they report refusals (FT-STORE-*). The client is a fake.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUNDLES0 } from '../data';
import { db, has, op } from '../test/fakeSupabase';
import { loadContent, publishMappings, removeLearning, saveBundle, saveBundleNow, saveBundleSoon, saveLearning } from './contentStore';
import { addAmbition, addInterest, loadLearner, removeAmbition, removeInterest, savePrefs, saveProgress } from './learnerStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));

beforeEach(() => { db.reset(); vi.stubGlobal('window', { setTimeout: (f: () => void, ms?: number) => setTimeout(f, ms) }); });
afterEach(() => { vi.useRealTimers(); });

const fields = { title: 'T', domain: 'prof', level: 2, format: 'Book', source: 'S', hours: 1, cpd: 0, due: '', why: '', business_line: 'Audit', status: 'draft' as const };

describe('loading content', () => {
  it('sorts learnings by number and keeps only mappings to known learnings', async () => {
    db.answer((c) => ({
      learnings: { data: [{ id: 'L10', title: 'Ten', domain: 'prof', level: 1, format: 'Book', source: '', hours: '2.00', cpd: '0', due: '', why: '', business_line: null, status: 'published' }, { id: 'L2', title: 'Two', domain: 'tech', level: 1, format: 'Book', source: '', hours: 1, cpd: 0, due: '', why: '', business_line: 'Audit', status: 'draft' }] },
      curriculum_mappings: { data: [{ audience: 'Audit', learning_id: 'L2', stage: 'Analyst', obligation: 'mandatory' }, { audience: 'Audit', learning_id: 'L99', stage: 'Analyst', obligation: 'advised' }] },
      knowledge_bundles: { data: [{ id: 'B1', business_line: null, access: 'all', data: { name: 'K' } }] },
    } as Record<string, object>)[c.table]);
    const c = await loadContent();
    expect(c.learnings.map(([r, m]) => [r[0], r[6], m.status])).toEqual([['L2', 1, 'draft'], ['L10', 2, 'published']]);
    expect(c.maps.Audit).toEqual([['L2', 'Analyst', 'mandatory']]);
    expect(c.bundles).toEqual([{ name: 'K', id: 'B1', access: 'all', line: null }]);
  });
  it('fails with the database message', async () => {
    db.answer((c) => (c.table === 'curriculum_mappings' ? { error: { message: 'permission denied' } } : { data: [] }));
    await expect(loadContent()).rejects.toThrow('permission denied');
  });
});

describe('saving learnings', () => {
  it('inserts a new learning', async () => {
    db.answer(() => ({ data: [{ id: 'L42' }] }));
    await saveLearning(fields);
    const [c] = db.on('learnings');
    expect(op(c)).toBe('insert');
    expect(c.steps[0][1][0]).toEqual(fields);
  });
  it('updates an existing learning with a timestamp', async () => {
    db.answer(() => ({ data: [{ id: 'L7' }] }));
    await saveLearning(fields, 'L7');
    const [c] = db.on('learnings');
    expect(op(c)).toBe('update');
    expect(c.steps[0][1][0]).toMatchObject({ ...fields, updated_at: expect.any(String) });
    expect(has(c, 'eq', 'id', 'L7')).toBe(true);
  });
  it('reports a write row-level security filtered out', async () => {
    db.answer(() => ({ data: [] }));
    await expect(saveLearning(fields, 'L7')).rejects.toThrow('Not saved · you can only edit learnings of your own business line');
    db.answer(() => ({ error: { message: 'check constraint' } }));
    await expect(saveLearning(fields)).rejects.toThrow('check constraint');
  });
  it('removes a learning, or says it could not', async () => {
    db.answer(() => ({ data: [{ id: 'L7' }] }));
    await removeLearning('L7');
    expect(has(db.on('learnings')[0], 'eq', 'id', 'L7')).toBe(true);
    db.answer(() => ({ data: [] }));
    await expect(removeLearning('L7')).rejects.toThrow('Not removed · you can only remove learnings of your own business line');
  });
});

describe('publishing mappings', () => {
  it('upserts changes and deletes dropped mappings', async () => {
    db.answer((c) => (op(c) === 'delete' ? { data: [{ learning_id: 'L2' }] } : {}));
    await publishMappings({ upserts: [{ audience: 'Audit', learning_id: 'L1', stage: 'Analyst', obligation: 'advised' }], deletes: [{ audience: 'Audit', learning_id: 'L2' }] });
    const calls = db.on('curriculum_mappings');
    expect(calls.map(op)).toEqual(['upsert', 'delete']);
    expect(calls[0].steps[0][1][0]).toEqual([{ audience: 'Audit', learning_id: 'L1', stage: 'Analyst', obligation: 'advised', updated_at: expect.any(String) }]);
    expect(has(calls[1], 'eq', 'audience', 'Audit') && has(calls[1], 'eq', 'learning_id', 'L2')).toBe(true);
  });
  it('accepts a delete of a mapping that was never stored', async () => {
    db.answer(() => ({ data: [] }));
    await expect(publishMappings({ upserts: [], deletes: [{ audience: 'Audit', learning_id: 'L2' }] })).resolves.toBeUndefined();
    expect(db.on('curriculum_mappings').map(op)).toEqual(['delete', 'select']);
  });
  it('refuses a delete that row-level security blocked', async () => {
    db.answer((c) => (op(c) === 'select' ? { data: [{ learning_id: 'L2' }] } : { data: [] }));
    await expect(publishMappings({ upserts: [], deletes: [{ audience: 'Audit', learning_id: 'L2' }] })).rejects.toThrow('Not published · you can only change the curriculum of your own audiences');
  });
  it('turns a row-level security error on upsert into plain words', async () => {
    db.answer(() => ({ error: { message: 'new row violates row-level security policy' } }));
    await expect(publishMappings({ upserts: [{ audience: 'Audit', learning_id: 'L1', stage: 'Analyst', obligation: 'advised' }], deletes: [] })).rejects.toThrow('Not published · you can only change the curriculum of your own audiences');
    db.answer(() => ({ error: { message: 'timeout' } }));
    await expect(publishMappings({ upserts: [{ audience: 'Audit', learning_id: 'L1', stage: 'Analyst', obligation: 'advised' }], deletes: [] })).rejects.toThrow('timeout');
  });
});

describe('saving bundles', () => {
  const b = { ...BUNDLES0[0], line: 'Consulting' };
  it('upserts the bundle row with its line', async () => {
    await saveBundle(b);
    expect(db.on('knowledge_bundles')[0].steps[0][1][0]).toMatchObject({ id: 'B1', business_line: 'Consulting', access: 'all', updated_at: expect.any(String) });
  });
  it('waits for a burst of edits and saves the latest version once', async () => {
    vi.useFakeTimers();
    let latest = { ...b, name: 'one' };
    const onError = vi.fn();
    saveBundleSoon('B1', () => latest, onError);
    latest = { ...b, name: 'two' };
    saveBundleSoon('B1', () => latest, onError);
    await vi.advanceTimersByTimeAsync(600);
    const writes = db.on('knowledge_bundles');
    expect(writes).toHaveLength(1);
    expect((writes[0].steps[0][1][0] as { data: { name: string } }).data.name).toBe('two');
    expect(onError).not.toHaveBeenCalled();
  });
  it('skips a bundle that is gone when the timer fires', async () => {
    vi.useFakeTimers();
    saveBundleSoon('B9', () => undefined, vi.fn(), 10);
    await vi.advanceTimersByTimeAsync(10);
    expect(db.on('knowledge_bundles')).toEqual([]);
  });
  it('reports a failed save', async () => {
    db.answer(() => ({ error: { message: 'denied' } }));
    const onError = vi.fn();
    saveBundleNow(b, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('denied'));
  });
  it('saves one bundle in order, even after a failure', async () => {
    const order: string[] = [];
    db.answer((c) => { const name = (c.steps[0][1][0] as { data: { name: string } }).data.name; order.push(name); return name === 'a' ? { error: { message: 'x' } } : {}; });
    const onError = vi.fn();
    saveBundleNow({ ...b, name: 'a' }, onError);
    saveBundleNow({ ...b, name: 'b' }, onError);
    await vi.waitFor(() => expect(order).toEqual(['a', 'b']));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('learner data', () => {
  it('loads progress, ambitions, interests and avatar preferences', async () => {
    db.answer((c) => ({
      learner_learnings: { data: [{ learning_id: 'L1', state: 'accepted', pct: 100, chosen: false, submitted_at: '2026-10-30T09:00:00Z', updated_at: '2026-10-30T09:00:00Z', evidence_note: null, evidence_link: 'https://x.example/c.pdf', evidence_ref: null }] },
      learning_decisions: { data: [{ learning_id: 'L1', verdict: 'accepted', comment: null, decided_by: 'c1', decided_by_name: 'Sam Coach', decided_at: '2026-10-31T10:00:00Z', evidence: { link: 'https://x.example/c.pdf' } }] },
      ambitions: { data: [{ id: 5, text: 'Lead', horizon: null, domains: null, source: null }] },
      interests: { data: [{ label: 'Data', domain: 'tec' }] },
      learner_prefs: { data: null },
    } as Record<string, object>)[c.table]);
    expect(await loadLearner('u1')).toEqual({
      progress: { L1: { state: 'accepted', pct: 100, chosen: false, submittedAt: '2026-10-30T09:00:00Z', updatedAt: '2026-10-30T09:00:00Z', evidence: { note: '', link: 'https://x.example/c.pdf', ref: '' }, rating: null } },
      ambitions: [{ id: '5', text: 'Lead', horizon: '', doms: [], from: '' }],
      interests: [{ label: 'Data', dom: 'tec' }], prefs: { initials: '', color: '' },
      decisions: [{ learningId: 'L1', verdict: 'accepted', comment: '', by: 'c1', byName: 'Sam Coach', at: '2026-10-31T10:00:00Z', evidence: { note: '', link: 'https://x.example/c.pdf', ref: '' }, rating: null }],
    });
    expect(db.calls.every((c) => has(c, 'eq', 'user_id', 'u1'))).toBe(true);
  });
  it('fails when any part does not load', async () => {
    db.answer((c) => (c.table === 'interests' ? { error: { message: 'nope' } } : { data: [] }));
    await expect(loadLearner('u1')).rejects.toThrow('nope');
  });
  it('saves progress through save_learning, passing only the given fields', async () => {
    await saveProgress('u1', 'L3', { chosen: true });
    expect(db.calls[0]).toEqual({ table: 'rpc:save_learning', steps: [['args', [{ p_learning_id: 'L3', p_state: null, p_pct: null, p_chosen: true }]]] });
  });
  it('sends evidence with save_learning only when given', async () => {
    await saveProgress('u1', 'L18', { state: 'submitted', pct: 100, link: 'https://x.example/c.pdf', note: '' });
    expect(db.calls[0].steps[0][1][0]).toEqual({ p_learning_id: 'L18', p_state: 'submitted', p_pct: 100, p_chosen: null, p_note: '', p_link: 'https://x.example/c.pdf' });
  });
  it('sends the classroom feedback rating with save_learning only when given', async () => {
    await saveProgress('u1', 'L10', { state: 'accepted', pct: 100, note: 'I will open every workshop with the issue tree.', rating: 4 });
    expect(db.calls[0].steps[0][1][0]).toEqual({ p_learning_id: 'L10', p_state: 'accepted', p_pct: 100, p_chosen: null, p_note: 'I will open every workshop with the issue tree.', p_rating: 4 });
  });
  it('adds and removes ambitions and interests', async () => {
    db.answer(() => ({ data: { id: 12 } }));
    expect(await addAmbition('u1', { text: 'Lead', horizon: '3 years', doms: ['lead'], from: 'chat' })).toEqual({ id: '12', text: 'Lead', horizon: '3 years', doms: ['lead'], from: 'chat' });
    expect(db.on('ambitions')[0].steps[0][1][0]).toEqual({ user_id: 'u1', text: 'Lead', horizon: '3 years', domains: ['lead'], source: 'chat' });
    db.answer(() => ({}));
    await removeAmbition('12');
    expect(has(db.on('ambitions')[1], 'eq', 'id', 12)).toBe(true);
    await addInterest('u1', { label: 'Data', dom: 'tec' });
    await removeInterest('u1', 'Data');
    expect(db.on('interests').map(op)).toEqual(['insert', 'delete']);
  });
  it('updates only the avatar fields given', async () => {
    await savePrefs('u1', { color: '#fff' });
    expect(db.on('learner_prefs')[0].steps[0]).toEqual(['update', [{ avatar_color: '#fff' }]]);
    await savePrefs('u1', { initials: 'AB', color: undefined });
    expect(db.on('learner_prefs')[1].steps[0]).toEqual(['update', [{ avatar_initials: 'AB' }]]);
    db.answer(() => ({ error: { message: 'denied' } }));
    await expect(savePrefs('u1', { initials: 'X' })).rejects.toThrow('denied');
  });
});
