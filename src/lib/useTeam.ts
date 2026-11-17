// Counsellees of a person: the profiles whose counsellor they are, with their learner data, trajectory data and industry
// and technology memberships (RLS: counsellors may read all of them).
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { loadLearner } from './learnerStore';
import { latestOnly } from './latestOnly';
import { loadAudiences } from './membershipStore';
import { loadCredentials, loadEnrolments } from './trajectoryStore';
import type { Member } from '../logic/team';

// One person's certification enrolments and credentials.
const loadTrj = async (id: string) => { const [enrols, creds] = await Promise.all([loadEnrolments(id), loadCredentials(id)]); return { enrols, creds }; };

async function fetchTeam(counsellorId: string): Promise<{ id: string; members: Member[] }> {
  const { data, error } = await supabase.from('profiles').select('id, email, full_name, business_line, career_stage').eq('counsellor_id', counsellorId).order('full_name');
  if (error) throw new Error(error.message);
  // A failed trajectory or membership load leaves trj or audiences unset for that person; the roster and levels still work.
  const members = await Promise.all((data || []).map(async (p) => ({
    id: p.id, name: p.full_name || p.email, stage: p.career_stage, businessLine: p.business_line, data: await loadLearner(p.id),
    trj: await loadTrj(p.id).catch(() => undefined), audiences: await loadAudiences(p.id).catch(() => undefined),
  })));
  return { id: counsellorId, members };
}

// members is null while loading or after a failed load; error says why, and retry loads again.
export function useTeam(counsellorId: string): { members: Member[] | null; error: string | null; retry: () => void; refresh: (personId: string) => Promise<void> } {
  const [team, setTeam] = useState<{ id: string; members: Member[] | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [apply] = useState(() => latestOnly<{ id: string; members: Member[] }>((v) => setTeam({ ...v, error: null })));
  useEffect(() => {
    apply(fetchTeam(counsellorId)).catch((err) => setTeam({ id: counsellorId, members: null, error: (err as Error).message }));
  }, [apply, counsellorId, attempt]);
  const mine = team && team.id === counsellorId ? team : null;
  // Reloads one person's trajectory data and memberships after a decision or a membership change (functional update:
  // the team may have changed meanwhile).
  const refresh = async (personId: string) => {
    const [trj, audiences] = await Promise.all([loadTrj(personId), loadAudiences(personId)]);
    setTeam((t) => (t && t.id === counsellorId && t.members ? { ...t, members: t.members.map((m) => (m.id === personId ? { ...m, trj, audiences } : m)) } : t));
  };
  return { members: mine?.members ?? null, error: mine?.error ?? null, retry: () => { setTeam(null); setAttempt((n) => n + 1); }, refresh };
}
