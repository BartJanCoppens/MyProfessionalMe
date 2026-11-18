-- Delete a trajectory that was never used (owner answers, 18 Nov 2026). An admin who made "New trajectory" by mistake could
-- not remove it from the editor. Rule: a trajectory can be deleted, in any status, only if nobody was EVER enrolled on it
-- (or asked to be: a past enrolment that was withdrawn counts) and no credential refers to it; once used it is only retired.
--
-- 1. trajectories.first_enrolled_at: the durable marker. Withdrawing deletes the enrolment row, so the rows alone lose the
--    history; the marker is stamped by a trigger on the first trajectory_enrolments insert (a request or an enrolment) and never
--    cleared. Clients cannot write it: insert and update on trajectories are now granted per column, without this one, so an
--    admin save cannot clear or set it. It is backfilled here from what remains: current enrolments, credentials and decisions
--    (a person who withdrew before this release, with no credential and no decision, cannot be recovered; docs/decisions.md).
-- 2. private.trajectory_in_use(id): the marker is set, or a credentials row refers to it (a renewal copies the trajectory, so
--    it counts too; a credential implies an enrolment, so this is belt and braces for backfilled data). Security definer: an
--    admin cannot read every person's rows, but the answer must not depend on who asks.
-- 3. "trajectories: admins remove" is replaced: the same write rule (private.can_write_trajectory) and not in use.
--    The foreign keys agree: enrolments restrict, credentials set null (never reached, since none exist).
-- 4. public.trajectories_in_use(): the ids of the trajectories the caller may write that are in use, so the editor hides
--    "Delete" on them. The database stays the judge: a delete of a used one is refused whatever the screen shows.
-- The editor holds no copy of the rule: it asks trajectories_in_use(), so the database is the one judge.
-- src/logic/trajectory.sync.test.ts reads this file.

alter table public.trajectories add column first_enrolled_at timestamptz;

update public.trajectories t set first_enrolled_at = coalesce(
  least(
    (select min(e.created_at) from public.trajectory_enrolments e where e.trajectory_id = t.id),
    (select min(d.decided_at) from public.trajectory_decisions d where d.trajectory_id = t.id)),
  now())
where exists (select 1 from public.trajectory_enrolments e where e.trajectory_id = t.id)
   or exists (select 1 from public.credentials c where c.trajectory_id = t.id)
   or exists (select 1 from public.trajectory_decisions d where d.trajectory_id = t.id);

create function private.stamp_first_enrolment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trajectories set first_enrolled_at = now() where id = new.trajectory_id and first_enrolled_at is null;
  return new;
end;
$$;
revoke execute on function private.stamp_first_enrolment() from public, anon, authenticated;
create trigger stamp_first_enrolment after insert on public.trajectory_enrolments
  for each row execute function private.stamp_first_enrolment();

-- Every column but the marker (the table-level insert and update grants of 20261117170000 are replaced).
revoke insert, update on public.trajectories from authenticated;
grant insert (id, name, issuer, credential, enrol, months, valid_months, renewal, cost, status, business_line, steps, maps, published_at, updated_at)
  on public.trajectories to authenticated;
grant update (id, name, issuer, credential, enrol, months, valid_months, renewal, cost, status, business_line, steps, maps, published_at, updated_at)
  on public.trajectories to authenticated;

create function private.trajectory_in_use(p_trajectory text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trajectories where id = p_trajectory and first_enrolled_at is not null)
      or exists (select 1 from public.credentials where trajectory_id = p_trajectory);
$$;

revoke execute on function private.trajectory_in_use(text) from public, anon;
grant execute on function private.trajectory_in_use(text) to authenticated;

drop policy "trajectories: admins remove" on public.trajectories;
create policy "trajectories: admins remove" on public.trajectories for delete to authenticated
  using ((select private.can_write_trajectory(business_line, status, maps)) and not (select private.trajectory_in_use(id)));

create function public.trajectories_in_use()
returns setof text
language sql
stable
set search_path = ''
as $$
  select t.id from public.trajectories t
  where private.can_write_trajectory(t.business_line, t.status, t.maps) and private.trajectory_in_use(t.id);
$$;

revoke execute on function public.trajectories_in_use() from public, anon;
grant execute on function public.trajectories_in_use() to authenticated;
