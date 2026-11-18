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
    expect(sql).toContain('public.plan_trajectory_allowed(c.author_id, c.for_trajectory)');
    expect(sql).not.toContain('create function private.user_can_plan_trajectory');
  });
  it('gives a placeholder one draft: free when it has no cid, names this draft or names none that exists', () => {
    expect(sql).toContain("s ->> 'cid' = p_id::text or not exists (select 1 from public.contributions x where x.id::text = s ->> 'cid' and x.id <> p_id)");
    expect(sql).toContain("c.type = s.v ->> 'fmt'");
  });
  it('makes the placeholder columns insert-only and links only what was drafted for the step', () => {
    expect(sql).toContain('grant insert (for_trajectory, for_step) on public.contributions to authenticated;');
    expect(sql).not.toMatch(/grant update \(for_/);
    expect(sql).toContain("c.for_trajectory = new.id and c.for_step = s.v ->> 'id'");
  });
  it('links by the draft\'s own placeholder, relinks by for_trajectory, and keeps a link a stale save sends back as a make step', () => {
    expect(sql).toContain("update public.trajectories set steps = steps where id = new.for_trajectory;");
    expect(sql).toContain("o.v ->> 'k' = 'learn' and o.v ? 'linked_at'");
    expect(sql).toContain("case when s.v ? 'cid' then c.id::text = s.v ->> 'cid' else private.plan_draft_matches(");
    expect(sql).toContain('and public.plan_trajectory_allowed(c.author_id, new.id) end having count(*) = 1');
    expect(sql).not.toContain('[0-9a-f]{8}'); // the one uuid test is private.is_uuid (20261118240000)
  });
});
