-- Private media storage (Studios Phase 3, Task 3.1): the files that voice, Horizon, Slides, Podcast and Reel build on.
--
-- One private bucket, `media`. Nothing in it is public; the app reads a file through a signed URL, which Storage signs
-- only for a file the caller may select.
--
-- A file lives at <author id>/<contribution id>/<file> (private.media_path_ok; src/logic/mediaFiles.ts builds it and
-- mediaFiles.test.ts checks both use the same pattern). The first segment is the author, as Socials Reel Studio's
-- registerUpload checks the path prefix.
--
-- Who writes (insert, update, delete), private.can_write_media: the author, under their own id, for their own
-- contribution while it is a draft or has changes requested. Once sent for review the files are frozen with it.
--
-- Who reads (select, and so signed URLs), private.can_read_media:
--   * the author (their own id is the first segment);
--   * the reviewers of that contribution (private.is_contribution_reviewer, as for the contribution itself);
--   * every signed-in person once the learning published from that contribution names the path.
-- How a learning names a file (the convention later phases follow): a JSON member called "path" anywhere in
-- learnings.content, whose value is the file's full path, e.g. {"audio": {"path": "<author>/<contribution>/narration.mp3"}}
-- or {"parts": [{"path": "..."}, ...]}. Only files of the contribution the learning was published from count, so a
-- path copied into another learning's content opens nothing.
--
-- Size and type: the bucket refuses files over 50 MB and types outside the list. The app checks the tighter limit per
-- kind first (.horizon 50 MB, audio 25 MB per file; MEDIA_KINDS in src/logic/mediaFiles.ts). Images and video are
-- listed for later phases; the app does not upload them yet.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('media', 'media', false, 52428800, array['audio/mpeg', 'audio/mp4', 'application/json', 'image/png', 'image/jpeg', 'image/webp', 'video/webm', 'video/mp4']);

-- <author id>/<contribution id>/<file>: two lower-case uuids and a file name of letters, digits, dots, dashes and
-- underscores (at most 100 characters, not starting with a dot). Nothing else: no deeper folders, no '..'.
create function private.media_path_ok(p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$', false);
$$;

-- The author, under their own id, for their own contribution while it is editable (as "contributions: author edits").
create function private.can_write_media(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.media_path_ok(p_path) then
    split_part(p_path, '/', 1)::uuid = (select auth.uid())
    and exists (select 1 from public.contributions c
                where c.id = split_part(p_path, '/', 2)::uuid and c.author_id = (select auth.uid()) and c.status in ('draft', 'changes'))
  else false end;
$$;

-- The author; the contribution's reviewers; everyone signed in once its published learning names the path.
create function private.can_read_media(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.media_path_ok(p_path) then
    split_part(p_path, '/', 1)::uuid = (select auth.uid())
    or exists (
      select 1 from public.contributions c
      left join public.learnings l on l.id = c.learning_id and l.status = 'published'
      where c.id = split_part(p_path, '/', 2)::uuid and c.author_id = split_part(p_path, '/', 1)::uuid
        and (private.is_contribution_reviewer(c.id)
             or coalesce(jsonb_path_exists(l.content, '$.**.path ? (@ == $p)', jsonb_build_object('p', p_path)), false)))
  else false end;
$$;

revoke execute on function private.media_path_ok(text) from public, anon, authenticated;
revoke execute on function private.can_write_media(text), private.can_read_media(text) from public, anon;
grant execute on function private.can_write_media(text), private.can_read_media(text) to authenticated;

-- storage.objects holds every bucket's files and keeps Supabase's own grants; these policies cover bucket media only.
-- No policy for anon: anon reads and writes nothing here.
create policy "media: read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (select private.can_read_media(name)));
create policy "media: author adds" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select private.can_write_media(name)));
create policy "media: author replaces" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select private.can_write_media(name)))
  with check (bucket_id = 'media' and (select private.can_write_media(name)));
create policy "media: author removes" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select private.can_write_media(name)));
