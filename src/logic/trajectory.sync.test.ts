// The evidence rule of a submitted step exists twice: in stepProofProblem (TypeScript) and in submit_trajectory_step
// (SQL). This test reads the migration and checks the SQL still holds the conditions the TypeScript rule encodes.
import { describe, expect, it } from 'vitest';
import { canBeMandatory, inMandatoryAudience, PROOF_LIMITS, stepProofProblem } from './trajectory';
import type { Trajectory } from './trajectory';
import { MEMBERSHIP_PATTERN } from './membership';
import { RENEW_DAYS } from './trajectoryLearner';

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
  it('"in use" is an enrolment or a credential of the trajectory', () => {
    expect(del).toContain('select exists (select 1 from public.trajectory_enrolments where trajectory_id = p_trajectory) or exists (select 1 from public.credentials where trajectory_id = p_trajectory)');
  });
  it('the one delete policy keeps the write rule and refuses a used trajectory', () => {
    expect(del).toContain('drop policy "trajectories: admins remove"');
    expect(del).toContain('using ((select private.can_write_trajectory(business_line, status, maps)) and not (select private.trajectory_in_use(id)))');
    expect(del.match(/create policy "trajectories: admins remove"/g)).toHaveLength(1);
  });
  it('the editor\'s list of used ids is the same helper', () => {
    expect(del).toContain('select t.id from public.trajectories t where private.trajectory_in_use(t.id)');
  });
});
