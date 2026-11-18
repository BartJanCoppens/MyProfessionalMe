-- Trajectory AI, Apply (studios plan, Task 7.4): a plan module that has no material yet becomes a placeholder step (k 'make'), and the step
-- links to its material once that is published.
--
-- trajectory_steps_ok         redefined (create or replace; the check constraint keeps calling it): kind 'make' joins the list. A make step
--                             needs a title of 1 to 120 characters and a fmt; its cid (the contribution drafted for it) is absent or a
--                             lower-case uuid string.
-- link_made_steps (trigger)   before insert or update of steps on trajectories: a make step whose cid names a contribution that is published
--                             with a learning becomes {k: 'learn', lid, linked_at: now()}, keeping id, win, req, pre and from. So a stale save
--                             from an open editor that still sends the make step is converted again: no client write can undo the link.
-- relink_trajectories         after the contribution gets its learning: touches the trajectories that hold its cid, so the trigger above runs.
-- link_made_steps keeps the first linked_at when a stale save sends the make step again (taken from the stored step with that id).
-- linked_at                   when the material was linked. A step that was optional-by-being-made becomes required only for people who enrol
--                             AFTER that moment; for an enrolment begun before it the step counts as optional (src/logic/trajectory.ts,
--                             isRequired). The database stores the moment; no SQL rule reads req (the credential comes with the accepted exam).
-- submit_trajectory_step and decide_trajectory already refuse any step kind but evidence, check and exam, so a make step cannot be submitted.

-- private.is_uuid: the one lower-case uuid text test of the Trajectory AI migrations (a cid, a step's link). Called by the check constraint as the writer.
create function private.is_uuid(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
$$;
revoke execute on function private.is_uuid(text) from public, anon;
grant execute on function private.is_uuid(text) to authenticated;

create or replace function private.trajectory_steps_ok(steps jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(steps) <> 'array' then false else
    not exists (
      select 1 from jsonb_array_elements(steps) s
      where not coalesce(
        jsonb_typeof(s) = 'object' and jsonb_typeof(s -> 'id') = 'string' and btrim(s ->> 'id') <> ''
        and (s ->> 'k') in ('learn', 'elect', 'evidence', 'check', 'exam', 'make')
        and ((s ->> 'k') <> 'make' or (
          jsonb_typeof(s -> 'title') = 'string' and char_length(s ->> 'title') between 1 and 120
          and jsonb_typeof(s -> 'fmt') = 'string'
          and (not (s ? 'cid') or (jsonb_typeof(s -> 'cid') = 'string'
            and private.is_uuid(s ->> 'cid'))))),
        false)
    )
    and (select count(distinct s ->> 'id') = count(*) from jsonb_array_elements(steps) s)
  end;
$$;

create function private.link_made_steps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' and jsonb_typeof(old.steps) = 'array' then prev := old.steps; end if;
  if jsonb_typeof(new.steps) = 'array' and exists (select 1 from jsonb_array_elements(new.steps) s where s ->> 'k' = 'make' and s ? 'cid') then
    new.steps := (
      select coalesce(jsonb_agg(
        case when l.learning_id is null then s.v
          else (s.v - 'cid' - 'fmt' - 'title' - 'hours') || jsonb_build_object('k', 'learn', 'lid', l.learning_id, 'linked_at', to_jsonb(coalesce(l.was, now()))) end
        order by s.ord), '[]'::jsonb)
      from jsonb_array_elements(new.steps) with ordinality s(v, ord)
      left join lateral (
        select c.learning_id, (select (o ->> 'linked_at')::timestamptz from jsonb_array_elements(prev) o where o ->> 'id' = s.v ->> 'id' and o ->> 'k' = 'learn' limit 1) as was
        from public.contributions c
        where s.v ->> 'k' = 'make' and c.status = 'published' and c.learning_id is not null
          and c.id = case when private.is_uuid(s.v ->> 'cid') then (s.v ->> 'cid')::uuid end
      ) l on true
    );
  end if;
  return new;
end;
$$;
create trigger link_made_steps before insert or update of steps on public.trajectories
  for each row execute function private.link_made_steps();

create function private.relink_trajectories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trajectories set steps = steps
  where steps @> jsonb_build_array(jsonb_build_object('cid', new.id::text));
  return null;
end;
$$;
create trigger relink_trajectories after update of learning_id on public.contributions
  for each row when (new.learning_id is not null and old.learning_id is distinct from new.learning_id)
  execute function private.relink_trajectories();

revoke execute on function private.link_made_steps(), private.relink_trajectories() from public, anon, authenticated;
