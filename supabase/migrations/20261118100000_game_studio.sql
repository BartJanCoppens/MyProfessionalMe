-- Game Studio (studios plan, Task 4.2): the 'Game' format through the shared studio path. Client side: src/logic/gameContent.ts,
-- src/logic/gameScan.ts and supabase/functions/_shared/gameRules.ts. No new table, policy or grant: the contributions policies and the
-- check gate cover it, and publish_contribution (20261117310000) already counts 0.25 h for a Game and marks it AI made through `made`.
--
-- items     A game is rows [label, text, text2] (rows_ok, width 3, one place short of the cap) and one built game after them
--           (private.game_item_ok). The rows are exactly one Concept first (text the setup, text 2 the win condition), at least 2
--           Rounds ("Round N": text what the player sees, text 2 the flaw or answer) and at most one "AI role" row (text who the
--           AI plays, text 2 what it knows), nothing else. The built game is {kind 'game', files {index.html, game.js} as text up
--           to 16000 and 32000 characters, for {role} the "Does the AI play a role?" answer it was built for, review null or
--           {passed, reasons (at most 10 texts of 300 characters)}, made 'ai'}.
-- scan      private.game_scan is the browser's scan (src/logic/gameScan.ts) in Postgres: the same rules and problem texts, with \b
--           written \y and the case-insensitive rules read with ~*. Advisory, as there (a denylist; the boundary is the sealed
--           frame), but a crafted API write that holds a script load is refused at the check like the app's own scan would.
--           src/logic/gameScan.sync.test.ts compares the two rule lists.
-- check     contribution_problems refuses a game that was not built, shows a scan problem, has no passed review, was built for
--           another AI role than the one chosen now, lacks (role chosen) or keeps (No AI role) the AI role row, or whose code
--           repeats the role's text 2 (12 characters or more, case-insensitive; GameStudio's echoedSecrets idea).
-- content   private.game_content: concept, win, rounds {text, answer}, role {kind, about} or null (what the role knows is never
--           copied, so no learner receives it), the leaderboard answer (Firm-wide when unanswered), the two files and 'ai'.
--           gameContent in src/logic/gameContent.ts builds the same for the preview.

