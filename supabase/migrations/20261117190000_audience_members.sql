-- Design v4 follow-ups, Task 2: industry (ind:) and technology (tec:) membership per person, so a mandatory trajectory map
-- on such an audience can bind people (docs/decisions.md, "Industry and technology membership").
--
-- 1. public.audience_members: one row per person and ind:/tec: audience. The person's counsellor, the person's Domain
--    Admins, General and System Admins set and remove it; the person never sets their own (unless they administer
--    themselves, as private.can_manage_user allows a System Admin). Rows are set or removed, never updated. The audience
--    catalogue lives in the app (AUDS in src/data.ts), as for curriculum_mappings: the database checks the format only.
--    No history beyond set_by and set_at (a PoC shortcut).
-- 2. private.trajectory_maps_ok: mandatory is allowed on business-line, ind: and tec: audiences; amb: and pro: only advise.
--    The rule only got looser, so the trajectories.maps check constraint holds for every existing row.
-- 3. private.in_mandatory_audience: a mandatory map binds a person at the map's stage when its audience is their business
--    line or one of their memberships.

-- ---------- membership ----------

create table public.audience_members (
  user_id uuid not null references public.profiles (id) on delete cascade,
  audience text not null check (audience ~ '^(ind|tec):[a-z]+$'),
  set_by uuid default auth.uid() references public.profiles (id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (user_id, audience)
);
create index audience_members_set_by_idx on public.audience_members (set_by);

alter table public.audience_members enable row level security;
revoke all on public.audience_members from anon, authenticated;
grant select, delete on public.audience_members to authenticated;
-- set_by and set_at come from their defaults only
grant insert (user_id, audience) on public.audience_members to authenticated;

-- The person, their counsellor, admins who manage them and General Admins (the formal track).
create policy "audience_members: read" on public.audience_members for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can_view_track(user_id)));
-- The counsellor, a managing admin or a General Admin (private.can_accept, never the person), or an admin of the person.
create policy "audience_members: counsellor or admin sets" on public.audience_members for insert to authenticated
  with check ((select private.can_manage_user(user_id)) or (select private.can_accept(user_id)));
create policy "audience_members: counsellor or admin removes" on public.audience_members for delete to authenticated
  using ((select private.can_manage_user(user_id)) or (select private.can_accept(user_id)));

-- ---------- what can be mandatory ----------

-- maps: [[audience, stage, 'mandatory'|'advised'], ...]. Audiences as in curriculum_mappings. A business-line, ind: or
-- tec: audience can be mandatory; amb: and pro: only advise (src/logic/trajectory.ts canBeMandatory mirrors this).
create or replace function private.trajectory_maps_ok(maps jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(maps) <> 'array' then false else not exists (
    select 1 from jsonb_array_elements(maps) m
    where not coalesce(
      jsonb_typeof(m) = 'array' and jsonb_array_length(m) = 3
      and jsonb_typeof(m -> 0) = 'string' and jsonb_typeof(m -> 1) = 'string' and jsonb_typeof(m -> 2) = 'string'
      and ((m ->> 0) in ('Consulting', 'Audit', 'Tax & Legal') or (m ->> 0) ~ '^(ind|tec|amb|pro):[a-z]+$')
      and (m ->> 1) = any (enum_range(null::public.career_stage)::text[])
      and (m ->> 2) in ('mandatory', 'advised')
      and ((m ->> 2) = 'advised' or (m ->> 0) in ('Consulting', 'Audit', 'Tax & Legal') or (m ->> 0) ~ '^(ind|tec):[a-z]+$'),
      false)
  ) end;
$$;

-- Inside a mandatory audience: a mandatory map at the person's career stage whose audience is their business line or one
-- of their memberships. The schema does not record when a person reached their stage.
create or replace function private.in_mandatory_audience(p_user uuid, maps jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_typeof(maps) = 'array' and exists (
    select 1 from public.profiles p, jsonb_array_elements(maps) m
    where p.id = p_user and m ->> 2 = 'mandatory' and m ->> 1 = p.career_stage::text
      and (m ->> 0 = p.business_line::text
           or exists (select 1 from public.audience_members a where a.user_id = p.id and a.audience = m ->> 0))
  );
$$;

-- create or replace keeps the grants; stated again so this file reads on its own.
revoke execute on function private.trajectory_maps_ok(jsonb) from public, anon;
grant execute on function private.trajectory_maps_ok(jsonb) to authenticated;
-- called only from the security definer trajectory functions
revoke execute on function private.in_mandatory_audience(uuid, jsonb) from public, anon, authenticated;
