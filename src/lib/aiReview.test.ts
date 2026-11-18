// The `ai` function's house-rules review of a game (supabase/functions/ai/review.ts), with its database and provider stood in: the
// verdict is read strictly, counted under the use, and recorded for the hash the database gave; nothing from the client but the id.
import { describe, expect, it, vi } from 'vitest';
import { reviewGame } from '../../supabase/functions/ai/review.ts';
import type { ReviewDeps } from '../../supabase/functions/ai/review.ts';

const input = { title: 'Invoice detective', review_hash: 'h1', content: { concept: 'c', win: 'w', rounds: [{ text: 't', answer: 'a' }], role: null, files: { 'index.html': '<main></main>', 'game.js': 'GameStudio.ready();' } } };
const verdict = (v: unknown) => ({ ok: true as const, text: JSON.stringify(v), cut: false });
const deps = (o: Partial<ReviewDeps> = {}): ReviewDeps => ({
  preamble: 'HOUSE RULES', load: vi.fn(async () => input), count: vi.fn(async () => 'ok' as const),
  call: vi.fn(async () => verdict({ passed: true, reasons: [] })), record: vi.fn(async () => null), ...o });

describe('reviewGame', () => {
  it('asks the model with the house rules first, then records the verdict for the files the database gave', async () => {
    const d = deps({ call: vi.fn(async () => verdict({ passed: false, reasons: ['Round 2 names a real company'] })) });
    expect(await reviewGame(d)).toEqual({ status: 200, body: { passed: false, reasons: ['Round 2 names a real company'] } });
    const ask = vi.mocked(d.call).mock.calls[0][0];
    expect(ask.system!.startsWith('HOUSE RULES')).toBe(true);
    expect(ask.messages[0].content).toContain('<<<Invoice detective>>>');
    expect(d.record).toHaveBeenCalledWith('h1', { passed: false, reasons: ['Round 2 names a real company'] });
    expect(d.count).toHaveBeenCalledWith(ask.system!.length + ask.messages[0].content.length);
  });
  it('records a pass', async () => {
    const d = deps();
    expect(await reviewGame(d)).toEqual({ status: 200, body: { passed: true, reasons: [] } });
    expect(d.record).toHaveBeenCalledWith('h1', { passed: true, reasons: [] });
  });
  it('refuses a game that is not the caller\'s, not built or not theirs to edit, before counting or calling', async () => {
    const d = deps({ load: vi.fn(async () => null) });
    expect(await reviewGame(d)).toEqual({ status: 404, error: 'That game is not yours to review, or it is not built yet' });
    expect(d.count).not.toHaveBeenCalled();
    expect(d.call).not.toHaveBeenCalled();
  });
  it('sends nothing beyond the daily limit, and says so', async () => {
    const d = deps({ count: vi.fn(async () => 'limit' as const) });
    expect(await reviewGame(d)).toMatchObject({ status: 429, error: expect.stringContaining('Daily AI limit reached') });
    expect(((await reviewGame(d)) as { error: string }).error).not.toMatch(/scripted/);
    expect(d.call).not.toHaveBeenCalled();
    expect(await reviewGame(deps({ count: vi.fn(async () => 'error' as const) }))).toMatchObject({ status: 500 });
  });
  it('records nothing when the answer is not a usable verdict, or the provider fails', async () => {
    for (const out of [{ ok: true as const, text: 'Looks fine to me', cut: false }, verdict({ passed: 'yes', reasons: [] }), { ok: true as const, text: '{"passed": true, "rea', cut: true }]) {
      const d = deps({ call: vi.fn(async () => out) });
      expect(await reviewGame(d)).toEqual({ status: 502, error: 'AI did not return a usable review · retry this step' });
      expect(d.record).not.toHaveBeenCalled();
    }
    const d = deps({ call: vi.fn(async () => ({ ok: false as const, error: 'The provider answered 500' })) });
    expect(await reviewGame(d)).toEqual({ status: 502, error: 'The provider answered 500' });
    expect(d.record).not.toHaveBeenCalled();
  });
  it('says so when the files changed during the review (the database refuses the stale hash)', async () => {
    const d = deps({ record: vi.fn(async () => 'The game changed during the review · run it again') });
    expect(await reviewGame(d)).toEqual({ status: 409, error: 'The game changed during the review · run it again' });
  });
});
