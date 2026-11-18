// The placeholder grant exists twice: placeholderRules (TypeScript) and private.plan_draft_matches / private.may_create / submit and publish in
// 20261118250000_plan_drafts.sql. This reads the migration and pins what both sides share.
import { describe, expect, it } from 'vitest';
import { migrationText } from '../test/migrations';
import { PLACEHOLDER_DOMAIN } from './planDraft';

const sql = migrationText('_plan_drafts.sql').replace(/\s+/g, ' ');

describe('placeholder grant: TypeScript and the database agree', () => {
  it('matches a make step by id and format, the line, the step\'s domain (default prof) and no audience', () => {
    expect(sql).toContain("s ->> 'id' = p_step and s ->> 'k' = 'make' and s ->> 'fmt' = p_format");
    expect(sql).toContain("(t.business_line is null or t.business_line = p_line)");
    expect(sql).toContain(`p_audience is null and p_domain = coalesce(s ->> 'dom', '${PLACEHOLDER_DOMAIN}')`);
  });
  it('routes a grant draft through the full default review and re-checks the author at publish', () => {
    expect(sql).toContain('v_peers := 2; v_expert := true; v_quality := true;');
    expect(sql).toContain('private.user_can_plan_trajectory(c.author_id, c.for_trajectory)');
  });
  it('makes the placeholder columns insert-only and links only what was drafted for the step', () => {
    expect(sql).toContain('grant insert (for_trajectory, for_step) on public.contributions to authenticated;');
    expect(sql).not.toMatch(/grant update \(for_/);
    expect(sql).toContain("c.for_trajectory = new.id and c.for_step = s.v ->> 'id'");
  });
});
