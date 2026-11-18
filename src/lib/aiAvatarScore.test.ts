// The `ai` function's scoring of a practice run (supabase/functions/ai/avatarScore.ts) with its database and provider stood in: the conversation is the one the
// database gives, the answer is read strictly, nothing is recorded for a cut or malformed answer, and the record is for the hash the input gave.
import { describe, expect, it, vi } from 'vitest';
import { SCORE_REFUSED, scoreAvatarRun } from '../../supabase/functions/ai/avatarScore.ts';
import type { ScoreDeps, ScoreLoad } from '../../supabase/functions/ai/avatarScore.ts';

const input: ScoreLoad = {
  title: 'Selling an HR system', situation: 'She has ten minutes.', counterpart: 'An HR director', score_hash: 'h1',
  points: [{ id: 'lp-1', text: 'Asks first', weight: 100 }],
  turns: [{ who: 'learner', text: 'What worries you most?', guard: null }, { who: 'character', text: 'The cost.', guard: null }, { who: 'learner', text: 'What does waiting cost?', guard: null }, { who: 'character', text: 'A lot.', guard: null }],
};
const answer = (o: Record<string, unknown> = {}) => ({ ok: true as const, cut: false, text: JSON.stringify({ learning_points: [{ id: 'lp-1', score: 60, comment: 'Asked first in turn 1.', turns: [1] }], strengths: [], missed: [], summary: 'Fine.', ...o }) });
const deps = (o: Partial<ScoreDeps> = {}): ScoreDeps => ({ preamble: '', dailyLimit: 120, dailyChars: 1_000_000, load: vi.fn(async () => input), count: vi.fn(async () => 'ok' as const), call: vi.fn(async () => answer()), record: vi.fn(async () => null), ...o });

describe('scoreAvatarRun', () => {
  it('scores the stored conversation and records the score for the hash the input gave', async () => {
    const d = deps();
    const out = await scoreAvatarRun(d);
    expect(out).toMatchObject({ status: 200, body: { overall: 60, band: 'Good', version: '1.0.0' } });
    expect(d.record).toHaveBeenCalledTimes(1);
    expect(vi.mocked(d.record).mock.calls[0][0]).toBe('h1');
    expect(vi.mocked(d.record).mock.calls[0][1]).toMatchObject({ overall: 60 });
    const ask = vi.mocked(d.call).mock.calls[0][0];
    expect(ask.max_tokens).toBe(1500);
    expect(ask.messages[0].content).toContain('Turn 1 (learner): <<<What worries you most?>>>');
    expect(d.count).toHaveBeenCalledWith((ask.system || '').length + ask.messages[0].content.length);
  });
  it('counts before it calls', async () => {
    const d = deps();
    await scoreAvatarRun(d);
    expect(vi.mocked(d.count).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(d.call).mock.invocationCallOrder[0]);
  });
  it('refuses each way the database refuses, counting and calling nothing; practice_only is a 400', async () => {
    expect(SCORE_REFUSED.practice_only).toEqual({ status: 400, error: 'This scenario is practice only: it has no score' });
    for (const [refusal, answered] of Object.entries(SCORE_REFUSED)) {
      const d = deps({ load: vi.fn(async () => ({ refusal })) });
      expect(await scoreAvatarRun(d)).toEqual(answered);
      expect(d.count).not.toHaveBeenCalled(); expect(d.call).not.toHaveBeenCalled(); expect(d.record).not.toHaveBeenCalled();
    }
    expect(await scoreAvatarRun(deps({ load: vi.fn(async () => ({ refusal: 'time_up' })) }))).toMatchObject({ status: 500 });
    expect(await scoreAvatarRun(deps({ load: vi.fn(async () => null) }))).toMatchObject({ status: 500 });
  });
  it('records nothing for a cut answer', async () => {
    const d = deps({ call: vi.fn(async () => ({ ok: true as const, cut: true, text: answer().text })) });
    expect(await scoreAvatarRun(d)).toEqual({ status: 502, error: 'AI did not return a usable score · try again' });
    expect(d.record).not.toHaveBeenCalled();
  });
  it('answers 502 with its text and records nothing for a malformed answer, a missing point or a score of 101', async () => {
    for (const out of [{ ok: true as const, cut: false, text: 'It went well' }, answer({ learning_points: [] }), answer({ learning_points: [{ id: 'lp-1', score: 101, comment: 'c', turns: [1] }] })]) {
      const d = deps({ call: vi.fn(async () => out) });
      expect(await scoreAvatarRun(d)).toEqual({ status: 502, error: 'AI did not return a usable score · try again' });
      expect(d.record).not.toHaveBeenCalled();
    }
  });
  it('passes a provider failure on and records nothing', async () => {
    const d = deps({ call: vi.fn(async () => ({ ok: false as const, error: 'The AI provider did not answer' })) });
    expect(await scoreAvatarRun(d)).toEqual({ status: 502, error: 'The AI provider did not answer' });
    expect(d.record).not.toHaveBeenCalled();
  });
  it('answers 409 with the database\'s words when it refuses the record', async () => {
    const d = deps({ record: vi.fn(async () => 'The run changed while it was scored · score it again') });
    expect(await scoreAvatarRun(d)).toEqual({ status: 409, error: 'The run changed while it was scored · score it again' });
  });
  it('says a daily limit stops the score and no script stands in; a count failure is a 500', async () => {
    const limited = deps({ count: vi.fn(async () => 'limit' as const) });
    const out = await scoreAvatarRun(limited) as { status: number; error: string };
    expect(out.status).toBe(429);
    expect(out.error).toContain('try again tomorrow (UTC)');
    expect(limited.call).not.toHaveBeenCalled();
    expect(await scoreAvatarRun(deps({ count: vi.fn(async () => 'error' as const) }))).toMatchObject({ status: 500 });
  });
  it('sends no preamble of the character: only the scoring text is the system text', async () => {
    const d = deps();
    await scoreAvatarRun(d);
    expect(vi.mocked(d.call).mock.calls[0][0].system).not.toMatch(/Stay in character/);
  });
});
