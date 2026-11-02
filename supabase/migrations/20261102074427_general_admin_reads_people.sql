-- A General Admin hands out creation rights (owner, 2 Nov 2026), so may list every person and their roles.
-- Reading only: private.can_manage_user() still excludes General Admins, so they change no profile or role.

drop policy "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.can_manage_user(id))
    or (select private.is_general_admin())
    or counsellor_id = (select auth.uid())
    or id = (select private.my_counsellor_id())
  );

drop policy "user_roles: read own or managed" on public.user_roles;
create policy "user_roles: read own or managed" on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can_manage_user(user_id)) or (select private.is_general_admin()));
