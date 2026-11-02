// Classroom attendance against the in-memory Supabase fake (v0.7.2): the roster and register_attendance.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../test/fakeSupabase';
import { loadRoster, registerAttendance } from './attendanceStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));

beforeEach(() => db.reset());

describe('classroom attendance', () => {
  it('maps attendance_roster rows for one learning', async () => {
    db.answer(() => ({ data: [{ user_id: 'u2', name: 'Kim Learner', business_line: 'Audit', state: 'accepted' }, { user_id: 'u3', name: 'Ali Member', business_line: null, state: 'not-started' }] }));
    expect(await loadRoster('L10')).toEqual([
      { userId: 'u2', name: 'Kim Learner', line: 'Audit', state: 'accepted' }, { userId: 'u3', name: 'Ali Member', line: null, state: 'not-started' }]);
    expect(db.calls[0]).toEqual({ table: 'rpc:attendance_roster', steps: [['args', [{ p_learning_id: 'L10' }]]] });
  });
  it('registers through register_attendance and returns how many were new', async () => {
    db.answer(() => ({ data: 2 }));
    expect(await registerAttendance('L10', ['u2', 'u3'])).toBe(2);
    expect(db.calls[0]).toEqual({ table: 'rpc:register_attendance', steps: [['args', [{ p_learning_id: 'L10', p_user_ids: ['u2', 'u3'] }]]] });
  });
  it('passes the database refusal on', async () => {
    db.answer(() => ({ error: { message: 'Attendance is registered for a published classroom learning only' } }));
    await expect(registerAttendance('L1', ['u2'])).rejects.toThrow('Attendance is registered for a published classroom learning only');
    db.answer(() => ({ error: { message: 'permission denied' } }));
    await expect(loadRoster('L10')).rejects.toThrow('permission denied');
  });
});
