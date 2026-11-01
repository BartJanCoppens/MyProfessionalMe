// Counsellees of a person: the profiles whose counsellor they are, with their learner data (RLS: counsellors may read both).
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { loadLearner } from './learnerStore';
import { latestOnly } from './latestOnly';
import type { Member } from '../logic/team';

async function fetchTeam(counsellorId: string): Promise<{ id: string; members: Member[] }> {
  const { data, error } = await supabase.from('profiles').select('id, email, full_name, business_line, career_stage').eq('counsellor_id', counsellorId).order('full_name');
  if (error) throw new Error(error.message);
  const members = await Promise.all((data || []).map(async (p) => ({
    id: p.id, name: p.full_name || p.email, stage: p.career_stage, businessLine: p.business_line, data: await loadLearner(p.id),
  })));
  return { id: counsellorId, members };
}

// members is null while loading or after a failed load; error says why, and retry loads again.
export function useTeam(counsellorId: string): { members: Member[] | null; error: string | null; retry: () => void } {
  const [team, setTeam] = useState<{ id: string; members: Member[] | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [apply] = useState(() => latestOnly<{ id: string; members: Member[] }>((v) => setTeam({ ...v, error: null })));
  useEffect(() => {
    apply(fetchTeam(counsellorId)).catch((err) => setTeam({ id: counsellorId, members: null, error: (err as Error).message }));
  }, [apply, counsellorId, attempt]);
  const mine = team && team.id === counsellorId ? team : null;
  return { members: mine?.members ?? null, error: mine?.error ?? null, retry: () => { setTeam(null); setAttempt((n) => n + 1); } };
}
