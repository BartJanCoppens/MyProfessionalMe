-- Creation rights and review requirements as simple logical rules (owner, 2 Nov 2026).
--
-- A rule has four parts: business lines, formats, domains and audiences (ind:/tec: keys). Within a part the values
-- are OR; across the parts that are filled in, AND; an empty part means "any". "(Consulting OR Tax & Legal) AND
-- Podcast" is one rule {lines: [Consulting, Tax & Legal], formats: [Podcast]}. Several rules of a person are OR.
--
-- creator_rules   replace creator_grants (one topic per row). A Domain Admin may only grant rules whose lines part is
--                 filled and holds only lines they administer, to people they manage; System and General Admins any.
-- review_policies become rules with peers/expert/quality. Every policy that matches a contribution applies and the
--                 strictest wins (most peers, an expert if any asks, quality & risk if any asks); none: the full flow.
-- contributions   state their business line (always one of the three, default: the author's), format (= type),
--                 domain and optionally one audience, instead of a topic. These four lock after the first submission.
--                 An empty lines part therefore means "any of the three lines", never firm-wide. Publication re-checks
--                 the author's rules. A contribution without an audience counts as "could be any" for review
--                 requirements: audience-scoped requirements apply to it too (no dodging a stricter one).
-- Existing grants, policies and contributions are carried over; a contribution already in review keeps its route.

-- ---------- the match ----------

-- Does a rule (or policy) cover these attributes? Each filled part must contain the value; an empty part is "any".
-- A rule with audiences needs the contribution to have one of them; a rule without audiences takes any or none.
create function private.rule_matches(r_lines public.business_line[], r_formats text[], r_domains text[], r_audiences text[],
                                     p_line public.business_line, p_format text, p_domain text, p_audience text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (cardinality(r_lines) = 0 or coalesce(p_line = any(r_lines), false))
     and (cardinality(r_formats) = 0 or coalesce(p_format = any(r_formats), false))
     and (cardinality(r_domains) = 0 or coalesce(p_domain = any(r_domains), false))
     and (cardinality(r_audiences) = 0 or coalesce(p_audience = any(r_audiences), false));
$$;

-- The business lines the caller administers as Domain Admin.
create function private.my_admin_lines()
returns public.business_line[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(business_line), '{}') from public.user_roles where user_id = (select auth.uid()) and role = 'domain_admin';
$$;

-- ---------- creator_rules ----------

create table public.creator_rules (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  lines public.business_line[] not null default '{}',
  formats text[] not null default '{}' check (formats <@ array['Reel', 'Podcast', 'Micro-guide', 'Case write-up']),
  domains text[] not null default '{}' check (domains <@ array['tech', 'acad', 'pers', 'prof', 'ind', 'reg', 'corp', 'tec', 'lead']),
  audiences text[] not null default '{}' check (audiences <@ array['ind:energy', 'ind:health', 'ind:whole', 'ind:public', 'tec:data', 'tec:sap', 'tec:ai']),
  granted_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint creator_rules_not_empty check (cardinality(lines) + cardinality(formats) + cardinality(domains) + cardinality(audiences) > 0)
);
create index creator_rules_user_id_idx on public.creator_rules (user_id);
create index creator_rules_granted_by_idx on public.creator_rules (granted_by);

-- One grant becomes a rule with that single part filled.
insert into public.creator_rules (user_id, lines, formats, domains, audiences, granted_by, created_at)
select user_id,
       case when topic_kind = 'line' then array[topic_value::public.business_line] else '{}' end,
       case when topic_kind = 'format' then array[topic_value] else '{}' end,
       case when topic_kind = 'domain' then array[topic_value] else '{}' end,
       case when topic_kind = 'audience' then array[topic_value] else '{}' end,
       granted_by, created_at
from public.creator_grants;

-- System and General Admins: any rule to anyone. A Domain Admin: people they manage, and only rules limited to
-- lines they administer (never "any line").
create function private.can_grant_rule(target uuid, r_lines public.business_line[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_system_admin() or private.is_general_admin() or (
    private.can_manage_user(target) and cardinality(r_lines) > 0 and r_lines <@ private.my_admin_lines()
  );
$$;

-- Do someone's rules allow a contribution with these attributes? Some rule of theirs must match.
create function private.rules_allow(p_user uuid, p_line public.business_line, p_format text, p_domain text, p_audience text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.creator_rules r
    where r.user_id = p_user and private.rule_matches(r.lines, r.formats, r.domains, r.audiences, p_line, p_format, p_domain, p_audience)
  );
$$;

-- May the caller create a contribution with these attributes?
create function private.may_create(p_line public.business_line, p_format text, p_domain text, p_audience text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.rules_allow((select auth.uid()), p_line, p_format, p_domain, p_audience);
$$;

-- ---------- review_policies as rules ----------

-- Keep the topic policies aside, then rebuild the table (its index and constraint names are reused).
create temporary table review_policies_by_topic as select * from public.review_policies;
drop table public.review_policies;
create table public.review_policies (
  id bigint generated always as identity primary key,
  lines public.business_line[] not null default '{}',
  formats text[] not null default '{}' check (formats <@ array['Reel', 'Podcast', 'Micro-guide', 'Case write-up']),
  domains text[] not null default '{}' check (domains <@ array['tech', 'acad', 'pers', 'prof', 'ind', 'reg', 'corp', 'tec', 'lead']),
  audiences text[] not null default '{}' check (audiences <@ array['ind:energy', 'ind:health', 'ind:whole', 'ind:public', 'tec:data', 'tec:sap', 'tec:ai']),
  peers smallint not null default 2 check (peers between 0 and 2),
  expert boolean not null default true,
  quality boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint review_policies_not_empty check (cardinality(lines) + cardinality(formats) + cardinality(domains) + cardinality(audiences) > 0)
);
create index review_policies_updated_by_idx on public.review_policies (updated_by);

insert into public.review_policies (lines, formats, domains, audiences, peers, expert, quality, updated_by, updated_at)
select case when topic_kind = 'line' then array[topic_value::public.business_line] else '{}' end,
       case when topic_kind = 'format' then array[topic_value] else '{}' end,
       case when topic_kind = 'domain' then array[topic_value] else '{}' end,
       case when topic_kind = 'audience' then array[topic_value] else '{}' end,
       peers, expert, quality, updated_by, updated_at
from review_policies_by_topic;

create trigger review_policies_touch
  before insert or update on public.review_policies
  for each row execute function private.touch_review_policy();

-- Who may set a review requirement: System and General Admins any; a Domain Admin only one limited to their lines.
create function private.can_set_policy(r_lines public.business_line[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_system_admin() or private.is_general_admin() or (cardinality(r_lines) > 0 and r_lines <@ private.my_admin_lines());
$$;

-- The effective requirement: the strictest of every matching policy; none matches: 2 peers, expert, quality & risk.
-- Without an audience a contribution could be for any, so audience-scoped policies count as matching.
create function private.policy_for(p_line public.business_line, p_format text, p_domain text, p_audience text,
                                   out peers smallint, out expert boolean, out quality boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(p.peers), 2)::smallint, coalesce(bool_or(p.expert), true), coalesce(bool_or(p.quality), true)
  from public.review_policies p
  where private.rule_matches(p.lines, p.formats, p.domains, case when p_audience is null then '{}' else p.audiences end, p_line, p_format, p_domain, p_audience);
$$;

-- ---------- contributions: line, format, domain, audience instead of a topic ----------

drop policy "contributions: author adds" on public.contributions;
drop policy "contributions: author edits" on public.contributions;

alter table public.contributions
  add column business_line public.business_line,
  add column audience text check (audience is null or audience in ('ind:energy', 'ind:health', 'ind:whole', 'ind:public', 'tec:data', 'tec:sap', 'tec:ai'));
-- carry over: a line topic is the line, an audience topic the audience; otherwise the author's line. A contribution
-- whose author has no line (none exist on 2 Nov 2026) goes to Consulting, as a line is now required.
update public.contributions c set
  business_line = coalesce(case when c.topic_kind = 'line' then c.topic_value::public.business_line end,
                           (select p.business_line from public.profiles p where p.id = c.author_id), 'Consulting'),
  audience = case when c.topic_kind = 'audience' then c.topic_value end;
alter table public.contributions alter column business_line set not null;
alter table public.contributions drop constraint contributions_topic;
alter table public.contributions drop column topic_kind, drop column topic_value;

revoke insert, update on public.contributions from authenticated;
grant insert (business_line, audience, type, title, domain, level, audience_stage, takeaway, outline, sources, ai_assisted, bundle_ids)
  on public.contributions to authenticated;
grant update (business_line, audience, type, title, domain, level, audience_stage, takeaway, outline, sources, ai_assisted, bundle_ids)
  on public.contributions to authenticated;

create policy "contributions: author adds" on public.contributions for insert to authenticated
  with check (author_id = (select auth.uid()) and (select private.may_create(business_line, type, domain, audience)));
create policy "contributions: author edits" on public.contributions for update to authenticated
  using (author_id = (select auth.uid()) and status in ('draft', 'changes'))
  with check (author_id = (select auth.uid()) and status in ('draft', 'changes') and (select private.may_create(business_line, type, domain, audience)));

-- The line defaults to the author's; someone without a line must pick one.
create or replace function private.contribution_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.status := 'draft'; new.step := 0; new.learning_id := null; new.submitted_at := null; new.published_at := null;
  end if;
  new.author_name := coalesce(private.display_name(new.author_id), '');
  if new.business_line is null then
    new.business_line := (select business_line from public.profiles where id = new.author_id);
  end if;
  if new.business_line is null then
    raise exception 'Pick a business line for this contribution' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- As before, with line, format, domain and audience fixed after the first submission (they chose the requirement).
create or replace function private.guard_contribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.business_line := coalesce(new.business_line, old.business_line); -- never cleared
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.id <> old.id or new.author_id <> old.author_id or new.author_name <> old.author_name or new.created_at <> old.created_at then
    raise exception 'The author of a contribution cannot change' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and (old.status, new.status) not in
     (('draft', 'review'), ('draft', 'published'), ('review', 'changes'), ('review', 'published'), ('changes', 'review')) then
    raise exception 'A contribution cannot move from % to %', old.status, new.status using errcode = '42501';
  end if;
  if old.status in ('review', 'published')
     and (new.business_line, new.audience, new.type, new.title, new.domain, new.level, new.audience_stage, new.takeaway, new.outline, new.sources, new.ai_assisted, new.bundle_ids)
     is distinct from (old.business_line, old.audience, old.type, old.title, old.domain, old.level, old.audience_stage, old.takeaway, old.outline, old.sources, old.ai_assisted, old.bundle_ids) then
    raise exception 'Only a draft or a contribution with changes requested can be edited' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (new.business_line, new.type, new.domain, new.audience) is distinct from (old.business_line, old.type, old.domain, old.audience) then
    raise exception 'The business line, format, domain and audience are fixed once a contribution is submitted' using errcode = '42501';
  end if;
  if new.learning_id is distinct from old.learning_id and not (old.status <> 'published' and new.status = 'published') then
    raise exception 'The published learning of a contribution is fixed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Publication goes into the contribution's line, and only while the author's rules still allow what it states.
create or replace function private.publish_contribution(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contributions%rowtype;
  v_id text;
begin
  select * into c from public.contributions where id = p_id;
  if not private.rules_allow(c.author_id, c.business_line, c.type, c.domain, c.audience) then
    raise exception 'The author''s creation rules no longer allow this contribution, so it cannot be published' using errcode = '42501';
  end if;
  insert into public.learnings (title, domain, level, format, source, hours, cpd, due, why, business_line, status, created_by)
  values (btrim(c.title), c.domain, c.level, c.type, 'Peer contribution',
          case c.type when 'Reel' then 0.025 when 'Podcast' then 0.5 when 'Micro-guide' then 0.1 else 0.25 end,
          0, '', btrim(c.takeaway), c.business_line, 'published', c.author_id)
  returning id into v_id;
  update public.contributions set status = 'published', step = 4, learning_id = v_id, published_at = now() where id = p_id;
  return v_id;
end;
$$;

-- Submit (or resubmit after changes), as before; the creation rule and the effective (strictest) requirement come
-- from the contribution's line, format, domain and audience.
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
  v_expert boolean;
  v_quality boolean;
  v_term text;
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
  if not private.may_create(c.business_line, c.type, c.domain, c.audience) then
    raise exception 'Not allowed by your creation rules; ask an admin' using errcode = '42501';
  end if;
  if char_length(btrim(c.title)) not between 1 and 60 then
    raise exception 'The title needs 1 to 60 characters' using errcode = 'P0001';
  end if;
  if btrim(c.takeaway) = '' then
    raise exception 'Write the one takeaway first' using errcode = 'P0001';
  end if;
  v_term := private.blocked_term(c.title || ' ' || c.takeaway || ' ' || c.outline || ' ' || array_to_string(c.sources, ' '));
  if v_term is not null then
    raise exception '“%” looks like a client name · anonymise it', initcap(v_term) using errcode = 'P0001';
  end if;

  if c.status = 'changes' then
    v_first := (select min(step) from public.contribution_reviews where contribution_id = p_id);
    update public.contribution_reviews set verdict = case when step = v_first then 'pending' else 'waiting' end, rubric = '{}', decided_at = null
    where contribution_id = p_id;
    update public.contributions set status = 'review', step = v_first, submitted_at = now() where id = p_id;
    return 'review';
  end if;

  select f.peers, f.expert, f.quality into v_peers, v_expert, v_quality from private.policy_for(c.business_line, c.type, c.domain, c.audience) f;
  delete from public.contribution_reviews where contribution_id = p_id;

  if v_expert then
    v_pick := (select e.user_id from public.domain_experts e where e.domain = c.domain and e.user_id <> me);
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
      select x.id from private.peer_candidates(me) as x(id)
      where not exists (select 1 from public.contribution_reviews y where y.contribution_id = p_id and y.reviewer_id = x.id)
      order by private.review_load(x.id), random() limit v_peers
    loop
      n := n + 1;
      insert into public.contribution_reviews (contribution_id, step, slot, reviewer_id, reviewer_name)
      values (p_id, 1, n, v_pick, private.display_name(v_pick));
    end loop;
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

-- ---------- the old topic tables and helpers go ----------

drop table public.creator_grants;
drop table review_policies_by_topic;
drop function private.can_grant_creator(uuid, text, text);
drop function private.has_creator_grant(text, text);
drop function private.can_set_review_policy(text, text);

-- ---------- grants and policies ----------

revoke execute on function private.rule_matches(public.business_line[], text[], text[], text[], public.business_line, text, text, text) from public, anon, authenticated;
revoke execute on function private.policy_for(public.business_line, text, text, text), private.rules_allow(uuid, public.business_line, text, text, text) from public, anon, authenticated;
revoke execute on function private.my_admin_lines(), private.can_grant_rule(uuid, public.business_line[]), private.may_create(public.business_line, text, text, text),
  private.can_set_policy(public.business_line[]) from public, anon;
grant execute on function private.my_admin_lines(), private.can_grant_rule(uuid, public.business_line[]), private.may_create(public.business_line, text, text, text),
  private.can_set_policy(public.business_line[]) to authenticated;

alter table public.creator_rules enable row level security;
alter table public.review_policies enable row level security;
revoke all on public.creator_rules, public.review_policies from anon, authenticated;

grant select, delete on public.creator_rules to authenticated;
grant insert (user_id, lines, formats, domains, audiences) on public.creator_rules to authenticated;

grant select, delete on public.review_policies to authenticated;
grant insert (lines, formats, domains, audiences, peers, expert, quality) on public.review_policies to authenticated;
grant update (lines, formats, domains, audiences, peers, expert, quality) on public.review_policies to authenticated;

create policy "creator_rules: read" on public.creator_rules for select to authenticated
  using ((select private.can_see_grants(user_id)));
create policy "creator_rules: grant" on public.creator_rules for insert to authenticated
  with check ((select private.can_grant_rule(user_id, lines)));
create policy "creator_rules: revoke" on public.creator_rules for delete to authenticated
  using ((select private.can_grant_rule(user_id, lines)));

create policy "review_policies: read" on public.review_policies for select to authenticated using (true);
create policy "review_policies: add" on public.review_policies for insert to authenticated
  with check ((select private.can_set_policy(lines)));
create policy "review_policies: edit" on public.review_policies for update to authenticated
  using ((select private.can_set_policy(lines))) with check ((select private.can_set_policy(lines)));
create policy "review_policies: remove" on public.review_policies for delete to authenticated
  using ((select private.can_set_policy(lines)));
