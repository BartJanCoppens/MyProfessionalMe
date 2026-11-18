// The evidence rule of a submitted step exists twice: in stepProofProblem (TypeScript) and in submit_trajectory_step
// (SQL). This test reads the migration and checks the SQL still holds the conditions the TypeScript rule encodes.
import { describe, expect, it } from 'vitest';
import { canBeMandatory, inMandatoryAudience, isRequired, PROOF_LIMITS, STEP_KIND_NAMES, stepProofProblem } from './trajectory';
import type { Trajectory } from './trajectory';
import { MEMBERSHIP_PATTERN } from './membership';
import { RENEW_DAYS } from './trajectoryLearner';
import { TRAJECTORY_COLUMNS } from '../lib/trajectoryStore';

const migrations = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const sql = Object.entries(migrations).filter(([f]) => f.includes('_trajectories')).map(([, text]) => text).join('\n');
const flat = sql.replace(/\s+/g, ' ');
// The latest definitions of in_mandatory_audience and trajectory_maps_ok, and the audience_members check.
const membership = Object.entries(migrations).filter(([f]) => f.includes('_audience_members')).map(([, text]) => text).join('\n').replace(/\s+/g, ' ');

describe('step proof rule: TypeScript and the database agree', () => {
  it('SQL requires a link or number for an exam and a link or note for evidence', () => {
    expect(flat).toContain("p_state = 'submitted' and k = 'exam' and l is null and rf is null");
    expect(flat).toContain("p_state = 'submitted' and k = 'evidence' and l is null and n is null");
    expect(flat).not.toMatch(/k = 'check' and l is null/);
  });
  it('SQL limits and link format match PROOF_LIMITS', () => {
    expect(flat).toContain(`char_length(l) > ${PROOF_LIMITS.link}`);
    expect(flat).toContain(`char_length(rf) > ${PROOF_LIMITS.ref} or char_length(n) > ${PROOF_LIMITS.note}`);
    expect(flat).toContain("l !~ '^https?://[^[:space:]]+$'");
  });
  it('TypeScript applies the same rule', () => {
    expect(stepProofProblem('exam', {})).not.toBeNull();
    expect(stepProofProblem('exam', { ref: 'N-1' })).toBeNull();
    expect(stepProofProblem('exam', { note: 'x' })).not.toBeNull();
    expect(stepProofProblem('evidence', { note: 'x' })).toBeNull();
    expect(stepProofProblem('evidence', { ref: 'x' })).not.toBeNull();
    expect(stepProofProblem('check', {})).toBeNull();
    expect(stepProofProblem('evidence', { link: 'ftp://x' })).not.toBeNull();
    expect(stepProofProblem('exam', { link: 'https://a.b/c' })).toBeNull();
    expect(stepProofProblem('evidence', { note: 'n'.repeat(PROOF_LIMITS.note + 1) })).not.toBeNull();
  });
});

describe('who a mandatory map binds: TypeScript and the database agree', () => {
  it('SQL allows mandatory on business lines, ind: and tec:, as canBeMandatory', () => {
    expect(membership).toContain("(m ->> 2) = 'advised' or (m ->> 0) in ('Consulting', 'Audit', 'Tax & Legal') or (m ->> 0) ~ '^(ind|tec):[a-z]+$'");
    expect(canBeMandatory('tec:data') && canBeMandatory('ind:energy') && canBeMandatory('Audit')).toBe(true);
    expect(canBeMandatory('amb:sust') || canBeMandatory('pro:blue')).toBe(false);
  });
  it('SQL binds at the map stage through the business line or a membership, as inMandatoryAudience', () => {
    expect(membership).toContain("m ->> 2 = 'mandatory' and m ->> 1 = p.career_stage::text and (m ->> 0 = p.business_line::text or exists (select 1 from public.audience_members a where a.user_id = p.id and a.audience = m ->> 0))");
    const t = { enrol: 'auto', maps: [['tec:data', 'Consultant', 'mandatory']] } as unknown as Trajectory;
    expect(inMandatoryAudience(t, { line: 'Audit', stage: 'Consultant', audiences: ['tec:data'] })).toBe(true);
    expect(inMandatoryAudience(t, { line: 'Audit', stage: 'Consultant', audiences: [] })).toBe(false);
  });
  it('SQL checks the membership format with the same pattern', () => {
    expect(membership).toContain("check (audience ~ '" + MEMBERSHIP_PATTERN.source + "')");
  });
});

describe('renewal window: TypeScript and the database agree', () => {
  const renewal = Object.entries(migrations).filter(([f]) => f.includes('_credential_renewal')).map(([, text]) => text).join('\n').replace(/\s+/g, ' ');
  it('submit_renewal opens RENEW_DAYS before expiry and requires the same proof rule', () => {
    expect(renewal).toContain(`if c.expires_on > current_date + ${RENEW_DAYS} then`);
    expect(renewal).toContain(`char_length(l) > ${PROOF_LIMITS.link} or l !~ '^https?://[^[:space:]]+$'`);
    expect(renewal).toContain(`char_length(rf) > ${PROOF_LIMITS.ref}`);
  });
});

