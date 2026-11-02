-- AI connections (owner, 2 Nov 2026): a System Admin stores the API keys of AI providers and chooses, per place
-- where the app uses AI, which connection (and optionally which model) serves it.
--
-- ai_connections  one row per provider account: name, provider, base URL, default model, region/notes, and the last
--                 four characters of the key (key_hint). The key itself is in Supabase Vault (secret_id points to it);
--                 no table column holds it and no client role can read it. Deleting a connection deletes its secret.
-- ai_uses         one row per place AI is used (seeded): kind (text, embedding, voice, avatar), the connection and
--                 model chosen for it, on/off, and waiting_for when the app cannot call it yet (a feature to build).
-- ai_set_key()    the only way to store or replace a key: System Admins only; returns nothing.
-- ai_live_uses()  the use keys the app can call right now (no secrets): enabled text uses with a connection that
--                 has a key and a model. Any signed-in user; the app uses it to decide between AI and its scripted reply.
-- ai_connection_key()  the decrypted key, for the `ai` edge function only (service_role).
-- Everything else about connections and uses is System Admin only, also reading.

-- Vault is on by default in Supabase projects; enable it only where it is missing.
do $$ begin
  if to_regprocedure('vault.create_secret(text,text,text)') is null and exists (select 1 from pg_available_extensions where name = 'supabase_vault') then
    create extension if not exists supabase_vault with schema vault;
  end if;
end $$;

-- Which providers can serve which kind of use. Storage-only providers (elevenlabs, heygen, other) keep keys for
-- the voice, avatar and embedding uses that are not built yet.
create function private.ai_provider_fits(p_kind text, p_provider text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'text' then p_provider in ('anthropic', 'openai_compatible')
    when 'embedding' then p_provider in ('openai_compatible', 'other')
    when 'voice' then p_provider in ('elevenlabs', 'other')
    when 'avatar' then p_provider in ('heygen', 'other')
    else false end;
$$;

-- ---------- tables ----------

create table public.ai_connections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  provider text not null check (provider in ('anthropic', 'openai_compatible', 'elevenlabs', 'heygen', 'other')),
  base_url text check (base_url is null or (base_url ~ '^https://[^\s]+$' and length(base_url) <= 300)),
  default_model text check (default_model is null or length(default_model) between 1 and 120),
  region text check (region is null or length(region) <= 200),
  key_hint text check (key_hint is null or length(key_hint) = 4),
  secret_id uuid,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint ai_connections_openai_needs_url check (provider <> 'openai_compatible' or base_url is not null)
);
create index ai_connections_created_by_idx on public.ai_connections (created_by);
create index ai_connections_updated_by_idx on public.ai_connections (updated_by);

