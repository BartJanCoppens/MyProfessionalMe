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

export function useTeam(counsellorId: string): Member[] | null {
  const [team, setTeam] = useState<{ id: string; members: Member[] } | null>(null);
  const [apply] = useState(() => latestOnly<{ id: string; members: Member[] }>((v) => setTeam(v)));
  useEffect(() => { apply(fetchTeam(counsellorId)).catch(() => setTeam({ id: counsellorId, members: [] })); }, [apply, counsellorId]);
  return team && team.id === counsellorId ? team.members : null;
}
