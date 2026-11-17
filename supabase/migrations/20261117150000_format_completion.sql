-- Design v4, task 2: completion and evidence for the seven new formats (owner decision D3).
--   Flash cards, Job aid, Practice exam, Teach-back: the learner marks them completed (self-completing, no counsellor).
--   Webinar: completes like Classroom, with the learner's feedback or the faculty's attendance register.
--   Case exercise: goes to the counsellor, with a link to the deliverable (evidence rule 'link').
--   Stretch assignment: goes to the counsellor, with a reflection of at least 140 characters.
-- learner_learnings.detail holds per-format progress (cards due, best exam score, ticks, ...). It is written through
-- save_learning (p_detail) by the owner only; the update policy stays owner-only and the counsellor/faculty guard
-- refuses any change to it. Mirrored in src/logic/record.ts (COMPLETION, LINK_FORMATS, REFLECTION_FORMATS);
-- src/logic/record.sync.test.ts reads this file's lists, so change both together.

alter table public.learner_learnings
  add column detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object');
grant update (detail) on public.learner_learnings to authenticated;

create or replace function private.is_self_complete(p_learning_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.learnings where id = p_learning_id and status = 'published'
                 and format in ('Podcast', 'Reel', 'E-learning', 'Avatar', 'Classroom', 'Flash cards', 'Job aid', 'Practice exam', 'Teach-back', 'Webinar'));
$$;

create or replace function private.completion_rule(p_format text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_format in ('Classroom', 'Webinar') then 'feedback' else 'none' end;
$$;

-- 'certificate' (a link or a number), 'link' (a link), 'reflection' (at least 140 characters) or 'none'.
create or replace function private.evidence_rule(p_format text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_format = 'Certification' then 'certificate'
    when p_format = 'Case exercise' then 'link'
    when p_format in ('Book', 'Website', 'Mentoring', 'Coaching', 'Game', 'Micro-guide', 'Case write-up', 'Stretch assignment') then 'reflection'
    else 'none'
  end;
$$;

create or replace function private.evidence_ok(p_learning_id text, p_note text, p_link text, p_ref text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.evidence_rule((select format from public.learnings where id = p_learning_id))
    when 'certificate' then p_link is not null or p_ref is not null
    when 'link' then p_link is not null
    when 'reflection' then char_length(btrim(coalesce(p_note, ''))) >= 140
    else true
  end;
$$;

-- Same body as before; the faculty (not the learner) may also register attendance and complete a webinar, and may not
-- change detail.
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
     and (new.evidence_note, new.evidence_link, new.evidence_ref, new.evidence_rating, new.submitted_at, new.updated_at, new.detail)
         is not distinct from (old.evidence_note, old.evidence_link, old.evidence_ref, old.evidence_rating, old.submitted_at, old.updated_at, old.detail) then
    if old.state = 'submitted' and new.state in ('accepted', 'in-progress') and new.pct = old.pct then
      return new;
    end if;
    if old.state <> 'accepted' and new.state = 'accepted' and new.pct = 100
       and private.can_register_attendance(old.user_id)
       and exists (select 1 from public.learnings where id = new.learning_id and format in ('Classroom', 'Webinar') and status = 'published') then
      return new;
    end if;
  end if;
  raise exception 'Only a submitted learning can be decided on, and nothing else may change' using errcode = '42501';
end;
$$;

-- Same body as before; the evidence message for a link, and the feedback message names webinars too.
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
                                   when 'link' then 'This format needs a link to your deliverable'
                                   else 'This format needs a short reflection of at least 140 characters' end
      using errcode = '23514';
  end if;
  if new.state = 'accepted' and (tg_op = 'INSERT' or old.state <> 'accepted') then
    if not private.completion_ok(new.learning_id, new.evidence_note, new.evidence_rating) then
      raise exception 'A classroom or webinar completes with your feedback: a rating from 1 to 5 and what you will apply (at least 40 characters)'
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

-- save_learning also takes the per-format detail: null leaves it as it is. Only the caller's own row is written.
drop function public.save_learning(text, text, smallint, boolean, text, text, text, smallint);
create function public.save_learning(p_learning_id text, p_state text default null, p_pct smallint default null, p_chosen boolean default null,
                                     p_note text default null, p_link text default null, p_ref text default null, p_rating smallint default null,
                                     p_detail jsonb default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.learner_learnings as l (user_id, learning_id, state, pct, chosen, evidence_note, evidence_link, evidence_ref, evidence_rating, detail)
  values ((select auth.uid()), p_learning_id, coalesce(p_state, 'not-started'), coalesce(p_pct, 0), coalesce(p_chosen, false),
          nullif(btrim(p_note), ''), nullif(btrim(p_link), ''), nullif(btrim(p_ref), ''), nullif(p_rating, 0), coalesce(p_detail, '{}'))
  on conflict (user_id, learning_id) do update set
    state = coalesce(p_state, l.state),
    pct = coalesce(p_pct, l.pct),
    chosen = coalesce(p_chosen, l.chosen),
    evidence_note = case when p_note is null then l.evidence_note else nullif(btrim(p_note), '') end,
    evidence_link = case when p_link is null then l.evidence_link else nullif(btrim(p_link), '') end,
    evidence_ref = case when p_ref is null then l.evidence_ref else nullif(btrim(p_ref), '') end,
    evidence_rating = case when p_rating is null then l.evidence_rating else nullif(p_rating, 0) end,
    detail = coalesce(p_detail, l.detail),
    updated_at = now();
$$;
revoke execute on function public.save_learning(text, text, smallint, boolean, text, text, text, smallint, jsonb) from public, anon;
grant execute on function public.save_learning(text, text, smallint, boolean, text, text, text, smallint, jsonb) to authenticated;

-- Attendance is registered for webinars too (same body, the format test widened).
create or replace function public.register_attendance(p_learning_id text, p_user_ids uuid[])
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
  if not exists (select 1 from public.learnings where id = p_learning_id and format in ('Classroom', 'Webinar') and status = 'published') then
    raise exception 'Attendance is registered for a published classroom or webinar learning only' using errcode = '22023';
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
