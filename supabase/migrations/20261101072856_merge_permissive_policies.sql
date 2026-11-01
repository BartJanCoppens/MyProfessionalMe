-- One permissive policy per table and action (the advisor's multiple_permissive_policies warning):
-- Postgres evaluates every permissive policy for each row, so they are merged with OR.

drop policy "profiles: read own or managed" on public.profiles;
drop policy "profiles: counsellor reads counsellees" on public.profiles;
drop policy "profiles: read own counsellor" on public.profiles;

-- Yourself, people you manage, your counsellees, and your own counsellor.
create policy "profiles: read" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.can_manage_user(id))
    or counsellor_id = (select auth.uid())
    or id = (select private.my_counsellor_id())
  );

drop policy "learner_learnings: owner updates" on public.learner_learnings;
drop policy "learner_learnings: counsellor or admin accepts" on public.learner_learnings;

-- The owner changes anything except acceptance; a counsellor or managing admin may only accept.
create policy "learner_learnings: update" on public.learner_learnings for update to authenticated
  using (user_id = (select auth.uid()) or (select private.can_accept(user_id)))
  with check (
    (user_id = (select auth.uid()) and state <> 'accepted')
    or ((select private.can_accept(user_id)) and state = 'accepted')
  );
