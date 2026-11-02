-- Create & share with peer review (F12, with the owner's change of 2 Nov 2026).
--
-- Topics. A topic is a business line ('line'), an industry or technology audience ('audience', e.g. ind:energy),
-- a contribution format ('format': Reel, Podcast, Micro-guide, Case write-up) or a learning domain ('domain').
--
-- creator_grants   (user, topic): who may create for what. System and General Admins grant anyone any topic;
--                  a Domain Admin grants people they manage, and line topics only for their own lines.
-- review_policies  (topic): how many peers (0..2), whether an expert and quality & risk review it.
--                  No row: the full flow (2 peers, expert, quality & risk). Domain Admins set their own lines only.
-- domain_experts   (domain → user): the subject-matter expert per domain, kept by System Admins.
-- contributions    a piece of content: draft → review → (changes → review)* → published.
-- contribution_reviews  one row per reviewer and step (1 peer, 2 expert, 3 quality & risk);
--                  verdict waiting → pending → approved | changes (→ pending on resubmit).
--
-- Clients never write status, step, verdicts or the published learning: those change only inside
-- private.submit_contribution / private.review_contribution / private.publish_contribution (security definer),
-- reached through public.submit_contribution and public.review_contribution. The guard triggers check that every
-- transition has an allowed shape. Names are copied at assignment because members cannot read each other's profiles.

-- ---------- tables ----------

create table public.creator_grants (
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic_kind text not null check (topic_kind in ('line', 'audience', 'format', 'domain')),
  topic_value text not null,
  granted_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (user_id, topic_kind, topic_value),
  constraint creator_grants_topic check (case topic_kind
    when 'line' then topic_value in ('Consulting', 'Audit', 'Tax & Legal')
    when 'audience' then topic_value ~ '^(ind|tec):[a-z]+$'
    when 'format' then topic_value in ('Reel', 'Podcast', 'Micro-guide', 'Case write-up')
    when 'domain' then topic_value in ('tech', 'acad', 'pers', 'prof', 'ind', 'reg', 'corp', 'tec', 'lead')
    else false end)
);
create index creator_grants_granted_by_idx on public.creator_grants (granted_by);

create table public.review_policies (
  topic_kind text not null check (topic_kind in ('line', 'audience', 'format', 'domain')),
  topic_value text not null,
  peers smallint not null default 2 check (peers between 0 and 2),
  expert boolean not null default true,
  quality boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (topic_kind, topic_value),
  constraint review_policies_topic check (case topic_kind
    when 'line' then topic_value in ('Consulting', 'Audit', 'Tax & Legal')
    when 'audience' then topic_value ~ '^(ind|tec):[a-z]+$'
    when 'format' then topic_value in ('Reel', 'Podcast', 'Micro-guide', 'Case write-up')
    when 'domain' then topic_value in ('tech', 'acad', 'pers', 'prof', 'ind', 'reg', 'corp', 'tec', 'lead')
    else false end)
);
create index review_policies_updated_by_idx on public.review_policies (updated_by);

create table public.domain_experts (
  domain text primary key check (domain in ('tech', 'acad', 'pers', 'prof', 'ind', 'reg', 'corp', 'tec', 'lead')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index domain_experts_user_id_idx on public.domain_experts (user_id);

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  author_name text not null default '',
  topic_kind text not null check (topic_kind in ('line', 'audience', 'format', 'domain')),
  topic_value text not null,
  type text not null check (type in ('Reel', 'Podcast', 'Micro-guide', 'Case write-up')),
  title text not null default '' check (char_length(title) <= 120),
  domain text not null check (domain in ('tech', 'acad', 'pers', 'prof', 'ind', 'reg', 'corp', 'tec', 'lead')),
  level smallint not null default 2 check (level between 1 and 5),
  audience_stage public.career_stage not null default 'Consultant',
  takeaway text not null default '' check (char_length(takeaway) <= 400),
  outline text not null default '' check (char_length(outline) <= 2000),
  sources text[] not null default '{}',
  ai_assisted boolean not null default false,
  bundle_ids text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'review', 'changes', 'published')),
  step smallint not null default 0 check (step between 0 and 4), -- index into REVIEW_STAGES
  learning_id text references public.learnings (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  published_at timestamptz,
  constraint contributions_topic check (case topic_kind
    when 'line' then topic_value in ('Consulting', 'Audit', 'Tax & Legal')
    when 'audience' then topic_value ~ '^(ind|tec):[a-z]+$'
    when 'format' then topic_value in ('Reel', 'Podcast', 'Micro-guide', 'Case write-up')
    when 'domain' then topic_value in ('tech', 'acad', 'pers', 'prof', 'ind', 'reg', 'corp', 'tec', 'lead')
    else false end)
);
create index contributions_author_id_idx on public.contributions (author_id);
create index contributions_learning_id_idx on public.contributions (learning_id);

create table public.contribution_reviews (
  contribution_id uuid not null references public.contributions (id) on delete cascade,
  step smallint not null check (step between 1 and 3), -- 1 peer review, 2 expert review, 3 quality & risk
  slot smallint not null default 1 check (slot between 1 and 2),
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewer_name text not null default '',
  verdict text not null default 'waiting' check (verdict in ('waiting', 'pending', 'approved', 'changes')),
  rubric boolean[] not null default '{}',
  comment text not null default '' check (char_length(comment) <= 2000),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (contribution_id, step, slot),
  -- separation of duties: one person reviews one step of a contribution at most
  constraint contribution_reviews_one_role unique (contribution_id, reviewer_id)
);
create index contribution_reviews_reviewer_id_idx on public.contribution_reviews (reviewer_id);

-- ---------- helpers ----------

-- Who may give someone creation rights for a topic.
create function private.can_grant_creator(target uuid, kind text, val text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_system_admin() or private.is_general_admin() or (
    private.can_manage_user(target)
    and (kind <> 'line' or exists (
      select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'domain_admin' and business_line::text = val))
  );
$$;

-- Who may read someone's grants: the person, System and General Admins, and admins who manage them.
create function private.can_see_grants(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target = (select auth.uid()) or private.is_system_admin() or private.is_general_admin() or private.can_manage_user(target);
$$;

-- Who may set the review requirement of a topic: System and General Admins any; a Domain Admin their own lines.
create function private.can_set_review_policy(kind text, val text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_system_admin() or private.is_general_admin() or (kind = 'line' and exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'domain_admin' and business_line::text = val));
$$;

create function private.has_creator_grant(kind text, val text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.creator_grants where user_id = (select auth.uid()) and topic_kind = kind and topic_value = val);
$$;

create function private.is_contribution_author(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.contributions where id = p_id and author_id = (select auth.uid()));
$$;

create function private.is_contribution_reviewer(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.contribution_reviews where contribution_id = p_id and reviewer_id = (select auth.uid()));
$$;

-- People who may peer-review an author: same business line; never the author, the author's counsellor,
-- or someone the author counsels. Interests and ambitions are never used (they are private, Q8).
create function private.peer_candidates(p_author uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p join public.profiles a on a.id = p_author
  where a.business_line is not null and p.business_line = a.business_line
    and p.id <> a.id
    and p.id is distinct from a.counsellor_id
    and p.counsellor_id is distinct from a.id;
$$;

create function private.peer_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from private.peer_candidates((select auth.uid()));
$$;

-- Open reviews someone has now; routing prefers people with fewer.
create function private.review_load(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.contribution_reviews where reviewer_id = p_user and verdict = 'pending';
$$;

-- A holder of the role who is neither the author nor already reviewing this contribution, least loaded first.
create function private.pick_reviewer(p_role public.app_role, p_author uuid, p_contribution uuid)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select r.user_id from public.user_roles r
  where r.role = p_role and r.user_id <> p_author
    and not exists (select 1 from public.contribution_reviews x where x.contribution_id = p_contribution and x.reviewer_id = r.user_id)
  order by private.review_load(r.user_id), random()
  limit 1;
$$;

create function private.display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(full_name), ''), split_part(email, '@', 1)) from public.profiles where id = p_user;
$$;

-- The first client name (src/data.ts CLIENT_WORDS) found as whole words; null when clean. Case, punctuation and
-- spacing are normalised first, so "Flemish-Care" and "flemish  care" match too (src/logic/contribution.ts does the same).
create function private.blocked_term(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select w from unnest(array['delcroix', 'brabant', 'hoverna', 'flemish care']) as w
  where (' ' || lower(regexp_replace(coalesce(t, ''), '[^[:alnum:]]+', ' ', 'g')) || ' ') like ('% ' || w || ' %')
  limit 1;
$$;

-- ---------- guard triggers ----------

create function private.contribution_defaults()
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
  return new;
end;
$$;

create trigger contributions_defaults
  before insert on public.contributions
  for each row execute function private.contribution_defaults();

-- Allowed shapes: draft → review | published (no review required), review → changes | published, changes → review.
-- Content changes only in draft or changes; after the first submission the topic, type and domain are fixed (they
-- chose the review policy and the routing); the author and the published learning are fixed.
create function private.guard_contribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
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
     and (new.topic_kind, new.topic_value, new.type, new.title, new.domain, new.level, new.audience_stage, new.takeaway, new.outline, new.sources, new.ai_assisted, new.bundle_ids)
     is distinct from (old.topic_kind, old.topic_value, old.type, old.title, old.domain, old.level, old.audience_stage, old.takeaway, old.outline, old.sources, old.ai_assisted, old.bundle_ids) then
    raise exception 'Only a draft or a contribution with changes requested can be edited' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (new.topic_kind, new.topic_value, new.type, new.domain) is distinct from (old.topic_kind, old.topic_value, old.type, old.domain) then
    raise exception 'The topic, format and domain are fixed once a contribution is submitted' using errcode = '42501';
  end if;
  if new.learning_id is distinct from old.learning_id and not (old.status <> 'published' and new.status = 'published') then
    raise exception 'The published learning of a contribution is fixed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger contributions_guard
  before update on public.contributions
  for each row execute function private.guard_contribution();

-- A review row keeps its contribution, step, slot and reviewer; verdicts move waiting → pending → approved | changes,
-- and back to waiting or pending when the author resubmits (the whole flow runs again).
create function private.guard_contribution_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if (new.contribution_id, new.step, new.slot, new.reviewer_id) is distinct from (old.contribution_id, old.step, old.slot, old.reviewer_id) then
    raise exception 'A review assignment cannot be moved' using errcode = '42501';
  end if;
  if new.verdict is distinct from old.verdict and (old.verdict, new.verdict) not in
     (('waiting', 'pending'), ('pending', 'approved'), ('pending', 'changes'),
      ('changes', 'pending'), ('approved', 'pending'), ('changes', 'waiting'), ('approved', 'waiting'), ('pending', 'waiting')) then
    raise exception 'A review cannot move from % to %', old.verdict, new.verdict using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger contribution_reviews_guard
  before update on public.contribution_reviews
  for each row execute function private.guard_contribution_review();

create function private.touch_review_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if (select auth.uid()) is not null then new.updated_by := (select auth.uid()); end if;
  return new;
end;
$$;

create trigger review_policies_touch
  before insert or update on public.review_policies
  for each row execute function private.touch_review_policy();

-- ---------- the flow ----------

-- Publication: the contribution becomes a catalogue learning by its author, in the topic's line
-- (or the author's line; firm-wide when they have none).
create function private.publish_contribution(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contributions%rowtype;
  v_line public.business_line;
  v_id text;
begin
  select * into c from public.contributions where id = p_id;
  v_line := case when c.topic_kind = 'line' then c.topic_value::public.business_line
                 else (select business_line from public.profiles where id = c.author_id) end;
  insert into public.learnings (title, domain, level, format, source, hours, cpd, due, why, business_line, status, created_by)
  values (btrim(c.title), c.domain, c.level, c.type, 'Peer contribution',
          case c.type when 'Reel' then 0.025 when 'Podcast' then 0.5 when 'Micro-guide' then 0.1 else 0.25 end,
          0, '', btrim(c.takeaway), v_line, 'published', c.author_id)
  returning id into v_id;
  update public.contributions set status = 'published', step = 4, learning_id = v_id, published_at = now() where id = p_id;
  return v_id;
end;
$$;

-- Submit (or resubmit after changes). Refused without a creation grant for the topic or when a content check fails
-- (client names are searched in every text field).
-- A first submission assigns every reviewer the topic's policy requires, up front, each person at most once:
-- the domain's expert or else a System Admin (step 2), a General Admin or else a System Admin (step 3), then the
-- peers (step 1) from the author's line among the people left. The first required step starts; with no step required
-- the contribution is published at once. Too few people: refused, still a draft.
-- A resubmission runs the whole flow again from the first step with the same reviewers: earlier approvals were of
-- the old version.
create function private.submit_contribution(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.contributions%rowtype;
  pol public.review_policies%rowtype;
  v_peers smallint := 2;
  v_expert boolean := true;
  v_quality boolean := true;
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
  if not exists (select 1 from public.creator_grants g where g.user_id = me and g.topic_kind = c.topic_kind and g.topic_value = c.topic_value) then
    raise exception 'You have no creation rights for %; ask an admin', c.topic_value using errcode = '42501';
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
  if (c.topic_kind = 'format' and c.type <> c.topic_value) or (c.topic_kind = 'domain' and c.domain <> c.topic_value) then
    raise exception 'The contribution does not match its topic %', c.topic_value using errcode = 'P0001';
  end if;

  if c.status = 'changes' then
    v_first := (select min(step) from public.contribution_reviews where contribution_id = p_id);
    update public.contribution_reviews set verdict = case when step = v_first then 'pending' else 'waiting' end, rubric = '{}', decided_at = null
    where contribution_id = p_id;
    update public.contributions set status = 'review', step = v_first, submitted_at = now() where id = p_id;
    return 'review';
  end if;

  select * into pol from public.review_policies where topic_kind = c.topic_kind and topic_value = c.topic_value;
  if found then v_peers := pol.peers; v_expert := pol.expert; v_quality := pol.quality; end if;
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
      raise exception 'Only % colleague(s) in your business line can peer-review this (the expert and quality reviewers do not count); its topic needs %. It stays a draft: ask an admin to lower the peer requirement for this topic.', n, v_peers
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

-- A reviewer decides on the step that is theirs now. Approving needs all four rubric items; asking for changes
-- needs a comment and returns the contribution to its author. When every reviewer of the step approved, the next
-- required step starts, or the contribution is published after the last one.
create function private.review_contribution(p_id uuid, p_verdict text, p_rubric boolean[], p_comment text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.contributions%rowtype;
  r public.contribution_reviews%rowtype;
  v_next smallint;
begin
  if p_verdict not in ('approved', 'changes') then
    raise exception 'A review approves or asks for changes' using errcode = 'P0001';
  end if;
  select * into c from public.contributions where id = p_id for update;
  if not found or c.status <> 'review' then
    raise exception 'This contribution is not waiting for a review' using errcode = '42501';
  end if;
  select * into r from public.contribution_reviews
  where contribution_id = p_id and step = c.step and reviewer_id = me and verdict = 'pending' order by slot limit 1;
  if not found then
    raise exception 'This review is not waiting for you' using errcode = '42501';
  end if;
  if p_verdict = 'approved' and (cardinality(coalesce(p_rubric, '{}')) <> 4 or not coalesce(true = all(p_rubric), false)) then
    raise exception 'Tick all four criteria to approve, or request changes' using errcode = 'P0001';
  end if;
  if p_verdict = 'changes' and btrim(coalesce(p_comment, '')) = '' then
    raise exception 'Add a comment so the author knows what to change' using errcode = 'P0001';
  end if;

  update public.contribution_reviews
  set verdict = p_verdict, rubric = coalesce(p_rubric, '{}'), comment = btrim(coalesce(p_comment, '')), decided_at = now()
  where contribution_id = p_id and step = r.step and slot = r.slot;

  if p_verdict = 'changes' then
    update public.contributions set status = 'changes' where id = p_id;
    return 'changes';
  end if;
  if exists (select 1 from public.contribution_reviews where contribution_id = p_id and step = c.step and verdict <> 'approved') then
    return 'review';
  end if;
  v_next := (select min(step) from public.contribution_reviews where contribution_id = p_id and step > c.step);
  if v_next is null then
    perform private.publish_contribution(p_id);
    return 'published';
  end if;
  update public.contribution_reviews set verdict = 'pending' where contribution_id = p_id and step = v_next;
  update public.contributions set step = v_next where id = p_id;
  return 'review';
end;
$$;

revoke execute on function
  private.can_grant_creator(uuid, text, text), private.can_see_grants(uuid), private.can_set_review_policy(text, text),
  private.has_creator_grant(text, text), private.is_contribution_author(uuid), private.is_contribution_reviewer(uuid),
  private.peer_count(), private.submit_contribution(uuid), private.review_contribution(uuid, text, boolean[], text)
  from public, anon;
grant execute on function
  private.can_grant_creator(uuid, text, text), private.can_see_grants(uuid), private.can_set_review_policy(text, text),
  private.has_creator_grant(text, text), private.is_contribution_author(uuid), private.is_contribution_reviewer(uuid),
  private.peer_count(), private.submit_contribution(uuid), private.review_contribution(uuid, text, boolean[], text)
  to authenticated;
-- Internal only: called by the functions above, never by a client.
revoke execute on function
  private.peer_candidates(uuid), private.review_load(uuid), private.pick_reviewer(public.app_role, uuid, uuid), private.display_name(uuid),
  private.blocked_term(text), private.publish_contribution(uuid), private.contribution_defaults(), private.guard_contribution(),
  private.guard_contribution_review(), private.touch_review_policy()
  from public, anon, authenticated;

-- ---------- the RPCs the app calls ----------

create function public.submit_contribution(p_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.submit_contribution(p_id);
$$;

create function public.review_contribution(p_id uuid, p_verdict text, p_rubric boolean[] default '{}', p_comment text default '')
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.review_contribution(p_id, p_verdict, p_rubric, p_comment);
$$;

-- How many colleagues could peer-review the caller (a number only; nobody is named before routing).
create function public.peer_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select private.peer_count();
$$;

revoke execute on function public.submit_contribution(uuid), public.review_contribution(uuid, text, boolean[], text), public.peer_count() from public, anon;
grant execute on function public.submit_contribution(uuid), public.review_contribution(uuid, text, boolean[], text), public.peer_count() to authenticated;

-- ---------- grants and policies ----------

alter table public.creator_grants enable row level security;
alter table public.review_policies enable row level security;
alter table public.domain_experts enable row level security;
alter table public.contributions enable row level security;
alter table public.contribution_reviews enable row level security;
revoke all on public.creator_grants, public.review_policies, public.domain_experts, public.contributions, public.contribution_reviews from anon, authenticated;

grant select, delete on public.creator_grants to authenticated;
grant insert (user_id, topic_kind, topic_value) on public.creator_grants to authenticated;

grant select, delete on public.review_policies to authenticated;
grant insert (topic_kind, topic_value, peers, expert, quality) on public.review_policies to authenticated;
grant update (topic_kind, topic_value, peers, expert, quality) on public.review_policies to authenticated;

grant select, delete on public.domain_experts to authenticated;
grant insert (domain, user_id) on public.domain_experts to authenticated;
grant update (domain, user_id, updated_at) on public.domain_experts to authenticated;

grant select, delete on public.contributions to authenticated;
grant insert (topic_kind, topic_value, type, title, domain, level, audience_stage, takeaway, outline, sources, ai_assisted, bundle_ids)
  on public.contributions to authenticated;
grant update (topic_kind, topic_value, type, title, domain, level, audience_stage, takeaway, outline, sources, ai_assisted, bundle_ids)
  on public.contributions to authenticated;

-- Reviews are read here and written only by the flow functions.
grant select on public.contribution_reviews to authenticated;

create policy "creator_grants: read" on public.creator_grants for select to authenticated
  using ((select private.can_see_grants(user_id)));
create policy "creator_grants: grant" on public.creator_grants for insert to authenticated
  with check ((select private.can_grant_creator(user_id, topic_kind, topic_value)));
create policy "creator_grants: revoke" on public.creator_grants for delete to authenticated
  using ((select private.can_grant_creator(user_id, topic_kind, topic_value)));

create policy "review_policies: read" on public.review_policies for select to authenticated using (true);
create policy "review_policies: add" on public.review_policies for insert to authenticated
  with check ((select private.can_set_review_policy(topic_kind, topic_value)));
create policy "review_policies: edit" on public.review_policies for update to authenticated
  using ((select private.can_set_review_policy(topic_kind, topic_value)))
  with check ((select private.can_set_review_policy(topic_kind, topic_value)));
create policy "review_policies: remove" on public.review_policies for delete to authenticated
  using ((select private.can_set_review_policy(topic_kind, topic_value)));

create policy "domain_experts: read" on public.domain_experts for select to authenticated using (true);
create policy "domain_experts: system admins add" on public.domain_experts for insert to authenticated
  with check ((select private.is_system_admin()));
create policy "domain_experts: system admins edit" on public.domain_experts for update to authenticated
  using ((select private.is_system_admin())) with check ((select private.is_system_admin()));
create policy "domain_experts: system admins remove" on public.domain_experts for delete to authenticated
  using ((select private.is_system_admin()));

-- The author, assigned reviewers and System Admins. Everyone else sees a published piece as its learnings row.
create policy "contributions: read" on public.contributions for select to authenticated
  using (
    author_id = (select auth.uid())
    or (select private.is_contribution_reviewer(id))
    or (select private.is_system_admin())
  );
create policy "contributions: author adds" on public.contributions for insert to authenticated
  with check (author_id = (select auth.uid()) and (select private.has_creator_grant(topic_kind, topic_value)));
create policy "contributions: author edits" on public.contributions for update to authenticated
  using (author_id = (select auth.uid()) and status in ('draft', 'changes'))
  with check (author_id = (select auth.uid()) and status in ('draft', 'changes') and (select private.has_creator_grant(topic_kind, topic_value)));
create policy "contributions: author removes a draft" on public.contributions for delete to authenticated
  using (author_id = (select auth.uid()) and status = 'draft');

create policy "contribution_reviews: read" on public.contribution_reviews for select to authenticated
  using (
    reviewer_id = (select auth.uid())
    or (select private.is_contribution_author(contribution_id))
    or (select private.is_system_admin())
  );
