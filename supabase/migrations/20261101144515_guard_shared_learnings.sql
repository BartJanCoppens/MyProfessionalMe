-- A learning mapped for an audience the caller cannot edit may not be removed or turned into a draft by them:
-- the delete would cascade into that audience's curriculum, and a draft would vanish from its learners' paths.
-- Calls without a user (migrations, service role) are not restricted.

create function private.guard_shared_learning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  if (tg_op = 'DELETE' or (new.status = 'draft' and old.status <> 'draft'))
     and exists (select 1 from public.curriculum_mappings m where m.learning_id = old.id and not private.can_edit_audience(m.audience)) then
    raise exception 'This learning is mapped for audiences you cannot edit; ask their admins to unmap it first' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function private.guard_shared_learning() from public, anon, authenticated;

create trigger learnings_guard_shared
  before update or delete on public.learnings
  for each row execute function private.guard_shared_learning();