// Deleting an unused trajectory: the owner's rule lives in the database only (the editor asks trajectories_in_use()).
describe('delete rule: the migration holds the owner rule', () => {
  const del = Object.entries(migrations).filter(([f]) => f.includes('_trajectory_delete')).map(([, text]) => text).join('\n').replace(/\s+/g, ' ');
  it('"in use" is ever enrolled (the durable marker) or a credential of the trajectory', () => {
    expect(del).toContain('select exists (select 1 from public.trajectories where id = p_trajectory and first_enrolled_at is not null) or exists (select 1 from public.credentials where trajectory_id = p_trajectory)');
  });
  it('the marker is stamped on the first enrolment insert, backfilled, and not writable by clients', () => {
    expect(del).toContain('create trigger stamp_first_enrolment after insert on public.trajectory_enrolments');
    expect(del).toContain('update public.trajectories set first_enrolled_at = now() where id = new.trajectory_id and first_enrolled_at is null');
    expect(del).toContain('from public.trajectory_decisions d where d.trajectory_id = t.id');
    expect(del).toContain('revoke insert, update on public.trajectories from authenticated');
    const grants = [...del.matchAll(/grant (?:insert|update) \(([^)]*)\) on public\.trajectories/g)].map((m) => m[1]);
    expect(grants).toHaveLength(2);
    for (const g of grants) expect(g).not.toContain('first_enrolled_at');
  });
  it('the editor\'s save path never sends the marker', () => {
    expect(TRAJECTORY_COLUMNS).not.toContain('first_enrolled_at');
  });
  it('the one delete policy keeps the write rule and refuses a used trajectory', () => {
    expect(del).toContain('drop policy "trajectories: admins remove"');
    expect(del).toContain('using ((select private.can_write_trajectory(business_line, status, maps)) and not (select private.trajectory_in_use(id)))');
    expect(del.match(/create policy "trajectories: admins remove"/g)).toHaveLength(1);
  });
  it('the editor\'s list of used ids is the same helper, for the trajectories the caller may write', () => {
    expect(del).toContain('select t.id from public.trajectories t where private.can_write_trajectory(t.business_line, t.status, t.maps) and private.trajectory_in_use(t.id)');
  });
});

// Apply's placeholder steps (migration *_plan_steps): the kinds, the make rule, the link, and the moment that makes a linked step optional for earlier enrolments.
describe('placeholder steps: TypeScript and the database agree', () => {
  const steps = Object.entries(migrations).filter(([f]) => f.includes('_plan_steps')).map(([, text]) => text).join('\n').replace(/\s+/g, ' ');
  it('the step kinds are the same list, make included', () => {
    const listed = /\(s ->> 'k'\) in \(([^)]*)\)/.exec(steps)![1].split(',').map((x) => x.trim().replace(/'/g, ''));
    expect(listed).toEqual([...STEP_KIND_NAMES]);
    expect(STEP_KIND_NAMES).toContain('make');
  });
  it('a make step needs a title of 1 to 120 characters, a fmt, and a cid that is absent or a lower-case uuid', () => {
    expect(steps).toContain("char_length(s ->> 'title') between 1 and 120");
    expect(steps).toContain("jsonb_typeof(s -> 'fmt') = 'string'");
    expect(steps).toContain("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
  });
  it('linking keeps id, win, req, pre and from, drops cid, fmt, title and hours, and records linked_at', () => {
    expect(steps).toContain("(s.v - 'cid' - 'fmt' - 'title' - 'hours') || jsonb_build_object('k', 'learn', 'lid', l.learning_id, 'linked_at', to_jsonb(coalesce(l.was, now())))");
    expect(steps).toContain("o ->> 'id' = s.v ->> 'id' and o ->> 'k' = 'learn'"); // a stale save keeps the first linked_at
    expect(steps).toContain('before insert or update of steps on public.trajectories');
    expect(steps).toContain('after update of learning_id on public.contributions');
  });
  it('TypeScript: a step linked after an enrolment began is optional for it, as the stored linked_at says', () => {
    const linked = { id: 's', k: 'learn' as const, lid: 'x', win: 1, req: true, pre: null, linked_at: '2026-06-10T12:00:00+00:00' };
    expect(isRequired(linked, { status: 'enrolled', start_month: 0, steps: {}, created_at: '2026-06-01T00:00:00+00:00' })).toBe(false);
    expect(isRequired(linked, { status: 'enrolled', start_month: 0, steps: {}, created_at: '2026-06-11T00:00:00+00:00' })).toBe(true);
  });
});

describe('who counts a step as required', () => {
  it('no SQL rule reads req: submitting and deciding never look at it, so isRequired is the one place (optional for earlier enrolments)', () => {
    const fn = (name: string) => flat.slice(flat.indexOf('create function public.' + name));
    for (const name of ['submit_trajectory_step', 'decide_trajectory']) expect(fn(name).slice(0, fn(name).indexOf('$$; ', 200))).not.toMatch(/'req'|"req"/);
  });
});

