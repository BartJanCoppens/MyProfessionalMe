-- Scoring a practice run, sharing it and the counsellor's confirmation (studios plan, Task 6.4). Client side: src/lib/avatarStore.ts; the `ai` function scores
-- (supabase/functions/ai/avatarScore.ts, _shared/avatarScore.ts).
--
-- server-owned  A client cannot write a score. The `ai` function (service role) reads the stored run through avatar_score_input, asks the model, reads the answer
--               strictly (readScore) and records it through record_avatar_score, which refuses a score that fails private.avatar_score_ok (the same rules
--               as readScore, in SQL) and a run that changed after the input was read (the hash covers the turns, the learning points and the prompt version).
--               Recording a score ends the run (finished_at). A score is advice: nothing here writes a completion, a record or progress (S6: a practice run
--               never counts either); the learning is completed by its quiz only.
-- sharing       share_avatar_run is the learner's choice, on their own finished, scored, non-test run; what is shared is the score and the transcript. The learner
--               may withdraw it (withdraw_avatar_run) until it is confirmed. A client reads only its own runs (policy); a shared run is read through
--               shared_avatar_runs (unconfirmed ones, newest first, at most 50, without the transcript and the injection flags) and shared_avatar_run_turns
--               (the transcript on open, the text of a held line blanked: the counsellor sees that a line was held, never what it said).
-- who decides   private.is_decider_for: the learner's counsellor, or an admin who may accept when the learner has no counsellor. ONE rule: waiting_submissions is
--               redefined below to call it (same result for evidence submissions), and so do the shared list, the transcript and the confirmation.
-- confirming    confirm_avatar_run: that person puts a note on a shared run, once. It is a note, never completion; a confirmed run leaves the queue.
-- metering      a scoring call counts as one call under avatar_conversation (its limits, its connection); no new use.

