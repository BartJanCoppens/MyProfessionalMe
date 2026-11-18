// The scoring rules in SQL (migration 20261118210000) and TypeScript (_shared/avatarScore.ts, ai/avatarScore.ts) say the same things: the prompt version, the
// 30, 54, 300, 200, 600 and 5 limits, the bands, the refusals' words, and who may execute what.
import { describe, expect, it } from 'vitest';
import { SCORE_REFUSED } from '../../supabase/functions/ai/avatarScore.ts';
import { REFUSED } from '../../supabase/functions/ai/avatarTurn.ts';
import { COMMENT_MAX, ITEM_MAX, LIST_MAX, NO_EVIDENCE_MAX, ONE_LINE_MAX, SCORE_PROMPT_VERSION, SUMMARY_MAX, bandOf } from '../../supabase/functions/_shared/avatarScore.ts';
import { migrationText } from '../test/migrations';

const sql = migrationText('20261118210000_avatar_scores.sql');
const fn = (name: string) => new RegExp('create function (?:private|public)\\.' + name + '\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;').exec(sql)![0];
const sqlText = (error: string) => "'" + error.replace(/'/g, "''") + "'";

describe('the score\'s rules in SQL', () => {
  const ok = fn('avatar_score_ok');
  it('carry the version literal into the hash and the check', () => {
    expect(fn('avatar_score_hash')).toContain("r.turns::text || (private.avatar_content(c.items, c.shape) -> 'points')::text || '" + SCORE_PROMPT_VERSION + "'");
    expect(ok).toContain("p_score ->> 'version' is distinct from '" + SCORE_PROMPT_VERSION + "'");
    expect(fn('avatar_score_hash')).toContain("encode(sha256(convert_to(");
  });
  it('keep the limits: 30 without a cited turn, 54 with one creditable line, comment 300, items 5 of 200, summary 600', () => {
    expect(ok).toContain(`jsonb_array_length(e -> 'turns') = 0 and (e ->> 'score')::numeric > ${NO_EVIDENCE_MAX}`);
    expect(ok).toContain(`v_credit <= 1 and (e ->> 'score')::numeric > ${ONE_LINE_MAX}`);
    expect(ok).toContain(`char_length(e ->> 'comment') > ${COMMENT_MAX}`);
    expect(ok).toContain(`jsonb_array_length(n) > ${LIST_MAX}`);
    expect(ok).toContain(`char_length(s #>> '{}') > ${ITEM_MAX}`);
    expect(ok).toContain(`char_length(p_score ->> 'summary') > ${SUMMARY_MAX}`);
    expect(fn('confirm_avatar_run')).toContain('char_length(v_note) > 600');
  });
  it('take the bands of bandOf', () => {
    const band = fn('score_band');
    for (const [from, name] of [[85, 'Excellent'], [70, 'Very good'], [55, 'Good'], [40, 'Mediocre']] as const) {
      expect(band).toContain(`p_score >= ${from} then '${name}'`);
      expect(bandOf(from)).toBe(name);
    }
    expect(band).toContain("else 'Needs improvement'");
  });
  it('credit only a learner turn the guard did not hold, and compute the overall as the weighted mean, rounded', () => {
    expect(ok).toContain("t ->> 'who' = 'learner' and t ->> 'guard' is null");
    expect(ok).toContain("is distinct from 'learner' or p_turns -> ((n #>> '{}')::integer - 1) ->> 'guard' is not null");
    expect(ok).toContain('round(v_sum / nullif(v_weights, 0))');
  });
});

describe('the input and the refusals', () => {
  const input = fn('avatar_score_input');
  it('give the refusals the edge answers, in the words the edge says', () => {
    const codes = [...input.matchAll(/'refusal', (?:case when r\.test then )?'([a-z_]+)'(?: else '([a-z_]+)' end)?/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean);
    expect([...new Set(codes)].sort()).toEqual(Object.keys(SCORE_REFUSED).sort());
    for (const k of ['not_yours', 'finished', 'not_allowed', 'no_scenario'] as const) expect(SCORE_REFUSED[k]).toEqual(REFUSED[k]);
  });
  it('never hands the scorer what the character reveals or hides', () => {
    expect(input).not.toMatch(/Reveals if asked|Hides unless probed|avatar_row_text|'reveals'|'hides'/);
  });
  it('record with the words the edge repeats, once, for the hash, and end the run', () => {
    const record = fn('record_avatar_score');
    expect(record).toContain(sqlText('The run changed while it was scored · score it again'));
    expect(record).toContain("update public.avatar_runs set score = p_score, score_hash = p_hash, finished_at = now()");
    expect(record).toContain(sqlText(REFUSED.finished.error));
  });
});

describe('who may execute what', () => {
  it('lets only the service role read the input and write the score; the learner shares and the counsellor confirms', () => {
    expect(sql).toContain('revoke execute on function public.avatar_score_input(uuid, uuid), public.record_avatar_score(uuid, text, jsonb) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.avatar_score_input(uuid, uuid), public.record_avatar_score(uuid, text, jsonb) to service_role;');
    expect(sql).toContain('grant execute on function public.share_avatar_run(uuid), public.confirm_avatar_run(uuid, text) to authenticated;');
    for (const name of ['avatar_score_input', 'record_avatar_score', 'share_avatar_run', 'confirm_avatar_run', 'avatar_score_hash']) expect(fn(name), name).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).not.toMatch(/grant (update|insert)[^;]*avatar_runs/);
  });
  it('says the shared and confirmed refusals in the words the screens show', () => {
    for (const t of ['That run is not yours', 'A practice run in the studio is never shared', 'Score the run before sharing it']) expect(fn('share_avatar_run')).toContain(sqlText(t));
    for (const t of ['Only their counsellor or an admin confirms a run', 'That run is not shared']) expect(fn('confirm_avatar_run')).toContain(sqlText(t));
    expect(fn('confirm_avatar_run')).toContain('private.can_accept(r.user_id)');
  });
});
