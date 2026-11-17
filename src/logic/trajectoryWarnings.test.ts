import { describe, expect, it } from 'vitest';
import { adminWarnings } from './trajectoryWarnings';
import type { LearningRef, Trajectory } from './trajectory';

const byId: Record<string, LearningRef> = { a: { hours: 45, cpd: 0, state: 'not-started', pct: 0 } };
const good: Trajectory = {
  id: 'T1', name: 'N', issuer: '', credential: 'Cred', enrol: 'open', months: 12, valid_months: null, renewal: '', cost: '',
  status: 'draft', business_line: null, published_at: null,
  steps: [{ id: 's1', k: 'learn', lid: 'a', win: 1, req: true, pre: null }, { id: 's2', k: 'exam', title: 'Exam', hours: 1, win: 12, req: true, pre: 's1' }],
  maps: [['Audit', 'senior', 'advised']],
};

describe('adminWarnings', () => {
  it('is quiet for a sound trajectory within the yearly goal', () => {
    expect(adminWarnings(good, byId, 100)).toEqual([]);
  });
  it('warns about the year-1 load against the passed yearly goal', () => {
    expect(adminWarnings(good, byId, 80)).toEqual(['Year 1 asks 46 h, more than half of the 80 h yearly budget.']);
    expect(adminWarnings(good, byId, 0)[0]).toContain('80 h yearly budget');
  });
  it('returns the design texts, with the admin rule for mandatory maps', () => {
    const t: Trajectory = {
      ...good, enrol: 'auto', credential: '', maps: [['amb:growth', 'senior', 'advised'], ['Audit', 'senior', 'mandatory']],
      steps: [{ id: 's1', k: 'learn', lid: 'a', win: 1, req: true, pre: null }, { id: 's2', k: 'exam', title: 'Exam', win: 2, req: true, pre: null }],
    };
    const w = adminWarnings(t, byId, 200);
    expect(w).toContain('Only business-line, industry and technology audiences are auto-enrolled; ambition and profile audiences see a suggestion.');
    expect(adminWarnings({ ...t, maps: [['tec:data', 'senior', 'mandatory']] }, byId, 200).join(' ')).not.toMatch(/auto-enrolled/);
    expect(w).toContain('Mandatory for Audit: needs a System or General Admin to publish.');
    expect(w).toContain('Step 2 (exam) has no prerequisite, so people could book it before the learnings are done.');
    expect(w).toContain('Name the credential people earn.');
    expect(w.join(' ')).not.toMatch(/Council/);
  });
  it('warns when nothing is mapped or there is no exam', () => {
    const w = adminWarnings({ ...good, maps: [], steps: [good.steps[0]] }, byId, 200);
    expect(w).toEqual(['Not mapped to any audience yet, so nobody sees it.', 'No exam or assessment step: add one before the credential.']);
  });
  it('warns about a step whose learning left the library', () => {
    const t = { ...good, steps: [{ id: 's1', k: 'learn' as const, lid: 'gone', win: 1, req: true, pre: null }, good.steps[1]] };
    expect(adminWarnings(t, byId, 200)).toEqual(['Step 1 points at a learning that is unpublished or no longer in the library.']);
  });
});
