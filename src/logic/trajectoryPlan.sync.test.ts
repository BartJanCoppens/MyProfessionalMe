// The caps of a trajectory plan exist twice: PLAN_CAPS (TypeScript, with the deep rules in planProblems) and the checks of
// 20261118230000_trajectory_plans.sql. This reads the migration and pins the numbers both sides share.
import { describe, expect, it } from 'vitest';
import { migrationText } from '../test/migrations';
import { STAGES } from '../data';
import { DOMAIN_CODES, emptyPlan, PLAN_CAPS } from './trajectoryPlan';

const sql = migrationText('_trajectory_plans.sql').replace(/\s+/g, ' ');

describe('plan caps: TypeScript and the database agree', () => {
  it('limits modules, removed titles, messages, bundles and sources per trajectory', () => {
    expect(sql).toContain(`jsonb_array_length(p -> 'modules') <= ${PLAN_CAPS.modules}`);
    expect(sql).toContain(`jsonb_array_length(p -> 'removed') <= ${PLAN_CAPS.removed}`);
    expect(sql).toContain(`jsonb_array_length(messages) <= ${PLAN_CAPS.messages}`);
    expect(sql).toContain(`cardinality(bundle_ids) <= ${PLAN_CAPS.bundles}`);
    expect(sql).toContain(`>= ${PLAN_CAPS.sourcesPerTrajectory} then raise exception`);
  });
  it('limits the size of a plan, the messages, a source and its passages', () => {
    expect(sql).toContain('octet_length(p::text) <= 120000');
    expect(sql).toContain('octet_length(messages::text) <= 300000');
    expect(sql).toContain('jsonb_array_length(p) between 1 and 600');
    expect(sql).toContain('char_length(v ->> 1) between 1 and 1200');
    expect(sql).toContain('chars between 1 and 400000');
    expect(sql).toContain('pages between 1 and 400');
  });
  it('starts a plan from the empty plan', () => {
    expect(sql).toContain(`default '${JSON.stringify(emptyPlan()).replace(/":/g, '": ').replace(/,"/g, ', "')}'`);
  });
  it('seeds the AI use off, for admins, at 40 calls and 1.5 million characters, and lets the bucket take PDFs', () => {
    expect(sql).toContain("'trajectory_ai'");
    expect(sql).toMatch(/'trajectory_ai', \d+, 'text', 'Trajectory AI', 'Curriculum mapping · Certification trajectories · Build with AI'/);
    expect(sql).toContain("null, true, false, 'Help a learning admin");
    expect(sql).toContain(', 40, 1500000)');
    expect(sql).toContain("allowed_mime_types || 'application/pdf'");
  });
  it('names the domain codes of the contributions check and the career stages of the enum, the two lists an AI brief is cut to', () => {
    const codes = /domain text not null check \(domain in \(([^)]*)\)\)/.exec(migrationText('_content_tables.sql'))![1].replace(/'/g, '').split(', ');
    expect(DOMAIN_CODES).toEqual(codes);
    const enumStages = /create type public\.career_stage as enum \(([^)]*)\)/.exec(migrationText('_learner_data.sql'))![1].replace(/'/g, '').split(', ');
    expect(STAGES).toEqual([...enumStages, 'Director', 'Partner']);
    expect(migrationText('_director_partner_stages.sql')).toContain("add value if not exists 'Director' after 'Senior manager'");
  });
});
