-- Reel Studio (studios plan, Task 5.5): the 'Reel' format through the shared studio path. Client side: src/logic/reelContent.ts,
-- src/logic/videoItem.ts and src/studioReel.ts. No new table, policy or grant: the contributions and storage policies and the check
-- gate cover it, and publish_contribution (20261117310000) already counts 0.025 h for a Reel and marks it AI made through `made`.
--
-- items     A reel is rows [label, text, text2] (rows_ok, width 3, two places short of the cap): Hook first, "Scene 1", "Scene 2" ...
--           from 1, Close (3 to 7 scenes in all; text the voice-over, text 2 the on-screen text), then an optional Check last (text
--           the question, text 2 its 2 to 4 options split on " · ", the right one first). After the rows come at most one voice-over
--           item (private.voice_ok, `slide` the scene's index) and at most one video item {kind, path, seconds, size, mime, made}
--           (private.video_ok): the cut the browser made, with `made` saying what it was made from (rows, voice clip paths, look,
--           format, captions, music). A reel is 10 items at most (private.item_max).
-- content   private.reel_content is reelContent in src/logic/reelContent.ts for a reel with a cut: each scene with its start and
--           seconds on the reel's clock (a scene lasts its clip, or its words at 140 a minute, with 0.3 s between scenes) and the
--           clip's word timings, the look joined from stock_looks, the check with the right option first (a = 0). Caption cues are
--           not stored: the browser groups them from the words, so that grouping has no twin here.
-- check     contribution_problems refuses a reel without its check question, not voiced as chosen, with a clip without word timing,
--           over 90 s, without a cut, changed after it (rows or clips differ from `made`), whose cut does not run as long as the reel
--           (1.5 s), whose presenter was switched after the cut (portrait or cards), whose stock look is switched off, whose voice or video files are outside the folder or not in Storage,
--           or whose video is not the type or size it claims (Storage's metadata: the size is Storage's own measure, the type is the Blob's type as the browser sent it).
--           The cut's `made`, `seconds` and type are client claims; peer review is the gate for what the video shows.
-- uses      media_voice is deleted: reels are voiced through studio_voice, the one runner (src/studioVoicing.ts).

-- 1. A reel is up to 8 rows, its voice-over and its video.
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
    ('Reel', 10),
    ('Podcast', 50),
    ('Game', 10),
    ('Slides', 15),
    ('Animated flow', 8),
    ('Interactive explainer', 10),
    ('Job aid', 20),
    ('Case exercise', 12)
  ) as t(type, m)
  where t.type = p_type;
$$;

-- 2. The rows. The scenes are every row but the Check; the options of a check are 2 to 4 texts, none blank.
create function private.reel_scenes(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.e order by x.n), '[]'::jsonb) from jsonb_array_elements(private.rows_of(p_items)) with ordinality as x(e, n) where x.e ->> 0 <> 'Check';
$$;

