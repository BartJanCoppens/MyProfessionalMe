-- Studios, Phase 5 (Task 5.1): word timings in a voice clip, for captions. A clip is the 6 keys it had, or 7 with `words`: when
-- each spoken word starts, in seconds from the clip's start (the `voice` function answers it; wordTimes in
-- supabase/functions/voice/core.ts). Clips stored before this phase have no `words` and stay valid; nothing is invented.
-- private.voice_ok is redefined from 20261117310000 (isVoiceItem in src/logic/voiceItem.ts; slidesContent.test.ts compares the limits).
-- No table, policy or grant changes.

-- Words are an array of at most 300 numbers (CLIP_WORDS_MAX), non-decreasing, each within [0, seconds].
create function private.words_ok(w jsonb, p_seconds numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(w) is distinct from 'array' then false
    when jsonb_array_length(w) > 300 then false
    else not exists (select 1 from jsonb_array_elements(w) with ordinality as t(x, n) left join jsonb_array_elements(w) with ordinality as u(x, n) on u.n = t.n - 1
      where case when jsonb_typeof(t.x) is distinct from 'number' then true
        when (t.x #>> '{}')::numeric not between 0 and p_seconds then true
        else u.x is not null and jsonb_typeof(u.x) = 'number' and (u.x #>> '{}')::numeric > (t.x #>> '{}')::numeric end)
  end;
$$;

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
          when (select count(*) from jsonb_object_keys(c)) <> 6 + (c ? 'words')::integer or not (c ?& array['slide', 'text', 'path', 'seconds', 'marks', 'voice']) then false
          when jsonb_typeof(c -> 'slide') is distinct from 'number' or (c ->> 'slide') !~ '^[0-9]{1,2}$' or jsonb_typeof(c -> 'text') is distinct from 'string'
            or jsonb_typeof(c -> 'path') is distinct from 'string' or jsonb_typeof(c -> 'voice') is distinct from 'string' or jsonb_typeof(c -> 'seconds') is distinct from 'number' or jsonb_typeof(c -> 'marks') is distinct from 'array' then false
          else (c ->> 'slide')::integer between 0 and 48 and private.trimmed(c ->> 'text') <> '' and char_length(c ->> 'text') <= 600 and (c ->> 'voice') ~ '^[A-Za-z0-9_-]{1,64}$'
            and private.media_path_ok(c ->> 'path') and right(c ->> 'path', 4) = '.mp3'
            and (c ->> 'seconds')::numeric > 0 and (c ->> 'seconds')::numeric <= 180
            and jsonb_array_length(c -> 'marks') <= 50
            and (not c ? 'words' or private.words_ok(c -> 'words', (c ->> 'seconds')::numeric))
            and not exists (select 1 from jsonb_array_elements(c -> 'marks') m where case
              when jsonb_typeof(m) is distinct from 'object' then true
              when (select count(*) from jsonb_object_keys(m)) <> 2 or not (m ?& array['kind', 'at']) then true
              when jsonb_typeof(m -> 'kind') is distinct from 'string' or (m ->> 'kind') not in ('next', 'cue') or jsonb_typeof(m -> 'at') is distinct from 'number' then true
              else (m ->> 'at')::numeric not between 0 and 180 end)
          end))
      else false end
  end;
$$;

revoke execute on function private.words_ok(jsonb, numeric), private.voice_ok(jsonb) from public, anon, authenticated;
