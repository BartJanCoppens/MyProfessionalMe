// Industry and technology membership (audience_members) in Supabase. Who may read or write it is decided by row-level
// security: the person reads their own; their counsellor, their Domain Admins, General and System Admins set it.
import { MEMBERSHIP_AUDIENCES, MEMBERSHIP_PATTERN } from '../logic/membership';
import { supabase } from './supabase';

type Failure = { message: string; code?: string };
const ORDER = MEMBERSHIP_AUDIENCES.map((a) => a.key);
// Known ind:/tec: keys only, in catalogue order (unknown ones last).
const tidy = (keys: unknown[]): string[] => keys.filter((k): k is string => typeof k === 'string' && MEMBERSHIP_PATTERN.test(k))
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 999) - (ORDER.indexOf(b) + 1 || 999));
const message = (error: Failure) => (error.code === '42501' ? 'Not allowed · ask an admin' : error.message);

export async function loadAudiences(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('audience_members').select('audience').eq('user_id', userId);
  if (error) throw new Error(message(error));
  return tidy(((data || []) as { audience: unknown }[]).map((r) => r.audience));
}

// Several people at once (User management): every id gets a list, empty when they have none.
export async function loadAudiencesOf(userIds: string[]): Promise<Record<string, string[]>> {
  if (!userIds.length) return {};
  const { data, error } = await supabase.from('audience_members').select('user_id, audience').in('user_id', userIds);
  if (error) throw new Error(message(error));
  const rows = (data || []) as { user_id: string; audience: unknown }[];
  return Object.fromEntries(userIds.map((id) => [id, tidy(rows.filter((r) => r.user_id === id).map((r) => r.audience))]));
}

// Sets (on) or removes one membership. Already set counts as set; a removal that matched no row says so.
export async function setAudience(userId: string, audience: string, on: boolean): Promise<{ error: string | null }> {
  if (!MEMBERSHIP_PATTERN.test(audience)) return { error: audience + ' is not an industry or technology audience' };
  if (on) {
    const { error } = await supabase.from('audience_members').insert({ user_id: userId, audience });
    return { error: error && error.code !== '23505' ? message(error) : null };
  }
  const { data, error } = await supabase.from('audience_members').delete().eq('user_id', userId).eq('audience', audience).select('user_id');
  if (error) return { error: message(error) };
  return { error: data?.length ? null : 'Not removed · it was already gone, or you may not change this person' };
}
