// The subject: the person whose growth map, library and profile the app shows.
// Everyone sees themselves; System and Domain Admins can choose someone they manage (read-only).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { loadLearner } from './learnerStore';
import type { LearnerData } from './learnerStore';
import { latestOnly } from './latestOnly';
import type { Auth } from './useAuth';

export type Subject = {
  id: string; name: string; email: string; businessLine: string | null; stage: string | null;
  counsellor: { id: string; name: string } | null; readOnly: boolean; data: LearnerData;
  // Uploaded avatar photo; kept in this browser only.
  photo: string | null;
};
type Person = { id: string; email: string; full_name: string | null; business_line: string | null; career_stage: string | null; counsellor_id: string | null };

const PICK_KEY = 'mpm-subject';
export const photoKey = (userId: string) => 'mpm-avatar:' + userId;
const nameOf = (p: Person) => p.full_name || p.email;
const readPick = () => { try { return sessionStorage.getItem(PICK_KEY); } catch { return null; } };
const readPhoto = (userId: string) => { try { return localStorage.getItem(photoKey(userId)); } catch { return null; } };

export function useSubject(auth: Auth) {
  const me = auth.profile!;
  const isAdmin = auth.access.isSystem || auth.access.domains.length > 0;
  const [people, setPeople] = useState<Person[] | null>(null);
  const [picked, setPicked] = useState<string>(() => readPick() || me.id);
  const [loaded, setLoaded] = useState<{ id: string; data: LearnerData } | null>(null);

  useEffect(() => {
    let live = true;
    // RLS returns yourself, people you manage, your counsellees and your counsellor.
    supabase.from('profiles').select('id, email, full_name, business_line, career_stage, counsellor_id').order('full_name', { nullsFirst: false })
      .then(({ data }) => { if (live) setPeople((data as Person[]) || []); });
    return () => { live = false; };
  }, [me.id]);

  // Choosable people: yourself, plus (for admins) the accounts they manage. Your own counsellor is visible
  // to you but their learner data is not, so they are only choosable when you administer their line.
  const options = useMemo(() => {
    const list = people || [];
    const self = list.find((p) => p.id === me.id);
    const others = !isAdmin ? [] : list.filter((p) => p.id !== me.id
      && (auth.access.isSystem || p.id !== me.counsellor_id || auth.access.domains.includes(p.business_line || '')));
    return (self ? [self] : []).concat(others).map((p) => ({ id: p.id, label: nameOf(p) + (p.id === me.id ? ' (you)' : '') }));
  }, [people, me.id, me.counsellor_id, isAdmin, auth.access]);

  const subjectId = options.some((o) => o.id === picked) ? picked : me.id;
  const apply = useRef(latestOnly<{ id: string; data: LearnerData }>((v) => setLoaded(v))).current;
  const reload = useCallback(() => apply(loadLearner(subjectId).then((data) => ({ id: subjectId, data }))), [apply, subjectId]);
  useEffect(() => { if (people) reload(); }, [people, reload]);

  const select = (id: string) => {
    try { sessionStorage.setItem(PICK_KEY, id); } catch { /* per-tab convenience only */ }
    setPicked(id);
  };

  // The last fully loaded person stays on screen while a newly chosen one loads.
  const person = loaded ? (people || []).find((p) => p.id === loaded.id) : undefined;
  const counsellor = person?.counsellor_id ? (people || []).find((p) => p.id === person.counsellor_id) : null;
  const subject: Subject | null = person && loaded ? {
    id: person.id, name: nameOf(person), email: person.email, businessLine: person.business_line, stage: person.career_stage,
    counsellor: person.counsellor_id ? { id: person.counsellor_id, name: counsellor ? nameOf(counsellor) : 'your counsellor' } : null,
    readOnly: person.id !== me.id, data: loaded.data, photo: readPhoto(person.id),
  } : null;

  return { subject, options, select, reload, loading: !loaded || loaded.id !== subjectId };
}
