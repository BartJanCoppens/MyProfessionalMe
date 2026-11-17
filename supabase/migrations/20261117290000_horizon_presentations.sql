-- Horizon presentations (studios plan, Task 3.3; owner decisions S8–S10): the 'Presentation' format. A creator uploads a
-- .horizon file made in the Horizon app through Create & share's upload form; it goes through peer review like any
-- contribution; learners play it in the app's own player (src/horizon/) and complete it by reaching the last slide.
--
-- Format   'Presentation' joins the contribution formats, creation rules and review requirements, and is an upload-form
--          format (contributions_upload_formats; CREATE_TYPES in src/logic/contribution.ts; items.test.ts checks the lists).
-- items    A Presentation always carries one item (private.carries_items; carriesItems in src/logic/items.ts): the
--          summary the browser read from the file before it was stored, {kind: 'horizon', path, title, slides,
--          seconds} (private.horizon_ok; isHorizonItem in src/logic/horizonItem.ts). path is the stored file, a .horizon
--          file in the media bucket; title the deck's title (1 to 200 characters); slides how many slides its route
--          shows (1 to 1000); seconds how long its narration runs (0 when it has none: the learner moves at their own
--          pace; at most 36,000).
-- check    contribution_problems (so the check and submit_contribution) refuses a Presentation whose file is not in
--          the contribution's own folder (<author id>/<contribution id>/) or not in Storage (the carry-in of Task 3.1:
--          a referenced file must exist before it is sent).
-- content  private.contribution_content publishes the summary, rebuilt from its known keys. Its "path" member opens the
--          file to every signed-in person once published (private.can_read_media, 20261117270000).
-- completion 'media' (COMPLETION in src/logic/record.ts): the learner completes it themselves by reaching the last
--          slide of the route; private.is_self_complete lists it.

alter table public.creator_rules drop constraint creator_rules_formats_check;
alter table public.creator_rules add constraint creator_rules_formats_check
  check (formats <@ array['Reel', 'Podcast', 'Micro-guide', 'Case write-up', 'Avatar', 'Flash cards', 'Practice exam', 'Presentation', 'Game', 'Slides', 'Animated flow', 'Interactive explainer', 'Job aid', 'Case exercise']);
alter table public.review_policies drop constraint review_policies_formats_check;
alter table public.review_policies add constraint review_policies_formats_check
  check (formats <@ array['Reel', 'Podcast', 'Micro-guide', 'Case write-up', 'Avatar', 'Flash cards', 'Practice exam', 'Presentation', 'Game', 'Slides', 'Animated flow', 'Interactive explainer', 'Job aid', 'Case exercise']);
alter table public.contributions drop constraint contributions_type_check;
alter table public.contributions add constraint contributions_type_check
  check (type in ('Reel', 'Podcast', 'Micro-guide', 'Case write-up', 'Avatar', 'Flash cards', 'Practice exam', 'Presentation', 'Game', 'Slides', 'Animated flow', 'Interactive explainer', 'Job aid', 'Case exercise'));
alter table public.contributions drop constraint contributions_upload_formats;
alter table public.contributions
  add constraint contributions_upload_formats check (studio is not null or type in ('Reel', 'Podcast', 'Micro-guide', 'Case write-up', 'Flash cards', 'Practice exam', 'Presentation'));

