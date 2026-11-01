-- Per-user learner data, replacing the seeded persona.
--
-- Everyone writes only their own data. People who may view it: the person, admins who
-- manage them (private.can_manage_user) and their counsellor. Only a counsellor or a managing
-- admin (never the person themselves) may mark a learning accepted.

create type public.career_stage as enum ('Analyst', 'Consultant', 'Senior consultant', 'Manager', 'Senior manager');

alter table public.profiles
  add column career_stage public.career_stage,
  add column counsellor_id uuid references public.profiles (id) on delete set null,
  add constraint profiles_not_own_counsellor check (counsellor_id is null or counsellor_id <> id);
create index profiles_counsellor_id_idx on public.profiles (counsellor_id);

grant update (career_stage, counsellor_id) on public.profiles to authenticated;

-- ---------- helpers ----------

create function private.my_counsellor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select counsellor_id from public.profiles where id = (select auth.uid());
$$;

create function private.can_view_learner(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target = (select auth.uid())
    or private.can_manage_user(target)
    or exists (select 1 from public.profiles where id = target and counsellor_id = (select auth.uid()));
$$;

-- Accepting a learning: the person's counsellor or an admin who manages them, never the person.
create function private.can_accept(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target <> (select auth.uid()) and (
    private.can_manage_user(target)
    or exists (select 1 from public.profiles where id = target and counsellor_id = (select auth.uid()))
  );
$$;

revoke execute on function private.my_counsellor_id() from public, anon;
revoke execute on function private.can_view_learner(uuid) from public, anon;
revoke execute on function private.can_accept(uuid) from public, anon;
grant execute on function private.my_counsellor_id() to authenticated;
grant execute on function private.can_view_learner(uuid) to authenticated;
grant execute on function private.can_accept(uuid) to authenticated;

-- Counsellors see their counsellees; everyone sees their own counsellor's name.
create policy "profiles: counsellor reads counsellees"
  on public.profiles for select
  to authenticated
  using (counsellor_id = (select auth.uid()));

create policy "profiles: read own counsellor"
  on public.profiles for select
  to authenticated
  using (id = (select private.my_counsellor_id()));

-- ---------- tables ----------

create table public.learner_learnings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  learning_id text not null,
  state text not null default 'not-started' check (state in ('not-started', 'in-progress', 'submitted', 'accepted')),
  pct smallint not null default 0 check (pct between 0 and 100),
  chosen boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, learning_id)
);

create table public.ambitions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  text text not null,
  horizon text,
  domains text[] not null default '{}',
  source text,
  created_at timestamptz not null default now()
);
create index ambitions_user_id_idx on public.ambitions (user_id);

create table public.interests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  domain text not null,
  created_at timestamptz not null default now(),
  constraint interests_unique unique (user_id, label)
);

create table public.learner_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  avatar_initials text,
  avatar_color text
);

alter table public.learner_learnings enable row level security;
alter table public.ambitions enable row level security;
alter table public.interests enable row level security;
alter table public.learner_prefs enable row level security;

-- This project applies Supabase's default ALL grants; reset to the minimum.
revoke all on public.learner_learnings, public.ambitions, public.interests, public.learner_prefs from anon, authenticated;
grant select, insert, delete on public.learner_learnings, public.ambitions, public.interests, public.learner_prefs to authenticated;
grant update (state, pct, chosen, updated_at) on public.learner_learnings to authenticated;
grant update (avatar_initials, avatar_color) on public.learner_prefs to authenticated;

-- learner_learnings
create policy "learner_learnings: read" on public.learner_learnings for select to authenticated
  using ((select private.can_view_learner(user_id)));
create policy "learner_learnings: owner adds" on public.learner_learnings for insert to authenticated
  with check (user_id = (select auth.uid()) and state <> 'accepted');
create policy "learner_learnings: owner updates" on public.learner_learnings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and state <> 'accepted');
create policy "learner_learnings: counsellor or admin accepts" on public.learner_learnings for update to authenticated
  using ((select private.can_accept(user_id)))
  with check ((select private.can_accept(user_id)) and state = 'accepted');
create policy "learner_learnings: owner removes" on public.learner_learnings for delete to authenticated
  using (user_id = (select auth.uid()));

-- ambitions, interests, learner_prefs: read like progress, write only your own
create policy "ambitions: read" on public.ambitions for select to authenticated using ((select private.can_view_learner(user_id)));
create policy "ambitions: owner adds" on public.ambitions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "ambitions: owner removes" on public.ambitions for delete to authenticated using (user_id = (select auth.uid()));

create policy "interests: read" on public.interests for select to authenticated using ((select private.can_view_learner(user_id)));
create policy "interests: owner adds" on public.interests for insert to authenticated with check (user_id = (select auth.uid()));
create policy "interests: owner removes" on public.interests for delete to authenticated using (user_id = (select auth.uid()));

create policy "learner_prefs: read" on public.learner_prefs for select to authenticated using ((select private.can_view_learner(user_id)));
create policy "learner_prefs: owner adds" on public.learner_prefs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "learner_prefs: owner updates" on public.learner_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "learner_prefs: owner removes" on public.learner_prefs for delete to authenticated using (user_id = (select auth.uid()));
