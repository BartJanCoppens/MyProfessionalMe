-- v0.7.0: the learning record (F2) and the approvals queue (F3).
--
-- 1. Evidence is text on the progress row: a reflection, a link and a certificate number. Files are linked (SharePoint,
--    OneDrive), never uploaded. What a format needs before it may be submitted is private.evidence_rule() (Q7, F2-a),
--    mirrored in src/logic/record.ts; change both together.
-- 2. Decisions go through public.decide_learning() only: accept, or request changes with a comment (the learning goes
--    back to in-progress and the learner resubmits). Every decision, and every podcast or reel that completes itself,
--    is kept in learning_decisions: who, when, verdict, comment and the evidence decided on.
-- 3. A General Admin may accept too (Q7), so reads every person's formal track: progress, evidence, decisions (F2-b).
--    Ambitions and interests stay private to the person (Q8).
-- 4. public.waiting_submissions(): what waits for the caller. Counsellees' submissions, and submissions of people
--    without a counsellor for whom the caller may accept (managing Domain Admins, General and System Admins).
-- Last activity is the person's latest own change to their progress (updated_at, now kept by the guard).

-- ---------- evidence on the progress row ----------

alter table public.learner_learnings
  add column submitted_at timestamptz,
  add column evidence_note text check (btrim(evidence_note) <> '' and char_length(evidence_note) <= 2000),
  add column evidence_link text check (char_length(evidence_link) <= 500 and evidence_link ~ '^https?://[^[:space:]]+$'),
  add column evidence_ref text check (btrim(evidence_ref) <> '' and char_length(evidence_ref) <= 80);
-- learnings submitted before this release wait since their last change
update public.learner_learnings set submitted_at = updated_at where state = 'submitted';
grant update (evidence_note, evidence_link, evidence_ref) on public.learner_learnings to authenticated;

