-- Delete a trajectory that was never used (owner answer, 18 Nov 2026). An admin who made "New trajectory" by mistake could
-- not remove it from the editor. Rule: a trajectory can be deleted, in any status, while nobody is enrolled (or has asked)
-- and no credential refers to it; once used it is only retired.
--
-- 1. private.trajectory_in_use(id): a trajectory_enrolments row (requested or enrolled) or a credentials row (a renewal
--    copies the trajectory, so it counts too) refers to it. Security definer: an admin cannot read every person's rows,
--    but the answer must not depend on who asks. trajectory_decisions rows do not count: they only exist for people who were
--    enrolled or asked, and the log of people who left is deleted with an unused draft (on delete cascade, by design).
-- 2. "trajectories: admins remove" is replaced: the same write rule (private.can_write_trajectory) and not in use.
--    The foreign keys agree: enrolments restrict, credentials set null (never reached, since none exist).
-- 3. public.trajectories_in_use(): the ids of the trajectories the caller can see that are in use, so the editor hides
--    "Delete" on them. The database stays the judge: a delete of a used one is refused whatever the screen shows.
-- The editor holds no copy of the rule: it asks trajectories_in_use(), so the database is the one judge.
-- src/logic/trajectory.sync.test.ts reads this file.

create function private.trajectory_in_use(p_trajectory text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trajectory_enrolments where trajectory_id = p_trajectory)
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
  select t.id from public.trajectories t where private.trajectory_in_use(t.id);
$$;

revoke execute on function public.trajectories_in_use() from public, anon;
grant execute on function public.trajectories_in_use() to authenticated;
