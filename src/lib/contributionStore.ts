// Create & share in Supabase: contributions, their reviews, creation rules, review requirements and domain experts.
// Status, steps and verdicts only change through the submit_contribution and review_contribution functions;
// row-level security decides what each person reads and writes.
import { supabase } from './supabase';
import type { Contribution, CreateData, Policy, PolicyRow, Review, Rule, RuleParts } from '../logic/contribution';

const fail = (error: { message: string } | null) => { if (error) throw new Error(/row-level security/.test(error.message) ? 'Not allowed · ask an admin' : error.message); };

// Everything Create & share shows the signed-in person. RLS returns more to a System Admin; keep what is theirs.
export async function loadCreate(userId: string): Promise<CreateData> {
  const [c, r, g, p, n] = await Promise.all([
    supabase.from('contributions').select('*').order('updated_at', { ascending: false }),
    supabase.from('contribution_reviews').select('*').order('step').order('slot'),
    supabase.from('creator_rules').select('id, user_id, lines, formats, domains, audiences').eq('user_id', userId).order('id'),
    supabase.from('review_policies').select('id, lines, formats, domains, audiences, peers, expert, quality').order('id'),
    supabase.rpc('peer_count'),
  ]);
  [c.error, r.error, g.error, p.error, n.error].forEach(fail);
  const reviews = (r.data || []) as Review[];
  const reviewing = new Set(reviews.filter((x) => x.reviewer_id === userId).map((x) => x.contribution_id));
  const contributions = ((c.data || []) as Contribution[]).filter((x) => x.author_id === userId || reviewing.has(x.id));
  const kept = new Set(contributions.map((x) => x.id));
  return {
    contributions, reviews: reviews.filter((x) => kept.has(x.contribution_id)),
    rules: (g.data || []) as Rule[], policies: (p.data || []) as PolicyRow[], peers: Number(n.data) || 0,
  };
}

export type DraftFields = Pick<Contribution, 'business_line' | 'audience' | 'type' | 'title' | 'domain' | 'level' | 'audience_stage' | 'takeaway' | 'outline' | 'sources' | 'ai_assisted' | 'bundle_ids'>;

// Creates a draft, or edits one (or one with changes requested). Returns its id.
export async function saveDraft(fields: DraftFields, id?: string | null): Promise<string> {
  if (id) {
    const { data, error } = await supabase.from('contributions').update(fields).eq('id', id).select('id');
    fail(error);
    if (!data?.length) throw new Error('Not saved · only a draft or a contribution with changes requested can be edited');
    return id;
  }
  const { data, error } = await supabase.from('contributions').insert(fields).select('id').single();
  fail(error);
  return (data as { id: string }).id;
}

export async function removeDraft(id: string) {
  const { data, error } = await supabase.from('contributions').delete().eq('id', id).select('id');
  fail(error);
  if (!data?.length) throw new Error('Only a draft can be deleted');
}

// Routing happens in the database. Returns the new status: 'review' or 'published'.
export async function submitContribution(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('submit_contribution', { p_id: id });
  fail(error);
  return String(data);
}

// Returns the contribution's status after the decision: 'review', 'changes' or 'published'.
export async function decideReview(id: string, verdict: 'approved' | 'changes', rubric: boolean[], comment: string): Promise<string> {
  const { data, error } = await supabase.rpc('review_contribution', { p_id: id, p_verdict: verdict, p_rubric: rubric, p_comment: comment });
  fail(error);
  return String(data);
}

// ---------- administration ----------

export async function loadRules(userIds: string[]): Promise<Rule[]> {
  if (!userIds.length) return [];
  const { data, error } = await supabase.from('creator_rules').select('id, user_id, lines, formats, domains, audiences').in('user_id', userIds).order('id');
  fail(error);
  return (data || []) as Rule[];
}

export async function addRule(userId: string, r: RuleParts) {
  fail((await supabase.from('creator_rules').insert({ user_id: userId, lines: r.lines, formats: r.formats, domains: r.domains, audiences: r.audiences })).error);
}

export async function removeRule(id: number) {
  const { data, error } = await supabase.from('creator_rules').delete().eq('id', id).select('id');
  fail(error);
  if (!data?.length) throw new Error('Not removed · you cannot change this rule');
}

// A new review requirement, or a change to one (with its id).
export async function savePolicy(row: RuleParts & Policy & { id?: number }) {
  const { id, ...fields } = row;
  const v = { lines: fields.lines, formats: fields.formats, domains: fields.domains, audiences: fields.audiences, peers: fields.peers, expert: fields.expert, quality: fields.quality };
  if (id == null) { fail((await supabase.from('review_policies').insert(v)).error); return; }
  const { data, error } = await supabase.from('review_policies').update(v).eq('id', id).select('id');
  fail(error);
  if (!data?.length) throw new Error('Not saved · you cannot change this review requirement');
}

export async function removePolicy(id: number) {
  const { data, error } = await supabase.from('review_policies').delete().eq('id', id).select('id');
  fail(error);
  if (!data?.length) throw new Error('Not removed · you cannot change this review requirement');
}

export async function loadExperts(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('domain_experts').select('domain, user_id');
  fail(error);
  return Object.fromEntries(((data || []) as { domain: string; user_id: string }[]).map((r) => [r.domain, r.user_id]));
}

// null clears the expert: a System Admin then reviews that domain.
export async function setExpert(domain: string, userId: string | null) {
  if (!userId) { fail((await supabase.from('domain_experts').delete().eq('domain', domain)).error); return; }
  fail((await supabase.from('domain_experts').upsert({ domain, user_id: userId, updated_at: new Date().toISOString() })).error);
}
