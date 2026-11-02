-- v0.7.2: completion per learning type (owner's rules, 2 Nov 2026).
--
-- Self-completing, no counsellor (private.is_self_complete):
--   Podcast and Reel: unchanged (80% listened, a right answer).
--   E-learning: the learner marks it completed.
--   Avatar: three right answers in the evaluation quiz after the practice session (checked in the app, trust-based like reels).
--   Classroom: the learner's feedback (a rating 1 to 5 and what they will apply, at least 40 characters), or the faculty
--              registers the person as attended through public.register_attendance().
-- Everything else (Certification, Book, Website, Mentoring, Game, Micro-guide, Case write-up, …) still goes to the
-- counsellor or an admin for acceptance with the evidence of private.evidence_rule(), as in v0.7.0.
-- The rules are mirrored in src/logic/record.ts (COMPLETION, FEEDBACK_MIN); src/logic/record.sync.test.ts reads this
-- file's lists, so change both together.
-- Submitting a self-completing format for acceptance is still possible at the database (rows submitted before this
-- release keep waiting for a decision); the app no longer offers it.

-- ---------- copy: the avatar learning that described the old completion ----------

-- Only when an admin has not rewritten it since the seed.
update public.learnings
   set why = 'A ten-minute spoken role-play with an AI avatar who reopens agreed scope. Up to three runs; the evaluation quiz after your practice session completes it.'
 where id = 'L38' and why = 'A ten-minute spoken role-play with an AI avatar who reopens agreed scope. Three runs; the best one counts once it reaches 4 of 5 on every skill.';

-- ---------- the classroom feedback: a rating next to the note ----------

alter table public.learner_learnings
  add column evidence_rating smallint check (evidence_rating between 1 and 5);
grant update (evidence_rating) on public.learner_learnings to authenticated;

-- ---------- what completes itself ----------

create or replace function private.is_self_complete(p_learning_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.learnings where id = p_learning_id and status = 'published'
                 and format in ('Podcast', 'Reel', 'E-learning', 'Avatar', 'Classroom'));
$$;

-- What a self-completing format needs on the row when the learner completes it: 'feedback' or 'none'.
create function private.completion_rule(p_format text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_format in ('Classroom') then 'feedback' else 'none' end;
$$;

create function private.completion_ok(p_learning_id text, p_note text, p_rating smallint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.completion_rule((select format from public.learnings where id = p_learning_id))
    when 'feedback' then coalesce(p_rating between 1 and 5, false) and char_length(btrim(coalesce(p_note, ''))) >= 40
    else true
  end;
$$;

revoke execute on function private.completion_rule(text), private.completion_ok(text, text, smallint) from public, anon;
grant execute on function private.completion_rule(text), private.completion_ok(text, text, smallint) to authenticated;

-- ---------- attendance: the faculty ----------

-- Faculty for a person: a Domain Admin who manages them, a General or a System Admin; never the person themselves.
create function private.can_register_attendance(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target <> (select auth.uid())
    and exists (select 1 from public.profiles where id = target)
    and (private.can_manage_user(target) or private.is_general_admin());
$$;
revoke execute on function private.can_register_attendance(uuid) from public, anon;
grant execute on function private.can_register_attendance(uuid) to authenticated;

alter table public.learning_decisions drop constraint learning_decisions_verdict_check;
alter table public.learning_decisions add constraint learning_decisions_verdict_check
  check (verdict in ('accepted', 'changes', 'self_completed', 'attended'));

-- ---------- guards ----------

-- The learner: anything except acceptance (self-completing formats excepted) and the evidence of an accepted learning.
-- Anyone else: decide on a submitted learning (decide_learning), or register a published classroom as attended
-- (register_attendance). Both run as security definer; the update policy stays owner-only.
create or replace function private.guard_learning_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if (select auth.uid()) = old.user_id then
    if (new.state = 'accepted') is distinct from (old.state = 'accepted')
       and not (new.state = 'accepted' and private.is_self_complete(new.learning_id)) then
      raise exception 'Only your counsellor or an admin can accept a learning' using errcode = '42501';
    end if;
    if old.state = 'accepted' and (new.evidence_note, new.evidence_link, new.evidence_ref, new.evidence_rating)
       is distinct from (old.evidence_note, old.evidence_link, old.evidence_ref, old.evidence_rating) then
      raise exception 'The evidence of an accepted learning stays as it was accepted' using errcode = '42501';
    end if;
    new.submitted_at := case when new.state = 'submitted' and old.state <> 'submitted' then now() else old.submitted_at end;
    new.updated_at := now();
    return new;
  end if;
  if new.chosen = old.chosen and new.user_id = old.user_id and new.learning_id = old.learning_id
     and (new.evidence_note, new.evidence_link, new.evidence_ref, new.evidence_rating, new.submitted_at, new.updated_at)
         is not distinct from (old.evidence_note, old.evidence_link, old.evidence_ref, old.evidence_rating, old.submitted_at, old.updated_at) then
    if old.state = 'submitted' and new.state in ('accepted', 'in-progress') and new.pct = old.pct then
      return new;
    end if;
    if old.state <> 'accepted' and new.state = 'accepted' and new.pct = 100
       and private.can_register_attendance(old.user_id)
       and exists (select 1 from public.learnings where id = new.learning_id and format = 'Classroom' and status = 'published') then
      return new;
    end if;
  end if;
  raise exception 'Only a submitted learning can be decided on, and nothing else may change' using errcode = '42501';
end;
$$;

-- After the row is final: the evidence rule holds whenever the learner submits; a learner completing a learning
-- themselves meets its completion rule (a classroom needs the feedback) and is recorded as self_completed, with the
-- feedback as the evidence.
create or replace function private.check_learning_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule text;
  fmt text := (select format from public.learnings where id = new.learning_id);
begin
  if (select auth.uid()) is null or (select auth.uid()) <> new.user_id then
    return null;
  end if;
  if new.state = 'submitted'
     and (tg_op = 'INSERT' or old.state <> 'submitted'
          or (new.evidence_note, new.evidence_link, new.evidence_ref) is distinct from (old.evidence_note, old.evidence_link, old.evidence_ref))
     and not private.evidence_ok(new.learning_id, new.evidence_note, new.evidence_link, new.evidence_ref) then
    rule := private.evidence_rule(fmt);
    raise exception '%', case rule when 'certificate' then 'This format needs a link to the certificate or its number'
                                   else 'This format needs a short reflection of at least 140 characters' end
      using errcode = '23514';
  end if;
  if new.state = 'accepted' and (tg_op = 'INSERT' or old.state <> 'accepted') then
    if not private.completion_ok(new.learning_id, new.evidence_note, new.evidence_rating) then
      raise exception 'A classroom completes with your feedback: a rating from 1 to 5 and what you will apply (at least 40 characters)'
        using errcode = '23514';
    end if;
    insert into public.learning_decisions (user_id, learning_id, verdict, decided_by, decided_by_name, evidence)
    values (new.user_id, new.learning_id, 'self_completed', new.user_id,
            coalesce((select coalesce(full_name, email) from public.profiles where id = new.user_id), ''),
            case when private.completion_rule(fmt) = 'feedback'
                 then jsonb_strip_nulls(jsonb_build_object('note', new.evidence_note, 'rating', new.evidence_rating)) else '{}'::jsonb end);
  end if;
  return null;
end;
$$;

-- ---------- writing progress ----------

-- save_learning also takes the classroom rating: null leaves it as it is, 0 clears it.
drop function public.save_learning(text, text, smallint, boolean, text, text, text);
create function public.save_learning(p_learning_id text, p_state text default null, p_pct smallint default null, p_chosen boolean default null,
                                     p_note text default null, p_link text default null, p_ref text default null, p_rating smallint default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.learner_learnings as l (user_id, learning_id, state, pct, chosen, evidence_note, evidence_link, evidence_ref, evidence_rating)
  values ((select auth.uid()), p_learning_id, coalesce(p_state, 'not-started'), coalesce(p_pct, 0), coalesce(p_chosen, false),
          nullif(btrim(p_note), ''), nullif(btrim(p_link), ''), nullif(btrim(p_ref), ''), nullif(p_rating, 0))
  on conflict (user_id, learning_id) do update set
    state = coalesce(p_state, l.state),
    pct = coalesce(p_pct, l.pct),
    chosen = coalesce(p_chosen, l.chosen),
    evidence_note = case when p_note is null then l.evidence_note else nullif(btrim(p_note), '') end,
    evidence_link = case when p_link is null then l.evidence_link else nullif(btrim(p_link), '') end,
    evidence_ref = case when p_ref is null then l.evidence_ref else nullif(btrim(p_ref), '') end,
    evidence_rating = case when p_rating is null then l.evidence_rating else nullif(p_rating, 0) end,
    updated_at = now();
$$;
revoke execute on function public.save_learning(text, text, smallint, boolean, text, text, text, smallint) from public, anon;
grant execute on function public.save_learning(text, text, smallint, boolean, text, text, text, smallint) to authenticated;

-- ---------- registering attendance ----------

-- The people the caller may register for this learning, with where each one stands.
create function public.attendance_roster(p_learning_id text)
returns table (user_id uuid, name text, business_line public.business_line, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(p.full_name, p.email), p.business_line, coalesce(l.state, 'not-started')
  from public.profiles p
  left join public.learner_learnings l on l.user_id = p.id and l.learning_id = p_learning_id
  where (select auth.uid()) is not null and private.can_register_attendance(p.id)
  order by lower(coalesce(p.full_name, p.email)), p.id;
$$;
revoke execute on function public.attendance_roster(text) from public, anon;
grant execute on function public.attendance_roster(text) to authenticated;

-- Registers these people as attended: accepted with the full hours, and an 'attended' decision by the caller.
-- All or nothing: refused when the learning is not a published classroom or when any person is not the caller's to
-- register. Someone already accepted stays as they are. Returns how many were newly registered.
create function public.register_attendance(p_learning_id text, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ids uuid[] := array(select distinct x from unnest(coalesce(p_user_ids, '{}'::uuid[])) x where x is not null);
  who uuid;
  c integer;
  n integer := 0;
  my_name text;
begin
  if me is null then
    raise exception 'Sign in to register attendance' using errcode = '42501';
  end if;
  if not exists (select 1 from public.learnings where id = p_learning_id and format = 'Classroom' and status = 'published') then
    raise exception 'Attendance is registered for a published classroom learning only' using errcode = '22023';
  end if;
  if cardinality(ids) > 500 then
    raise exception 'Register at most 500 people at a time' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(ids) x where not coalesce(private.can_register_attendance(x), false)) then
    raise exception 'You can register attendance only for people you manage as an admin' using errcode = '42501';
  end if;
  my_name := coalesce((select coalesce(full_name, email) from public.profiles where id = me), '');
  foreach who in array ids loop
    insert into public.learner_learnings as l (user_id, learning_id, state, pct)
    values (who, p_learning_id, 'accepted', 100)
    on conflict (user_id, learning_id) do update set state = 'accepted', pct = 100 where l.state <> 'accepted';
    get diagnostics c = row_count;
    if c > 0 then
      insert into public.learning_decisions (user_id, learning_id, verdict, decided_by, decided_by_name)
      values (who, p_learning_id, 'attended', me, my_name);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.register_attendance(text, uuid[]) from public, anon;
grant execute on function public.register_attendance(text, uuid[]) to authenticated;
