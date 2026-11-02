// Create & share: topics, content checks, the rubric, review policies and the stages a contribution goes through.
// Pure functions over the rows of supabase/migrations/*_create_and_share.sql; the database repeats every rule that protects data.
import { AUD_INFO, AUDS, BLS, CLIENT_WORDS, DOMAINS, NEW_TYPES, REVIEW_STAGES, RUBRIC } from '../data';

export type TopicKind = 'line' | 'audience' | 'format' | 'domain';
export type Topic = { kind: TopicKind; value: string };
export type Policy = { peers: number; expert: boolean; quality: boolean };
export type ContributionStatus = 'draft' | 'review' | 'changes' | 'published';
export type Verdict = 'waiting' | 'pending' | 'approved' | 'changes';

export type Contribution = {
  id: string; author_id: string; author_name: string; topic_kind: TopicKind; topic_value: string;
  type: string; title: string; domain: string; level: number; audience_stage: string; takeaway: string; outline: string; sources: string[];
  ai_assisted: boolean; bundle_ids: string[]; status: ContributionStatus; step: number; learning_id: string | null;
  created_at: string; updated_at: string; submitted_at: string | null; published_at: string | null;
};
export type Review = {
  contribution_id: string; step: number; slot: number; reviewer_id: string; reviewer_name: string; verdict: Verdict;
  rubric: boolean[]; comment: string; decided_at: string | null; created_at: string;
};
export type Grant = { user_id: string; topic_kind: TopicKind; topic_value: string };
export type PolicyRow = { topic_kind: TopicKind; topic_value: string } & Policy;
// What Create & share shows the signed-in person: their contributions, what they review, their grants, every policy,
// and how many colleagues could peer-review them.
export type CreateData = { contributions: Contribution[]; reviews: Review[]; grants: Grant[]; policies: PolicyRow[]; peers: number };

// The design's fifth type, "Avatar scenario", waits for the avatar studio (Q16). A contribution's type is its learning format.
export const CREATE_TYPES = NEW_TYPES.filter((t) => t[0] !== 'Avatar scenario');
export const TYPE_NAMES = CREATE_TYPES.map((t) => t[0]);
export const DEFAULT_POLICY: Policy = { peers: 2, expert: true, quality: true };
export const TITLE_MAX = 60;
export const TAKE_MAX = 200;
export const KIND_LABEL: Record<TopicKind, string> = { line: 'Business line', audience: 'Industry or technology', format: 'Format', domain: 'Domain' };

export const topicKey = (t: Topic) => t.kind + '|' + t.value;
export function parseTopic(key: string): Topic | null {
  const i = key.indexOf('|');
  return i > 0 ? { kind: key.slice(0, i) as TopicKind, value: key.slice(i + 1) } : null;
}
export const topicOf = (r: { topic_kind: TopicKind; topic_value: string }): Topic => ({ kind: r.topic_kind, value: r.topic_value });
export const domainName = (k: string) => (DOMAINS.find((d) => d[0] === k) || [k, k])[1];

export function topicLabel(t: Topic) {
  if (t.kind === 'audience') return AUD_INFO[t.value]?.name || t.value;
  if (t.kind === 'domain') return domainName(t.value);
  return t.value;
}
export const topicLong = (t: Topic) => KIND_LABEL[t.kind] + ' · ' + topicLabel(t);

// Every topic a grant or a policy can name.
export function allTopics(): Topic[] {
  return ([] as Topic[]).concat(
    BLS.map((v) => ({ kind: 'line' as const, value: v })),
    AUDS.ind.concat(AUDS.tec).map((a) => ({ kind: 'audience' as const, value: a[0] })),
    TYPE_NAMES.map((v) => ({ kind: 'format' as const, value: v })),
    DOMAINS.map((d) => ({ kind: 'domain' as const, value: d[0] })),
  );
}

