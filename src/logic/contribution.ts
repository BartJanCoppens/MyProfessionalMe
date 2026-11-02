// Create & share: creation rules, content checks, the rubric, review policies and the stages a contribution goes through.
// Pure functions over the rows of supabase/migrations/*_create_and_share.sql; the database repeats every rule that protects data.
import { AUD_INFO, AUDS, BLS, CLIENT_WORDS, DOMAINS, NEW_TYPES, REVIEW_STAGES, RUBRIC } from '../data';

export type Policy = { peers: number; expert: boolean; quality: boolean };
export type ContributionStatus = 'draft' | 'review' | 'changes' | 'published';
export type Verdict = 'waiting' | 'pending' | 'approved' | 'changes';

export type Contribution = {
  id: string; author_id: string; author_name: string; business_line: string | null; audience: string | null;
  type: string; title: string; domain: string; level: number; audience_stage: string; takeaway: string; outline: string; sources: string[];
  ai_assisted: boolean; bundle_ids: string[]; status: ContributionStatus; step: number; learning_id: string | null;
  created_at: string; updated_at: string; submitted_at: string | null; published_at: string | null;
};
export type Review = {
  contribution_id: string; step: number; slot: number; reviewer_id: string; reviewer_name: string; verdict: Verdict;
  rubric: boolean[]; comment: string; decided_at: string | null; created_at: string;
};

// A rule: four parts. Within a part the values are OR; across the parts that are filled in, AND; an empty part is "any".
// "(Consulting OR Tax & Legal) AND Podcast" = { lines: [Consulting, Tax & Legal], formats: [Podcast] }.
export type RuleParts = { lines: string[]; formats: string[]; domains: string[]; audiences: string[] };
export type Part = keyof RuleParts;
export type Rule = RuleParts & { id: number; user_id: string };
export type PolicyRow = RuleParts & Policy & { id: number };
// What a contribution states: its business line (always one), format (= its type), domain and optionally one audience.
export type Attrs = { line: string | null; format: string; domain: string; audience: string | null };
// What Create & share shows the signed-in person: their contributions, what they review, their creation rules,
// every review requirement, and how many colleagues could peer-review them.
export type CreateData = { contributions: Contribution[]; reviews: Review[]; rules: Rule[]; policies: PolicyRow[]; peers: number };

// The design's fifth type, "Avatar scenario", waits for the avatar studio (Q16). A contribution's type is its learning format.
export const CREATE_TYPES = NEW_TYPES.filter((t) => t[0] !== 'Avatar scenario');
export const TYPE_NAMES = CREATE_TYPES.map((t) => t[0]);
export const DEFAULT_POLICY: Policy = { peers: 2, expert: true, quality: true };
export const TITLE_MAX = 60;
export const TAKE_MAX = 200;

export const domainName = (k: string) => (DOMAINS.find((d) => d[0] === k) || [k, k])[1];
export const audienceName = (k: string) => AUD_INFO[k]?.name || k;
// Every value a part can hold, in display order.
export const PART_VALUES: Record<Part, string[]> = {
  lines: BLS.slice(), formats: TYPE_NAMES, domains: DOMAINS.map((d) => d[0]), audiences: AUDS.ind.concat(AUDS.tec).map((a) => a[0]),
};
export const PART_LABEL: Record<Part, string> = { lines: 'Business lines', formats: 'Formats', domains: 'Domains', audiences: 'Industries and technologies' };
export const valueName = (part: Part, v: string) => (part === 'domains' ? domainName(v) : part === 'audiences' ? audienceName(v) : v);
export const PARTS: Part[] = ['lines', 'formats', 'domains', 'audiences'];
export const emptyParts = (): RuleParts => ({ lines: [], formats: [], domains: [], audiences: [] });
export const isEmptyRule = (r: RuleParts) => PARTS.every((p) => !r[p].length);
export const togglePart = (r: RuleParts, part: Part, v: string): RuleParts =>
  ({ ...r, [part]: r[part].includes(v) ? r[part].filter((x) => x !== v) : PART_VALUES[part].filter((x) => x === v || r[part].includes(x)) });

// Who may grant a rule or set a requirement: System and General Admins anything (anyLine); a Domain Admin only with
// the lines part filled and every line one they administer (never "any line"). The database's can_grant_rule /
// can_set_policy do the same.
export const withinLines = (r: RuleParts, anyLine: boolean, domains: string[]) => anyLine || (r.lines.length > 0 && r.lines.every((l) => domains.includes(l)));
export const ruleProblem = (r: RuleParts, anyLine: boolean, domains: string[]) =>
  isEmptyRule(r) ? 'Pick at least one value' : !withinLines(r, anyLine, domains) ? 'Pick at least one of your business lines, and only yours' : '';

// Does a rule (or review requirement) cover these attributes? Each filled part must hold the value; a rule with
// audiences needs the contribution to have one of them. The database's private.rule_matches does the same.
export function ruleMatches(r: RuleParts, a: Attrs) {
  return (!r.lines.length || (!!a.line && r.lines.includes(a.line))) && (!r.formats.length || r.formats.includes(a.format))
    && (!r.domains.length || r.domains.includes(a.domain)) && (!r.audiences.length || (!!a.audience && r.audiences.includes(a.audience)));
}
// Several rules of a person are OR.
export const mayCreate = (rules: RuleParts[], a: Attrs) => rules.some((r) => ruleMatches(r, a));
export const attrsOf = (c: Contribution): Attrs => ({ line: c.business_line, format: c.type, domain: c.domain, audience: c.audience });

// The rule in plain words: "Consulting or Tax & Legal · Podcast", "Any line · Reel · Regulations".
export function ruleSentence(r: RuleParts) {
  const part = (p: Part) => r[p].map((v) => valueName(p, v)).join(' or ');
  return [r.lines.length ? part('lines') : 'Any line'].concat((['formats', 'domains', 'audiences'] as Part[]).filter((p) => r[p].length).map(part)).join(' · ');
}
// The values a person may pick per part: the union over their rules, everything when some rule leaves the part empty
// (an empty lines part is any of the three lines; a contribution always has one). noAudience: whether leaving the
// audience out can still match some rule.
export function allowedValues(rules: RuleParts[]) {
  const pick = (p: Part) => (rules.some((r) => !r[p].length) ? PART_VALUES[p] : PART_VALUES[p].filter((v) => rules.some((r) => r[p].includes(v))));
  return { lines: pick('lines'), formats: pick('formats'), domains: pick('domains'), audiences: pick('audiences'),
    noAudience: rules.some((r) => !r.audiences.length) };
}
export const attrsLabel = (a: Attrs) => [a.line || '', a.audience ? audienceName(a.audience) : ''].filter(Boolean).join(' · ');

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

// The effective review requirement: the strictest of every matching one (most peers, an expert if any asks,
// quality & risk if any asks); none matches: the full flow. Without an audience a contribution could be for any, so
// audience-scoped requirements count too. The database's private.policy_for does the same.
export function policyFor(rows: (RuleParts & Policy)[], a: Attrs | null): Policy {
  const m = a ? rows.filter((r) => ruleMatches(a.audience ? r : { ...r, audiences: [] }, a)) : [];
  return m.length ? { peers: Math.max(...m.map((r) => r.peers)), expert: m.some((r) => r.expert), quality: m.some((r) => r.quality) } : DEFAULT_POLICY;
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
// A submitted contribution follows the steps it was routed through; a draft shows the current effective requirement.
export function stagesOf(c: Contribution, reviews: Review[], policies: PolicyRow[]): Stage[] {
  if (c.status === 'draft') return stagesFor(policyFor(policies, attrsOf(c)));
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
