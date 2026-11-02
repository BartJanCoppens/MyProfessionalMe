// Rows for Create & share tests, shaped like the contributions and contribution_reviews tables.
import type { Contribution, Review } from '../logic/contribution';

export const contribution = (o: Partial<Contribution> = {}): Contribution => ({
  id: 'c1', author_id: 'u1', author_name: 'Robin Test', business_line: 'Consulting', audience: null, type: 'Reel', title: 'One slide, one message', domain: 'pers', level: 2,
  audience_stage: 'Consultant', takeaway: 'State the message as a full sentence.', outline: '', sources: [], ai_assisted: false, bundle_ids: [], status: 'draft', step: 0, learning_id: null,
  created_at: '2026-10-28T09:00:00Z', updated_at: '2026-10-28T09:00:00Z', submitted_at: null, published_at: null, ...o,
});
export const review = (o: Partial<Review> = {}): Review => ({
  contribution_id: 'c1', step: 1, slot: 1, reviewer_id: 'u2', reviewer_name: 'Sam Peer', verdict: 'pending', rubric: [], comment: '', decided_at: null, created_at: '2026-10-29T09:00:00Z', ...o,
});