// The first client name in the text as whole words, after folding case, punctuation and spacing
// ("Flemish-Care" matches "flemish care"); private.blocked_term in the database does the same.
export function blockedTerm(text: string): string | null {
  const norm = ' ' + text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ';
  return CLIENT_WORDS.find((w) => norm.includes(' ' + w + ' ')) || null;
}
const cap = (w: string) => w.replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export type Check = { ok: boolean; text: string };
// Before submit: a title of at most 60 characters, one takeaway, no client names.
// Client names are searched in every text field: title, takeaway, outline and cited sources.
export function contentChecks(d: { title: string; takeaway: string; outline?: string[]; sources?: string[] }): Check[] {
  const title = d.title.trim(), take = d.takeaway.trim(), hit = blockedTerm([d.title, d.takeaway].concat(d.outline || [], d.sources || []).join(' '));
  return [
    { ok: title.length > 0 && title.length <= TITLE_MAX, text: !title ? 'Add a title' : title.length <= TITLE_MAX ? 'Title is clear and short' : 'Title is over 60 characters (' + title.length + ')' },
    { ok: !!take && take.length <= TAKE_MAX, text: !take ? 'Write the one takeaway' : take.length <= TAKE_MAX ? 'One takeaway, ' + take.length + ' of ' + TAKE_MAX + ' characters' : 'Takeaway is too long for one point' },
    { ok: !hit, text: hit ? '“' + cap(hit) + '” looks like a client name · anonymise it' : 'No client names found' },
  ];
}
export const checksPass = (checks: Check[]) => checks.every((c) => c.ok);

// Approve only when all four rubric items hold.
export const rubricComplete = (r: boolean[] | undefined) => !!r && r.length === RUBRIC.length && r.every(Boolean);

export function policyFor(rows: PolicyRow[], t: Topic | null): Policy {
  const p = t && rows.find((r) => r.topic_kind === t.kind && r.topic_value === t.value);
  return p ? { peers: p.peers, expert: p.expert, quality: p.quality } : DEFAULT_POLICY;
}
export const policyLabel = (p: Policy) => {
  const parts = [p.peers ? p.peers + (p.peers === 1 ? ' peer' : ' peers') : '', p.expert ? 'expert' : '', p.quality ? 'quality & risk' : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : 'no review · published on submit';
};

export type Stage = { name: string; step: number };
// The stages a policy requires, from Draft to Published (step = index into REVIEW_STAGES).
export function stagesFor(p: Policy): Stage[] {
  return [0, 1, 2, 3, 4].filter((k) => k === 0 || k === 4 || (k === 1 && p.peers > 0) || (k === 2 && p.expert) || (k === 3 && p.quality))
    .map((k) => ({ name: REVIEW_STAGES[k], step: k }));
}
// A submitted contribution follows the steps it was routed through; a draft shows its topic's current policy.
export function stagesOf(c: Contribution, reviews: Review[], policies: PolicyRow[]): Stage[] {
  if (c.status === 'draft') return stagesFor(policyFor(policies, topicOf(c)));
  const steps = new Set(reviews.filter((r) => r.contribution_id === c.id).map((r) => r.step));
  return [0, 1, 2, 3, 4].filter((k) => k === 0 || k === 4 || steps.has(k)).map((k) => ({ name: REVIEW_STAGES[k], step: k }));
}
export const stageAt = (stages: Stage[], step: number) => Math.max(0, stages.findIndex((s) => s.step === step));

// Reviews waiting for this person now: their row is pending and the contribution is in review (not back with its author).
export function reviewBadge(d: CreateData | null, userId: string) {
  if (!d) return 0;
  const inReview = new Set(d.contributions.filter((c) => c.status === 'review').map((c) => c.id));
  return d.reviews.filter((r) => r.reviewer_id === userId && r.verdict === 'pending' && inReview.has(r.contribution_id)).length;
}

export const ROLE_OF_STEP: Record<number, string> = { 1: 'Peer reviewer', 2: 'Subject-matter expert', 3: 'Quality & risk' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}
export function daysWaiting(iso: string | null | undefined, now: Date) {
  if (!iso) return '';
  const n = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000));
  return n === 0 ? 'Assigned today' : n === 1 ? 'Waiting 1 day' : 'Waiting ' + n + ' days';
}
