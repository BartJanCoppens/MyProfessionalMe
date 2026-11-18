-- The Game Studio's house-rules review, server-owned (studios plan, Task 4.4; replaces the client-written `review` of 20261118100000).
-- A client cannot say a game passed: the `ai` function (service role, action review_game) loads the contribution's current game
-- files from here, asks the model, reads the verdict strictly and records it through record_game_review, the only writer of
-- game_reviews. contribution_problems wants a passed review whose files hash equals the hash of the files as they are now, so any
-- rebuild or edit of the code asks for a new review, with no client "clear review" step. The hash exists in SQL only
-- (private.game_files_hash); the function hands back, unread, the hash it was given.
-- game item  {kind, files, for}: `review` and `made` are no longer accepted from an author (game_item_ok counts exactly three keys), so a
--            crafted write can neither forge a pass nor hide "Made with AI". A Game is always AI built: game_content says made 'ai'
--            and publish_contribution reads that, whatever a client sends.
-- game_reviews  contribution_id, files_hash, passed, reasons, reviewed_at; RLS on, no policy, no grant: only definers and the service role.
-- RPCs       record_game_review and game_review_input: service_role only (public schema, as the other `ai` function RPCs, so PostgREST
--            serves them). game_review_status: the author or an assigned reviewer reads {passed, reasons, current}, current meaning the
--            verdict is for the files as they are now.
-- Metering   the review is counted under studio_game (20261118120000), with the build.

-- 1. The built game: exactly kind, files and for.
create or replace function private.game_item_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(e) is distinct from 'object' then false
    when (select count(*) from jsonb_object_keys(e)) <> 3 or not (e ?& array['kind', 'files', 'for']) then false
    when e ->> 'kind' is distinct from 'game' then false
    when jsonb_typeof(e -> 'files') is distinct from 'object' or jsonb_typeof(e -> 'for') is distinct from 'object' then false
    when (select count(*) from jsonb_object_keys(e -> 'files')) <> 2 or not (e -> 'files' ?& array['index.html', 'game.js']) then false
    when jsonb_typeof(e -> 'files' -> 'index.html') is distinct from 'string' or jsonb_typeof(e -> 'files' -> 'game.js') is distinct from 'string' then false
    when char_length(e -> 'files' ->> 'index.html') > 16000 or char_length(e -> 'files' ->> 'game.js') > 32000 then false
    else (select count(*) from jsonb_object_keys(e -> 'for')) = 1 and jsonb_typeof(e -> 'for' -> 'role') = 'string'
      and (e -> 'for' ->> 'role') in ('Game master', 'Opponent', 'Suspect to question', 'No AI role')
  end;
$$;

-- 2. The hash of a game's two files, as they are: null without a built game. The one implementation.
create function private.game_files_hash(p_items jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(jsonb_build_array(e -> 'files' -> 'index.html', e -> 'files' -> 'game.js')::text, 'UTF8')), 'hex')
  from jsonb_array_elements(p_items) e where jsonb_typeof(e) = 'object' limit 1;
$$;

-- 3. The verdicts: one per contribution, the latest.
create table public.game_reviews (
  contribution_id uuid primary key references public.contributions (id) on delete cascade,
  files_hash text not null,
  passed boolean not null,
  reasons text[] not null default '{}',
  reviewed_at timestamptz not null default now(),
  constraint game_reviews_reasons check (cardinality(reasons) <= 10)
);
alter table public.game_reviews enable row level security;
revoke all on public.game_reviews from anon, authenticated;

-- What the `ai` function reviews for the author: the title, the game's content (concept, win, rounds, who the AI plays, the two
-- files; never what the AI role knows) and the hash of those files. Null unless the caller is the author of a Game that is still theirs to edit and built.
create function public.game_review_input(p_user uuid, p_contribution uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('title', c.title, 'files_hash', private.game_files_hash(c.items), 'content', private.game_content(c.items, c.shape))
  from public.contributions c
  where c.id = p_contribution and c.type = 'Game' and c.author_id = p_user and c.status in ('draft', 'changes')
    and jsonb_typeof(c.items) = 'array' and private.items_ok('Game', c.items) and private.game_files_hash(c.items) is not null;
$$;

-- Records the verdict for the hash the function was given; refuses when the files changed meanwhile.
create function public.record_game_review(p_contribution uuid, p_files_hash text, p_passed boolean, p_reasons text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contributions;
begin
  select * into c from public.contributions where id = p_contribution and type = 'Game' for update;
  if not found or jsonb_typeof(c.items) <> 'array' or private.game_files_hash(c.items) is null then raise exception 'That game is not built'; end if;
  if p_files_hash is distinct from private.game_files_hash(c.items) then raise exception 'The game changed during the review · run it again'; end if;
  if p_passed is null or cardinality(coalesce(p_reasons, '{}')) > 10
    or exists (select 1 from unnest(coalesce(p_reasons, '{}')) r where r is null or char_length(r) > 300) then raise exception 'The verdict is not valid'; end if;
  insert into public.game_reviews (contribution_id, files_hash, passed, reasons, reviewed_at)
  values (p_contribution, p_files_hash, p_passed, coalesce(p_reasons, '{}'), now())
  on conflict (contribution_id) do update set files_hash = excluded.files_hash, passed = excluded.passed, reasons = excluded.reasons, reviewed_at = excluded.reviewed_at;
end;
$$;

-- The verdict as the author or an assigned reviewer sees it; null when there is none.
create function public.game_review_status(p_contribution uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('passed', r.passed, 'reasons', to_jsonb(r.reasons), 'current', r.files_hash is not distinct from private.game_files_hash(c.items))
  from public.game_reviews r join public.contributions c on c.id = r.contribution_id
  where r.contribution_id = p_contribution and (private.is_contribution_author(p_contribution) or private.is_contribution_reviewer(p_contribution));
$$;

-- As before (20261118100000), but the house-rules verdict is read from game_reviews (server-owned), for the files as they are now.
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
      select * into v_review from public.game_reviews where contribution_id = c.id;
      if not found then
        p := array_append(p, 'The house-rules check has not passed');
      elsif v_review.files_hash is distinct from private.game_files_hash(c.items) then
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

revoke execute on function private.game_files_hash(jsonb) from public, anon, authenticated;
revoke execute on function public.game_review_input(uuid, uuid), public.record_game_review(uuid, text, boolean, text[]) from public, anon, authenticated;
grant execute on function public.game_review_input(uuid, uuid), public.record_game_review(uuid, text, boolean, text[]) to service_role;
revoke execute on function public.game_review_status(uuid) from public, anon;
grant execute on function public.game_review_status(uuid) to authenticated;