-- What a format needs before it may be submitted: 'certificate' (a link or a certificate number), 'reflection'
-- (at least 140 characters) or 'none'. Podcasts and reels complete themselves (private.is_self_complete).
create function private.evidence_rule(p_format text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_format = 'Certification' then 'certificate'
    when p_format in ('Book', 'Website', 'Mentoring', 'Coaching', 'Game', 'Micro-guide', 'Case write-up') then 'reflection'
    else 'none'
  end;
$$;

create function private.evidence_ok(p_learning_id text, p_note text, p_link text, p_ref text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.evidence_rule((select format from public.learnings where id = p_learning_id))
    when 'certificate' then p_link is not null or p_ref is not null
    when 'reflection' then char_length(btrim(coalesce(p_note, ''))) >= 140
    else true
  end;
$$;

revoke execute on function private.evidence_rule(text), private.evidence_ok(text, text, text, text) from public, anon;
grant execute on function private.evidence_rule(text), private.evidence_ok(text, text, text, text) to authenticated;

-- ---------- who reads and who accepts ----------

-- The formal learning track: the person, their counsellor, admins who manage them, and General Admins.
create function private.can_view_track(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_learner(target) or private.is_general_admin();
$$;
revoke execute on function private.can_view_track(uuid) from public, anon;
grant execute on function private.can_view_track(uuid) to authenticated;

-- Accepting: the counsellor, a managing admin or a General Admin; never the person.
create or replace function private.can_accept(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target <> (select auth.uid()) and (
    private.can_manage_user(target)
    or private.is_general_admin()
    or exists (select 1 from public.profiles where id = target and counsellor_id = (select auth.uid()))
  );
$$;

drop policy "learner_learnings: read" on public.learner_learnings;
create policy "learner_learnings: read" on public.learner_learnings for select to authenticated
  using ((select private.can_view_track(user_id)));
-- avatar initials and colour, shown when a General Admin views someone (not private, unlike ambitions and interests)
drop policy "learner_prefs: read" on public.learner_prefs;
create policy "learner_prefs: read" on public.learner_prefs for select to authenticated
  using ((select private.can_view_track(user_id)));

-- Only the person writes their row; decisions go through public.decide_learning().
drop policy "learner_learnings: update" on public.learner_learnings;
create policy "learner_learnings: update" on public.learner_learnings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- decisions ----------

create table public.learning_decisions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  learning_id text not null,
  verdict text not null check (verdict in ('accepted', 'changes', 'self_completed')),
  comment text check (char_length(comment) <= 500),
  decided_by uuid references public.profiles (id) on delete set null,
  -- kept as it was, so the learner sees who decided even when they cannot read that person's profile
  decided_by_name text not null default '',
  decided_at timestamptz not null default now(),
  -- the evidence as it was when the decision was taken
  evidence jsonb not null default '{}'::jsonb
);
create index learning_decisions_user_learning_idx on public.learning_decisions (user_id, learning_id);
create index learning_decisions_decided_by_idx on public.learning_decisions (decided_by);
alter table public.learning_decisions enable row level security;
revoke all on public.learning_decisions from anon, authenticated;
grant select on public.learning_decisions to authenticated;
create policy "learning_decisions: read" on public.learning_decisions for select to authenticated
  using ((select private.can_view_track(user_id)));

-- Accept, or request changes with a comment (10 to 500 characters). Returns the new state.
create function public.decide_learning(p_user_id uuid, p_learning_id text, p_verdict text, p_comment text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c text := nullif(btrim(coalesce(p_comment, '')), '');
  r public.learner_learnings;
begin
  if coalesce(p_verdict, '') not in ('accepted', 'changes') then
    raise exception 'A decision is accepted or changes' using errcode = '22023';
  end if;
  if not coalesce(private.can_accept(p_user_id), false) then
    raise exception 'Only their counsellor or an admin can decide on this learning' using errcode = '42501';
  end if;
  if p_verdict = 'changes' and char_length(coalesce(c, '')) < 10 then
    raise exception 'Say what should change (at least 10 characters)' using errcode = '22023';
  end if;
  if char_length(coalesce(c, '')) > 500 then
    raise exception 'Keep the comment to 500 characters' using errcode = '22023';
  end if;
  update public.learner_learnings set state = case p_verdict when 'accepted' then 'accepted' else 'in-progress' end
    where user_id = p_user_id and learning_id = p_learning_id and state = 'submitted'
    returning * into r;
  if not found then
    raise exception 'This learning is no longer waiting for acceptance' using errcode = 'P0002';
  end if;
  insert into public.learning_decisions (user_id, learning_id, verdict, comment, decided_by, decided_by_name, evidence)
  values (p_user_id, p_learning_id, p_verdict, c, (select auth.uid()),
          coalesce((select coalesce(full_name, email) from public.profiles where id = (select auth.uid())), ''),
          jsonb_strip_nulls(jsonb_build_object('note', r.evidence_note, 'link', r.evidence_link, 'ref', r.evidence_ref, 'submitted_at', r.submitted_at)));
  return r.state;
end;
$$;
revoke execute on function public.decide_learning(uuid, text, text, text) from public, anon;
grant execute on function public.decide_learning(uuid, text, text, text) to authenticated;

-- ---------- guards ----------

-- The learner changes anything except acceptance (podcasts and reels complete themselves) and the evidence of an
-- accepted learning; the guard stamps submitted_at and updated_at. Anyone else only decides on a submitted learning.
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
    if old.state = 'accepted' and (new.evidence_note, new.evidence_link, new.evidence_ref) is distinct from (old.evidence_note, old.evidence_link, old.evidence_ref) then
      raise exception 'The evidence of an accepted learning stays as it was accepted' using errcode = '42501';
    end if;
    new.submitted_at := case when new.state = 'submitted' and old.state <> 'submitted' then now() else old.submitted_at end;
    new.updated_at := now();
    return new;
  end if;
  if old.state = 'submitted' and new.state in ('accepted', 'in-progress')
     and new.pct = old.pct and new.chosen = old.chosen
     and new.user_id = old.user_id and new.learning_id = old.learning_id
     and (new.evidence_note, new.evidence_link, new.evidence_ref, new.submitted_at, new.updated_at)
         is not distinct from (old.evidence_note, old.evidence_link, old.evidence_ref, old.submitted_at, old.updated_at) then
    return new;
  end if;
  raise exception 'Only a submitted learning can be decided on, and nothing else may change' using errcode = '42501';
end;
$$;

create function private.stamp_learning_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.submitted_at := case when new.state = 'submitted' then now() end;
  return new;
end;
$$;
revoke execute on function private.stamp_learning_insert() from public, anon, authenticated;
create trigger learner_learnings_stamp_insert
  before insert on public.learner_learnings
  for each row execute function private.stamp_learning_insert();

-- After the row is final (save_learning inserts or merges): the evidence rule holds whenever the learner submits or
-- changes the evidence of a submission, and a podcast or reel completing itself is recorded.
create function private.check_learning_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule text;
begin
  if (select auth.uid()) is null or (select auth.uid()) <> new.user_id then
    return null;
  end if;
  if new.state = 'submitted'
     and (tg_op = 'INSERT' or old.state <> 'submitted'
          or (new.evidence_note, new.evidence_link, new.evidence_ref) is distinct from (old.evidence_note, old.evidence_link, old.evidence_ref))
     and not private.evidence_ok(new.learning_id, new.evidence_note, new.evidence_link, new.evidence_ref) then
    rule := private.evidence_rule((select format from public.learnings where id = new.learning_id));
    raise exception '%', case rule when 'certificate' then 'This format needs a link to the certificate or its number'
                                   else 'This format needs a short reflection of at least 140 characters' end
      using errcode = '23514';
  end if;
  if new.state = 'accepted' and (tg_op = 'INSERT' or old.state <> 'accepted') then
    insert into public.learning_decisions (user_id, learning_id, verdict, decided_by, decided_by_name)
    values (new.user_id, new.learning_id, 'self_completed', new.user_id,
            coalesce((select coalesce(full_name, email) from public.profiles where id = new.user_id), ''));
  end if;
  return null;
end;
$$;
revoke execute on function private.check_learning_record() from public, anon, authenticated;
create trigger learner_learnings_check_record
  after insert or update on public.learner_learnings
  for each row execute function private.check_learning_record();

-- ---------- writing progress ----------

-- save_learning also takes the evidence: null leaves a field as it is, '' clears it.
drop function public.save_learning(text, text, smallint, boolean);
create function public.save_learning(p_learning_id text, p_state text default null, p_pct smallint default null, p_chosen boolean default null,
                                     p_note text default null, p_link text default null, p_ref text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.learner_learnings as l (user_id, learning_id, state, pct, chosen, evidence_note, evidence_link, evidence_ref)
  values ((select auth.uid()), p_learning_id, coalesce(p_state, 'not-started'), coalesce(p_pct, 0), coalesce(p_chosen, false),
          nullif(btrim(p_note), ''), nullif(btrim(p_link), ''), nullif(btrim(p_ref), ''))
  on conflict (user_id, learning_id) do update set
    state = coalesce(p_state, l.state),
    pct = coalesce(p_pct, l.pct),
    chosen = coalesce(p_chosen, l.chosen),
    evidence_note = case when p_note is null then l.evidence_note else nullif(btrim(p_note), '') end,
    evidence_link = case when p_link is null then l.evidence_link else nullif(btrim(p_link), '') end,
    evidence_ref = case when p_ref is null then l.evidence_ref else nullif(btrim(p_ref), '') end,
    updated_at = now();
$$;
revoke execute on function public.save_learning(text, text, smallint, boolean, text, text, text) from public, anon;
grant execute on function public.save_learning(text, text, smallint, boolean, text, text, text) to authenticated;

-- ---------- the approvals queue ----------

-- Submissions waiting for the caller, with each person's last activity. Runs under the caller's row-level security.
create function public.waiting_submissions()
returns table (user_id uuid, name text, business_line public.business_line, learning_id text, submitted_at timestamptz,
               evidence_note text, evidence_link text, evidence_ref text, last_activity timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.user_id, coalesce(p.full_name, p.email), p.business_line, l.learning_id, l.submitted_at,
         l.evidence_note, l.evidence_link, l.evidence_ref,
         (select max(x.updated_at) from public.learner_learnings x where x.user_id = l.user_id)
  from public.learner_learnings l
  join public.profiles p on p.id = l.user_id
  where l.state = 'submitted'
    and (p.counsellor_id = (select auth.uid()) or (p.counsellor_id is null and (select private.can_accept(l.user_id))))
  order by l.submitted_at nulls first, l.user_id, l.learning_id;
$$;
revoke execute on function public.waiting_submissions() from public, anon;
grant execute on function public.waiting_submissions() to authenticated;
