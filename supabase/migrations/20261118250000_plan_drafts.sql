-- Trajectory AI, "Draft with AI" from a placeholder (studios plan, Task 7.5): the material of a placeholder step is drafted in the matching studio by
-- whoever may edit the trajectory, for that trajectory's business line, WITHOUT a creation rule of their own (owner, 18 Nov 2026). Review still applies.
--
-- contributions.for_trajectory / for_step   the placeholder a contribution was drafted for. Insert only (never grantable on update), so a draft cannot be
--                                           pointed at another placeholder afterwards. for_trajectory goes to null when the trajectory is deleted.
-- private.plan_draft_matches                the placeholder exists and is free (no cid, or the cid names this contribution or no contribution that still exists: one
--                                           grant draft per placeholder, nobody takes it over): a make step of that trajectory with that id and fmt = the contribution's format, the
--                                           contribution's line is the trajectory's (any line for a firm-wide trajectory), its domain is the step's `dom`
--                                           (default 'prof') and it names no audience. So the grant cannot pick a domain or audience that routes to a weaker review.
-- private.may_create (7 arguments)          extends the one helper: without for_trajectory the creation-rule check (4 arguments, unchanged); with it, a matching free
--                                           placeholder the caller may plan (private.can_plan_trajectory). The policies, check_contribution and submit_contribution call it.
--                                           A rule holder naming a placeholder needs the same: nobody names a placeholder they cannot plan or that is taken.
-- submit_contribution                       as before, except a contribution its author's creation rules do not allow (made under the placeholder grant) is always
--                                           routed through the full default review (2 peers, an expert, quality & risk), whatever review requirements say; a line with too few
--                                           peers says so in its own words (no requirement an admin could lower).
-- publish_contribution                      as before (20261117310000), except the author's creation rules may be replaced by a matching placeholder the author
--                                           can still plan (re-checked at publish with public.plan_trajectory_allowed, the one claim-switching function; a removed
--                                           editor's draft is not published under the grant).
-- link_made_steps / relink_trajectories    as before (20261118240000), except a make step links only to a contribution drafted for that very step
--                                           (for_trajectory = the trajectory, for_step = the step, type = the step's fmt), found without the step's cid, and a stale save
--                                           that sends a linked step back as a make step keeps the link.
-- Every other behaviour is unchanged for everyone else.

alter table public.contributions
  add column for_trajectory text references public.trajectories (id) on delete set null,
  add column for_step text constraint contributions_for_step_check check (for_step is null or char_length(for_step) between 1 and 40);
create index contributions_for_trajectory_idx on public.contributions (for_trajectory) where for_trajectory is not null;
grant insert (for_trajectory, for_step) on public.contributions to authenticated;

create function private.plan_draft_matches(p_trajectory text, p_step text, p_line public.business_line, p_format text, p_domain text, p_audience text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_trajectory is not null and p_step is not null and exists (
    select 1 from public.trajectories t, jsonb_array_elements(t.steps) s
    where t.id = p_trajectory and (t.business_line is null or t.business_line = p_line)
      and s ->> 'id' = p_step and s ->> 'k' = 'make' and s ->> 'fmt' = p_format
      and p_audience is null and p_domain = coalesce(s ->> 'dom', 'prof')
      and (not (s ? 'cid') or s ->> 'cid' = p_id::text
           or not exists (select 1 from public.contributions x where x.id::text = s ->> 'cid' and x.id <> p_id))
  ), false);
$$;

create function private.may_create(p_line public.business_line, p_format text, p_domain text, p_audience text, p_trajectory text, p_step text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_trajectory is null then private.may_create(p_line, p_format, p_domain, p_audience)
    else private.plan_draft_matches(p_trajectory, p_step, p_line, p_format, p_domain, p_audience, p_id) and coalesce(private.can_plan_trajectory(p_trajectory), false) end;
$$;

revoke execute on function private.plan_draft_matches(text, text, public.business_line, text, text, text, uuid), private.may_create(public.business_line, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function private.may_create(public.business_line, text, text, text, text, text, uuid) to authenticated;  -- the policies run as the caller; plan_draft_matches is only called by definers

drop policy "contributions: author adds" on public.contributions;
drop policy "contributions: author edits" on public.contributions;
create policy "contributions: author adds" on public.contributions for insert to authenticated
  with check (author_id = (select auth.uid()) and (select private.may_create(business_line, type, domain, audience, for_trajectory, for_step, id)));
create policy "contributions: author edits" on public.contributions for update to authenticated
  using (author_id = (select auth.uid()) and status in ('draft', 'changes'))
  with check (author_id = (select auth.uid()) and status in ('draft', 'changes') and (select private.may_create(business_line, type, domain, audience, for_trajectory, for_step, id)));

-- As before (20261117230000), with the placeholder grant.
create or replace function private.check_contribution(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.contributions%rowtype;
  v_problems text[];
begin
  select * into c from public.contributions where id = p_id for update;
  if not found or c.author_id is distinct from me then
    raise exception 'Contribution not found' using errcode = '42501';
  end if;
  if c.status not in ('draft', 'changes') then
    raise exception 'Only a draft or a contribution with changes requested can be checked' using errcode = 'P0001';
  end if;
  v_problems := case when private.may_create(c.business_line, c.type, c.domain, c.audience, c.for_trajectory, c.for_step, c.id) then '{}'::text[]
                     else array['Not allowed by your creation rules; ask an admin'] end || private.contribution_problems(c);
  update public.contributions set
    check_fingerprint = case when cardinality(v_problems) = 0 then private.contribution_fingerprint(c.items, c.title, c.type, c.shape) end,
    check_passed_at = case when cardinality(v_problems) = 0 then now() end
  where id = p_id;
  return v_problems;
end;
$$;

-- As before (20261117230000), with the placeholder grant.
create or replace function private.submit_contribution(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.contributions%rowtype;
  v_peers smallint;
  v_grant boolean;
  v_expert boolean;
  v_quality boolean;
  v_problems text[];
  v_pick uuid;
  v_first smallint;
  n integer := 0;
begin
  select * into c from public.contributions where id = p_id for update;
  if not found or c.author_id is distinct from me then
    raise exception 'Contribution not found' using errcode = '42501';
  end if;
  if c.status not in ('draft', 'changes') then
    raise exception 'Only a draft or a contribution with changes requested can be submitted' using errcode = 'P0001';
  end if;
  if not private.may_create(c.business_line, c.type, c.domain, c.audience, c.for_trajectory, c.for_step, c.id) then
    raise exception 'Not allowed by your creation rules; ask an admin' using errcode = '42501';
  end if;
  v_problems := private.contribution_problems(c);
  if cardinality(v_problems) > 0 then
    raise exception '%', v_problems[1] using errcode = 'P0001';
  end if;
  if c.studio is not null and c.check_passed_at is null then
    raise exception 'Run the automatic check first' using errcode = 'P0001';
  end if;
  if c.studio is not null and c.check_fingerprint is distinct from private.contribution_fingerprint(c.items, c.title, c.type, c.shape) then
    raise exception 'The content changed after the automatic check; run it again' using errcode = 'P0001';
  end if;

  if c.status = 'changes' then
    v_first := (select min(step) from public.contribution_reviews where contribution_id = p_id);
    update public.contribution_reviews set verdict = case when step = v_first then 'pending' else 'waiting' end, rubric = '{}', decided_at = null
    where contribution_id = p_id;
    update public.contributions set status = 'review', step = v_first, submitted_at = now() where id = p_id;
    return 'review';
  end if;

  v_grant := not private.rules_allow(me, c.business_line, c.type, c.domain, c.audience);
  if not v_grant then
    select f.peers, f.expert, f.quality into v_peers, v_expert, v_quality from private.policy_for(c.business_line, c.type, c.domain, c.audience) f;
  else
    v_peers := 2; v_expert := true; v_quality := true;  -- made under the placeholder grant: always the full default review
  end if;
  delete from public.contribution_reviews where contribution_id = p_id;

  if v_expert then
    v_pick := private.pick_expert(c.domain, me, p_id);
    if v_pick is null then v_pick := private.pick_reviewer('system_admin', me, p_id); end if;
    if v_pick is null then
      raise exception 'No subject-matter expert or System Admin can review this. It stays a draft.' using errcode = 'P0001';
    end if;
    insert into public.contribution_reviews (contribution_id, step, slot, reviewer_id, reviewer_name)
    values (p_id, 2, 1, v_pick, private.display_name(v_pick));
  end if;

  if v_quality then
    v_pick := private.pick_reviewer('general_admin', me, p_id);
    if v_pick is null then v_pick := private.pick_reviewer('system_admin', me, p_id); end if;
    if v_pick is null then
      raise exception 'No General or System Admin can do the quality & risk review. It stays a draft.' using errcode = 'P0001';
    end if;
    insert into public.contribution_reviews (contribution_id, step, slot, reviewer_id, reviewer_name)
    values (p_id, 3, 1, v_pick, private.display_name(v_pick));
  end if;

  if v_peers > 0 then
    for v_pick in
      select x.id from private.peer_candidates(me, c.business_line) as x(id)
      where not exists (select 1 from public.contribution_reviews y where y.contribution_id = p_id and y.reviewer_id = x.id)
      order by private.review_load(x.id), random() limit v_peers
    loop
      n := n + 1;
      insert into public.contribution_reviews (contribution_id, step, slot, reviewer_id, reviewer_name)
      values (p_id, 1, n, v_pick, private.display_name(v_pick));
    end loop;
    if n < v_peers and v_grant then
      raise exception 'Drafts made from a trajectory need % peer reviewers in your business line and only % can review it. It stays a draft: ask an admin to add reviewers, or get a creation rule.', v_peers, n
        using errcode = 'P0001';
    end if;
    if n < v_peers then
      raise exception 'Only % colleague(s) in your business line can peer-review this (the expert and quality reviewers do not count); the review requirement needs %. It stays a draft: ask an admin to lower the peer requirement.', n, v_peers
        using errcode = 'P0001';
    end if;
  end if;

  v_first := (select min(step) from public.contribution_reviews where contribution_id = p_id);
  if v_first is null then
    perform private.publish_contribution(p_id);
    return 'published';
  end if;
  update public.contribution_reviews set verdict = 'pending' where contribution_id = p_id and step = v_first;
  update public.contributions set status = 'review', step = v_first, submitted_at = now() where id = p_id;
  return 'review';
end;
$$;

-- As before (20261117310000), with the placeholder grant.
create or replace function private.publish_contribution(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contributions%rowtype;
  v_id text;
  v_content jsonb;
begin
  select * into c from public.contributions where id = p_id;
  if not (private.rules_allow(c.author_id, c.business_line, c.type, c.domain, c.audience) or (private.plan_draft_matches(c.for_trajectory, c.for_step, c.business_line, c.type, c.domain, c.audience, c.id) and public.plan_trajectory_allowed(c.author_id, c.for_trajectory))) then
    raise exception 'The author''s creation rules no longer allow this contribution, and it is not the material of a placeholder its author can still plan, so it cannot be published' using errcode = '42501';
  end if;
  if private.carries_items(c.type, c.studio) then
    if not private.items_ok(c.type, c.items) then
      raise exception 'This contribution has no usable items, so it cannot be published' using errcode = 'P0001';
    end if;
    v_content := private.contribution_content(c.type, c.items, c.shape);
  end if;
  insert into public.learnings (title, domain, level, format, source, hours, cpd, due, why, business_line, status, created_by, content, ai_made)
  values (btrim(c.title), c.domain, c.level, c.type, 'Peer contribution',
          case c.type when 'Reel' then 0.025
                      when 'Podcast' then case when c.studio is not null then private.media_hours((v_content ->> 'seconds')::numeric) else 0.5 end
                      when 'Micro-guide' then 0.1 when 'Practice exam' then 0.5
                      when 'Case exercise' then private.case_hours(c.shape) when 'Animated flow' then 0.025
                      when 'Presentation' then private.media_hours((v_content ->> 'seconds')::numeric)
                      when 'Slides' then private.media_hours((v_content ->> 'seconds')::numeric) else 0.25 end,
          0, '', btrim(c.takeaway), c.business_line, 'published', c.author_id, v_content,
          c.ai_assisted or coalesce(v_content ->> 'made', '') = 'ai')
  returning id into v_id;
  update public.contributions set status = 'published', step = 4, learning_id = v_id, published_at = now() where id = p_id;
  return v_id;
end;
$$;

-- As before (20261118240000), linking only what was drafted for the step, found by the contribution's own for_trajectory / for_step / type (the
-- step's cid is only the "taken" marker, so a stale save that lost it cannot stop the link). A make step sent for a step that is already linked (a stale
-- save from an editor opened before the link) keeps the stored learn step: the link is never undone and its linked_at never restamped.
create or replace function private.link_made_steps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' and jsonb_typeof(old.steps) = 'array' then prev := old.steps; end if;
  if jsonb_typeof(new.steps) = 'array' and exists (select 1 from jsonb_array_elements(new.steps) s where s ->> 'k' = 'make') then
    new.steps := (
      select coalesce(jsonb_agg(
        coalesce(kept.v, case when l.learning_id is null then s.v
          else (s.v - 'cid' - 'fmt' - 'title' - 'hours' - 'dom') || jsonb_build_object('k', 'learn', 'lid', l.learning_id, 'linked_at', to_jsonb(now())) end)
        order by s.ord), '[]'::jsonb)
      from jsonb_array_elements(new.steps) with ordinality s(v, ord)
      left join lateral (
        select o.v from jsonb_array_elements(prev) o(v)
        where s.v ->> 'k' = 'make' and o.v ->> 'id' = s.v ->> 'id' and o.v ->> 'k' = 'learn' and o.v ? 'linked_at' limit 1
      ) kept on true
      left join lateral (
        select c.learning_id from public.contributions c
        where s.v ->> 'k' = 'make' and c.status = 'published' and c.learning_id is not null
          and c.for_trajectory = new.id and c.for_step = s.v ->> 'id' and c.type = s.v ->> 'fmt'
        order by c.published_at limit 1
      ) l on true
    );
  end if;
  return new;
end;
$$;

-- Touches the trajectory the contribution was drafted for, so the trigger above runs (by for_trajectory, not by a cid that a stale save may have lost).
create or replace function private.relink_trajectories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trajectories set steps = steps where id = new.for_trajectory;
  return null;
end;
$$;
