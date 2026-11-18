-- Slides Studio (studios plan, Task 3.4): the 'Slides' format through the shared studio path (items_ok,
-- contribution_content, the check gate), with the AI voice's audio stored in the media bucket.
--
-- items     A deck's slides are [title, bullets, talk-over] rows (rows_ok, width 3): the bullets are one text between
--           middle dots (·), at least one, and the talk-over is required; at most one fewer than the item cap (14), because
--           after them may come one voice-over item {kind: 'voice', clips: [...]} (private.voice_ok; isVoiceItem in
--           src/logic/voiceItem.ts). A clip is {slide, text, voice, path, seconds, marks}: the slide's index (0 to 13), the words it
--           was made from, the stock voice's id (`voice`, one voice for the whole deck), an .mp3 in the media folder shape, its length (up to 180 s) and the marks of the talk-over (at
--           most 50, each {kind: 'next' | 'cue', at}). A clip counts only while its text is the slide's present talk-over.
-- shape     "Who presents?" = 'AI voice' needs a clip on every slide (else only captions at a reading pace of 140 words
--           a minute); "Template" and "Transitions" are published with the deck (default Firm template, Calm).
-- check     contribution_problems refuses an AI-voice deck with an unvoiced slide, a talk over 15 minutes (900 s, the
--           design's limit for slides) and any used voice-over file that is not in the contribution's own folder and in
--           Storage (the carry-in of Task 3.1: a referenced file must exist before it is sent).
-- content   private.slides_content: the slides with their bullets and talk-over, each slide's audio {path, seconds, marks}
--           when the AI voice is used, the total seconds (private.slides_seconds), the template and transitions, and who told
--           it ('ai' or 'scripted', which publish_contribution reads for learnings.ai_made). A slide drawing (svg) is not
--           made by any studio yet, so none is published.
-- hours     A published deck counts its total seconds through private.horizon_hours, the Presentation's rule (0.05 h steps,
--           at least 0.05 h, at most 1 h).
-- completion 'media' (COMPLETION in src/logic/record.ts): the learner completes it by playing it to the end;
--           private.is_self_complete lists it.

