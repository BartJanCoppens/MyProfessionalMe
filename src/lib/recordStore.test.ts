// Decisions and the approvals queue against the in-memory Supabase fake (F2, F3).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../test/fakeSupabase';
import { decideLearning, loadQueue } from './recordStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));

beforeEach(() => db.reset());

describe('deciding on a submitted learning', () => {
  it('accepts through decide_learning, without an empty comment', async () => {
    db.answer(() => ({ data: 'accepted' }));
    expect(await decideLearning('u2', 'L18', 'accepted', '  ')).toBe('accepted');
    expect(db.calls[0]).toEqual({ table: 'rpc:decide_learning', steps: [['args', [{ p_user_id: 'u2', p_learning_id: 'L18', p_verdict: 'accepted', p_comment: null }]]] });
  });
  it('requests changes with the trimmed comment', async () => {
    db.answer(() => ({ data: 'in-progress' }));
    expect(await decideLearning('u2', 'L3', 'changes', ' Name one idea you will use. ')).toBe('in-progress');
    expect(db.calls[0].steps[0][1][0]).toMatchObject({ p_verdict: 'changes', p_comment: 'Name one idea you will use.' });
  });
  it('passes the database refusal on', async () => {
    db.answer(() => ({ error: { message: 'This learning is no longer waiting for acceptance' } }));
    await expect(decideLearning('u2', 'L3', 'accepted')).rejects.toThrow('This learning is no longer waiting for acceptance');
  });
});

describe('the approvals queue', () => {
  it('maps waiting_submissions rows', async () => {
    db.answer(() => ({ data: [{ user_id: 'u2', name: 'Kim Learner', business_line: 'Audit', learning_id: 'L18', submitted_at: '2026-10-28T09:00:00Z',
      evidence_note: null, evidence_link: 'https://x.example/c.pdf', evidence_ref: 'AZ-1', last_activity: '2026-10-28T09:00:00Z' }] }));
    expect(await loadQueue()).toEqual([{ userId: 'u2', name: 'Kim Learner', line: 'Audit', learningId: 'L18', submittedAt: '2026-10-28T09:00:00Z',
      evidence: { note: '', link: 'https://x.example/c.pdf', ref: 'AZ-1' }, lastActivity: '2026-10-28T09:00:00Z' }]);
    expect(db.calls[0].table).toBe('rpc:waiting_submissions');
  });
  it('fails with the database message', async () => {
    db.answer(() => ({ error: { message: 'permission denied' } }));
    await expect(loadQueue()).rejects.toThrow('permission denied');
  });
});
