// The AI role's database side (migration 20261118140000): the refusals public.game_role_context gives are exactly the ones the `ai` function
// answers (gameRole.ts), the function is the service role's alone, and the role's knowledge is read there and from nowhere a client can reach.
import { describe, expect, it } from 'vitest';
import { GAME_ROLE_USE, REFUSED } from '../../supabase/functions/ai/gameRole.ts';
import { migrationText } from '../test/migrations';

const sql = migrationText('20261118140000_game_role.sql');

describe('game_role_context and the ai function', () => {
  it('give the same refusals', () => {
    const codes = [...sql.matchAll(/'refusal', '([a-z_]+)'/g)].map((m) => m[1]);
    expect([...new Set(codes)].sort()).toEqual(Object.keys(REFUSED).sort());
  });
  it('is for the service role only', () => {
    expect(sql).toContain('revoke execute on function public.game_role_context(uuid, uuid) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.game_role_context(uuid, uuid) to service_role;');
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
  });
  it('wants the caller\'s own, unfinished run, and for a play-test a current author or reviewer', () => {
    expect(sql).toContain('r.user_id is distinct from p_user');
    expect(sql).toContain('r.finished_at is not null');
    expect(sql).toMatch(/k\.author_id = p_user or exists \(select 1 from public\.contribution_reviews v where v\.contribution_id = k\.id and v\.reviewer_id = p_user\)/);
  });
  it('seeds the use the function counts under, at 60 a day', () => {
    expect(sql).toContain(`('${GAME_ROLE_USE}', 60, 'text'`);
    expect(sql).toMatch(/, 60\);/);
  });
});
