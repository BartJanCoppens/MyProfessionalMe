-- Security review fixes.
--
-- 1. Bootstrapping is one-shot: an email in private.bootstrap_admins only becomes System Admin
--    while no System Admin exists, and the row is consumed. Otherwise anyone able to create an
--    account with that email (for example after the original account was removed) would become
--    System Admin.
-- 2. A Domain Admin may not manage someone who is Domain Admin for a line the caller does not
--    administer; resetting that person's password would hand over their admin rights.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email));
  if exists (select 1 from private.bootstrap_admins where email = lower(new.email))
     and not exists (select 1 from public.user_roles where role = 'system_admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'system_admin');
  end if;
  delete from private.bootstrap_admins where email = lower(new.email);
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

-- The first System Admin exists, so the bootstrap list has done its job.
delete from private.bootstrap_admins
where email in (select p.email from public.profiles p join public.user_roles r on r.user_id = p.id where r.role = 'system_admin');

create or replace function private.can_manage_user(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_system_admin() or (
    -- the target's business line is one the caller administers
    exists (
      select 1
      from public.profiles p
      join public.user_roles r on r.business_line = p.business_line
      where p.id = target and r.user_id = (select auth.uid()) and r.role = 'domain_admin'
    )
    -- never a System Admin
    and not exists (
      select 1 from public.user_roles where user_id = target and role = 'system_admin'
    )
    -- never someone who administers a line the caller does not
    and not exists (
      select 1 from public.user_roles t
      where t.user_id = target and t.role = 'domain_admin'
        and not exists (
          select 1 from public.user_roles c
          where c.user_id = (select auth.uid()) and c.role = 'domain_admin' and c.business_line = t.business_line
        )
    )
  );
$$;
revoke execute on function private.can_manage_user(uuid) from public, anon;
grant execute on function private.can_manage_user(uuid) to authenticated;
