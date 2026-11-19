-- E-learning Studio, images and hotspots in the course (plan 2026-11-19, Task 2.3): the course shape gains the blocks 'image' and 'hotspot'
-- {block, id, lesson, path, alt, cap[, spots]}. The functions below are 20261119120000's, redefined with create or replace and behaving the same for every
-- other kind and for every course without a picture.
-- shape    private.course_shape_ok: a picture's path is '' while the creator has not added the file, or a media path (private.media_path_ok) of the
--          contribution's folder shape that ends in .png, .jpg, .jpeg or .webp (never .svg); alt is at most 600 characters (blank is allowed in a draft and asked
--          for by the check), cap at most 200. A hotspot has 2 to 8 points [x, y, title, text], x and y numbers from 0 to 100 (percent of the picture).
-- name     private.course_block_problem: the kinds 'image', "Image" and 'hotspot', "Hotspot image" (KIND_NAME, SHAPE_RULE in src/logic/courseContent.ts).
-- content  private.course_block_public: a picture publishes as {block, id, path, alt, cap[, spots]}, texts trimmed; learners read the file once the published
--          content names its path (private.can_read_media, 20261118230000: a "path" member anywhere in the content), and no other file of the folder.
-- check    private.course_image_problems: no file, no alt text (words and order of imageProblems in src/logic/courseContent.ts); private.contribution_problems
--          adds them for a course, and "An image is not there · add it again" through private.media_files_missing (20261117310000: the file must be in the
--          contribution's own folder and in Storage), so submit (which runs the problems again) refuses a file removed after the check.
-- Storage is unchanged: the bucket already lists image/png, image/jpeg and image/webp (20261117270000) and not image/svg+xml.

-- 1. Helpers of the shape.
create function private.course_pct(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric between 0 and 100 else false end, false);
$$;

create function private.course_picture_ok(b jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(b -> 'path') = 'string'
    and ((b ->> 'path') = '' or (private.media_path_ok(b ->> 'path') and (b ->> 'path') ~ '\.(png|jpg|jpeg|webp)$'))
    and jsonb_typeof(b -> 'alt') = 'string' and char_length(b ->> 'alt') <= 600
    and jsonb_typeof(b -> 'cap') = 'string' and char_length(b ->> 'cap') <= 200, false);
$$;

-- 2. The block's own fields, its name and its published form.
create or replace function private.course_shape_ok(b jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case b ->> 'block'
    when 'text' then jsonb_typeof(b -> 'h') = 'string' and char_length(b ->> 'h') <= 120 and private.course_text_ok(b -> 't', 4000)
    when 'callout' then private.course_text_ok(b -> 't', 600)
    when 'accordion' then private.course_len(b -> 'panels') between 2 and 8
      and not exists (select 1 from jsonb_array_elements(private.course_list(b -> 'panels')) p
                      where not (private.course_len(p) = 2 and private.course_text_ok(p -> 0, 120) and private.course_text_ok(p -> 1, 1200)))
    when 'check' then private.question_ok(b -> 'question')
    when 'sort' then private.course_text_ok(b -> 'p', 400) and private.course_len(b -> 'bins') = 2
      and not exists (select 1 from jsonb_array_elements(private.course_list(b -> 'bins')) x where not private.course_text_ok(x, 40))
      and private.course_len(b -> 'cards') between 2 and 10
      and not exists (select 1 from jsonb_array_elements(private.course_list(b -> 'cards')) c where not (private.course_len(c) >= 1 and private.course_text_ok(c -> 0, 160)))
    when 'branch' then private.course_text_ok(b -> 'q', 400) and private.course_len(b -> 'choices') between 2 and 4
      and not exists (select 1 from jsonb_array_elements(private.course_list(b -> 'choices')) c
                      where not (private.course_len(c) = 3 and private.course_text_ok(c -> 0, 200) and private.course_text_ok(c -> 1, 400) and jsonb_typeof(c -> 2) = 'boolean'))
    when 'reflect' then private.course_text_ok(b -> 'p', 400)
    when 'embed' then (b ->> 'format') in ('Avatar', 'Reel', 'Podcast', 'Game', 'Slides', 'Animated flow', 'Interactive explainer', 'Flash cards', 'Practice exam', 'Job aid', 'Case exercise') and jsonb_typeof(b -> 'learning') = 'string' and (b ->> 'learning') ~ '^(L[0-9]{1,6})?$'
    when 'image' then private.course_picture_ok(b)
    when 'hotspot' then private.course_picture_ok(b) and private.course_len(b -> 'spots') between 2 and 8
      and not exists (select 1 from jsonb_array_elements(private.course_list(b -> 'spots')) s
                      where not (private.course_len(s) = 4 and private.course_pct(s -> 0) and private.course_pct(s -> 1) and private.course_text_ok(s -> 2, 120) and private.course_text_ok(s -> 3, 600)))
    when 'exercise' then private.course_text_ok(b -> 'q', 400)
      and case when jsonb_typeof(b -> 'a') = 'number' then abs((b ->> 'a')::numeric) < 1e15 else false end
      and case when jsonb_typeof(b -> 'tol') = 'number' then (b ->> 'tol')::numeric >= 0 and (b ->> 'tol')::numeric < 1e15 else false end
      and jsonb_typeof(b -> 'unit') = 'string' and char_length(b ->> 'unit') <= 12
  end, false);
$$;


create or replace function private.course_block_problem(b jsonb, p_lessons integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(b) is distinct from 'object' or k.kind is null then 'A block has a kind that is not known'
    when jsonb_typeof(b -> 'id') is distinct from 'string' or (b ->> 'id') !~ '^b[0-9a-z]{4,20}$' then 'A block has an id that is missing or not allowed'
    when not private.course_lesson_ok(b, p_lessons) then 'A block points to a lesson that does not exist'
    when not private.course_shape_ok(b) then 'Lesson ' || ((b ->> 'lesson')::integer + 1) || ' · ' || k.name || ': ' || k.rule
    when k.kind = 'sort' and exists (select 1 from jsonb_array_elements(b -> 'cards') c where not (private.course_len(c) = 2 and jsonb_typeof(c -> 1) = 'number' and (c ->> 1) in ('0', '1')))
      then 'Lesson ' || ((b ->> 'lesson')::integer + 1) || ' · ' || k.name || ': give every item a group'
    when k.kind = 'branch' and not exists (select 1 from jsonb_array_elements(b -> 'choices') c where c ->> 2 = 'true')
      then 'Lesson ' || ((b ->> 'lesson')::integer + 1) || ' · ' || k.name || ': mark at least one good choice'
  end
  from (select 1) o left join (values
    ('text', 'Text', 'keep the heading to 120 characters and write the text, up to 4000'),
    ('callout', 'Callout', 'write the callout, up to 600 characters'),
    ('accordion', 'Accordion', 'give 2 to 8 panels, each with a title and a text'),
    ('check', 'Knowledge check', 'give four options, the right answer and why'),
    ('sort', 'Sort into groups', 'give a prompt, two group names and 2 to 10 items'),
    ('branch', 'Branching scenario', 'give a question and 2 to 4 choices, each with its reply and whether it is good'),
    ('reflect', 'Reflection', 'write the prompt for the learner, up to 400 characters'),
    ('embed', 'Embedded learning', 'pick one of the formats and a learning from the library'),
    ('image', 'Image', 'add a .png, .jpg, .jpeg or .webp image, alt text up to 600 characters and a caption up to 200'),
    ('hotspot', 'Hotspot image', 'give 2 to 8 points, each placed on the image (0 to 100 %) with a title and a text'),
    ('exercise', 'Calculation exercise', 'give a question, the right number, the tolerance (0 or more) and a unit of up to 12 characters')
  ) as k(kind, name, rule) on k.kind = b ->> 'block';
$$;

create or replace function private.course_block_public(b jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case b ->> 'block'
    when 'text' then jsonb_build_object('block', 'text', 'id', b -> 'id', 'h', private.trimmed(b ->> 'h'), 't', private.trimmed(b ->> 't'))
    when 'callout' then jsonb_build_object('block', 'callout', 'id', b -> 'id', 't', private.trimmed(b ->> 't'))
    when 'accordion' then jsonb_build_object('block', 'accordion', 'id', b -> 'id', 'panels',
      (select jsonb_agg(jsonb_build_array(private.trimmed(p ->> 0), private.trimmed(p ->> 1)) order by x.n) from jsonb_array_elements(b -> 'panels') with ordinality x(p, n)))
    when 'check' then jsonb_build_object('block', 'check', 'id', b -> 'id', 'question', jsonb_build_object(
      't', private.trimmed(b #>> '{question,t}'), 'q', private.trimmed(b #>> '{question,q}'), 'a', b #> '{question,a}', 'why', private.trimmed(b #>> '{question,why}'),
      'o', (select jsonb_agg(private.trimmed(o #>> '{}') order by x.n) from jsonb_array_elements(b #> '{question,o}') with ordinality x(o, n))))
    when 'sort' then jsonb_build_object('block', 'sort', 'id', b -> 'id', 'p', private.trimmed(b ->> 'p'),
      'bins', jsonb_build_array(private.trimmed(b #>> '{bins,0}'), private.trimmed(b #>> '{bins,1}')),
      'cards', (select jsonb_agg(jsonb_build_array(private.trimmed(c ->> 0), c -> 1) order by x.n) from jsonb_array_elements(b -> 'cards') with ordinality x(c, n)))
    when 'branch' then jsonb_build_object('block', 'branch', 'id', b -> 'id', 'q', private.trimmed(b ->> 'q'), 'choices',
      (select jsonb_agg(jsonb_build_array(private.trimmed(c ->> 0), private.trimmed(c ->> 1), c -> 2) order by x.n) from jsonb_array_elements(b -> 'choices') with ordinality x(c, n)))
    when 'reflect' then jsonb_build_object('block', 'reflect', 'id', b -> 'id', 'p', private.trimmed(b ->> 'p'))
    when 'embed' then jsonb_build_object('block', 'embed', 'id', b -> 'id', 'format', b -> 'format', 'learning', b -> 'learning')
    when 'image' then jsonb_build_object('block', 'image', 'id', b -> 'id', 'path', b -> 'path', 'alt', private.trimmed(b ->> 'alt'), 'cap', private.trimmed(b ->> 'cap'))
    when 'hotspot' then jsonb_build_object('block', 'hotspot', 'id', b -> 'id', 'path', b -> 'path', 'alt', private.trimmed(b ->> 'alt'), 'cap', private.trimmed(b ->> 'cap'), 'spots',
      (select jsonb_agg(jsonb_build_array(s -> 0, s -> 1, private.trimmed(s ->> 2), private.trimmed(s ->> 3)) order by x.n) from jsonb_array_elements(b -> 'spots') with ordinality x(s, n)))
    when 'exercise' then jsonb_build_object('block', 'exercise', 'id', b -> 'id', 'q', private.trimmed(b ->> 'q'), 'a', b -> 'a', 'tol', b -> 'tol', 'unit', private.trimmed(b ->> 'unit'))
  end;
$$;

-- 3. The image check.
-- The image files a course names, in order (a block with no file yet names none), as courseImagePaths in src/logic/courseContent.ts.
create function private.course_image_paths(p_items jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(x.b ->> 'path' order by x.n) filter (where x.b ->> 'path' <> ''), '{}')
  from jsonb_array_elements(private.course_list(p_items)) with ordinality x(b, n)
  where jsonb_typeof(x.b) = 'object' and x.b ->> 'block' in ('image', 'hotspot');
$$;

-- What a picture still lacks (items_ok already holds): the file, then the alt text, per block in order, each sentence once; in the words of imageProblems.
create function private.course_image_problems(p_items jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(r.m order by r.o), '{}') from (
    select q.m, min(q.o) as o from (
      select x.n * 2 + v.k as o, v.m
      from jsonb_array_elements(private.course_list(p_items)) with ordinality x(b, n)
      cross join lateral (values
        (0, case when (x.b ->> 'path') = '' then 'Lesson ' || ((x.b ->> 'lesson')::integer + 1) || ' · ' || case x.b ->> 'block' when 'image' then 'Image' else 'Hotspot image' end || ': add the image' end),
        (1, case when private.trimmed(x.b ->> 'alt') = '' then 'Lesson ' || ((x.b ->> 'lesson')::integer + 1) || ' · ' || case x.b ->> 'block' when 'image' then 'Image' else 'Hotspot image' end || ': write the alt text (read aloud by screen readers)' end)
      ) v(k, m)
      where jsonb_typeof(x.b) = 'object' and x.b ->> 'block' in ('image', 'hotspot')
    ) q where q.m is not null group by q.m
  ) r;
$$;

-- 4. contribution_problems, as in 20261119120000 with the image problems and the image files added to the E-learning part.
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
  v_speakers text[];
  v_game jsonb;
  v_review public.game_reviews;
  v_row jsonb;
  v_role text;
  v_knows text;
  v_video jsonb;
  v_voiced boolean;
  v_secs numeric;
  v_scene integer;
  v_paths text[];
  v_n integer;
  v_title text;
  v_scored integer;
  v_embed text;
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
    -- an avatar's rows say what is wrong with them (the character, the learning points, the quiz), a course's its blocks, then its lesson count; anything else they get wrong is the generic line
    if c.type = 'Avatar' and cardinality(private.avatar_row_problems(c.items)) > 0 then
      p := p || private.avatar_row_problems(c.items);
    elsif c.type = 'E-learning' and cardinality(private.course_row_problems(c.items)) > 0 then
      p := p || private.course_row_problems(c.items);
    elsif c.type = 'E-learning' and (select count(*) from jsonb_array_elements(private.course_list(c.items)) e where jsonb_typeof(e) = 'array') < 2 then
      p := array_append(p, 'Add at least 2 lessons');
    else
      p := array_append(p, case c.type when 'Flash cards' then 'Add the cards first: generate them with AI or import a CSV'
        when 'Practice exam' then 'Add the questions first: generate them with AI or import a CSV'
        when 'Presentation' then 'Add the .horizon file first'
        when 'Animated flow' then 'Add the stages, build the animation and write its text alternative first'
        when 'Slides' then 'Add the slides first: each needs a title, bullets and a talk-over'
        when 'Podcast' then 'Add the script first: a chapter, then a line for each speaker'
        when 'Reel' then 'Check the reel''s rows first: a Hook, scenes, a Close and a check with 2 to 4 options, the right one first' else 'Add the items first' end);
    end if;
  elsif c.studio is not null and (select count(*) from jsonb_array_elements(c.items) e where c.type not in ('Interactive explainer', 'Animated flow', 'Slides', 'Podcast', 'Game', 'Reel') or jsonb_typeof(e) = 'array') < v_min then
    p := array_append(p, format('Add at least %s items', v_min));
  end if;
  if c.type = 'Presentation' and private.items_ok(c.type, c.items) then
    if private.media_files_missing(c.author_id, c.id, array[c.items -> 0 ->> 'path']) then
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
    if private.slides_voiced(c.items, c.shape) and private.media_files_missing(c.author_id, c.id,
        array(select private.slide_clip(c.items, n) ->> 'path' from generate_series(0, jsonb_array_length(private.rows_of(c.items)) - 1) n)) then
      p := array_append(p, 'A voice-over file is not there · voice the slides again');
    end if;
  end if;
  if c.type = 'Podcast' and c.studio is not null and private.items_ok(c.type, c.items) then
    v_speakers := case coalesce(c.shape ->> 'Format?', 'Interview with an expert') when 'Two AI hosts' then array['Host', 'Co-host'] when 'Solo talk' then array['Host'] else array['Host', 'Guest'] end;
    if exists (select 1 from jsonb_array_elements(private.podcast_turns(c.items)) t where (t ->> 'speaker') <> all (v_speakers)) then
      p := array_append(p, 'A line has a speaker this format does not have: ' || array_to_string(v_speakers, ' and ') || ' only');
    end if;
    if not private.podcast_voiced(c.items) then
      p := array_append(p, 'Voice every line in Produce: an episode is always told by the AI voice, with a different voice for each speaker');
    end if;
    if private.podcast_seconds(c.items) > 1800 then
      p := array_append(p, 'The episode runs longer than 30 minutes: shorten the script');
    end if;
    -- every voice-over file the episode uses must be in the contribution's own folder and in Storage
    if private.podcast_voiced(c.items) and private.media_files_missing(c.author_id, c.id,
        array(select private.turn_clip(c.items, n) ->> 'path' from generate_series(0, jsonb_array_length(private.podcast_turns(c.items)) - 1) n)) then
      p := array_append(p, 'A voice-over file is not there · voice the episode again');
    end if;
  end if;
  if c.type = 'Game' and c.studio is not null and private.items_ok(c.type, c.items) then
    v_role := private.game_role(c.shape);
    v_row := private.game_role_row(c.items);
    v_game := (select e from jsonb_array_elements(c.items) e where jsonb_typeof(e) = 'object');
    if v_role <> 'No AI role' and v_row is null then
      p := array_append(p, 'Add the AI role: who it plays and what it knows');
    elsif v_role = 'No AI role' and v_row is not null then
      p := array_append(p, 'Remove the AI role row, or choose a role in Shape it');
    end if;
    if v_game is null then
      p := array_append(p, 'Build the game in Produce first');
    else
      p := p || private.game_scan(v_game -> 'files');
      select * into v_review from public.game_reviews where contribution_id = c.id;
      if not found then
        p := array_append(p, 'The house-rules check has not passed');
      elsif v_review.review_hash is distinct from private.game_review_hash(c.title, c.items, c.shape, c.takeaway) then
        p := array_append(p, 'Run the house-rules check again');
      elsif not v_review.passed then
        p := array_append(p, 'The house-rules check has not passed' || coalesce(': ' || nullif(v_review.reasons[1], ''), ''));
      end if;
      if v_game -> 'for' ->> 'role' <> v_role then
        p := array_append(p, 'You changed the AI role after the build · build the game again');
      end if;
      -- what the AI role knows (its text 2, 12 characters or more) must not be in the game's own code: learners read the code
      v_knows := private.trimmed(coalesce(v_row ->> 2, ''));
      if private.text_echoes(v_knows, v_game -> 'files' ->> 'index.html', true) or private.text_echoes(v_knows, v_game -> 'files' ->> 'game.js', true) then
        p := array_append(p, 'The game''s code repeats what the AI role hides');
      end if;
      -- nor may the texts learners read: the concept, win, rounds and who the AI plays (everything but the role's own text 2)
      if exists (select 1 from jsonb_array_elements(private.rows_of(c.items)) r
          where private.text_echoes(v_knows, r ->> 1, true) or (r ->> 0 <> 'AI role' and private.text_echoes(v_knows, r ->> 2, true))) then
        p := array_append(p, 'The game''s text repeats what the AI role hides');
      end if;
    end if;
  end if;
  if c.type = 'Reel' and c.studio is not null and private.items_ok(c.type, c.items) then
    v_voiced := private.reel_voiced(c.items, c.shape);
    v_secs := private.reel_seconds(c.items, c.shape);
    v_video := (select e from jsonb_array_elements(c.items) e where jsonb_typeof(e) = 'object' and e ->> 'kind' = 'video');
    v_paths := array(select private.reel_clip(c.items, n) ->> 'path' from generate_series(0, jsonb_array_length(private.reel_scenes(c.items)) - 1) n);
    if private.reel_check(c.items) is null then
      p := array_append(p, 'Add the check question: one question, the right answer first');
    end if;
    if private.reel_wants_voice(c.shape) and not v_voiced then
      p := array_append(p, 'Voice every scene in Produce, or choose Text and music only in Shape it');
    elsif v_voiced then
      select n + 1 into v_scene from generate_series(0, jsonb_array_length(private.reel_scenes(c.items)) - 1) n where not (private.reel_clip(c.items, n) ? 'words') order by n limit 1;
      if v_scene is not null then
        p := array_append(p, format('Voice scene %s again · its word timing is missing', v_scene));
      end if;
    end if;
    if v_secs > 90 and not (private.reel_wants_voice(c.shape) and not v_voiced) then
      p := array_append(p, format('The reel runs %s s · at most 90 s', ceil(v_secs)));
    end if;
    if v_video is null then
      p := array_append(p, 'Make the final cut in Produce');
    else
      -- the cut is made from these rows and these clips (rows and clips are compared as the browser stored them)
      if v_video -> 'made' -> 'rows' is distinct from private.rows_of(c.items)
         or (v_voiced and v_video -> 'made' -> 'clips' is distinct from to_jsonb(v_paths))
         or (not private.reel_wants_voice(c.shape) and v_video -> 'made' -> 'clips' <> '[]'::jsonb)
         or (c.shape ->> 'Who presents?' = 'Stock presenter and AI voice') is distinct from (v_video -> 'made' ->> 'look' is not null) then
        p := array_append(p, 'You changed the reel after the final cut · make the final cut again');
      end if;
      if (v_voiced or not private.reel_wants_voice(c.shape)) and abs((v_video ->> 'seconds')::numeric - v_secs) > 1.5 then
        p := array_append(p, 'The video''s length does not match the voice-over · make the final cut again');
      end if;
      -- a stock presenter needs an active stock look (one can be switched off after it was picked)
      if c.shape ->> 'Who presents?' = 'Stock presenter and AI voice' and v_video -> 'made' ->> 'look' is not null
         and not exists (select 1 from public.stock_looks l where l.active and l.id::text = v_video -> 'made' ->> 'look') then
        p := array_append(p, 'That look is not on the stock list');
      end if;
      -- every file must be in the contribution's own folder and in Storage; the video must be the type and size it claims
      if v_voiced and private.media_files_missing(c.author_id, c.id, v_paths) then
        p := array_append(p, 'A voice-over file is not there · voice the reel again');
      end if;
      if private.media_files_missing(c.author_id, c.id, array[v_video ->> 'path']) then
        p := array_append(p, 'The video file is not there · make the final cut again');
      elsif exists (select 1 from storage.objects o where o.bucket_id = 'media' and o.name = v_video ->> 'path'
                    and (coalesce(o.metadata ->> 'mimetype', '') <> v_video ->> 'mime' or coalesce((o.metadata ->> 'size')::numeric, 52428801) > 52428800)) then
        p := array_append(p, 'The video file is not the type or size it claims');
      end if;
    end if;
  end if;
  if c.type = 'Avatar' and c.studio is not null and private.items_ok(c.type, c.items) then
    if coalesce(c.shape ->> 'How long is a run?', '') not in ('5 minutes', '10 minutes', '15 minutes') then
      p := array_append(p, 'Choose how long a run is');
    end if;
    if coalesce(c.shape ->> 'Language', '') not in ('English', 'Dutch', 'French') then
      p := array_append(p, 'Choose the language');
    end if;
    if coalesce(c.shape ->> 'Difficulty', '') not in ('Gentle', 'Realistic', 'Tough') then
      p := array_append(p, 'Choose the difficulty');
    end if;
    if coalesce(c.shape ->> 'How is it scored?', '') not in ('AI scores, counsellor confirms', 'Practice only') then
      p := array_append(p, 'Choose how it is scored');
    end if;
    -- the look is chosen in Produce and is an active stock look; the voice is optional, and an active stock voice when it is set
    if coalesce(c.shape ->> 'Look', '') = '' then
      p := array_append(p, 'Choose a look in Produce');
    elsif not exists (select 1 from public.stock_looks l where l.active and l.id::text = c.shape ->> 'Look') then
      p := array_append(p, 'That look is not on the stock list');
    end if;
    if coalesce(c.shape ->> 'Voice', '') <> '' and not exists (select 1 from public.stock_voices v where v.active and v.id::text = c.shape ->> 'Voice') then
      p := array_append(p, 'That voice is not on the stock list');
    end if;
    -- what the character reveals or hides must not be in the texts learners read
    if private.avatar_echo(c.items, c.shape) then
      p := array_append(p, 'The scenario''s public text repeats what the character keeps back');
    end if;
  end if;
  if c.type = 'E-learning' and c.studio is not null and private.items_ok(c.type, c.items) then
    -- every lesson has a block; a completion rule that scores needs at least one scored block
    for v_n, v_title in select l.n, private.trimmed(l.e ->> 1) from jsonb_array_elements(private.rows_of(c.items)) with ordinality l(e, n)
                        where not exists (select 1 from jsonb_array_elements(c.items) b where jsonb_typeof(b) = 'object' and b ->> 'lesson' = (l.n - 1)::text) order by l.n loop
      p := array_append(p, format('Lesson %s “%s” has no blocks yet', v_n, v_title));
    end loop;
    v_scored := (select count(*) from jsonb_array_elements(c.items) e where jsonb_typeof(e) = 'object' and e ->> 'block' in ('check', 'sort', 'exercise'));
    if v_scored = 0 and private.course_rule(c.shape) <> 'seen' then
      p := array_append(p, 'Add a block that scores (a knowledge check, a sort or a calculation), or choose “All lessons viewed” in Shape it');
    end if;
    -- a picture has its file and its alt text; every file must be in the contribution's own folder and in Storage (a file removed after the check is refused at submit)
    p := p || private.course_image_problems(c.items);
    if private.media_files_missing(c.author_id, c.id, private.course_image_paths(c.items)) then
      p := array_append(p, 'An image is not there · add it again');
    end if;
    -- an embedded learning must still be a published learning of its format: a source retired after the check is refused at submit, which runs this again
    foreach v_embed in array private.course_embed_problems(c.items) loop
      p := array_append(p, v_embed);
    end loop;
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

revoke execute on function private.course_pct(jsonb), private.course_picture_ok(jsonb), private.course_image_paths(jsonb), private.course_image_problems(jsonb) from public, anon, authenticated;
