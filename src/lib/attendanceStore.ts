// Classroom attendance (v0.7.2), in Supabase. The faculty is a Domain Admin for people of their line, a General or a
// System Admin, never the person themselves (private.can_register_attendance). attendance_roster() returns exactly the
// people the signed-in admin may register, with where each one stands on the learning; register_attendance() marks the
// given people attended (accepted with the full hours, an 'attended' decision by the admin), all or nothing.
import { supabase } from './supabase';

export type RosterRow = { userId: string; name: string; line: string | null; state: string };

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

type Row = { user_id: string; name: string; business_line: string | null; state: string };

export async function loadRoster(learningId: string): Promise<RosterRow[]> {
  const { data, error } = await supabase.rpc('attendance_roster', { p_learning_id: learningId });
  fail(error);
  return ((data || []) as Row[]).map((r) => ({ userId: r.user_id, name: r.name, line: r.business_line, state: r.state }));
}

// Returns how many people were newly registered (someone already completed stays as they are).
export async function registerAttendance(learningId: string, userIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('register_attendance', { p_learning_id: learningId, p_user_ids: userIds });
  fail(error);
  return Number(data) || 0;
}
