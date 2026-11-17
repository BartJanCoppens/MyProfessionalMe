// Warnings an admin sees while editing a trajectory (the design's texts; D2 and the missing-learning warning added).
import type { Trajectory, TrjStep, LearningRef } from './trajectory';
import { canBeMandatory, totals } from './trajectory';

const fmtHours = (h: number) => (h > 0 && h < 1 ? Math.round(h * 60) + ' min' : Math.round(h * 10) / 10 + ' h');
const learningIds = (st: TrjStep) => (st.k === 'learn' ? [st.lid ?? ''] : st.k === 'elect' ? st.opts || [] : []);

export function adminWarnings(t: Trajectory, byId: Record<string, LearningRef | undefined>, yearlyGoal: number): string[] {
  const goal = yearlyGoal > 0 ? yearlyGoal : 80;
  const warns: string[] = [];
  if (!t.maps.length) warns.push('Not mapped to any audience yet, so nobody sees it.');
  if (t.enrol === 'auto' && t.maps.some((m) => !canBeMandatory(m[0]))) warns.push('Only business-line, industry and technology audiences are auto-enrolled; ambition and profile audiences see a suggestion.');
  t.maps.filter((m) => m[2] === 'mandatory').forEach((m) => warns.push('Mandatory for ' + m[0] + ': needs a System or General Admin to publish.'));
  t.steps.forEach((st, i) => {
    if (st.k === 'exam' && !st.pre && i > 0) warns.push('Step ' + (i + 1) + ' (exam) has no prerequisite, so people could book it before the learnings are done.');
    if (learningIds(st).some((id) => !byId[id])) warns.push('Step ' + (i + 1) + ' points at a learning that is unpublished or no longer in the library.');
  });
  if (!t.steps.some((st) => st.k === 'exam')) warns.push('No exam or assessment step: add one before the credential.');
  const year1 = totals(t, byId).perYear[0];
  if (year1 > goal / 2) warns.push('Year 1 asks ' + fmtHours(year1) + ', more than half of the ' + goal + ' h yearly budget.');
  if (!t.credential.trim()) warns.push('Name the credential people earn.');
  return warns;
}
