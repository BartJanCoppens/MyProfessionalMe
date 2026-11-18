-- Live video and the voice fallback (studios plan, Task 6.5). The `avatar` edge function issues short-lived HeyGen LiveAvatar tokens; the `voice`
-- function speaks a run's last character line with the scenario's stock voice (the portrait fallback). The keys stay in Vault (AI connections).
--
-- stock_looks.heygen_avatar_id / heygen_voice_id   a look with a HeyGen stock avatar (and its HeyGen voice) is "Live video"; one without is "Portrait only".
--                                                  System and General Admins set them under the existing add and edit policies; a non-uuid is refused by the type.
-- ai_uses.daily_seconds                            seconds of live video per person per day (null: no limit). avatar_video: 10 sessions and 1,800 s a day.
-- ai_usage.seconds                                 seconds reserved or used today, per person and use.
-- avatar_sessions                                  one row per live session (service role only: no grant, no policy). max_seconds is what HeyGen is told to allow.
-- avatar_session_open / avatar_session_report      reserve the seconds before a token is issued; the client's seconds never lower the charge: a final report that
--                                                  stopped the upstream session charges the wall clock and returns the rest, one that did not stop it keeps the whole reservation. One open session per person; an unreported session keeps its
--                                                  reservation until its maximum has passed.
-- avatar_say_input                                 what the portrait voice says: the run's last character line (the scenario's opening line before the character has answered), with the scenario's stock voice (never a text from the client).
-- ai_live_uses()                                   as before (20261117280000), and an avatar use is live on a HeyGen connection with a key (no model needed).

-- 1. Looks and uses.
alter table public.stock_looks add column heygen_avatar_id uuid, add column heygen_voice_id uuid;
grant insert (heygen_avatar_id, heygen_voice_id), update (heygen_avatar_id, heygen_voice_id) on public.stock_looks to authenticated;

alter table public.ai_uses add column daily_seconds int check (daily_seconds is null or daily_seconds between 0 and 86400);
grant update (daily_seconds) on public.ai_uses to authenticated;
alter table public.ai_usage add column seconds int not null default 0;

update public.ai_uses set waiting_for = null, daily_limit = 10, daily_seconds = 1800, enabled = false where key = 'avatar_video';
update public.ai_uses set waiting_for = null, label = 'Avatar voice (portrait)', description = 'Speaks the character''s lines with the scenario''s stock voice when the live video is not used or fails (the portrait).', daily_limit = 300, daily_chars = 30000, enabled = false where key = 'avatar_voice';

-- 2. The sessions.
create table public.avatar_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  run_id uuid not null references public.avatar_runs (id) on delete cascade,
  opened_at timestamptz not null default now(),
  max_seconds int not null check (max_seconds between 60 and 3600),
  used_seconds int not null default 0 check (used_seconds between 0 and max_seconds),
  provider_session_id text,
  closed_at timestamptz
);
create index avatar_sessions_user_id_idx on public.avatar_sessions (user_id);
create index avatar_sessions_run_id_idx on public.avatar_sessions (run_id);
alter table public.avatar_sessions enable row level security;
revoke all on public.avatar_sessions from anon, authenticated;

-- The one language-name -> code mapping the video and the portrait's voice use (the scenario's language is English, Dutch or French).
create or replace function private.language_code(p_language text) returns text language sql immutable set search_path = '' as $$
  select case p_language when 'Dutch' then 'nl' when 'French' then 'fr' else 'en' end
$$;

