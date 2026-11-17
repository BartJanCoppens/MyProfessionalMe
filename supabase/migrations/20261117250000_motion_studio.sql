-- Motion Studio (studios plan, Task 2.3): the 'Animated flow' format through the shared studio path of 20261117230000
-- (items_ok, contribution_content, the check gate), and its completion.
--
-- items     An Animated flow's stages are [label, text] rows (rows_ok, as every studio), at most one fewer than its item
--           cap, and after them exactly one drawing: {svg, alt, made}. The svg is the SMIL-animated drawing (it starts
--           with <svg, at most 60,000 characters; the app sanitises it whenever it is drawn), alt its text alternative
--           (required, at most 2,000 characters), made who animated it, 'ai' or 'scripted' (a plain layout that was
--           never animated is not sendable), and seconds the length it was built for (20, 45 or 90, from "Length?" at
--           build time; the studio asks for a new build when "Length?" changes). Mirrored by isDrawing/SVG_MAX/ALT_MAX in src/logic/motionSvg.ts and
--           motionProblems in src/logic/studioContent.ts. The drawing is part of the items, so the check fingerprint, the
--           client-name scan (its text alternative and the drawing's text) and the guard's lock cover it unchanged.
-- content   private.motion_content: kind 'motion', the stages, the drawing, its text alternative, the length it was built
--           for and who made it (studioContent builds the same).
-- hours     A published Animated flow is a short media learning, like a reel (0.025 h).
-- completion An Animated flow completes itself ('mark' in COMPLETION, src/logic/record.ts): its panel does it when the
--           learner reaches the end or reads the text version.

-- One drawing of an Animated flow.
create function private.drawing_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(e) is distinct from 'object' then false
    else jsonb_typeof(e -> 'svg') is not distinct from 'string' and left(e ->> 'svg', 4) = '<svg' and char_length(e ->> 'svg') <= 60000
      and jsonb_typeof(e -> 'alt') is not distinct from 'string' and btrim(e ->> 'alt') <> '' and char_length(e ->> 'alt') <= 2000
      and jsonb_typeof(e -> 'made') is not distinct from 'string' and (e ->> 'made') in ('ai', 'scripted')
      and jsonb_typeof(e -> 'seconds') is not distinct from 'number' and (e ->> 'seconds') in ('20', '45', '90')
  end;
$$;

-- An Animated flow's items: its stages (the array items) as studio rows, one place short of the cap, and one drawing.
create function private.motion_ok(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.rows_ok(coalesce((select jsonb_agg(x.e order by x.n) from jsonb_array_elements(p_items) with ordinality as x(e, n) where jsonb_typeof(x.e) = 'array'), '[]'::jsonb),
      private.item_max('Animated flow') - 1, 2)
    and (select count(*) from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array') = 1
    and not exists (select 1 from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array' and not private.drawing_ok(e));
$$;

-- As before (20261117240000), with the Animated flow.
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
    when p_type = 'Interactive explainer' then private.explainer_ok(p_items)
    when p_type = 'Animated flow' then private.motion_ok(p_items)
    when p_type in ('Job aid', 'Case exercise') then private.rows_ok(p_items, private.item_max(p_type), 3)
      and (p_type <> 'Case exercise' or (
        not exists (select 1 from jsonb_array_elements(p_items) e where (e ->> 0) not in ('Brief', 'Deliverable', 'Criterion'))
        and (select count(distinct e ->> 0) from jsonb_array_elements(p_items) e) = 3))
    else false
  end;
$$;

-- An Animated flow: its stages in order, its drawing with the text alternative, the length it was built for and who made it.
create function private.motion_content(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', 'motion',
      'stages', (select jsonb_agg(jsonb_build_object('label', btrim(x.e ->> 0), 'text', btrim(x.e ->> 1)) order by x.n)
                 from jsonb_array_elements(p_items) with ordinality as x(e, n) where jsonb_typeof(x.e) = 'array'),
      'svg', d.e ->> 'svg', 'alt', btrim(d.e ->> 'alt'),
      'seconds', (d.e ->> 'seconds')::integer,
      'made', d.e ->> 'made')
  from (select e from jsonb_array_elements(p_items) e where jsonb_typeof(e) = 'object' limit 1) d;
$$;

-- As before (20261117240000), with the Animated flow.
create or replace function private.contribution_content(p_type text, p_items jsonb, p_shape jsonb)
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
    when 'Interactive explainer' then private.explainer_content(p_items, p_shape)
    when 'Animated flow' then private.motion_content(p_items)
  end;
$$;

-- As before (20261117240000); an Animated flow's drawing does not count toward its minimum, and what it lacks is named.
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
      when 'Animated flow' then 'Add the stages, build the animation and write its text alternative first' else 'Add the items first' end);
  elsif c.studio is not null and (select count(*) from jsonb_array_elements(c.items) e where c.type not in ('Interactive explainer', 'Animated flow') or jsonb_typeof(e) = 'array') < v_min then
    p := array_append(p, format('Add at least %s items', v_min));
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

-- As before (20261117230000); an Animated flow is a short media learning.
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
                      when 'Case exercise' then private.case_hours(c.shape) when 'Animated flow' then 0.025 else 0.25 end,
          0, '', btrim(c.takeaway), c.business_line, 'published', c.author_id, v_content)
  returning id into v_id;
  update public.contributions set status = 'published', step = 4, learning_id = v_id, published_at = now() where id = p_id;
  return v_id;
end;
$$;

-- As before (20261117240000), with the Animated flow.
create or replace function private.is_self_complete(p_learning_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.learnings where id = p_learning_id and status = 'published'
                 and format in ('Podcast', 'Reel', 'E-learning', 'Avatar', 'Classroom', 'Flash cards', 'Job aid', 'Practice exam', 'Teach-back', 'Webinar', 'Interactive explainer', 'Animated flow'));
$$;

revoke execute on function private.drawing_ok(jsonb), private.motion_ok(jsonb), private.motion_content(jsonb) from public, anon, authenticated;
