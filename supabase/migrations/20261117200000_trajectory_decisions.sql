-- Design v4 follow-up: "Talk first" on a trajectory start request or step needs a comment, and the learner sees it.
--
-- 1. public.trajectory_decisions: every decide_trajectory decision (approve or talk), with who, when and the comment,
--    as learning_decisions does for decide_learning. Read by the person and whoever reads their formal track
--    (private.can_view_track); no client writes it: only decide_trajectory inserts.
-- 2. decide_trajectory takes a comment: 'talk' needs 10 to 500 characters (trimmed), 'approve' takes an optional one
--    (at most 500). The limits are COMMENT_MIN and COMMENT_MAX in src/logic/record.ts (record.sync.test.ts).
--    Every other check is unchanged from 20261117170000_trajectories.sql.

create table public.trajectory_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- a trajectory with people on it is retired, not deleted; a deleted draft takes its log (of people who left) along
  trajectory_id text not null references public.trajectories (id) on delete cascade,
  -- null: the start request
  step_id text,
  decision text not null check (decision in ('approve', 'talk')),
  comment text check (comment is null or char_length(comment) between 10 and 500),
  decided_by uuid references public.profiles (id) on delete set null default auth.uid(),
  -- kept as it was, so the learner sees who decided even when they cannot read that person's profile
  decided_by_name text not null default '',
  decided_at timestamptz not null default now()
);
create index trajectory_decisions_user_trajectory_idx on public.trajectory_decisions (user_id, trajectory_id);
create index trajectory_decisions_trajectory_idx on public.trajectory_decisions (trajectory_id);
create index trajectory_decisions_decided_by_idx on public.trajectory_decisions (decided_by);
alter table public.trajectory_decisions enable row level security;
revoke all on public.trajectory_decisions from anon, authenticated;
grant select on public.trajectory_decisions to authenticated;
create policy "trajectory_decisions: read" on public.trajectory_decisions for select to authenticated
  using ((select private.can_view_track(user_id)));

-- p_step null: approve a start request ('talk' leaves it waiting, stamped). A step: approve marks a submitted step
-- done ('talk' sends it back to the learner). Accepting the exam adds the confirmed credential (D5). 'talk' needs a
-- comment of 10 to 500 characters; every decision is logged in trajectory_decisions.
-- Returns the new status or state, or 'talk'.
drop function public.decide_trajectory(uuid, text, text, text);
create function public.decide_trajectory(p_user uuid, p_trajectory text, p_step text, p_decision text, p_comment text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  c text := nullif(btrim(coalesce(p_comment, '')), '');
  t public.trajectories;
  r public.trajectory_enrolments;
  k text;
  result text;
begin
  if coalesce(p_decision, '') not in ('approve', 'talk') then
    raise exception 'A decision is approve or talk' using errcode = '22023';
  end if;
  if not coalesce(private.can_accept(p_user), false) then
    raise exception 'Only their counsellor or an admin can decide on this trajectory' using errcode = '42501';
  end if;
  if p_decision = 'talk' and char_length(coalesce(c, '')) < 10 then
    raise exception 'Say what to talk about (at least 10 characters)' using errcode = '22023';
  end if;
  if char_length(coalesce(c, '')) > 500 then
    raise exception 'Keep the comment to 500 characters' using errcode = '22023';
  end if;
  select * into r from public.trajectory_enrolments where user_id = p_user and trajectory_id = p_trajectory for update;
  if not found then
    raise exception 'This person is not on this trajectory' using errcode = 'P0002';
  end if;
  if p_step is null then
    if r.status <> 'requested' then
      raise exception 'No start request is waiting' using errcode = 'P0002';
    end if;
    update public.trajectory_enrolments
      set status = case when p_decision = 'approve' then 'enrolled' else status end,
          start_month = case when p_decision = 'approve' then private.current_month() else start_month end,
          decided_by = uid, decided_at = now()
      where user_id = p_user and trajectory_id = p_trajectory;
    result := case when p_decision = 'approve' then 'enrolled' else 'talk' end;
  else
    select * into t from public.trajectories where id = p_trajectory;
    k := (select s ->> 'k' from jsonb_array_elements(t.steps) s where s ->> 'id' = p_step);
    if r.status <> 'enrolled' or k is null or k not in ('evidence', 'check', 'exam')
       or (r.steps -> p_step ->> 'state') is distinct from 'submitted' then
      raise exception 'This step is not waiting for a decision' using errcode = 'P0002';
    end if;
    if p_decision = 'approve' and k = 'exam' and exists (
         select 1 from public.credentials where user_id = p_user and trajectory_id = t.id and status = 'confirmed'
           and (expires_on is null or expires_on >= current_date)) then
      raise exception 'This person already holds this credential' using errcode = '23505';
    end if;
    if p_decision = 'talk' then
      update public.trajectory_enrolments set steps = steps - p_step, decided_by = uid, decided_at = now()
        where user_id = p_user and trajectory_id = p_trajectory;
      result := 'talk';
    else
      update public.trajectory_enrolments
        set steps = jsonb_set(steps, array[p_step, 'state'], '"done"'::jsonb), decided_by = uid, decided_at = now()
        where user_id = p_user and trajectory_id = p_trajectory;
      if k = 'exam' then
        insert into public.credentials (user_id, name, issuer, earned_on, expires_on, link, ref, trajectory_id, status, confirmed_by, confirmed_at)
        values (p_user, t.credential, coalesce(nullif(t.issuer, ''), t.name), current_date,
                case when t.valid_months is not null then (current_date + make_interval(months => t.valid_months))::date end,
                r.steps -> p_step ->> 'link', r.steps -> p_step ->> 'ref', t.id, 'confirmed', uid, now());
      end if;
      result := 'done';
    end if;
  end if;
  insert into public.trajectory_decisions (user_id, trajectory_id, step_id, decision, comment, decided_by, decided_by_name)
  values (p_user, p_trajectory, p_step, p_decision, c, uid,
          coalesce((select coalesce(full_name, email) from public.profiles where id = uid), ''));
  return result;
end;
$$;
revoke execute on function public.decide_trajectory(uuid, text, text, text, text) from public, anon;
grant execute on function public.decide_trajectory(uuid, text, text, text, text) to authenticated;