-- 1. The band of a 0 to 100 score (Taxatar's bands) and the credit rules the TypeScript scorer applies (_shared/avatarScore.ts, src/logic/avatarScore.sync.test.ts).
create function private.score_band(p_score numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_score >= 85 then 'Excellent' when p_score >= 70 then 'Very good' when p_score >= 55 then 'Good' when p_score >= 40 then 'Mediocre' else 'Needs improvement' end;
$$;

-- 2. What the score is bound to: the turns, the learning points and the scoring prompt's version.
create function private.avatar_score_hash(p_run uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.avatar_runs;
  c public.contributions;
begin
  select * into r from public.avatar_runs where id = p_run;
  if not found then return null; end if;
  c := private.avatar_run_contribution(p_run, r.user_id);
  if c.id is null then return null; end if;
  return encode(sha256(convert_to(r.turns::text || (private.avatar_content(c.items, c.shape) -> 'points')::text || '1.0.0', 'utf8')), 'hex');
end;
$$;

-- 3. A score is valid when it has exactly the points of the scenario in order, integers 0 to 100 whose band is the band of the number, a comment of at most 300
-- characters, cited turns that are the learner's own lines the guards did not hold, evidence or 30 at most, one creditable line 54 (Mediocre) at most,
-- an overall that is the weighted mean, rounded, at most 5 strengths and 5 missed of 200 characters and a summary of 600.
create function private.avatar_score_ok(p_score jsonb, p_points jsonb, p_turns jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
  p jsonb;
  k integer;
  n jsonb;
  v_credit integer := (select count(*) from jsonb_array_elements(p_turns) t where t ->> 'who' = 'learner' and t ->> 'guard' is null);
  v_sum numeric := 0;
  v_weights numeric := 0;
begin
  -- every key is required with its type: an absent key is null, and a null test never fires, so every test says "is distinct from"
  if jsonb_typeof(p_score) is distinct from 'object' or jsonb_typeof(p_score -> 'points') is distinct from 'array' or jsonb_array_length(p_score -> 'points') <> jsonb_array_length(p_points) then return false; end if;
  if p_score ->> 'version' is distinct from '1.0.0' or jsonb_typeof(p_score -> 'flags') is distinct from 'array' or jsonb_typeof(p_score -> 'summary') is distinct from 'string' or char_length(p_score ->> 'summary') > 600 then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_score -> 'flags') f where jsonb_typeof(f) is distinct from 'string' or (f #>> '{}') not in ('meta_or_injection', 'offensive', 'marker_forgery')) then return false; end if;
  for k in 0..jsonb_array_length(p_points) - 1 loop
    e := p_score -> 'points' -> k;
    p := p_points -> k;
    if jsonb_typeof(e) is distinct from 'object' or e -> 'id' is distinct from p -> 'id' or e -> 'weight' is distinct from p -> 'weight' or e -> 'text' is distinct from p -> 'text' then return false; end if;
    if jsonb_typeof(e -> 'score') is distinct from 'number' or (e ->> 'score')::numeric <> trunc((e ->> 'score')::numeric) or (e ->> 'score')::numeric not between 0 and 100 then return false; end if;
    if e ->> 'band' is distinct from private.score_band((e ->> 'score')::numeric) or jsonb_typeof(e -> 'comment') is distinct from 'string' or char_length(e ->> 'comment') > 300 then return false; end if;
    if jsonb_typeof(e -> 'turns') is distinct from 'array' then return false; end if;
    for n in select x from jsonb_array_elements(e -> 'turns') x loop
      if jsonb_typeof(n) is distinct from 'number' or (n #>> '{}')::numeric <> trunc((n #>> '{}')::numeric) or (n #>> '{}')::numeric < 1 or (n #>> '{}')::numeric > jsonb_array_length(p_turns)
        or p_turns -> ((n #>> '{}')::integer - 1) ->> 'who' is distinct from 'learner' or p_turns -> ((n #>> '{}')::integer - 1) ->> 'guard' is not null then return false; end if;
    end loop;
    if jsonb_array_length(e -> 'turns') = 0 and (e ->> 'score')::numeric > 30 then return false; end if;
    if v_credit <= 1 and (e ->> 'score')::numeric > 54 then return false; end if;
    v_sum := v_sum + (p ->> 'weight')::numeric * (e ->> 'score')::numeric;
    v_weights := v_weights + (p ->> 'weight')::numeric;
  end loop;
  if jsonb_typeof(p_score -> 'overall') is distinct from 'number' or (p_score ->> 'overall')::numeric is distinct from round(v_sum / nullif(v_weights, 0)) or p_score ->> 'band' is distinct from private.score_band(round(v_sum / nullif(v_weights, 0))) then return false; end if;
  for n in select x from jsonb_array_elements(jsonb_build_array(p_score -> 'strengths', p_score -> 'missed')) x loop
    if jsonb_typeof(n) is distinct from 'array' or jsonb_array_length(n) > 5 or exists (select 1 from jsonb_array_elements(n) s where jsonb_typeof(s) is distinct from 'string' or char_length(s #>> '{}') > 200) then return false; end if;
  end loop;
  return true;
end;
$$;

-- 4. What the `ai` function scores for the caller (service role only): their own, unfinished run with at least one learner line of a scenario that has a score,
-- or why not. The hidden rows are not here: the scorer never receives what the character reveals or hides.
create function public.avatar_score_input(p_user uuid, p_run uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.avatar_runs;
  c public.contributions;
  v_content jsonb;
begin
  select * into r from public.avatar_runs where id = p_run;
  if not found or r.user_id is distinct from p_user then return jsonb_build_object('refusal', 'not_yours'); end if;
  if r.finished_at is not null then return jsonb_build_object('refusal', 'finished'); end if;
  c := private.avatar_run_contribution(p_run, p_user);
  if c.id is null then return jsonb_build_object('refusal', case when r.test then 'not_allowed' else 'no_scenario' end); end if;
  if not private.avatar_ok(c.items) then return jsonb_build_object('refusal', 'no_scenario'); end if;
  v_content := private.avatar_content(c.items, c.shape);
  if v_content ->> 'scoring' = 'Practice only' then return jsonb_build_object('refusal', 'practice_only'); end if;
  if not exists (select 1 from jsonb_array_elements(r.turns) t where t ->> 'who' = 'learner') then return jsonb_build_object('refusal', 'no_lines'); end if;
  return jsonb_build_object('title', c.title, 'situation', v_content ->> 'situation', 'counterpart', v_content ->> 'counterpart', 'points', v_content -> 'points',
    'turns', r.turns, 'score_hash', private.avatar_score_hash(p_run));
end;
$$;

-- 5. Records the score for the hash the function was given, once: the run ends with it.
create function public.record_avatar_score(p_run uuid, p_hash text, p_score jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.avatar_runs;
  c public.contributions;
begin
  select * into r from public.avatar_runs where id = p_run for update;
  if not found then raise exception 'That run is not yours'; end if;
  if r.finished_at is not null then raise exception 'This run has ended'; end if;
  c := private.avatar_run_contribution(p_run, r.user_id);
  if c.id is null then raise exception 'This learning has no practice scenario'; end if;
  if p_hash is distinct from private.avatar_score_hash(p_run) then raise exception 'The run changed while it was scored · score it again'; end if;
  if not private.avatar_score_ok(p_score, private.avatar_content(c.items, c.shape) -> 'points', r.turns) then raise exception 'The score is not valid'; end if;
  update public.avatar_runs set score = p_score, score_hash = p_hash, finished_at = now() where id = p_run;
end;
$$;

-- 6. The learner shares their own scored run with whoever may see their track (their counsellor); a practice run in the studio never.
create function public.share_avatar_run(p_run uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.avatar_runs;
begin
  select * into r from public.avatar_runs where id = p_run for update;
  if not found or r.user_id is distinct from (select auth.uid()) then raise exception 'That run is not yours'; end if;
  if r.test then raise exception 'A practice run in the studio is never shared'; end if;
  if r.score is null then raise exception 'Score the run before sharing it'; end if;
  update public.avatar_runs set shared_at = coalesce(shared_at, now()) where id = p_run;
end;
$$;

-- 7. The counsellor's confirmation: a note on a shared run (once), by the learner's counsellor (an admin only when there is none); never the learner. It changes no progress.
create function public.confirm_avatar_run(p_run uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.avatar_runs;
  v_note text := private.trimmed(coalesce(p_note, ''));
begin
  select * into r from public.avatar_runs where id = p_run for update;
  if not found or not private.is_decider_for(r.user_id) then raise exception 'Only their counsellor or an admin confirms a run'; end if;
  if r.shared_at is null then raise exception 'That run is not shared'; end if;
  if r.confirmed_at is not null then raise exception 'This run is already confirmed'; end if;
  if char_length(v_note) > 600 then raise exception 'A note is at most 600 characters'; end if;
  update public.avatar_runs set confirmed_by = (select auth.uid()), confirmed_at = now(), counsellor_note = v_note where id = p_run;
end;
$$;

-- 8. Who decides, and what a decider reads of a shared run.
create function private.is_decider_for(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user <> (select auth.uid()) and exists (select 1 from public.profiles p where p.id = p_user
    and (p.counsellor_id = (select auth.uid()) or (p.counsellor_id is null and private.can_accept(p_user))));
$$;

-- The one rule of who decides on a person's work, as waiting_submissions had it inline: their counsellor, or an admin who may accept when they have none.
-- waiting_submissions (security invoker, so the helper is executable by authenticated) is redefined to use it; its result for submissions is unchanged.
create or replace function public.waiting_submissions()
returns table (user_id uuid, name text, business_line public.business_line, learning_id text, submitted_at timestamptz,
               evidence_note text, evidence_link text, evidence_ref text, last_activity timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.user_id, coalesce(p.full_name, p.email), p.business_line, l.learning_id, l.submitted_at,
         l.evidence_note, l.evidence_link, l.evidence_ref,
         (select max(x.updated_at) from public.learner_learnings x where x.user_id = l.user_id)
  from public.learner_learnings l
  join public.profiles p on p.id = l.user_id
  where l.state = 'submitted' and (select private.is_decider_for(l.user_id))
  order by l.submitted_at nulls first, l.user_id, l.learning_id;
$$;

-- The unconfirmed shared runs waiting for the caller (the oldest 50, with the true number waiting in `total`): who, which learning and the AI's reading (without the injection flags, which are for the server).
create function public.shared_avatar_runs()
returns table (run_id uuid, user_id uuid, name text, learning_id text, title text, score jsonb, shared_at timestamptz, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.user_id, coalesce(p.full_name, p.email), r.learning_id, coalesce(l.title, r.learning_id), r.score - 'flags', r.shared_at, count(*) over ()
  from public.avatar_runs r join public.profiles p on p.id = r.user_id left join public.learnings l on l.id = r.learning_id
  where r.shared_at is not null and not r.test and r.confirmed_at is null and private.is_decider_for(r.user_id)
  order by r.shared_at, r.id limit 50;
$$;

-- The transcript of one such run, read on open; the text of a line a guard held is blanked (the line is still there, marked by its guard code).
create function public.shared_avatar_run_turns(p_run uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(case when x.t ->> 'guard' is not null then jsonb_set(x.t, '{text}', '""') else x.t end order by x.n), '[]'::jsonb)
  from public.avatar_runs r, jsonb_array_elements(r.turns) with ordinality as x(t, n)
  where r.id = p_run and r.shared_at is not null and not r.test and r.confirmed_at is null and private.is_decider_for(r.user_id);
$$;

-- The learner takes a share back until it is confirmed; after that it stays (the counsellor's note is on it).
create function public.withdraw_avatar_run(p_run uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.avatar_runs;
begin
  select * into r from public.avatar_runs where id = p_run for update;
  if not found or r.user_id is distinct from (select auth.uid()) then raise exception 'That run is not yours'; end if;
  if r.shared_at is null then raise exception 'That run is not shared'; end if;
  if r.confirmed_at is not null then raise exception 'This run is confirmed · it stays shared'; end if;
  update public.avatar_runs set shared_at = null where id = p_run;
end;
$$;

-- 9. Who may execute what.
revoke execute on function private.score_band(numeric), private.avatar_score_hash(uuid), private.avatar_score_ok(jsonb, jsonb, jsonb), private.is_decider_for(uuid) from public, anon, authenticated;
grant execute on function private.is_decider_for(uuid) to authenticated;
revoke execute on function public.avatar_score_input(uuid, uuid), public.record_avatar_score(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.avatar_score_input(uuid, uuid), public.record_avatar_score(uuid, text, jsonb) to service_role;
revoke execute on function public.share_avatar_run(uuid), public.withdraw_avatar_run(uuid), public.confirm_avatar_run(uuid, text), public.shared_avatar_runs(), public.shared_avatar_run_turns(uuid) from public, anon;
grant execute on function public.share_avatar_run(uuid), public.withdraw_avatar_run(uuid), public.confirm_avatar_run(uuid, text), public.shared_avatar_runs(), public.shared_avatar_run_turns(uuid) to authenticated;