-- As before (20261117230000), with the Presentation's one item.
create or replace function private.item_max(p_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select t.m from (values
    ('Flash cards', 40),
    ('Practice exam', 30),
    ('Presentation', 1),
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

-- As before (20261117230000): the card formats and a Presentation always carry items; anything made in a studio does.
create or replace function private.carries_items(p_type text, p_studio text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type in ('Flash cards', 'Practice exam', 'Presentation') or p_studio is not null;
$$;

-- A Presentation's item: what the browser read from the .horizon file, and where the file is.
create function private.horizon_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(e) is distinct from 'object' then false
    else (select count(*) from jsonb_object_keys(e)) = 5
      and e ->> 'kind' is not distinct from 'horizon'
      and jsonb_typeof(e -> 'path') is not distinct from 'string' and private.media_path_ok(e ->> 'path') and right(e ->> 'path', 8) = '.horizon'
      and jsonb_typeof(e -> 'title') is not distinct from 'string' and btrim(e ->> 'title') <> '' and char_length(e ->> 'title') <= 200
      -- each cast only once its type is known (AND does not promise an order)
      and case when jsonb_typeof(e -> 'slides') is not distinct from 'number' and (e ->> 'slides') ~ '^[0-9]{1,4}$' then (e ->> 'slides')::integer between 1 and 1000 else false end
      and case when jsonb_typeof(e -> 'seconds') is not distinct from 'number' then (e ->> 'seconds')::numeric between 0 and 36000 else false end
  end;
$$;

-- As before (20261117250000), with the Presentation.
create or replace function private.items_ok(p_type text, p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_items is null or jsonb_typeof(p_items) <> 'array' then false
    when p_type = 'Flash cards' then private.rows_ok(p_items, private.item_max(p_type), 2)
    when p_type = 'Practice exam' then jsonb_array_length(p_items) between 1 and private.item_max(p_type) and not exists (select 1 from jsonb_array_elements(p_items) e where not private.question_ok(e))
    when p_type = 'Presentation' then jsonb_array_length(p_items) = 1 and private.horizon_ok(p_items -> 0)
    when p_type = 'Interactive explainer' then private.explainer_ok(p_items)
    when p_type = 'Animated flow' then private.motion_ok(p_items)
    when p_type in ('Job aid', 'Case exercise') then private.rows_ok(p_items, private.item_max(p_type), 3)
      and (p_type <> 'Case exercise' or (
        not exists (select 1 from jsonb_array_elements(p_items) e where (e ->> 0) not in ('Brief', 'Deliverable', 'Criterion'))
        and (select count(distinct e ->> 0) from jsonb_array_elements(p_items) e) = 3))
    else false
  end;
$$;

-- A Presentation's content: its one item, rebuilt from the known keys, the title trimmed.
create function private.horizon_content(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', 'horizon', 'path', e ->> 'path', 'title', btrim(e ->> 'title'), 'slides', (e ->> 'slides')::integer, 'seconds', (e -> 'seconds'))
  from (select p_items -> 0 as e) x;
$$;

-- As before (20261117250000), with the Presentation.
create or replace function private.contribution_content(p_type text, p_items jsonb, p_shape jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'Flash cards' then private.flash_content(p_items)
    when 'Practice exam' then private.exam_content(p_items)
    when 'Presentation' then private.horizon_content(p_items)
    when 'Job aid' then private.aid_content(p_items)
    when 'Case exercise' then private.case_content(p_items, p_shape)
    when 'Interactive explainer' then private.explainer_content(p_items, p_shape)
    when 'Animated flow' then private.motion_content(p_items)
  end;
$$;

-- As before (20261117250000); a Presentation's file must be in the contribution's own folder and in Storage. Called
-- by check_contribution and submit_contribution (security definer, after they checked the caller is the author).
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
  v_check boolean;
  v_path text;
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
      when 'Practice exam' then 'Add the questions first: generate them with AI or import a CSV'
      when 'Presentation' then 'Add the .horizon file first'
      when 'Animated flow' then 'Add the stages, build the animation and write its text alternative first' else 'Add the items first' end);
  elsif c.studio is not null and (select count(*) from jsonb_array_elements(c.items) e where c.type not in ('Interactive explainer', 'Animated flow') or jsonb_typeof(e) = 'array') < v_min then
    p := array_append(p, format('Add at least %s items', v_min));
  end if;
  if c.type = 'Presentation' and private.items_ok(c.type, c.items) then
    v_path := c.items -> 0 ->> 'path';
    if split_part(v_path, '/', 1) <> c.author_id::text or split_part(v_path, '/', 2) <> c.id::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'media' and o.name = v_path) then
      p := array_append(p, 'The .horizon file is not there · add it again');
    end if;
  end if;
  if c.type = 'Interactive explainer' and c.studio is not null and jsonb_typeof(c.items) = 'array' then
    v_check := exists (select 1 from jsonb_array_elements(c.items) e where jsonb_typeof(e) = 'object');
    if coalesce(c.shape ->> 'End with?', '') = 'A three-question check' and not v_check then
      p := array_append(p, 'Ending with a three-question check needs its three questions');
    elsif coalesce(c.shape ->> 'End with?', '') <> 'A three-question check' and v_check then
      p := array_append(p, 'The check is only shown when the explainer ends with it: remove it, or choose “A three-question check” in Shape it');
    end if;
  end if;
  v_term := private.blocked_term(c.title || ' ' || c.takeaway || ' ' || c.outline || ' ' || array_to_string(c.sources, ' ') || ' ' || coalesce(c.items::text, '')
    || ' ' || coalesce((select string_agg(a.key || ' ' || a.value, ' ') from jsonb_each_text(c.shape) a), ''));
  if v_term is not null then
    p := array_append(p, format('“%s” looks like a client name · anonymise it', initcap(v_term)));
  end if;
  return p;
end;
$$;

-- As before (20261117250000), with the Presentation.
create or replace function private.is_self_complete(p_learning_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.learnings where id = p_learning_id and status = 'published'
                 and format in ('Podcast', 'Reel', 'E-learning', 'Avatar', 'Classroom', 'Flash cards', 'Job aid', 'Practice exam', 'Teach-back', 'Webinar', 'Interactive explainer', 'Animated flow', 'Presentation'));
$$;

revoke execute on function private.horizon_ok(jsonb), private.horizon_content(jsonb) from public, anon, authenticated;
