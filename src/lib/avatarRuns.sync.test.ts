// The avatar runs' database side (migration 20261118200000) and the `ai` function agree: the refusals of avatar_run_context are the ones avatarTurn.ts
// answers (with the same words in avatar_add_turns), the two functions are the service role's alone, the run's limits and the guard codes are the
// shared rules', and a practice run is a test that can neither be shared nor sit on a learning.
import { describe, expect, it } from 'vitest';
import { REFUSED } from '../../supabase/functions/ai/avatarTurn.ts';
import { GUARD_CODES, RUN_GRACE_MINUTES, RUN_MINUTES, RUN_TURNS } from '../../supabase/functions/_shared/avatarRules.ts';
import { migrationText } from '../test/migrations';

const sql = migrationText('20261118200000_avatar_runs.sql');
const fn = (name: string) => sql.slice(sql.indexOf('create function public.' + name), sql.indexOf('$$;', sql.indexOf('create function public.' + name)));

describe('avatar_run_context and the ai function', () => {
  it('give the same refusals, in the same words in avatar_add_turns', () => {
    const codes = [...fn('avatar_run_context').matchAll(/'refusal', (?:case when r\.test then '([a-z_]+)' else )?'([a-z_]+)'/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean);
    // prompt_changed is the edge's own, before counting: the database says the same words at the write
    expect([...new Set(codes)].sort()).toEqual(Object.keys(REFUSED).filter((c) => c !== 'prompt_changed').sort());
    const add = fn('avatar_add_turns');
    const sqlText = (error: string) => "'" + error.replace(/'/g, "''") + "'";
    expect(add).toContain(sqlText(REFUSED.prompt_changed.error));
    for (const [code, answer] of Object.entries(REFUSED).filter(([c]) => c !== 'prompt_changed')) {
      // the one message with a number is built from the context's `lines`
      expect(add, code).toContain(typeof answer === 'function' ? "'You used the ' || (v_ctx ->> 'lines') || ' lines of this run · end it to see your score'" : sqlText(answer.error));
    }
  });
  it('are for the service role only', () => {
    expect(sql).toContain('revoke execute on function public.avatar_run_context(uuid, uuid), public.avatar_add_turns(uuid, uuid, jsonb, text, text, integer) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.avatar_run_context(uuid, uuid), public.avatar_add_turns(uuid, uuid, jsonb, text, text, integer) to service_role;');
    for (const name of ['avatar_run_context', 'avatar_add_turns']) expect(fn(name)).toMatch(/security definer\s+set search_path = ''/);
  });
  it('count a run as the shared rules do: lines by minutes, and the minutes and five more', () => {
    const context = fn('avatar_run_context');
    for (const m of RUN_MINUTES) if (m !== 15) expect(context).toContain(`when ${m} then ${RUN_TURNS[m]}`);
    expect(context).toContain(`else ${RUN_TURNS[15]} end`);
    expect(context).toContain(`(v_minutes + ${RUN_GRACE_MINUTES}) * interval '1 minute'`);
  });
  it('take the guard codes the shared rules name', () => {
    expect([...fn('avatar_add_turns').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((c) => (GUARD_CODES as readonly string[]).includes(c))).toEqual([...GUARD_CODES]);
  });
  it('keep a practice run a test that is never shared and never on a learning, with no update or delete for a client', () => {
    expect(sql).toContain('check (test = (contribution_id is not null))');
    expect(sql).toContain('check (not (test and shared_at is not null))');
    expect(sql).toContain('grant insert (learning_id, contribution_id, test) on public.avatar_runs to authenticated;');
    expect(sql).not.toMatch(/grant (update|delete)[^;]*avatar_runs/);
  });
  it('reads a real run from the published contribution and a practice run only while its author or reviewer', () => {
    const context = fn('avatar_run_context'), lookup = sql.slice(sql.indexOf('create function private.avatar_run_contribution'), sql.indexOf('$$;', sql.indexOf('create function private.avatar_run_contribution')));
    expect(context).toContain('private.avatar_run_contribution(p_run, p_user)');
    expect(lookup).toContain("private.can_play_test_as(k.id, p_user, 'Avatar')");
    expect(lookup).toContain("k.status = 'published'");
    expect(context).toContain('r.user_id is distinct from p_user');
  });
});
