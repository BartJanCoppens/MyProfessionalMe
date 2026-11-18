-- Avatar Studio, the format (studios plan, Task 6.1): the 'Avatar' format through the shared studio path. Client side: src/logic/avatarContent.ts,
-- supabase/functions/_shared/avatarRules.ts and src/logic/checkRow.ts. No new table, policy or grant: the contributions policies and the check gate
-- cover it, and publish_contribution (20261117310000) already counts 0.25 h for an Avatar and marks it AI made through `made`. The later tasks add
-- the runs, the character's turn, the guardrails, the scoring and the live video; this one is what a creator writes and what a learner may know.
--
-- items     An avatar is rows [label, text, text2] (rows_ok, width 3, up to the Avatar cap of 12): exactly one each of Persona, Situation, Opening line,
--           Reveals if asked and Hides unless probed (the last two are what the character gives away if asked and what it keeps back unless the learner
--           probes: only the author and the `ai` function ever read them), 1 to 4 "Learning point · N %" rows with N adding up to 100, and exactly
--           Quiz 1, Quiz 2 and Quiz 3 (the question, then 2 to 4 options in text 2 split on " · ", the right one first). Nothing else.
-- shape     The run, language and difficulty (Produce) and the look and voice (the cast) are saved inside the draft's shape (src/createSave.ts: the
--           studio's `savesProduce`), because the database reads them: 'How long is a run?', 'Language', 'Difficulty', 'How is it scored?', 'Look' (a
--           stock look's id), 'Voice' (a stock voice's id, optional), 'Who does the learner talk to?'.
-- content   private.avatar_content is avatarContent in src/logic/avatarContent.ts: the character's persona, situation and opening line, the weighted
--           learning points, the quiz with the right option first (a = 0: the panel rotates them), the look and voice joined from stock_looks and
--           stock_voices, the run and who the learner talks to. It never selects Reveals or Hides.
-- check     contribution_problems refuses an avatar whose rows are wrong (private.avatar_row_problems, in words), with a run, language, difficulty or
--           scoring not chosen, without an active stock look (or with a voice that is not an active one), and whose public text repeats what the
--           character keeps back (private.avatar_echo: any 12 characters of Reveals or Hides, in lower case, inside Persona, Situation, Opening line,
--           a learning point, a quiz row or who the learner talks to; the Game's rule, applied to any part of the hidden text because here the hidden
--           text is a sentence a creator can paraphrase around).
-- completion unchanged: the quiz (never a run) completes the learning (private.is_self_complete, private.evidence_rule); hours stay the default 0.25 h.
-- reel      private.reel_check is a row finder, so the check row rule is check_row_ok(r), a name for reel_options_ok(r ->> 2): the Reel keeps working as it is.