create table public.ai_uses (
  key text primary key,
  label text not null,
  description text not null,
  place text not null,
  kind text not null check (kind in ('text', 'embedding', 'voice', 'avatar')),
  waiting_for text,
  admins_only boolean not null default false,
  sort int not null default 0,
  connection_id uuid references public.ai_connections (id) on delete set null,
  model text check (model is null or length(model) between 1 and 120),
  enabled boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index ai_uses_connection_id_idx on public.ai_uses (connection_id);
create index ai_uses_updated_by_idx on public.ai_uses (updated_by);

insert into public.ai_uses (key, sort, kind, label, place, description, waiting_for, admins_only) values
 ('profile_chat', 10, 'text', 'Talk it through', 'My profile', 'The profile chat that helps a person put interests and ambitions into words and proposes them for saving.', null, false),
 ('curriculum_copilot', 20, 'text', 'Curriculum copilot', 'Administration · Curriculum mapping', 'Answers questions about the mappings and proposes up to five changes; the admin decides.', null, true),
 ('learners_eye', 30, 'text', 'Read it as …', 'Administration · Curriculum mapping · Learner''s eye', 'Reads the stacked learning of one persona in their words and names one change.', null, true),
 ('kb_answer', 40, 'text', 'Test retrieval answer', 'Administration · Knowledge library · Test', 'Answers a test question from the retrieved passages, with citations.', null, true),
 ('draft_outline', 50, 'text', 'Draft with AI', 'Create & share · New', 'Drafts a takeaway and an outline from passages of the chosen knowledge bundles.', null, false),
 ('logic_translate', 60, 'text', 'Logic question translation', 'Knowledge library · logic engine', 'Translates a question and its facts into a query for the IDP-Z3 solver.', 'the logic engine (F14, IDP-Z3)', true),
 ('kb_embeddings', 70, 'embedding', 'Knowledge embeddings', 'Knowledge library · indexing and retrieval', 'Embeds passages and questions for vector search (Multilingual E5 large, hosted in the EU).', 'retrieval in the database (F13)', true),
 ('avatar_conversation', 80, 'text', 'Avatar conversation', 'Library · avatar practice', 'Plays the practice persona in an avatar conversation and coaches afterwards.', 'the avatar studio (parked, to be integrated with Taxatar)', false),
 ('avatar_voice', 90, 'voice', 'Avatar voice', 'Library · avatar practice', 'Speaks the avatar''s lines and transcribes the learner.', 'the avatar studio (parked, to be integrated with Taxatar)', false),
 ('avatar_video', 100, 'avatar', 'Avatar video', 'Library · avatar practice', 'Renders the talking avatar.', 'the avatar studio (parked, to be integrated with Taxatar)', false),
 ('media_voice', 110, 'voice', 'Podcast and reel voice-over', 'Create & share · podcasts and reels', 'Reads a peer''s script aloud for a podcast or reel.', 'voice-over in Create & share', false);

-- ---------- guards ----------

-- A use only takes a connection whose provider fits its kind; a connection in use cannot switch to a provider that
-- no longer fits. Both tables record who changed them last.
create function private.guard_ai_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare p text;
begin
  if new.connection_id is not null then
    select provider into p from public.ai_connections where id = new.connection_id;
    if not private.ai_provider_fits(new.kind, p) then
      raise exception 'A % connection cannot serve a % use', p, new.kind using errcode = 'check_violation';
    end if;
  end if;
  new.updated_by := auth.uid(); new.updated_at := now();
  return new;
end $$;
create trigger ai_uses_guard before update on public.ai_uses for each row execute function private.guard_ai_use();

create function private.guard_ai_connection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider is distinct from old.provider and exists (
    select 1 from public.ai_uses u where u.connection_id = new.id and not private.ai_provider_fits(u.kind, new.provider)) then
    raise exception 'This connection serves uses that a % provider cannot serve; choose another connection for them first', new.provider using errcode = 'check_violation';
  end if;
  new.updated_by := auth.uid(); new.updated_at := now();
  return new;
end $$;
create trigger ai_connections_guard before update on public.ai_connections for each row execute function private.guard_ai_connection();

-- The key goes with its connection.
create function private.drop_ai_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.secret_id is not null then delete from vault.secrets where id = old.secret_id; end if;
  return old;
end $$;
create trigger ai_connections_drop_secret after delete on public.ai_connections for each row execute function private.drop_ai_secret();

-- ---------- functions ----------

-- Store or replace a connection's key in Vault. System Admins only. The key is never returned or stored elsewhere;
-- only its last four characters are kept, to recognise it.
create function public.ai_set_key(p_connection uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare k text := btrim(coalesce(p_key, '')); sid uuid;
begin
  if not private.is_system_admin() then raise exception 'Only a System Admin can set an API key' using errcode = 'insufficient_privilege'; end if;
  if length(k) < 8 or length(k) > 4000 or k ~ '\s' then raise exception 'That does not look like an API key' using errcode = 'check_violation'; end if;
  select secret_id into sid from public.ai_connections where id = p_connection for update;
  if not found then raise exception 'Connection not found' using errcode = 'no_data_found'; end if;
  if sid is null then
    sid := vault.create_secret(k, 'ai_connection_' || p_connection::text, 'API key of an AI connection (MyProfessionalMe)');
  else
    perform vault.update_secret(sid, k);
  end if;
  update public.ai_connections set secret_id = sid, key_hint = right(k, 4) where id = p_connection;
end $$;

-- The use keys the app can call now. The `ai` edge function applies the same list before every call.
create function public.ai_live_uses()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(u.key order by u.sort), '{}')
  from public.ai_uses u join public.ai_connections c on c.id = u.connection_id
  where u.enabled and u.kind = 'text' and u.waiting_for is null and c.secret_id is not null
    and private.ai_provider_fits(u.kind, c.provider) and coalesce(u.model, c.default_model) is not null;
$$;

-- The decrypted key of a connection, for the `ai` edge function (service_role) only.
create function public.ai_connection_key(p_connection uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret from public.ai_connections c join vault.decrypted_secrets s on s.id = c.secret_id where c.id = p_connection;
$$;

revoke execute on function private.ai_provider_fits(text, text), private.guard_ai_use(), private.guard_ai_connection(), private.drop_ai_secret() from public, anon, authenticated;
revoke execute on function public.ai_set_key(uuid, text), public.ai_live_uses(), public.ai_connection_key(uuid) from public, anon, authenticated;
grant execute on function public.ai_set_key(uuid, text), public.ai_live_uses() to authenticated;
grant execute on function public.ai_live_uses(), public.ai_connection_key(uuid) to service_role;

-- ---------- grants and policies: System Admins only ----------

alter table public.ai_connections enable row level security;
alter table public.ai_uses enable row level security;
revoke all on public.ai_connections, public.ai_uses from anon, authenticated;

grant select (id, name, provider, base_url, default_model, region, key_hint, created_by, created_at, updated_by, updated_at) on public.ai_connections to authenticated;
grant insert (name, provider, base_url, default_model, region), update (name, provider, base_url, default_model, region), delete on public.ai_connections to authenticated;
grant select on public.ai_uses to authenticated;
grant update (connection_id, model, enabled) on public.ai_uses to authenticated;

create policy "ai_connections: read" on public.ai_connections for select to authenticated using ((select private.is_system_admin()));
create policy "ai_connections: add" on public.ai_connections for insert to authenticated with check ((select private.is_system_admin()));
create policy "ai_connections: edit" on public.ai_connections for update to authenticated using ((select private.is_system_admin())) with check ((select private.is_system_admin()));
create policy "ai_connections: remove" on public.ai_connections for delete to authenticated using ((select private.is_system_admin()));
create policy "ai_uses: read" on public.ai_uses for select to authenticated using ((select private.is_system_admin()));
create policy "ai_uses: edit" on public.ai_uses for update to authenticated using ((select private.is_system_admin())) with check ((select private.is_system_admin()));