-- 1. The AI role chosen in "Shape it": one of the three roles, else 'No AI role' (roleAnswer in src/logic/gameContent.ts).
create function private.game_role(p_shape jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when (p_shape ->> 'Does the AI play a role?') in ('Game master', 'Opponent', 'Suspect to question') then p_shape ->> 'Does the AI play a role?' else 'No AI role' end;
$$;

-- The AI role row of a game's items (roleOf in supabase/functions/_shared/gameRules.ts), or null.
create function private.game_role_row(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select r from jsonb_array_elements(private.rows_of(p_items)) r where r ->> 0 = 'AI role' limit 1;
$$;

-- 2. The scan of a game's two files: the problems, in the order of scanGameFiles. The rules are listed in the order of RULES in
-- src/logic/gameScan.ts (a VALUES list is read in the order written); the third column is its case-insensitive flag.
create function private.game_scan(p_files jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  p text[] := '{}';
  v_name text;
  v_text text;
  v_max integer;
  v_rule record;
  v_found text[];
begin
  if coalesce(p_files ->> 'index.html', '') = '' then
    p := array_append(p, 'The game has no index.html');
  end if;
  foreach v_name in array array['index.html', 'game.js'] loop
    v_text := p_files ->> v_name;
    continue when v_text is null;
    v_max := case v_name when 'index.html' then 16000 else 32000 end;
    if char_length(v_text) > v_max then
      p := array_append(p, format('%s is too large (over %s characters)', v_name, v_max));
      continue;
    end if;
    for v_rule in select * from (values
      ('contacts another website', '\yfetch\s*\(|XMLHttpRequest|\yWebSocket\y|\yEventSource\y|sendBeacon|RTCPeerConnection', false),
      ('loads code from elsewhere', '\yimport\s*\(|importScripts|<script\y[^>]*\ysrc\s*=|<link\y|@import|<i?frame\y|<object\y|<embed\y|createElement\s*\(\s*[''"`](i?frame|object|embed)[''"`]', true),
      ('leaves the page', '\y(window|self|globalThis|frames|top|parent|opener)\s*\.\s*open\s*\(|\[\s*[''"`](location|open)[''"`]\s*\]|\y(self|globalThis|frames|opener)\s*\.\s*location\y|\ylocation\s*\.\s*(href\s*=(?!=)|assign\s*\(|replace\s*\()|\y(top|parent|document|window)\s*\.\s*location\s*=(?!=)|(^|[^.\w])location\s*=(?!=)|<meta\y[^>]*http-equiv|<a\y[^>]*\ytarget\s*=', true),
      ('submits a form', '<form\y|\.submit\s*\(|requestSubmit', true),
      ('uses browser storage', 'document\s*\.\s*cookie|\ylocalStorage\y|\ysessionStorage\y|\yindexedDB\y|\ycaches\s*\.', false),
      ('runs code from text', '\yeval\s*\(|\ynew\s+Function\s*\(|\yset(Timeout|Interval)\s*\(\s*[''"`]', false),
      ('contains a web address', '\y(https?|wss?|ftp):\/\/|(^|[\s"''(=,`])\/\/[a-z0-9-]+\.[a-z]{2,}', true)
      ) as rule(what, pattern, ci) loop
      v_found := regexp_match(v_text, '(' || v_rule.pattern || ')', case when v_rule.ci then 'i' else '' end);
      if v_found is not null then
        p := array_append(p, format('%s %s (%s)', v_name, v_rule.what, left(private.trimmed(v_found[1]), 40)));
      end if;
    end loop;
  end loop;
  return p;
end;
$$;

-- 3. The built game: exact keys, the two files as text within their limits, the AI role answer it was built for, its review.
create function private.game_item_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(e) is distinct from 'object' then false
    when (select count(*) from jsonb_object_keys(e)) <> 5 or not (e ?& array['kind', 'files', 'for', 'review', 'made']) then false
    when e ->> 'kind' is distinct from 'game' or jsonb_typeof(e -> 'made') is distinct from 'string' or e ->> 'made' is distinct from 'ai' then false
    when jsonb_typeof(e -> 'files') is distinct from 'object' or jsonb_typeof(e -> 'for') is distinct from 'object' then false
    when (select count(*) from jsonb_object_keys(e -> 'files')) <> 2 or not (e -> 'files' ?& array['index.html', 'game.js']) then false
    when jsonb_typeof(e -> 'files' -> 'index.html') is distinct from 'string' or jsonb_typeof(e -> 'files' -> 'game.js') is distinct from 'string' then false
    when char_length(e -> 'files' ->> 'index.html') > 16000 or char_length(e -> 'files' ->> 'game.js') > 32000 then false
    when (select count(*) from jsonb_object_keys(e -> 'for')) <> 1 or jsonb_typeof(e -> 'for' -> 'role') is distinct from 'string'
      or (e -> 'for' ->> 'role') not in ('Game master', 'Opponent', 'Suspect to question', 'No AI role') then false
    when jsonb_typeof(e -> 'review') = 'null' then true
    when jsonb_typeof(e -> 'review') is distinct from 'object' then false
    when (select count(*) from jsonb_object_keys(e -> 'review')) <> 2 or not (e -> 'review' ?& array['passed', 'reasons']) then false
    when jsonb_typeof(e -> 'review' -> 'passed') is distinct from 'boolean' or jsonb_typeof(e -> 'review' -> 'reasons') is distinct from 'array' then false
    else jsonb_array_length(e -> 'review' -> 'reasons') <= 10
      and not exists (select 1 from jsonb_array_elements(e -> 'review' -> 'reasons') x where jsonb_typeof(x) <> 'string' or char_length(x #>> '{}') > 300)
  end;
$$;

-- A game's items: its rows (one place short of the cap) with the row rules, and at most one built game.
create function private.game_ok(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with r as (select x.n, x.e ->> 0 as label from jsonb_array_elements(private.rows_of(p_items)) with ordinality as x(e, n))
  select private.rows_ok(private.rows_of(p_items), private.item_max('Game') - 1, 3)
    and coalesce((select label from r where n = 1), '') = 'Concept'
    and (select count(*) from r where label = 'Concept') = 1
    and (select count(*) from r where label ~ '^Round [0-9]+$') >= 2
    and (select count(*) from r where label = 'AI role') <= 1
    and not exists (select 1 from r where label <> 'Concept' and label <> 'AI role' and label !~ '^Round [0-9]+$')
    and (select count(*) from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array') <= 1
    and not exists (select 1 from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array' and not private.game_item_ok(e));
$$;

-- 4. A game's content (gameContent in src/logic/gameContent.ts builds the same for the preview); null until it is built.
create function private.game_content(p_items jsonb, p_shape jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with r as (select x.n, x.e ->> 0 as label, private.trimmed(x.e ->> 1) as body, private.trimmed(coalesce(x.e ->> 2, '')) as extra
             from jsonb_array_elements(private.rows_of(p_items)) with ordinality as x(e, n)),
  g as (select e from jsonb_array_elements(p_items) e where jsonb_typeof(e) = 'object' limit 1)
  select case when not exists (select 1 from g) then null else jsonb_build_object('kind', 'game', 'made', 'ai',
    'concept', coalesce((select body from r where label = 'Concept' order by n limit 1), ''),
    'win', coalesce((select extra from r where label = 'Concept' order by n limit 1), ''),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('text', body, 'answer', extra) order by n) from r where label ~ '^Round [0-9]+$'), '[]'::jsonb),
    -- what the role knows (its text 2) is never copied
    'role', case when private.game_role(p_shape) = 'No AI role' then null
      else jsonb_build_object('kind', private.game_role(p_shape), 'about', coalesce((select body from r where label = 'AI role' limit 1), '')) end,
    'leaderboard', case when (p_shape ->> 'Leaderboard?') in ('Firm-wide', 'My team only', 'None') then p_shape ->> 'Leaderboard?' else 'Firm-wide' end,
    'files', (select e -> 'files' from g)) end;
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
    when p_type = 'Game' then private.game_ok(p_items)
    when p_type = 'Interactive explainer' then private.explainer_ok(p_items)
    when p_type = 'Animated flow' then private.motion_ok(p_items)
    when p_type in ('Job aid', 'Case exercise') then private.rows_ok(p_items, private.item_max(p_type), 3)
      and (p_type <> 'Case exercise' or (
        not exists (select 1 from jsonb_array_elements(p_items) e where (e ->> 0) not in ('Brief', 'Deliverable', 'Criterion'))
        and (select count(distinct e ->> 0) from jsonb_array_elements(p_items) e) = 3))
    else false
  end;
$$;

-- As before (20261117310000), with the Game.
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
    when 'Game' then private.game_content(p_items, p_shape)
  end;
$$;

-- As before (20261117310000), with the Game: the build, its scan, its review, the AI role and what it hides.
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
  v_row jsonb;
  v_role text;
  v_knows text;
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
  elsif c.studio is not null and (select count(*) from jsonb_array_elements(c.items) e where c.type not in ('Interactive explainer', 'Animated flow', 'Slides', 'Podcast', 'Game') or jsonb_typeof(e) = 'array') < v_min then
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
      if coalesce(v_game -> 'review' ->> 'passed', 'false') <> 'true' then
        p := array_append(p, 'The house-rules check has not passed' || coalesce(': ' || nullif(v_game -> 'review' -> 'reasons' ->> 0, ''), ''));
      end if;
      if v_game -> 'for' ->> 'role' <> v_role then
        p := array_append(p, 'You changed the AI role after the build · build the game again');
      end if;
      -- what the AI role knows (its text 2, 12 characters or more) must not be in the game's own code: learners read the code
      v_knows := lower(private.trimmed(coalesce(v_row ->> 2, '')));
      if char_length(v_knows) >= 12 and (position(v_knows in lower(v_game -> 'files' ->> 'index.html')) > 0 or position(v_knows in lower(v_game -> 'files' ->> 'game.js')) > 0) then
        p := array_append(p, 'The game''s code repeats what the AI role hides');
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

revoke execute on function private.game_role(jsonb), private.game_role_row(jsonb), private.game_scan(jsonb), private.game_item_ok(jsonb), private.game_ok(jsonb),
  private.game_content(jsonb, jsonb) from public, anon, authenticated;