create function private.reel_check(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select x.e from jsonb_array_elements(private.rows_of(p_items)) as x(e) where x.e ->> 0 = 'Check' limit 1;
$$;

create function private.reel_options(p_text text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array(select private.trimmed(b) from regexp_split_to_table(coalesce(p_text, ''), '\s*·\s*') with ordinality as t(b, n) order by n);
$$;

create function private.reel_options_ok(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(private.reel_options(p_text)) between 2 and 4 and not exists (select 1 from unnest(private.reel_options(p_text)) o where o = '');
$$;

-- What a cut says it was made from: the rows, the voice clips' paths, the look, the format (and the size that goes with it), the captions and the music.
create function private.reel_made_ok(m jsonb, p_size text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case when jsonb_typeof(m) is distinct from 'object' then false
    when (select count(*) from jsonb_object_keys(m)) <> 6 or not (m ?& array['rows', 'clips', 'look', 'format', 'captions', 'music']) then false
    when jsonb_typeof(m -> 'rows') is distinct from 'array' or jsonb_typeof(m -> 'clips') is distinct from 'array' then false
    when jsonb_array_length(m -> 'rows') not between 1 and 8 or jsonb_array_length(m -> 'clips') > 7 then false
    when exists (select 1 from jsonb_array_elements(m -> 'rows') r where jsonb_typeof(r) <> 'array' or jsonb_array_length(r) not between 2 and 3
                 or exists (select 1 from jsonb_array_elements(r) x where jsonb_typeof(x) <> 'string')) then false
    when exists (select 1 from jsonb_array_elements(m -> 'clips') c where jsonb_typeof(c) <> 'string' or not private.media_path_ok(c #>> '{}') or right(c #>> '{}', 4) <> '.mp3') then false
    when jsonb_typeof(m -> 'look') <> 'null' and (jsonb_typeof(m -> 'look') <> 'string' or (m ->> 'look') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then false
    when jsonb_typeof(m -> 'format') is distinct from 'string' or jsonb_typeof(m -> 'captions') is distinct from 'string' or jsonb_typeof(m -> 'music') is distinct from 'string' then false
    else (m ->> 'format', p_size) in (('9:16 vertical', '720x1280'), ('1:1 square', '1080x1080')) and (m ->> 'captions') in ('Burned in', 'Separate file') and (m ->> 'music') in ('None', 'Calm', 'Upbeat')
  end, false);
$$;

-- The cut: an mp4 or webm in the contribution's folder (its extension and mime agree), up to 90 s, in one of the two sizes.
create function private.video_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case when jsonb_typeof(e) is distinct from 'object' then false
    when (select count(*) from jsonb_object_keys(e)) <> 6 or not (e ?& array['kind', 'path', 'seconds', 'size', 'mime', 'made']) then false
    when jsonb_typeof(e -> 'kind') is distinct from 'string' or jsonb_typeof(e -> 'path') is distinct from 'string' or jsonb_typeof(e -> 'seconds') is distinct from 'number'
      or jsonb_typeof(e -> 'size') is distinct from 'string' or jsonb_typeof(e -> 'mime') is distinct from 'string' then false
    when e ->> 'kind' <> 'video' or not private.media_path_ok(e ->> 'path') then false
    when not ((e ->> 'mime' = 'video/mp4' and right(e ->> 'path', 4) = '.mp4') or (e ->> 'mime' = 'video/webm' and right(e ->> 'path', 5) = '.webm')) then false
    when (e ->> 'seconds')::numeric <= 0 or (e ->> 'seconds')::numeric > 90 or (e ->> 'size') not in ('720x1280', '1080x1080') then false
    else private.reel_made_ok(e -> 'made', e ->> 'size')
  end, false);
$$;

-- A reel's items: its rows (Hook, Scene N, Close, then the optional Check), then at most one voice-over and one video, and no row after them.
create function private.reel_ok(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with r as (select x.n, x.e ->> 0 as label, x.e ->> 2 as extra, count(*) over () as total from jsonb_array_elements(private.rows_of(p_items)) with ordinality as x(e, n)),
  s as (select label, extra, row_number() over (order by n) as k, count(*) over () as cnt from r where label <> 'Check')
  select coalesce(private.rows_ok(private.rows_of(p_items), private.item_max('Reel') - 2, 3)
    and (select max(cnt) from s) between 3 and 7
    and not exists (select 1 from s where label <> case when k = 1 then 'Hook' when k = cnt then 'Close' else 'Scene ' || (k - 1) end or private.trimmed(coalesce(extra, '')) = '')
    and (select count(*) from r where label = 'Check') <= 1
    and not exists (select 1 from r where label = 'Check' and (n <> total or not private.reel_options_ok(extra)))
    and (select count(*) from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array') <= 2
    and (select count(*) from jsonb_array_elements(p_items) e where jsonb_typeof(e) = 'object' and e ->> 'kind' = 'voice') <= 1
    and (select count(*) from jsonb_array_elements(p_items) e where jsonb_typeof(e) = 'object' and e ->> 'kind' = 'video') <= 1
    and not exists (select 1 from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array'
                    and not (jsonb_typeof(e) = 'object' and case e ->> 'kind' when 'voice' then private.voice_ok(e) when 'video' then private.video_ok(e) else false end))
    and not exists (select 1 from jsonb_array_elements(p_items) with ordinality as a(e, n), jsonb_array_elements(p_items) with ordinality as b(e, n)
                    where jsonb_typeof(a.e) <> 'array' and jsonb_typeof(b.e) = 'array' and b.n > a.n), false);
$$;

-- 3. The voice, the clock and the content. The voice-over counts while it is chosen in "Who presents?" (the two voice options) and every
-- scene has a clip made from its present words, all in one stock voice. A scene lasts its clip, or its words at 140 a minute; 0.3 s sit between scenes.
create function private.reel_wants_voice(p_shape jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_shape ->> 'Who presents?', '') in ('Stock presenter and AI voice', 'AI voice over text cards');
$$;

create function private.reel_clip(p_items jsonb, p_scene integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select private.clip_for(p_items, p_scene, private.reel_scenes(p_items) -> p_scene ->> 1);
$$;

create function private.reel_voiced(p_items jsonb, p_shape jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.reel_wants_voice(p_shape) and jsonb_array_length(private.reel_scenes(p_items)) > 0
    and not exists (select 1 from generate_series(0, jsonb_array_length(private.reel_scenes(p_items)) - 1) n where private.reel_clip(p_items, n) is null)
    and (select count(distinct private.reel_clip(p_items, n) ->> 'voice') from generate_series(0, jsonb_array_length(private.reel_scenes(p_items)) - 1) n) = 1;
$$;

-- [{start, seconds}] per scene, rounded to the millisecond (reelTimeline in src/logic/reelContent.ts).
create function private.reel_timeline(p_items jsonb, p_shape jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with s as (select n, case when private.reel_voiced(p_items, p_shape) then (private.reel_clip(p_items, n) ->> 'seconds')::numeric
                            else private.own_seconds(private.reel_scenes(p_items) -> n ->> 1) end as secs
             from generate_series(0, jsonb_array_length(private.reel_scenes(p_items)) - 1) n),
  t as (select n, secs, coalesce(sum(secs + 0.3) over (order by n rows between unbounded preceding and 1 preceding), 0) as start from s)
  select jsonb_agg(jsonb_build_object('start', round(start, 3), 'seconds', round(secs, 3)) order by n) from t;
$$;

-- How long the reel runs: the last scene's start and seconds.
create function private.reel_seconds(p_items jsonb, p_shape jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce((select round((t.e ->> 'start')::numeric + (t.e ->> 'seconds')::numeric, 3) from jsonb_array_elements(private.reel_timeline(p_items, p_shape)) with ordinality as t(e, n) order by t.n desc limit 1), 0);
$$;

-- A reel's content (reelContent in src/logic/reelContent.ts builds the same, and for a preview without a cut); null until it has its cut, its check
-- and, when a voice is chosen, every scene voiced. Stable: the stock look is read from stock_looks when it publishes.
create function private.reel_content(p_items jsonb, p_shape jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with v as (select e from jsonb_array_elements(p_items) e where jsonb_typeof(e) = 'object' and e ->> 'kind' = 'video' limit 1),
  ck as (select private.reel_options(private.reel_check(p_items) ->> 2) as o, private.reel_check(p_items) ->> 1 as q)
  select case when not exists (select 1 from v) or private.reel_check(p_items) is null or (private.reel_wants_voice(p_shape) and not private.reel_voiced(p_items, p_shape)) then null
    else jsonb_build_object('kind', 'reel', 'size', (select e ->> 'size' from v), 'seconds', private.reel_seconds(p_items, p_shape),
      'scenes', (select jsonb_agg(jsonb_build_object('label', s.e ->> 0, 'text', private.trimmed(s.e ->> 1), 'onScreen', private.trimmed(s.e ->> 2),
                   'start', (private.reel_timeline(p_items, p_shape) -> (s.n::integer - 1) ->> 'start')::numeric, 'seconds', (private.reel_timeline(p_items, p_shape) -> (s.n::integer - 1) ->> 'seconds')::numeric,
                   'words', case when private.reel_voiced(p_items, p_shape) then private.reel_clip(p_items, s.n::integer - 1) -> 'words' end) order by s.n)
                 from jsonb_array_elements(private.reel_scenes(p_items)) with ordinality as s(e, n)),
      'video', (select jsonb_build_object('path', e ->> 'path', 'mime', e ->> 'mime') from v),
      'burned', (select e -> 'made' ->> 'captions' = 'Burned in' from v),
      'look', case when p_shape ->> 'Who presents?' = 'Stock presenter and AI voice'
        then (select jsonb_build_object('id', l.id, 'name', l.name, 'portrait', l.portrait, 'color', l.color) from public.stock_looks l where l.active and l.id::text = (select e -> 'made' ->> 'look' from v)) end,
      'music', (select e -> 'made' ->> 'music' from v),
      'check', (select jsonb_build_object('q', private.trimmed(ck.q), 'opts', to_jsonb(ck.o), 'a', 0) from ck),
      'made', case when private.reel_voiced(p_items, p_shape) then 'ai' else 'scripted' end) end;
$$;

-- 4. items_ok and contribution_content, as before (20261118100000), with the Reel. contribution_content is stable now (it reads stock_looks).
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
    when p_type = 'Podcast' then private.podcast_ok(p_items)
    when p_type = 'Game' then private.game_ok(p_items)
    when p_type = 'Reel' then private.reel_ok(p_items)
    when p_type = 'Interactive explainer' then private.explainer_ok(p_items)
    when p_type = 'Animated flow' then private.motion_ok(p_items)
    when p_type in ('Job aid', 'Case exercise') then private.rows_ok(p_items, private.item_max(p_type), 3)
      and (p_type <> 'Case exercise' or (
        not exists (select 1 from jsonb_array_elements(p_items) e where (e ->> 0) not in ('Brief', 'Deliverable', 'Criterion'))
        and (select count(distinct e ->> 0) from jsonb_array_elements(p_items) e) = 3))
    else false
  end;
$$;

create or replace function private.contribution_content(p_type text, p_items jsonb, p_shape jsonb)
returns jsonb
language sql
stable
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
    when 'Podcast' then private.podcast_content(p_items)
    when 'Game' then private.game_content(p_items, p_shape)
    when 'Reel' then private.reel_content(p_items, p_shape)
  end;
$$;

-- 6. contribution_problems
-- As before (20261118130000), with the Reel: the check question, the voice, the clock, the cut and its files.
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
      when 'Slides' then 'Add the slides first: each needs a title, bullets and a talk-over'
      when 'Podcast' then 'Add the script first: a chapter, then a line for each speaker'
      when 'Reel' then 'Check the reel''s rows first: a Hook, scenes, a Close and a check with 2 to 4 options, the right one first' else 'Add the items first' end);
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
      v_knows := lower(private.trimmed(coalesce(v_row ->> 2, '')));
      if char_length(v_knows) >= 12 and (position(v_knows in lower(v_game -> 'files' ->> 'index.html')) > 0 or position(v_knows in lower(v_game -> 'files' ->> 'game.js')) > 0) then
        p := array_append(p, 'The game''s code repeats what the AI role hides');
      end if;
      -- nor may the texts learners read: the concept, win, rounds and who the AI plays (everything but the role's own text 2)
      if char_length(v_knows) >= 12 and exists (select 1 from jsonb_array_elements(private.rows_of(c.items)) r
          where position(v_knows in lower(r ->> 1)) > 0 or (r ->> 0 <> 'AI role' and position(v_knows in lower(coalesce(r ->> 2, ''))) > 0)) then
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


-- 5. Reels are voiced through studio_voice (the one voice runner): the older voice-over use goes, and the place says so.
delete from public.ai_uses where key = 'media_voice';
update public.ai_uses set place = 'Create & share · Slides, Podcast and Reel studios' where key = 'studio_voice';

revoke execute on function private.reel_scenes(jsonb), private.reel_check(jsonb), private.reel_options(text), private.reel_options_ok(text), private.reel_made_ok(jsonb, text), private.video_ok(jsonb),
  private.reel_ok(jsonb), private.reel_wants_voice(jsonb), private.reel_clip(jsonb, integer), private.reel_voiced(jsonb, jsonb), private.reel_timeline(jsonb, jsonb), private.reel_seconds(jsonb, jsonb),
  private.reel_content(jsonb, jsonb) from public, anon, authenticated;
