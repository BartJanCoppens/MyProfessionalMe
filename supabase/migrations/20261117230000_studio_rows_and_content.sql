-- Job Aid Studio and Case Studio (studios plan, Task 2.1), and the one path every studio's items take from now on.
--
-- items     A contribution made in a studio keeps its rows in `items`, as flash cards and exams keep theirs: [label, text]
--           or [label, text, text2]. contributions_items_check allows items on the card formats and on any studio
--           contribution, up to the format's most items (private.item_max; ITEM_MAX in src/logic/items.ts).
--           private.items_ok checks the rows of each format whose studio is built (Job aid and Case exercise here); the
--           other studio formats still fail, so they cannot be sent until their studio ships with its content.
-- shape     The studio's "Shape it" answers (question to answer, all text), saved with the draft. Publishing reads the
--           ones its content needs: a case, whether it can count as trajectory evidence.
-- content   publish_contribution builds learnings.content through private.contribution_content, one function per
--           content shape (flash, exam, aid, case); src/logic/studioContent.ts builds the same for the studio preview and
--           parseFormatContent (src/lib/contentStore.ts) reads it.

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
revoke execute on function private.item_max(text) from public, anon;
grant execute on function private.item_max(text) to authenticated;

alter table public.contributions drop constraint contributions_items_check;
alter table public.contributions add constraint contributions_items_check
  check (items is null or ((type in ('Flash cards', 'Practice exam') or studio is not null)
    and jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= coalesce(private.item_max(type), 0)));

alter table public.contributions add column shape jsonb constraint contributions_shape_check
  check (shape is null or (jsonb_typeof(shape) = 'object' and char_length(shape::text) <= 2000
    and not jsonb_path_exists(shape, '$.* ? (@.type() != "string")')));
grant insert (shape), update (shape) on public.contributions to authenticated;

-- A studio's rows: 1 to p_max arrays of a label, a text and an optional text 2, all text; label and text not blank;
-- labels up to 300 characters, texts up to 600 (SHORT_MAX and LONG_MAX in src/logic/items.ts; itemsValid).
create function private.studio_rows_ok(p_items jsonb, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_items) is distinct from 'array' then false
    else jsonb_array_length(p_items) between 1 and p_max and not exists (
      select 1 from jsonb_array_elements(p_items) e
      where case when jsonb_typeof(e) <> 'array' then true
                 when jsonb_array_length(e) not in (2, 3) then true
                 else jsonb_typeof(e -> 0) <> 'string' or jsonb_typeof(e -> 1) <> 'string' or coalesce(jsonb_typeof(e -> 2), 'string') <> 'string'
                   or btrim(e ->> 0) = '' or btrim(e ->> 1) = ''
                   or char_length(e ->> 0) > 300 or char_length(e ->> 1) > 600 or char_length(coalesce(e ->> 2, '')) > 600 end)
  end;
$$;

-- As before (20261117180000), with the most items from private.item_max and the rows of the built studio formats. A
-- case uses only the labels Brief, Deliverable and Criterion, each at least once (itemsValid's caseExercise).
create or replace function private.items_ok(p_type text, p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_items is null or jsonb_typeof(p_items) <> 'array' then false
    when p_type = 'Flash cards' then jsonb_array_length(p_items) between 1 and private.item_max(p_type) and not exists (
      select 1 from jsonb_array_elements(p_items) e
      where jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 2
         or jsonb_typeof(e -> 0) is distinct from 'string' or jsonb_typeof(e -> 1) is distinct from 'string'
         or btrim(e ->> 0) = '' or btrim(e ->> 1) = '' or char_length(e ->> 0) > 300 or char_length(e ->> 1) > 600)
    when p_type = 'Practice exam' then jsonb_array_length(p_items) between 1 and private.item_max(p_type) and not exists (
      select 1 from jsonb_array_elements(p_items) e
      where jsonb_typeof(e) <> 'object'
         or jsonb_typeof(e -> 't') is distinct from 'string' or jsonb_typeof(e -> 'q') is distinct from 'string' or jsonb_typeof(e -> 'why') is distinct from 'string'
         or btrim(e ->> 't') = '' or btrim(e ->> 'q') = '' or btrim(e ->> 'why') = ''
         or char_length(e ->> 't') > 300 or char_length(e ->> 'q') > 300 or char_length(e ->> 'why') > 600
         or jsonb_typeof(e -> 'o') is distinct from 'array' or jsonb_array_length(e -> 'o') <> 4
         or exists (select 1 from jsonb_array_elements(e -> 'o') o where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '' or char_length(o #>> '{}') > 300)
         or jsonb_typeof(e -> 'a') is distinct from 'number' or (e ->> 'a') not in ('0', '1', '2', '3'))
    when p_type in ('Job aid', 'Case exercise') then private.studio_rows_ok(p_items, private.item_max(p_type))
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

-- As before (20261117180000); every contribution with items (the card formats and anything made in a studio) needs
-- usable items and publishes them through contribution_content.
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
  if c.type in ('Flash cards', 'Practice exam') or c.studio is not null then
    if not private.items_ok(c.type, c.items) then
      raise exception 'This contribution has no usable items, so it cannot be published' using errcode = 'P0001';
    end if;
    v_content := private.contribution_content(c.type, c.items, c.shape);
  end if;
  insert into public.learnings (title, domain, level, format, source, hours, cpd, due, why, business_line, status, created_by, content)
  values (btrim(c.title), c.domain, c.level, c.type, 'Peer contribution',
          case c.type when 'Reel' then 0.025 when 'Podcast' then 0.5 when 'Micro-guide' then 0.1 when 'Practice exam' then 0.5 else 0.25 end,
          0, '', btrim(c.takeaway), c.business_line, 'published', c.author_id, v_content)
  returning id into v_id;
  update public.contributions set status = 'published', step = 4, learning_id = v_id, published_at = now() where id = p_id;
  return v_id;
end;
$$;

revoke execute on function private.studio_rows_ok(jsonb, integer), private.flash_content(jsonb), private.exam_content(jsonb), private.aid_content(jsonb),
  private.case_content(jsonb, jsonb), private.contribution_content(text, jsonb, jsonb) from public, anon, authenticated;
