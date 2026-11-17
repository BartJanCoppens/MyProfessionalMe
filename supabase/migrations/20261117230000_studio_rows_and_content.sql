-- Job Aid Studio and Case Studio (studios plan, Task 2.1), and the one path every studio's items take from now on.
--
-- items     A contribution carries items when its format is cards or exam questions, or when it was made in a studio
--           (private.carries_items; carriesItems in src/logic/items.ts): [label, text] or [label, text, text2] rows for a
--           studio. contributions_items_check caps them per format (private.item_max; ITEM_MAX). private.items_ok checks
--           the rows of each format whose studio is built (Job aid and Case exercise here); the other studio formats still
--           fail, so they cannot be sent until their studio ships with its content.
-- shape     The studio's "Shape it" answers (question to answer, all text), only on a studio contribution. They are part of
--           the check fingerprint and of the client-name scan, are fixed once submitted, and publishing reads the ones its
--           content needs: a case's length (hours) and whether it can count as trajectory evidence.
-- content   publish_contribution builds learnings.content through private.contribution_content, one function per
--           content shape (flash, exam, aid, case); src/logic/studioContent.ts builds the same for the studio preview and
--           parseFormatContent (src/lib/contentStore.ts) reads it. Text is trimmed with btrim (spaces) here and trim()
--           there; the studio's single-line inputs hold no other leading or trailing whitespace.

