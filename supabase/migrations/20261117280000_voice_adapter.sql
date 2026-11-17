-- The voice adapter (Studios Phase 3, Task 3.2): ElevenLabs behind the one `voice` edge function, with stock voices only.
--
-- stock_voices            the voices a creator may choose (owner S2, S5: only stock voices, never a cloned person).
--                         name is a role and a description ("Narrator · warm, 40s"), never a person's name; voice_id is
--                         the provider's id and stays as added (a wrong one is deactivated and added again); nobody
--                         deletes a voice, since stored narration was made with it. System and General Admins add,
--                         rename and deactivate on the AI connections page; every signed-in person reads the active ones.
-- ai_uses.daily_chars     characters per person per day for a use (null: no character limit; text uses keep calls only).
-- ai_count_call()         as before (20261102093739), and refuses a call that would pass the use's daily characters.
-- studio_voice            the studios' voice use: kind voice, off by default, 30,000 characters a day per person.
-- ai_live_uses()          as before, and a voice use is live on an ElevenLabs connection with a key (no model needed:
--                         the function uses ElevenLabs' multilingual model unless the use or connection names one).
-- public.can_write_media  the media write rule (private.can_write_media, 20261117270000) for the signed-in caller, so the
--                         `voice` function can ask it with the caller's token before it spends characters.

-- ---------- stock voices ----------

create table public.stock_voices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  voice_id text not null unique check (voice_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  language text not null check (length(trim(language)) between 2 and 40),
  accent text check (accent is null or length(accent) <= 40),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.stock_voices enable row level security;
revoke all on public.stock_voices from anon, authenticated;
grant select on public.stock_voices to authenticated;
grant insert (name, voice_id, language, accent, active), update (name, language, accent, active) on public.stock_voices to authenticated;

create policy "stock_voices: read" on public.stock_voices for select to authenticated
  using (active or (select private.is_system_admin()) or (select private.is_general_admin()));
create policy "stock_voices: add" on public.stock_voices for insert to authenticated
  with check ((select private.is_system_admin()) or (select private.is_general_admin()));
create policy "stock_voices: edit" on public.stock_voices for update to authenticated
  using ((select private.is_system_admin()) or (select private.is_general_admin()))
  with check ((select private.is_system_admin()) or (select private.is_general_admin()));

-- ---------- a daily character limit per use ----------

alter table public.ai_uses add column daily_chars int check (daily_chars is null or daily_chars between 0 and 10000000);
grant update (daily_chars) on public.ai_uses to authenticated;

-- Counts one call, atomically, unless the caller reached the use's daily calls or would pass its daily characters.
-- Returns the calls used today. Beyond either limit nothing is counted.
create or replace function public.ai_count_call(p_user uuid, p_use text, p_chars int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare lim int; chars_lim int; n int; c int := greatest(coalesce(p_chars, 0), 0); today date := (now() at time zone 'utc')::date;
begin
  select daily_limit, daily_chars into lim, chars_lim from public.ai_uses where key = p_use;
  if lim is null then raise exception 'Unknown AI use' using errcode = 'no_data_found'; end if;
  if lim = 0 or c > coalesce(chars_lim, c) then raise exception 'Daily AI limit reached' using errcode = 'check_violation'; end if;
  insert into public.ai_usage as u (user_id, use_key, day, calls, input_chars) values (p_user, p_use, today, 1, c)
  on conflict (user_id, use_key, day) do update set calls = u.calls + 1, input_chars = u.input_chars + excluded.input_chars
    where u.calls < lim and (chars_lim is null or u.input_chars + excluded.input_chars <= chars_lim)
  returning calls into n;
  if n is null then raise exception 'Daily AI limit reached' using errcode = 'check_violation'; end if;
  return n;
end $$;

-- ---------- the studios' voice use ----------

-- Off by default: until a System Admin chooses an ElevenLabs connection and switches it on, a studio offers the browser
-- voice for preview only, labelled "Browser voice · not saved".
insert into public.ai_uses (key, sort, kind, label, place, description, waiting_for, admins_only, enabled, preamble, daily_chars) values
 ('studio_voice', 105, 'voice', 'Studio voice-over', 'Create & share · Slides and Podcast studios', 'Reads a creator''s narration aloud in a stock voice (ElevenLabs) and stores the audio with their draft. At most 5,000 characters per call.', null, false, false, '', 30000);

-- As before (20261102092324), plus voice uses on an ElevenLabs connection with a key.
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
    and ((u.kind = 'text' and coalesce(u.model, c.default_model) is not null) or (u.kind = 'voice' and c.provider = 'elevenlabs'));
$$;

-- ---------- the media write rule, for the caller ----------

create function public.can_write_media(p_path text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.can_write_media(p_path);
$$;
revoke execute on function public.can_write_media(text) from public, anon, authenticated;
grant execute on function public.can_write_media(text) to authenticated;
