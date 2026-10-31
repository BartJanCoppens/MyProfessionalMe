-- Accounts and roles for MyProfessionalMe.
--
-- System Admin  : can do everything, and is the only role that grants roles.
-- Domain Admin  : one or more per business line; manages the users of that line
--                 (and, in the app, the library and curriculum mapping of that line).
--
-- Authorization data lives in public.user_roles, never in user_metadata.
-- Writes to auth users (create, delete, passwords) go through the manage-users edge function.

create type public.business_line as enum ('Consulting', 'Audit', 'Tax & Legal');
create type public.app_role as enum ('system_admin', 'domain_admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  business_line public.business_line,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);
create index profiles_business_line_idx on public.profiles (business_line);

create table public.user_roles (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  business_line public.business_line,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- a system admin is global; a domain admin is always scoped to one line
  constraint user_roles_scope check (
    (role = 'system_admin' and business_line is null)
    or (role = 'domain_admin' and business_line is not null)
  ),
  constraint user_roles_unique unique nulls not distinct (user_id, role, business_line)
);
create index user_roles_user_id_idx on public.user_roles (user_id);
create index user_roles_created_by_idx on public.user_roles (created_by);
create index user_roles_line_role_idx on public.user_roles (business_line, role);

-- ---------- private helpers (schema not exposed through the Data API) ----------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Emails that become System Admin the moment their auth user is created.
create table private.bootstrap_admins (email text primary key);
insert into private.bootstrap_admins (email) values ('bart.jan.coppens@intelli-select.com');

create function private.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'system_admin'
  );
$$;

-- True when the caller may manage the given business line. A null line is system-admin only.
create function private.can_manage_line(line public.business_line)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_system_admin() or exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'domain_admin' and business_line = line
  );
$$;

-- True when the caller may manage the given user: system admins manage everyone;
-- domain admins manage users of their line(s), except system admins.
create function private.can_manage_user(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_system_admin() or (
    exists (
      select 1
      from public.profiles p
      join public.user_roles r on r.business_line = p.business_line
      where p.id = target and r.user_id = (select auth.uid()) and r.role = 'domain_admin'
    )
    and not exists (
      select 1 from public.user_roles where user_id = target and role = 'system_admin'
    )
  );
$$;

revoke execute on function private.is_system_admin() from public, anon;
revoke execute on function private.can_manage_line(public.business_line) from public, anon;
revoke execute on function private.can_manage_user(uuid) from public, anon;
grant execute on function private.is_system_admin() to authenticated;
grant execute on function private.can_manage_line(public.business_line) to authenticated;
grant execute on function private.can_manage_user(uuid) to authenticated;

-- Every auth user gets a profile; bootstrap emails also become System Admin.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email));
  if exists (select 1 from private.bootstrap_admins where email = lower(new.email)) then
    insert into public.user_roles (user_id, role) values (new.id, 'system_admin');
  end if;
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Never remove the last System Admin (directly, or by deleting their account).
create function private.keep_one_system_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'system_admin' and not exists (
    select 1 from public.user_roles where role = 'system_admin' and id <> old.id
  ) then
    raise exception 'Cannot remove the last System Admin' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
revoke execute on function private.keep_one_system_admin() from public, anon, authenticated;

create trigger user_roles_keep_one_system_admin
  before delete on public.user_roles
  for each row execute function private.keep_one_system_admin();

-- ---------- row-level security ----------

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- New tables are not exposed to the Data API automatically; grant exactly what the app needs.
grant select on public.profiles to authenticated;
grant update (full_name, business_line) on public.profiles to authenticated;
grant select, insert, delete on public.user_roles to authenticated;

create policy "profiles: read own or managed"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select private.can_manage_user(id)));

-- Moving someone to another line requires managing both the old and the new line.
create policy "profiles: update managed"
  on public.profiles for update
  to authenticated
  using ((select private.can_manage_user(id)))
  with check ((select private.can_manage_line(business_line)));

create policy "user_roles: read own or managed"
  on public.user_roles for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.can_manage_user(user_id)));

create policy "user_roles: system admins grant"
  on public.user_roles for insert
  to authenticated
  with check ((select private.is_system_admin()));

create policy "user_roles: system admins revoke"
  on public.user_roles for delete
  to authenticated
  using ((select private.is_system_admin()));