-- Text trimmed of exactly the characters JavaScript's trim() strips (tab, line feed, vertical tab, form feed, carriage return, space,
-- no-break space, Ogham space mark, the en to hair spaces, line and paragraph separators, narrow no-break space, medium
-- mathematical space, ideographic space and the byte order mark), so the studios' TypeScript and SQL read the same text.
create function private.trimmed(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(p_text, E'\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff');
$$;

-- How many words a talk-over speaks: the text without the ⟨next⟩ and ⟨cue⟩ marks (spoken in src/logic/narration.ts).
create function private.spoken_words(p_text text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select cardinality(array_remove(regexp_split_to_array(btrim(regexp_replace(regexp_replace(regexp_replace(p_text, '⟨(next|cue)⟩', ' ', 'g'), '\s+', ' ', 'g'), '\s+([.,!?;:])', '\1', 'g')), '\s+'), ''));
$$;

-- The seconds a talk-over takes at 140 words a minute without a voice (ownSeconds in src/logic/narration.ts): its spoken
-- words, at least 2 seconds.
create function private.own_seconds(p_text text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select greatest(2, private.spoken_words(p_text) * 60 / 140.0);
$$;

-- A deck's voice-over item.
create function private.voice_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(e) is distinct from 'object' then false
    else (select count(*) from jsonb_object_keys(e)) = 2 and e ->> 'kind' is not distinct from 'voice'
      and case when jsonb_typeof(e -> 'clips') is not distinct from 'array' then
        jsonb_array_length(e -> 'clips') between 1 and 14
        and (select count(distinct c ->> 'slide') from jsonb_array_elements(e -> 'clips') c) = jsonb_array_length(e -> 'clips')
        and not exists (select 1 from jsonb_array_elements(e -> 'clips') c where not (case
          when jsonb_typeof(c) is distinct from 'object' then false
          when (select count(*) from jsonb_object_keys(c)) <> 6 or not (c ?& array['slide', 'text', 'path', 'seconds', 'marks', 'voice']) then false
          when jsonb_typeof(c -> 'slide') is distinct from 'number' or (c ->> 'slide') !~ '^[0-9]{1,2}$' or jsonb_typeof(c -> 'text') is distinct from 'string'
            or jsonb_typeof(c -> 'path') is distinct from 'string' or jsonb_typeof(c -> 'voice') is distinct from 'string' or jsonb_typeof(c -> 'seconds') is distinct from 'number' or jsonb_typeof(c -> 'marks') is distinct from 'array' then false
          else (c ->> 'slide')::integer between 0 and 13 and private.trimmed(c ->> 'text') <> '' and char_length(c ->> 'text') <= 600 and (c ->> 'voice') ~ '^[A-Za-z0-9_-]{1,64}$'
            and private.media_path_ok(c ->> 'path') and right(c ->> 'path', 4) = '.mp3'
            and (c ->> 'seconds')::numeric > 0 and (c ->> 'seconds')::numeric <= 180
            and jsonb_array_length(c -> 'marks') <= 50
            and not exists (select 1 from jsonb_array_elements(c -> 'marks') m where case
              when jsonb_typeof(m) is distinct from 'object' then true
              when (select count(*) from jsonb_object_keys(m)) <> 2 or not (m ?& array['kind', 'at']) then true
              when jsonb_typeof(m -> 'kind') is distinct from 'string' or (m ->> 'kind') not in ('next', 'cue') or jsonb_typeof(m -> 'at') is distinct from 'number' then true
              else (m ->> 'at')::numeric not between 0 and 180 end)
          end))
      else false end
  end;
$$;

-- A deck's items: its slides (the array items) as rows with bullets and a talk-over, one place short of the cap, and at
-- most one voice-over item.
create function private.slides_ok(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.rows_ok(private.rows_of(p_items), private.item_max('Slides') - 1, 3)
    and not exists (select 1 from jsonb_array_elements(private.rows_of(p_items)) e
                    where coalesce(private.spoken_words(e ->> 2), 0) < 1 or not exists (select 1 from regexp_split_to_table(e ->> 1, '\s*·\s*') b where private.trimmed(b) <> ''))
    and (select count(*) from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array') <= 1
    and not exists (select 1 from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array' and not private.voice_ok(e));
$$;

-- The clip made from slide p_slide's present talk-over, or null.
create function private.slide_clip(p_items jsonb, p_slide integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select c from jsonb_array_elements(coalesce((select e -> 'clips' from jsonb_array_elements(p_items) e where jsonb_typeof(e) = 'object' limit 1), '[]'::jsonb)) c
  where (c ->> 'slide')::integer = p_slide and private.trimmed(c ->> 'text') = private.trimmed(private.rows_of(p_items) -> p_slide ->> 2)
  limit 1;
$$;

-- Whether the deck is told by the AI voice: it is chosen in "Who presents?" and every slide has its clip.
create function private.slides_voiced(p_items jsonb, p_shape jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_shape ->> 'Who presents?', '') = 'AI voice' and jsonb_array_length(private.rows_of(p_items)) > 0
    and not exists (select 1 from generate_series(0, jsonb_array_length(private.rows_of(p_items)) - 1) n where private.slide_clip(p_items, n) is null)
    and (select count(distinct private.slide_clip(p_items, n) ->> 'voice') from generate_series(0, jsonb_array_length(private.rows_of(p_items)) - 1) n) = 1;
$$;

-- How long the deck plays, rounded to seconds: each slide's stored seconds with the AI voice, else its words at the pace.
create function private.slides_seconds(p_items jsonb, p_shape jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(sum(case when private.slides_voiced(p_items, p_shape) then (private.slide_clip(p_items, r.n::integer - 1) ->> 'seconds')::numeric
                                 else private.own_seconds(r.e ->> 2) end), 0))
  from jsonb_array_elements(private.rows_of(p_items)) with ordinality as r(e, n);
$$;

-- A deck's content (slidesContent in src/logic/slidesContent.ts builds the same for the preview).
create function private.slides_content(p_items jsonb, p_shape jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', 'slides',
    'slides', (select jsonb_agg(jsonb_build_object('title', private.trimmed(r.e ->> 0), 'bullets', (select jsonb_agg(private.trimmed(b)) from regexp_split_to_table(r.e ->> 1, '\s*·\s*') b where private.trimmed(b) <> ''),
                                                   'narration', private.trimmed(r.e ->> 2))
                                || case when private.slides_voiced(p_items, p_shape)
                                     then jsonb_build_object('audio', jsonb_build_object('path', private.slide_clip(p_items, r.n::integer - 1) ->> 'path',
                                       'seconds', private.slide_clip(p_items, r.n::integer - 1) -> 'seconds', 'marks', private.slide_clip(p_items, r.n::integer - 1) -> 'marks'))
                                     else '{}'::jsonb end
                                order by r.n)
               from jsonb_array_elements(private.rows_of(p_items)) with ordinality as r(e, n)),
    'seconds', private.slides_seconds(p_items, p_shape)::integer,
    'template', case when p_shape ->> 'Template' = 'Minimal' then 'Minimal' else 'Firm template' end,
    'transitions', case when p_shape ->> 'Transitions' = 'Slide in' then 'Slide in' else 'Calm' end,
    'made', case when private.slides_voiced(p_items, p_shape) then 'ai' else 'scripted' end);
$$;

-- As before (20261117290000), with the Slides.
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
    when p_type = 'Slides' then private.slides_ok(p_items)
    when p_type = 'Interactive explainer' then private.explainer_ok(p_items)
    when p_type = 'Animated flow' then private.motion_ok(p_items)
    when p_type in ('Job aid', 'Case exercise') then private.rows_ok(p_items, private.item_max(p_type), 3)
      and (p_type <> 'Case exercise' or (
        not exists (select 1 from jsonb_array_elements(p_items) e where (e ->> 0) not in ('Brief', 'Deliverable', 'Criterion'))
        and (select count(distinct e ->> 0) from jsonb_array_elements(p_items) e) = 3))
    else false
  end;
$$;

-- As before (20261117290000), with the Slides.
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
    when 'Slides' then private.slides_content(p_items, p_shape)
  end;
$$;

-- As before (20261117290000), with the Slides: the voice, the 15 minutes and the voice-over files.
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
      when 'Animated flow' then 'Add the stages, build the animation and write its text alternative first'
      when 'Slides' then 'Add the slides first: each needs a title, bullets and a talk-over' else 'Add the items first' end);
  elsif c.studio is not null and (select count(*) from jsonb_array_elements(c.items) e where c.type not in ('Interactive explainer', 'Animated flow', 'Slides') or jsonb_typeof(e) = 'array') < v_min then
    p := array_append(p, format('Add at least %s items', v_min));
  end if;
  if c.type = 'Presentation' and private.items_ok(c.type, c.items) then
    v_path := c.items -> 0 ->> 'path';
    if split_part(v_path, '/', 1) <> c.author_id::text or split_part(v_path, '/', 2) <> c.id::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'media' and o.name = v_path) then
      p := array_append(p, 'The .horizon file is not there · add it again');
    end if;
  end if;
  if c.type = 'Slides' and c.studio is not null and private.items_ok(c.type, c.items) then
    if coalesce(c.shape ->> 'Who presents?', '') = 'AI voice' and not private.slides_voiced(c.items, c.shape) then
      p := array_append(p, 'Voice every slide in Produce, or choose Captions only in Shape it');
    end if;
    if private.slides_seconds(c.items, c.shape) > 900 then
      p := array_append(p, 'The talk runs longer than 15 minutes: shorten the talk-over or cut slides');
    end if;
    -- every voice-over file the slides use must be in the contribution's own folder and in Storage
    if private.slides_voiced(c.items, c.shape) and exists (
      select 1 from generate_series(0, jsonb_array_length(private.rows_of(c.items)) - 1) n
      where split_part(private.slide_clip(c.items, n) ->> 'path', '/', 1) <> c.author_id::text or split_part(private.slide_clip(c.items, n) ->> 'path', '/', 2) <> c.id::text
         or not exists (select 1 from storage.objects o where o.bucket_id = 'media' and o.name = private.slide_clip(c.items, n) ->> 'path')) then
      p := array_append(p, 'A voice-over file is not there · voice the slides again');
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

-- As before (20261117290000), with the Slides.
create or replace function private.is_self_complete(p_learning_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.learnings where id = p_learning_id and status = 'published'
                 and format in ('Podcast', 'Reel', 'E-learning', 'Avatar', 'Classroom', 'Flash cards', 'Job aid', 'Practice exam', 'Teach-back', 'Webinar', 'Interactive explainer', 'Animated flow', 'Presentation', 'Slides'));
$$;

-- As before (20261117290000), with a deck's hours from its seconds.
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
  insert into public.learnings (title, domain, level, format, source, hours, cpd, due, why, business_line, status, created_by, content, ai_made)
  values (btrim(c.title), c.domain, c.level, c.type, 'Peer contribution',
          case c.type when 'Reel' then 0.025 when 'Podcast' then 0.5 when 'Micro-guide' then 0.1 when 'Practice exam' then 0.5
                      when 'Case exercise' then private.case_hours(c.shape) when 'Animated flow' then 0.025
                      when 'Presentation' then private.horizon_hours((v_content ->> 'seconds')::numeric)
                      when 'Slides' then private.horizon_hours((v_content ->> 'seconds')::numeric) else 0.25 end,
          0, '', btrim(c.takeaway), c.business_line, 'published', c.author_id, v_content,
          c.ai_assisted or coalesce(v_content ->> 'made', '') = 'ai')
  returning id into v_id;
  update public.contributions set status = 'published', step = 4, learning_id = v_id, published_at = now() where id = p_id;
  return v_id;
end;
$$;

revoke execute on function private.trimmed(text), private.spoken_words(text), private.own_seconds(text), private.voice_ok(jsonb), private.slides_ok(jsonb), private.slide_clip(jsonb, integer), private.slides_voiced(jsonb, jsonb),
  private.slides_seconds(jsonb, jsonb), private.slides_content(jsonb, jsonb) from public, anon, authenticated;
