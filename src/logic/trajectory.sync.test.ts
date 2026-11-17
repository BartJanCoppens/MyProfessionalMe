// The evidence rule of a submitted step exists twice: in stepProofProblem (TypeScript) and in submit_trajectory_step
// (SQL). This test reads the migration and checks the SQL still holds the conditions the TypeScript rule encodes.
import { describe, expect, it } from 'vitest';
import { canBeMandatory, inMandatoryAudience, PROOF_LIMITS, stepProofProblem } from './trajectory';
import type { Trajectory } from './trajectory';
import { MEMBERSHIP_PATTERN } from './membership';

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