-- The most items each format holds (ITEM_MAX). Granted to authenticated: contributions_items_check calls it.
create function private.item_max(p_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select t.m from (values
    ('Flash cards', 40),
    ('Practice exam', 30),
    ('Avatar', 12),
    ('Reel', 8),
    ('Podcast', 8),
    ('Game', 10),
    ('Slides', 15),
    ('Animated flow', 8),
    ('Interactive explainer', 10),
    ('Job aid', 20),
    ('Case exercise', 12)
  ) as t(type, m)
  where t.type = p_type;
$$;

-- Whether a contribution carries items (carriesItems): the card formats always, anything made in a studio. Granted to
-- authenticated: contributions_items_check calls it.
create function private.carries_items(p_type text, p_studio text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type in ('Flash cards', 'Practice exam') or p_studio is not null;
$$;
revoke execute on function private.item_max(text), private.carries_items(text, text) from public, anon;
grant execute on function private.item_max(text), private.carries_items(text, text) to authenticated;

alter table public.contributions drop constraint contributions_items_check;
alter table public.contributions add constraint contributions_items_check
  check (items is null or (private.carries_items(type, studio)
    and jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= coalesce(private.item_max(type), 0)));

-- strict: a list as an answer is refused as a whole, not looked into.
alter table public.contributions add column shape jsonb constraint contributions_shape_check
  check (shape is null or (studio is not null and jsonb_typeof(shape) = 'object' and char_length(shape::text) <= 2000
    and not jsonb_path_exists(shape, 'strict $.* ? (@.type() != "string")')));
grant insert (shape), update (shape) on public.contributions to authenticated;

-- Rows: 1 to p_max arrays of 2 to p_width texts (a flash card is 2, a studio row a label, a text and an optional text 2);
-- the first two not blank; the first up to 300 characters, the others up to 600 (SHORT_MAX, LONG_MAX and fieldOk in
-- src/logic/items.ts).
create function private.rows_ok(p_items jsonb, p_max integer, p_width integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_items) is distinct from 'array' then false
    else jsonb_array_length(p_items) between 1 and p_max and not exists (
      select 1 from jsonb_array_elements(p_items) e
      where case when jsonb_typeof(e) <> 'array' then true
                 when jsonb_array_length(e) not between 2 and p_width then true
                 else jsonb_typeof(e -> 0) <> 'string' or jsonb_typeof(e -> 1) <> 'string' or coalesce(jsonb_typeof(e -> 2), 'string') <> 'string'
                   or btrim(e ->> 0) = '' or btrim(e ->> 1) = ''
                   or char_length(e ->> 0) > 300 or char_length(e ->> 1) > 600 or char_length(coalesce(e ->> 2, '')) > 600 end)
  end;
$$;

-- As before (20261117180000), with the caps from private.item_max, flash cards as two-text rows and the rows of the built
-- studio formats. A case uses only the labels Brief, Deliverable and Criterion, each at least once (itemsValid).
create or replace function private.items_ok(p_type text, p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_items is null or jsonb_typeof(p_items) <> 'array' then false
    when p_type = 'Flash cards' then private.rows_ok(p_items, private.item_max(p_type), 2)
    when p_type = 'Practice exam' then jsonb_array_length(p_items) between 1 and private.item_max(p_type) and not exists (
      select 1 from jsonb_array_elements(p_items) e
      where jsonb_typeof(e) <> 'object'
         or jsonb_typeof(e -> 't') is distinct from 'string' or jsonb_typeof(e -> 'q') is distinct from 'string' or jsonb_typeof(e -> 'why') is distinct from 'string'
         or btrim(e ->> 't') = '' or btrim(e ->> 'q') = '' or btrim(e ->> 'why') = ''
         or char_length(e ->> 't') > 300 or char_length(e ->> 'q') > 300 or char_length(e ->> 'why') > 600
         or jsonb_typeof(e -> 'o') is distinct from 'array' or jsonb_array_length(e -> 'o') <> 4
         or exists (select 1 from jsonb_array_elements(e -> 'o') o where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '' or char_length(o #>> '{}') > 300)
         or jsonb_typeof(e -> 'a') is distinct from 'number' or (e ->> 'a') not in ('0', '1', '2', '3'))
    when p_type in ('Job aid', 'Case exercise') then private.rows_ok(p_items, private.item_max(p_type), 3)
      and (p_type <> 'Case exercise' or (
        not exists (select 1 from jsonb_array_elements(p_items) e where (e ->> 0) not in ('Brief', 'Deliverable', 'Criterion'))
        and (select count(distinct e ->> 0) from jsonb_array_elements(p_items) e) = 3))
    else false
  end;
$$;

-- ---------- content: one function per content shape ----------

create function private.flash_content(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', 'flash', 'total', jsonb_array_length(p_items), 'due', jsonb_array_length(p_items), 'next', '', 'cards', p_items);
$$;

create function private.exam_content(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', 'exam', 'bank', jsonb_array_length(p_items), 'real', 'A peer-written set, reviewed before it was published.', 'qs', p_items);
$$;

-- A job aid: one line per row, "label · text" (the moment, then the line), in order.
create function private.aid_content(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', 'aid', 'items', coalesce(jsonb_agg(btrim(x.e ->> 0) || ' · ' || btrim(x.e ->> 1) order by x.n), '[]'::jsonb))
  from jsonb_array_elements(p_items) with ordinality as x(e, n);
$$;

-- A case: the Brief rows as the brief, Deliverable and Criterion rows as the deliverables and the rubric, in order. The
-- learner hands in to their counsellor (the evidence flow), so that is the reviewer. It counts as trajectory evidence
-- when the creator answered Yes.
create function private.case_content(p_items jsonb, p_shape jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', 'case',
    'brief', coalesce((select string_agg(btrim(x.e ->> 1), ' ' order by x.n) from jsonb_array_elements(p_items) with ordinality as x(e, n) where x.e ->> 0 = 'Brief'), ''),
    'deliv', coalesce((select jsonb_agg(btrim(x.e ->> 1) order by x.n) from jsonb_array_elements(p_items) with ordinality as x(e, n) where x.e ->> 0 = 'Deliverable'), '[]'::jsonb),
    'rubric', coalesce((select jsonb_agg(btrim(x.e ->> 1) order by x.n) from jsonb_array_elements(p_items) with ordinality as x(e, n) where x.e ->> 0 = 'Criterion'), '[]'::jsonb),
    'reviewer', 'Reviewed by your counsellor.',
    'evidence', coalesce(p_shape ->> 'Can it count as trajectory evidence?', '') = 'Yes');
$$;

-- A case's study hours from "How long should it take?" (CASE_HOURS in src/logic/studioContent.ts); half a day unanswered.
create function private.case_hours(p_shape jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_shape ->> 'How long should it take?' when '2 hours' then 2 when 'Half a day' then 4 when 'A full day' then 8 else 4 end;
$$;

-- The learning content a contribution's items publish as; null for a format without one.
create function private.contribution_content(p_type text, p_items jsonb, p_shape jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'Flash cards' then private.flash_content(p_items)
    when 'Practice exam' then private.exam_content(p_items)
    when 'Job aid' then private.aid_content(p_items)
    when 'Case exercise' then private.case_content(p_items, p_shape)
  end;
$$;

-- As before (20261117180000); every contribution that carries items needs usable ones and publishes them through
-- contribution_content. A case's hours come from its length answer.
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
  if not private.rules_allow(c.author_id, c.business_line, c.type, c.domain, c.audience) then
    raise exception 'The author''s creation rules no longer allow this contribution, so it cannot be published' using errcode = '42501';
  end if;
  if private.carries_items(c.type, c.studio) then
    if not private.items_ok(c.type, c.items) then
      raise exception 'This contribution has no usable items, so it cannot be published' using errcode = 'P0001';
    end if;
    v_content := private.contribution_content(c.type, c.items, c.shape);
  end if;
  insert into public.learnings (title, domain, level, format, source, hours, cpd, due, why, business_line, status, created_by, content)
  values (btrim(c.title), c.domain, c.level, c.type, 'Peer contribution',
          case c.type when 'Reel' then 0.025 when 'Podcast' then 0.5 when 'Micro-guide' then 0.1 when 'Practice exam' then 0.5
                      when 'Case exercise' then private.case_hours(c.shape) else 0.25 end,
          0, '', btrim(c.takeaway), c.business_line, 'published', c.author_id, v_content)
  returning id into v_id;
  update public.contributions set status = 'published', step = 4, learning_id = v_id, published_at = now() where id = p_id;
  return v_id;
end;
$$;

-- ---------- the check gate covers the answers ----------

-- The fingerprint a passed check is stored with: the items, the title, the format and now the answers.
create function private.contribution_fingerprint(p_items jsonb, p_title text, p_type text, p_shape jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(coalesce(p_items::text, 'null') || chr(31) || coalesce(p_title, '') || chr(31) || coalesce(p_type, '') || chr(31) || coalesce(p_shape::text, 'null'));
$$;

-- As before (20261117220000); items through carries_items, and the answers are searched for client names too.
create or replace function private.contribution_problems(c public.contributions)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  p text[] := '{}';
  v_min integer := private.studio_min_items(c.studio, c.type);
  v_term text;
begin
  if char_length(btrim(c.title)) not between 1 and 60 then
    p := array_append(p, 'The title needs 1 to 60 characters');
  end if;
  if btrim(c.takeaway) = '' then
    p := array_append(p, 'Write the one takeaway first');
  end if;
  if c.studio is not null and v_min is null then
    p := array_append(p, format('This studio does not make %s', c.type));
  elsif private.carries_items(c.type, c.studio) and not private.items_ok(c.type, c.items) then
    p := array_append(p, case c.type when 'Flash cards' then 'Add the cards first: generate them with AI or import a CSV'
      when 'Practice exam' then 'Add the questions first: generate them with AI or import a CSV' else 'Add the items first' end);
  elsif c.studio is not null and jsonb_array_length(c.items) < v_min then
    p := array_append(p, format('Add at least %s items', v_min));
  end if;
  v_term := private.blocked_term(c.title || ' ' || c.takeaway || ' ' || c.outline || ' ' || array_to_string(c.sources, ' ') || ' ' || coalesce(c.items::text, '')
    || ' ' || coalesce((select string_agg(a.value, ' ') from jsonb_each_text(c.shape) a), ''));
  if v_term is not null then
    p := array_append(p, format('“%s” looks like a client name · anonymise it', initcap(v_term)));
  end if;
  return p;
end;
$$;

-- As before (20261117220000), with the answers in the fingerprint.
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
  v_problems := case when private.may_create(c.business_line, c.type, c.domain, c.audience) then '{}'::text[]
                     else array['Not allowed by your creation rules; ask an admin'] end || private.contribution_problems(c);
  update public.contributions set
    check_fingerprint = case when cardinality(v_problems) = 0 then private.contribution_fingerprint(c.items, c.title, c.type, c.shape) end,
    check_passed_at = case when cardinality(v_problems) = 0 then now() end
  where id = p_id;
  return v_problems;
end;
$$;

-- As before (20261117220000), with the answers in the fingerprint.
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
  if not private.may_create(c.business_line, c.type, c.domain, c.audience) then
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

  select f.peers, f.expert, f.quality into v_peers, v_expert, v_quality from private.policy_for(c.business_line, c.type, c.domain, c.audience) f;
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

drop function private.contribution_fingerprint(jsonb, text, text);

-- As before (20261117180000), with the answers locked like every other field once a contribution is in review or published.
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
     and (new.business_line, new.audience, new.type, new.title, new.domain, new.level, new.audience_stage, new.takeaway, new.outline, new.sources, new.ai_assisted, new.bundle_ids, new.items, new.shape)
     is distinct from (old.business_line, old.audience, old.type, old.title, old.domain, old.level, old.audience_stage, old.takeaway, old.outline, old.sources, old.ai_assisted, old.bundle_ids, old.items, old.shape) then
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

revoke execute on function private.rows_ok(jsonb, integer, integer), private.flash_content(jsonb), private.exam_content(jsonb), private.aid_content(jsonb),
  private.case_content(jsonb, jsonb), private.case_hours(jsonb), private.contribution_content(text, jsonb, jsonb),
  private.contribution_fingerprint(jsonb, text, text, jsonb) from public, anon, authenticated;
