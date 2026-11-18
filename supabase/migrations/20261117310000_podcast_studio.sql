-- Podcast Studio (studios plan, Task 3.5): the 'Podcast' format through the shared studio path, voiced by the AI voice.
--
-- items     A script is rows [label, text] (rows_ok, width 2) of two kinds, told apart by the label. A chapter row is
--           "Chapter N · m:ss" (N counts from 1; the times rise strictly from 0:00, the plan of the draft) with the chapter's
--           title as text; a turn row is a speaker (Host, Guest or Co-host; at most two in a script) with the words as text. The
--           script starts with a chapter, every chapter is followed by at least one turn, and a turn speaks at least one word.
--           After the rows may come the one voice-over item (private.voice_ok, shared with Slides): one clip per turn, `slide`
--           being the turn's index (0 for the first turn), with the stock voice's id in `voice`. A clip counts only while its
--           text is the turn's present words (private.clip_for, which private.slide_clip now uses too).
-- shape     "Format?" says which speakers there are: Interview with an expert (Host, Guest, the default), Two AI hosts (Host,
--           Co-host) or Solo talk (Host); the check refuses a turn by anyone else. One voice per speaker and different voices
--           for different speakers (private.podcast_voiced). "Length?" and "Who listens?" only steer the AI draft.
-- check     contribution_problems refuses an episode that is not voiced (an episode is always told by the AI voice; there is no
--           browser-voice podcast), longer than 30 minutes (1800 s, the design's limit) and with a voice-over file that is not
--           in the contribution's own folder and in Storage.
-- content   private.podcast_content: chapters {title, start, turn} (start in seconds from the voiced lengths, turn the index of
--           its first turn), turns {speaker, text, audio {path, seconds, marks}} (the transcript is the script itself), the
--           total seconds and 'ai' as who told it.
-- hours     A studio episode counts its seconds through private.media_hours (this is private.horizon_hours under a neutral
--           name: 0.05 h steps, at least 0.05 h, at most 1 h); a v3 podcast keeps its catalogue hours.
-- limits    A turn is at most 600 characters (rows_ok), well under the voice function's 5,000 characters a call, so one turn is
--           always one segment here; the app chunks longer text at 5,000 (src/logic/narration.ts chunkText) as a safeguard.

-- 1. The hours a narrated piece counts: horizon_hours under a name that fits Slides and Podcast too.
create function private.media_hours(p_seconds numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_seconds > 0 then least(1, greatest(1, ceil(p_seconds / 180)) * 0.05) else 0.25 end;
$$;

-- 2. The most items of a Podcast: a script of chapters and turns, and its voice-over (ITEM_MAX in src/logic/items.ts).
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

-- 3. The voice-over item, now with up to 49 clips (a script of turns); the clip's rules are otherwise as before (20261117300000).
create or replace function private.voice_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(e) is distinct from 'object' then false
    else (select count(*) from jsonb_object_keys(e)) = 2 and e ->> 'kind' is not distinct from 'voice'
      and case when jsonb_typeof(e -> 'clips') is not distinct from 'array' then
        jsonb_array_length(e -> 'clips') between 1 and 49
        and (select count(distinct c ->> 'slide') from jsonb_array_elements(e -> 'clips') c) = jsonb_array_length(e -> 'clips')
        and not exists (select 1 from jsonb_array_elements(e -> 'clips') c where not (case
          when jsonb_typeof(c) is distinct from 'object' then false
          when (select count(*) from jsonb_object_keys(c)) <> 6 or not (c ?& array['slide', 'text', 'path', 'seconds', 'marks', 'voice']) then false
          when jsonb_typeof(c -> 'slide') is distinct from 'number' or (c ->> 'slide') !~ '^[0-9]{1,2}$' or jsonb_typeof(c -> 'text') is distinct from 'string'
            or jsonb_typeof(c -> 'path') is distinct from 'string' or jsonb_typeof(c -> 'voice') is distinct from 'string' or jsonb_typeof(c -> 'seconds') is distinct from 'number' or jsonb_typeof(c -> 'marks') is distinct from 'array' then false
          else (c ->> 'slide')::integer between 0 and 48 and private.trimmed(c ->> 'text') <> '' and char_length(c ->> 'text') <= 600 and (c ->> 'voice') ~ '^[A-Za-z0-9_-]{1,64}$'
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

-- 4. The clip made from the words p_text of part p_part (a slide, a turn), or null: one reading for both formats.
create function private.clip_for(p_items jsonb, p_part integer, p_text text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select c from jsonb_array_elements(coalesce((select e -> 'clips' from jsonb_array_elements(p_items) e where jsonb_typeof(e) = 'object' limit 1), '[]'::jsonb)) c
  where (c ->> 'slide')::integer = p_part and private.trimmed(c ->> 'text') = private.trimmed(p_text)
  limit 1;
$$;

-- As before (20261117300000), through clip_for.
create or replace function private.slide_clip(p_items jsonb, p_slide integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select private.clip_for(p_items, p_slide, private.rows_of(p_items) -> p_slide ->> 2);
$$;

-- 5. The script. Chapter rows are labelled "Chapter N · m:ss" (N and the minutes up to 3 digits).
create function private.script_ok(p_rows jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with r as (
    select x.n, x.e ->> 0 as label, x.e ->> 1 as body, regexp_match(x.e ->> 0, '^Chapter ([0-9]{1,3}) · ([0-9]{1,3}):([0-5][0-9])$') as m
    from jsonb_array_elements(p_rows) with ordinality as x(e, n)),
  c as (select n, m[1]::integer as num, m[2]::integer * 60 + m[3]::integer as secs, row_number() over (order by n) as k from r where m is not null)
  select coalesce((select m is not null from r where n = 1), false)
    and not exists (select 1 from r where m is null and label not in ('Host', 'Guest', 'Co-host'))
    and not exists (select 1 from c where num <> k)
    and coalesce((select secs from c where k = 1), -1) = 0
    and not exists (select 1 from c a join c b on b.k = a.k + 1 where b.secs <= a.secs)
    and not exists (select 1 from r a where a.m is not null and not exists (select 1 from r b where b.n = a.n + 1 and b.m is null))
    and not exists (select 1 from r where m is null and coalesce(private.spoken_words(body), 0) < 1)
    and (select count(distinct label) from r where m is null) <= 2;
$$;

-- A script's items: its rows (one place short of the cap) with the script rules, and at most one voice-over item.
create function private.podcast_ok(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.rows_ok(private.rows_of(p_items), private.item_max('Podcast') - 1, 2)
    and private.script_ok(private.rows_of(p_items))
    and (select count(*) from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array') <= 1
    and not exists (select 1 from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array' and not private.voice_ok(e));
$$;

-- The turns in order: {speaker, text, chapter} with the words trimmed and the chapter's number (from 1). A turn's place in this
-- array is the `slide` of its clip.
create function private.podcast_turns(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('speaker', r.label, 'text', private.trimmed(r.body), 'chapter', r.ch) order by r.n), '[]'::jsonb)
  from (select x.n, x.e ->> 0 as label, x.e ->> 1 as body,
               count(*) filter (where (x.e ->> 0) ~ '^Chapter [0-9]{1,3} · [0-9]{1,3}:[0-5][0-9]$') over (order by x.n) as ch
        from jsonb_array_elements(private.rows_of(p_items)) with ordinality as x(e, n)) r
  where r.label !~ '^Chapter [0-9]{1,3} · [0-9]{1,3}:[0-5][0-9]$';
$$;

create function private.turn_clip(p_items jsonb, p_turn integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select private.clip_for(p_items, p_turn, private.podcast_turns(p_items) -> p_turn ->> 'text');
$$;

-- Whether the episode is voiced: every turn has its clip, one voice for each speaker and a different voice for each speaker.
create function private.podcast_voiced(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with v as (select private.podcast_turns(p_items) -> k ->> 'speaker' as speaker, private.turn_clip(p_items, k) ->> 'voice' as voice
             from generate_series(0, jsonb_array_length(private.podcast_turns(p_items)) - 1) as k)
  select exists (select 1 from v)
    and not exists (select 1 from v where voice is null)
    and (select count(distinct voice) from v) = (select count(distinct speaker) from v)
    and not exists (select 1 from v group by speaker having count(distinct voice) > 1);
$$;

-- How long the episode plays, rounded to seconds: each turn's stored seconds when voiced, else its words at 140 a minute.
create function private.podcast_seconds(p_items jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(sum(case when private.podcast_voiced(p_items) then (private.turn_clip(p_items, k.n::integer) ->> 'seconds')::numeric
                                 else private.own_seconds(private.podcast_turns(p_items) -> k.n::integer ->> 'text') end), 0))
  from generate_series(0, jsonb_array_length(private.podcast_turns(p_items)) - 1) as k(n);
$$;

-- An episode's content (podcastContent in src/logic/podcastContent.ts builds the same for the preview); null until it is voiced.
create function private.podcast_content(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when not private.podcast_voiced(p_items) then null else jsonb_build_object('kind', 'podcast', 'made', 'ai',
    'seconds', private.podcast_seconds(p_items)::integer,
    'chapters', (select jsonb_agg(jsonb_build_object('title', private.trimmed(r.e ->> 1), 'turn', f.first,
                   'start', round(coalesce((select sum((private.turn_clip(p_items, t.k::integer) ->> 'seconds')::numeric) from generate_series(0, f.first - 1) as t(k)), 0))::integer) order by r.n)
                 from (select x.e, x.n, row_number() over (order by x.n) as ch from jsonb_array_elements(private.rows_of(p_items)) with ordinality as x(e, n)
                       where (x.e ->> 0) ~ '^Chapter [0-9]{1,3} · [0-9]{1,3}:[0-5][0-9]$') r,
                 lateral (select count(*)::integer as first from jsonb_array_elements(private.podcast_turns(p_items)) t where (t ->> 'chapter')::integer < r.ch) f),
    'turns', (select jsonb_agg(jsonb_build_object('speaker', t.e ->> 'speaker', 'text', t.e ->> 'text',
                   'audio', jsonb_build_object('path', private.turn_clip(p_items, t.n::integer - 1) ->> 'path', 'seconds', private.turn_clip(p_items, t.n::integer - 1) -> 'seconds',
                                               'marks', private.turn_clip(p_items, t.n::integer - 1) -> 'marks')) order by t.n)
              from jsonb_array_elements(private.podcast_turns(p_items)) with ordinality as t(e, n))) end;
$$;

-- As before (20261117300000), with the Podcast.
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
    when p_type = 'Interactive explainer' then private.explainer_ok(p_items)
    when p_type = 'Animated flow' then private.motion_ok(p_items)
    when p_type in ('Job aid', 'Case exercise') then private.rows_ok(p_items, private.item_max(p_type), 3)
      and (p_type <> 'Case exercise' or (
        not exists (select 1 from jsonb_array_elements(p_items) e where (e ->> 0) not in ('Brief', 'Deliverable', 'Criterion'))
        and (select count(distinct e ->> 0) from jsonb_array_elements(p_items) e) = 3))
    else false
  end;
$$;

-- As before (20261117300000), with the Podcast.
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
    when 'Podcast' then private.podcast_content(p_items)
  end;
$$;

-- Whether any of these voice-over files is outside the contribution's own folder (<author>/<contribution>/) or not in Storage: the
-- one check Slides and Podcast share.
create function private.voice_files_missing(p_author uuid, p_contribution uuid, p_paths text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from unnest(p_paths) as f(path)
    where split_part(f.path, '/', 1) <> p_author::text or split_part(f.path, '/', 2) <> p_contribution::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'media' and o.name = f.path));
$$;

-- As before (20261117300000), with the Podcast: the script, the speakers of its format, the voice, the 30 minutes and the files.
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
  v_speakers text[];
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
      when 'Podcast' then 'Add the script first: a chapter, then a line for each speaker' else 'Add the items first' end);
  elsif c.studio is not null and (select count(*) from jsonb_array_elements(c.items) e where c.type not in ('Interactive explainer', 'Animated flow', 'Slides', 'Podcast') or jsonb_typeof(e) = 'array') < v_min then
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
    if private.slides_voiced(c.items, c.shape) and private.voice_files_missing(c.author_id, c.id,
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
    if private.podcast_voiced(c.items) and private.voice_files_missing(c.author_id, c.id,
        array(select private.turn_clip(c.items, n) ->> 'path' from generate_series(0, jsonb_array_length(private.podcast_turns(c.items)) - 1) n)) then
      p := array_append(p, 'A voice-over file is not there · voice the episode again');
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

-- As before (20261117300000), with a studio episode's hours from its seconds (a v3 podcast keeps 0.5 h) and the neutral name.
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

drop function private.horizon_hours(numeric);

revoke execute on function private.media_hours(numeric), private.clip_for(jsonb, integer, text), private.script_ok(jsonb), private.podcast_ok(jsonb), private.podcast_turns(jsonb),
  private.turn_clip(jsonb, integer), private.voice_files_missing(uuid, uuid, text[]), private.podcast_voiced(jsonb), private.podcast_seconds(jsonb), private.podcast_content(jsonb) from public, anon, authenticated;
