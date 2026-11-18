-- Game runs, leaderboards and the learner panel (studios plan, Task 4.3). Client side: src/lib/gameStore.ts, src/fmtGame.ts.
--
-- game_runs   one row per play of a game: a learner's run on a published Game learning (test = false), or an author's or an assigned
--             reviewer's play-test on a contribution (test = true, never on a learning). A play-test never counts: the check
--             test = (contribution_id is not null) keeps it off learnings, and the leaderboard reads finished non-test runs only.
-- grants      authenticated may read own runs and insert (learning_id, contribution_id, test); user_id is the default auth.uid(). No
--             update or delete: a run is finished only through finish_game_run, the server clock sets the time, once per run.
-- score       0 to 1,000,000, accepted once per run; still reported by the game, so a leaderboard is a game, not a proof.
-- board       game_leaderboard (definer): the top 10 of finished non-test runs, each player's best (score, then fewer seconds), as
--             first name and initial (S11). 'My team only' = the people who share your counsellor, that counsellor and your own
--             counsellees (private.team_ids). Nobody reads another person's raw runs.

create table public.game_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  learning_id text references public.learnings (id) on delete cascade,
  contribution_id uuid references public.contributions (id) on delete cascade,
  test boolean not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  seconds integer,
  score integer,
  constraint game_runs_one_target check (num_nonnulls(learning_id, contribution_id) = 1),
  constraint game_runs_test_on_contribution check (test = (contribution_id is not null)),
  constraint game_runs_score_range check (finished_at is null or score between 0 and 1000000)
);
create index game_runs_board_idx on public.game_runs (learning_id) where not test and finished_at is not null;
create index game_runs_user_id_idx on public.game_runs (user_id);
create index game_runs_contribution_id_idx on public.game_runs (contribution_id) where contribution_id is not null;
alter table public.game_runs enable row level security;
revoke all on public.game_runs from anon, authenticated;
grant select on public.game_runs to authenticated;
grant insert (learning_id, contribution_id, test) on public.game_runs to authenticated;

-- A published learning that carries a game.
create function private.is_game_learning(p_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.learnings where id = p_id and status = 'published' and format = 'Game' and content ->> 'kind' = 'game');
$$;

-- The author of a Game contribution or one of its assigned reviewers may play-test it: the one rule, for a given person (the `ai` function's
-- game_role_context asks it for the run's owner) and for the signed-in one (the run policy).
create function private.can_test_game_as(p_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.contributions c where c.id = p_id and c.type = 'Game'
    and (c.author_id = p_user or exists (select 1 from public.contribution_reviews v where v.contribution_id = c.id and v.reviewer_id = p_user)));
$$;

create function private.can_test_game(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_test_game_as(p_id, (select auth.uid()));
$$;

create policy "game_runs: own read" on public.game_runs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "game_runs: start" on public.game_runs for insert to authenticated
  with check (user_id = (select auth.uid()) and (
    (not test and (select private.is_game_learning(learning_id)))
    or (test and (select private.can_test_game(contribution_id)))));

-- The characters JavaScript's trim() and \s treat as spaces: the one list, for trimmed (Slides, redefined here to read it) and
-- for first_and_initial. Postgres' own \s is a different set (no no-break or em space), so it is not used for names.
create function private.js_space()
returns text
language sql
immutable
set search_path = ''
as $$
  select E'\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
$$;

create or replace function private.trimmed(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(p_text, private.js_space());
$$;

-- "Jan Peeters" -> "Jan P."; an email address or a blank name -> "Player" (firstNameInitial in src/game/protocol.ts: trim, split
-- on runs of JavaScript whitespace, the first word and the last word's initial).
create function private.first_and_initial(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(private.trimmed(p_name), '') = '' or p_name like '%@%' then 'Player'
    when array_length(parts, 1) = 1 then parts[1]
    else parts[1] || ' ' || upper(left(parts[array_length(parts, 1)], 1)) || '.'
  end
  from (select regexp_split_to_array(private.trimmed(p_name), '[' || private.js_space() || ']+') as parts) s;
$$;

-- Yourself, the people who share your counsellor, that counsellor and your own counsellees.
create function private.team_ids(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p_user
  union select counsellor_id from public.profiles where id = p_user and counsellor_id is not null
  union select id from public.profiles where counsellor_id = p_user
  union select p.id from public.profiles p where p.counsellor_id is not null and p.counsellor_id = (select counsellor_id from public.profiles where id = p_user);
$$;

-- Finishes the caller's own unfinished run: the server clock and the score, once.
create function public.finish_game_run(p_run uuid, p_score integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.game_runs;
begin
  select * into v_run from public.game_runs where id = p_run for update;
  if not found or v_run.user_id is distinct from (select auth.uid()) then raise exception 'That run is not yours'; end if;
  if v_run.finished_at is not null then raise exception 'This run has finished'; end if;
  if p_score is null or p_score < 0 or p_score > 1000000 then raise exception 'The score must be a whole number from 0 to 1000000'; end if;
  update public.game_runs set finished_at = now(), score = p_score,
    seconds = least(86400, greatest(0, extract(epoch from now() - started_at)))::integer where id = p_run;
end;
$$;

-- The top 10 of a learning's finished, non-test runs, each player's best, by first name and initial.
create function public.game_leaderboard(p_learning text)
returns table (rank integer, name text, score integer, seconds integer)
language sql
stable
security definer
set search_path = ''
as $$
  with board as (
    select coalesce(l.content ->> 'leaderboard', 'Firm-wide') as scope
    from public.learnings l where l.id = p_learning and private.is_game_learning(l.id)
  ), best as (
    select distinct on (r.user_id) r.user_id, r.score, r.seconds
    from public.game_runs r, board b
    where r.learning_id = p_learning and not r.test and r.finished_at is not null and b.scope <> 'None'
      and (b.scope <> 'My team only' or r.user_id in (select private.team_ids((select auth.uid()))))
    order by r.user_id, r.score desc, r.seconds asc
  )
  select (row_number() over (order by best.score desc, best.seconds asc, best.user_id))::integer,
    private.first_and_initial(p.full_name), best.score, best.seconds
  from best join public.profiles p on p.id = best.user_id
  order by 1 limit 10;
$$;

revoke execute on function private.js_space() from authenticated;
revoke execute on function private.js_space(), private.is_game_learning(text), private.can_test_game(uuid), private.can_test_game_as(uuid, uuid), private.first_and_initial(text), private.team_ids(uuid),
  public.finish_game_run(uuid, integer), public.game_leaderboard(text) from public, anon;
grant execute on function private.is_game_learning(text), private.can_test_game(uuid), public.finish_game_run(uuid, integer), public.game_leaderboard(text) to authenticated;