-- 3. Opens a session for the caller's own unfinished run: a refusal, or { session_id, max_seconds, avatar_id, voice_id, language }.
create function public.avatar_session_open(p_user uuid, p_run uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.avatar_runs;
  c public.contributions;
  v_look public.stock_looks;
  v_content jsonb;
  v_minutes integer;
  v_secs_lim integer;
  v_left integer;
  v_max integer;
  v_id uuid;
  today date := (now() at time zone 'utc')::date;
begin
  perform pg_advisory_xact_lock(hashtextextended('avatar_session:' || p_user::text, 0));
  select * into r from public.avatar_runs where id = p_run;
  if not found or r.user_id is distinct from p_user then return jsonb_build_object('refusal', 'not_yours'); end if;
  if r.finished_at is not null then return jsonb_build_object('refusal', 'finished'); end if;
  c := private.avatar_run_contribution(p_run, p_user);
  if c.id is null then return jsonb_build_object('refusal', 'no_video'); end if;
  select * into v_look from public.stock_looks l where l.active and l.heygen_avatar_id is not null and l.id::text = c.shape ->> 'Look';
  if not found then return jsonb_build_object('refusal', 'no_video'); end if;
  if exists (select 1 from public.avatar_sessions s where s.user_id = p_user and s.closed_at is null and now() < s.opened_at + s.max_seconds * interval '1 second') then
    return jsonb_build_object('refusal', 'open_elsewhere');
  end if;
  v_content := private.avatar_content(c.items, c.shape);
  v_minutes := (v_content ->> 'minutes')::integer;
  select daily_seconds into v_secs_lim from public.ai_uses where key = 'avatar_video';
  v_left := v_secs_lim - coalesce((select u.seconds from public.ai_usage u where u.user_id = p_user and u.use_key = 'avatar_video' and u.day = today), 0);
  if v_left < 60 then return jsonb_build_object('refusal', 'minutes_used'); end if;
  v_max := least(v_minutes * 60 + 60, coalesce(v_left, 3600), 3600);
  begin
    perform public.ai_count_call(p_user, 'avatar_video', 0);
  exception when check_violation then
    return jsonb_build_object('refusal', 'sessions_used');
  end;
  update public.ai_usage set seconds = seconds + v_max where user_id = p_user and use_key = 'avatar_video' and day = today;
  insert into public.avatar_sessions (user_id, run_id, max_seconds) values (p_user, p_run, v_max) returning id into v_id;
  return jsonb_build_object('session_id', v_id, 'max_seconds', v_max, 'avatar_id', v_look.heygen_avatar_id, 'voice_id', v_look.heygen_voice_id,
    'language', private.language_code(v_content ->> 'language'));
end;
$$;

-- 4. Reporting. The client's seconds are never a reason to charge less: a heartbeat is only recorded (never more than the wall clock allows, plus 5 s, and
-- never less than before). A final report names whether the upstream (HeyGen) session was stopped by the function: stopped, the session closes and is charged
-- the wall-clock time since it opened (at most max_seconds), the rest of the reservation returns; not stopped, the whole reservation stays charged and the session
-- stays open, so open_elsewhere holds until opened_at + max_seconds. Returns the seconds charged (used_seconds records the time seen, for the log).
create function public.avatar_session_report(p_user uuid, p_session uuid, p_seconds integer, p_final boolean, p_stopped boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.avatar_sessions;
  v_wall integer;
  v_used integer;
begin
  if p_seconds is null or p_seconds < 0 or p_seconds > 3600 then raise exception 'Seconds are 0 to 3,600'; end if;
  select * into s from public.avatar_sessions where id = p_session and user_id = p_user for update;
  if not found then raise exception 'That is not your video session'; end if;
  if s.closed_at is not null then raise exception 'This video session has ended'; end if;
  v_wall := floor(extract(epoch from now() - s.opened_at))::integer;
  v_used := case when p_final then greatest(s.used_seconds, least(v_wall, s.max_seconds)) else greatest(s.used_seconds, least(p_seconds, v_wall + 5, s.max_seconds)) end;
  update public.avatar_sessions set used_seconds = v_used, closed_at = case when p_final and p_stopped then now() end where id = p_session;
  if p_final and p_stopped then
    update public.ai_usage set seconds = greatest(0, seconds - (s.max_seconds - v_used))
      where user_id = p_user and use_key = 'avatar_video' and day = (s.opened_at at time zone 'utc')::date;
  end if;
  return case when p_final and not p_stopped then s.max_seconds else v_used end;
end;
$$;

-- The provider's session id (HeyGen) the function saved when it issued the token, so a final report can stop that session; and the saving of it.
create function public.avatar_session_attach(p_user uuid, p_session uuid, p_provider text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.avatar_sessions set provider_session_id = left(p_provider, 200) where id = p_session and user_id = p_user and closed_at is null;
$$;
create function public.avatar_session_provider(p_user uuid, p_session uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select provider_session_id from public.avatar_sessions where id = p_session and user_id = p_user;
$$;

-- 5. What the portrait says: the last character line of the caller's own run, the scenario's active stock voice and the language code, or a refusal.
create function public.avatar_say_input(p_user uuid, p_run uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.avatar_runs;
  c public.contributions;
  v_voice text;
  v_text text;
  v_content jsonb;
begin
  select * into r from public.avatar_runs where id = p_run;
  if not found or r.user_id is distinct from p_user then return jsonb_build_object('refusal', 'not_yours'); end if;
  c := private.avatar_run_contribution(p_run, p_user);
  if c.id is null then return jsonb_build_object('refusal', 'no_voice'); end if;
  select v.voice_id into v_voice from public.stock_voices v where v.active and v.id::text = c.shape ->> 'Voice';
  if v_voice is null then return jsonb_build_object('refusal', 'no_voice'); end if;
  select t ->> 'text' into v_text from jsonb_array_elements(r.turns) with ordinality x(t, n) where t ->> 'who' = 'character' order by n desc limit 1;
  v_content := private.avatar_content(c.items, c.shape);
  -- Before the character has answered, the line to speak is the scenario's own opening line, read here from the published content (never from the client).
  if v_text is null then v_text := v_content ->> 'opening'; end if;
  if v_text is null then return jsonb_build_object('refusal', 'no_line'); end if;
  return jsonb_build_object('text', v_text, 'voice_id', v_voice,
    'language', private.language_code(v_content ->> 'language'));
end;
$$;

-- 6. ai_live_uses(): as before, and an avatar use on a HeyGen connection with a key.
create or replace function public.ai_live_uses()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(u.key order by u.sort), '{}')
  from public.ai_uses u join public.ai_connections c on c.id = u.connection_id
  where u.enabled and u.waiting_for is null and c.secret_id is not null and private.ai_provider_fits(u.kind, c.provider)
    and ((u.kind = 'text' and coalesce(u.model, c.default_model) is not null) or (u.kind = 'voice' and c.provider = 'elevenlabs') or (u.kind = 'avatar' and c.provider = 'heygen'));
$$;

-- 7. Who may execute what: the service role only (the `avatar` and `voice` functions).
revoke execute on function public.avatar_session_open(uuid, uuid), public.avatar_session_report(uuid, uuid, integer, boolean, boolean), public.avatar_session_attach(uuid, uuid, text), public.avatar_session_provider(uuid, uuid), public.avatar_say_input(uuid, uuid) from public, anon, authenticated;
grant execute on function public.avatar_session_open(uuid, uuid), public.avatar_session_report(uuid, uuid, integer, boolean, boolean), public.avatar_session_attach(uuid, uuid, text), public.avatar_session_provider(uuid, uuid), public.avatar_say_input(uuid, uuid) to service_role;