-- 1. A check row: the question in text, 2 to 4 non-blank options in text 2 (checkRow.ts: checkOk).
create function private.check_row_ok(r jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.reel_options_ok(r ->> 2);
$$;

-- 2. An avatar's items: its rows, as above.
create function private.avatar_ok(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with r as (select x.e, x.e ->> 0 as label, x.e ->> 1 as body from jsonb_array_elements(p_items) with ordinality as x(e, n))
  select coalesce(private.rows_ok(p_items, private.item_max('Avatar'), 3)
    and not exists (select 1 from r where private.trimmed(body) = '')
    and (select count(*) from r where label in ('Persona', 'Situation', 'Opening line', 'Reveals if asked', 'Hides unless probed')) = 5
    and (select count(distinct label) from r where label in ('Persona', 'Situation', 'Opening line', 'Reveals if asked', 'Hides unless probed')) = 5
    and (select count(*) from r where label ~ '^Learning point · [0-9]+ %$') between 1 and 4
    and (select sum(substring(label from '[0-9]+')::numeric) from r where label ~ '^Learning point · [0-9]+ %$') = 100
    and (select count(*) from r where label in ('Quiz 1', 'Quiz 2', 'Quiz 3')) = 3
    and (select count(distinct label) from r where label in ('Quiz 1', 'Quiz 2', 'Quiz 3')) = 3
    and not exists (select 1 from r where label in ('Quiz 1', 'Quiz 2', 'Quiz 3') and not private.check_row_ok(e))
    and not exists (select 1 from r where label not in ('Persona', 'Situation', 'Opening line', 'Reveals if asked', 'Hides unless probed', 'Quiz 1', 'Quiz 2', 'Quiz 3')
                    and label !~ '^Learning point · [0-9]+ %$'), false);
$$;

-- 3. What is wrong with an avatar's rows, in words and in the order of avatarRows in src/logic/avatarContent.ts: the character, the rows that are
-- not allowed, the learning points and the quiz. Empty when the rows are right (or wrong in a way no line explains: a blank text, a width).
create function private.avatar_row_problems(p_items jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  p text[] := '{}';
  v_rows jsonb := private.rows_of(p_items);
  v_label text;
  v_n integer;
  v_total numeric;
begin
  if exists (select 1 from unnest(array['Persona', 'Situation', 'Opening line', 'Reveals if asked', 'Hides unless probed']) l
             where not exists (select 1 from jsonb_array_elements(v_rows) e where e ->> 0 = l)) then
    p := array_append(p, 'Add the character: Persona, Situation, Opening line, Reveals if asked and Hides unless probed');
  end if;
  for v_label in select e ->> 0 from jsonb_array_elements(v_rows) with ordinality as x(e, n)
                 where e ->> 0 in ('Persona', 'Situation', 'Opening line', 'Reveals if asked', 'Hides unless probed') group by e ->> 0 having count(*) > 1 order by min(n) loop
    p := array_append(p, v_label || ': use each character row once');
  end loop;
  for v_label in select e ->> 0 from jsonb_array_elements(v_rows) with ordinality as x(e, n)
                 where private.trimmed(e ->> 0) <> '' and e ->> 0 not in ('Persona', 'Situation', 'Opening line', 'Reveals if asked', 'Hides unless probed', 'Quiz 1', 'Quiz 2', 'Quiz 3')
                   and e ->> 0 !~ '^Learning point · [0-9]+ %$' order by n loop
    p := array_append(p, v_label || ': use a character row, “Learning point · N %” or Quiz 1 to 3 as the label');
  end loop;
  select count(*), coalesce(sum(substring(e ->> 0 from '[0-9]+')::numeric), 0) into v_n, v_total from jsonb_array_elements(v_rows) e where e ->> 0 ~ '^Learning point · [0-9]+ %$';
  if v_n not between 1 and 4 then
    p := array_append(p, 'Add 1 to 4 learning points, each as “Learning point · N %”');
  elsif v_total <> 100 then
    p := array_append(p, format('Learning point weights add up to %s %%, not 100 %%', v_total));
  end if;
  if (select count(*) from jsonb_array_elements(v_rows) e where e ->> 0 in ('Quiz 1', 'Quiz 2', 'Quiz 3')) <> 3
     or (select count(distinct e ->> 0) from jsonb_array_elements(v_rows) e where e ->> 0 in ('Quiz 1', 'Quiz 2', 'Quiz 3')) <> 3
     or exists (select 1 from jsonb_array_elements(v_rows) e where e ->> 0 in ('Quiz 1', 'Quiz 2', 'Quiz 3') and not private.check_row_ok(e)) then
    p := array_append(p, 'Add the three quiz questions: each with 2 to 4 options, the right one first');
  end if;
  return p;
end;
$$;

-- 4. Whether a text learners read repeats what the character keeps back: any 12 characters of Reveals or Hides (trimmed, lower case) inside the
-- persona, the situation, the opening line, a learning point, a quiz row (question and options) or who the learner talks to. JavaScript's
-- toLowerCase and Postgres' lower() can differ for a few Unicode letters (decisions.md).
create function private.avatar_echo(p_items jsonb, p_shape jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with r as (select e from jsonb_array_elements(private.rows_of(p_items)) e),
  hidden as (select lower(private.trimmed(e ->> 1)) as h from r where e ->> 0 in ('Reveals if asked', 'Hides unless probed')),
  shown as (select lower(t) as t from r, unnest(case when e ->> 0 in ('Persona', 'Situation', 'Opening line') or e ->> 0 ~ '^Learning point · [0-9]+ %$' then array[e ->> 1]
                                                     when e ->> 0 in ('Quiz 1', 'Quiz 2', 'Quiz 3') then array[e ->> 1, coalesce(e ->> 2, '')] else '{}'::text[] end) as t
            union all select lower(coalesce(p_shape ->> 'Who does the learner talk to?', '')))
  select exists (select 1 from hidden h cross join shown s cross join generate_series(1, char_length(h.h) - 11) i where position(substr(h.h, i, 12) in s.t) > 0);
$$;

-- 5. An avatar's content (avatarContent in src/logic/avatarContent.ts builds the same for the preview). Stable: the look and the voice are read when
-- it publishes. Reveals and Hides are never selected. The run, language, difficulty and scoring read as their first option until chosen (the check
-- gate asks for them first). An avatar is always made with AI: the AI plays the character (made = 'ai', so ai_made).
create function private.avatar_content(p_items jsonb, p_shape jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with r as (select x.e, x.e ->> 0 as label, x.n from jsonb_array_elements(private.rows_of(p_items)) with ordinality as x(e, n))
  select jsonb_build_object('kind', 'avatar',
    'persona', (select private.trimmed(e ->> 1) from r where label = 'Persona'),
    'situation', (select private.trimmed(e ->> 1) from r where label = 'Situation'),
    'opening', (select private.trimmed(e ->> 1) from r where label = 'Opening line'),
    'points', (select jsonb_agg(jsonb_build_object('id', 'lp-' || k.n, 'text', private.trimmed(k.e ->> 1), 'weight', substring(k.label from '[0-9]+')::numeric) order by k.n)
               from (select r.e, r.label, row_number() over (order by r.n) as n from r where r.label ~ '^Learning point · [0-9]+ %$') k),
    'quiz', (select jsonb_agg(jsonb_build_object('q', private.trimmed(e ->> 1), 'opts', to_jsonb(private.reel_options(e ->> 2)), 'a', 0) order by label) from r where label in ('Quiz 1', 'Quiz 2', 'Quiz 3')),
    'look', (select jsonb_build_object('id', l.id, 'name', l.name, 'portrait', l.portrait, 'color', l.color) from public.stock_looks l where l.active and l.id::text = p_shape ->> 'Look'),
    'voice', (select jsonb_build_object('id', v.id, 'name', v.name) from public.stock_voices v where v.active and v.id::text = p_shape ->> 'Voice'),
    'language', case when p_shape ->> 'Language' in ('English', 'Dutch', 'French') then p_shape ->> 'Language' else 'English' end,
    'difficulty', case when p_shape ->> 'Difficulty' in ('Gentle', 'Realistic', 'Tough') then p_shape ->> 'Difficulty' else 'Gentle' end,
    'minutes', case p_shape ->> 'How long is a run?' when '10 minutes' then 10 when '15 minutes' then 15 else 5 end,
    'scoring', case when p_shape ->> 'How is it scored?' in ('AI scores, counsellor confirms', 'Practice only') then p_shape ->> 'How is it scored?' else 'AI scores, counsellor confirms' end,
    'counterpart', private.trimmed(coalesce(p_shape ->> 'Who does the learner talk to?', '')),
    'made', 'ai');
$$;

-- 6. items_ok, contribution_content and contribution_problems, as before (20261118180000), with the Avatar.
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
    when p_type = 'Avatar' then private.avatar_ok(p_items)
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
    when 'Avatar' then private.avatar_content(p_items, p_shape)
  end;
$$;

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
    -- an avatar's rows say what is wrong with them (the character, the learning points, the quiz); anything else they get wrong is the generic line
    if c.type = 'Avatar' and cardinality(private.avatar_row_problems(c.items)) > 0 then
      p := p || private.avatar_row_problems(c.items);
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

revoke execute on function private.check_row_ok(jsonb), private.avatar_ok(jsonb), private.avatar_row_problems(jsonb), private.avatar_echo(jsonb, jsonb), private.avatar_content(jsonb, jsonb)
  from public, anon, authenticated;
