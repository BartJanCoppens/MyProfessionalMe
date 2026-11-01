-- Security review fixes for the learner-data migration.
--
-- 1. Counsellor assignment grants read and accept rights, so it is guarded: the new counsellor must be
--    someone the caller manages, and nobody but a System Admin changes their own stage or counsellor.
-- 2. Someone other than the learner may only move a learning from submitted to accepted, changing nothing else.
-- Calls without a user (service role, migrations) are not restricted.

create function private.guard_profile_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_system_admin() then
    return new;
  end if;
  if new.counsellor_id is distinct from old.counsellor_id or new.career_stage is distinct from old.career_stage then
    if new.id = (select auth.uid()) then
      raise exception 'Only a System Admin can change their own stage or counsellor' using errcode = '42501';
    end if;
    if new.counsellor_id is distinct from old.counsellor_id and new.counsellor_id is not null
       and not private.can_manage_user(new.counsellor_id) then
      raise exception 'The counsellor must be someone you manage' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_profile_assignments() from public, anon, authenticated;

create trigger profiles_guard_assignments
  before update on public.profiles
  for each row execute function private.guard_profile_assignments();

create function private.guard_learning_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (select auth.uid()) = old.user_id then
    return new;
  end if;
  if old.state = 'submitted' and new.state = 'accepted'
     and new.pct = old.pct and new.chosen = old.chosen
     and new.user_id = old.user_id and new.learning_id = old.learning_id then
    return new;
  end if;
  raise exception 'Only a submitted learning can be accepted, and nothing else may change' using errcode = '42501';
end;
$$;
revoke execute on function private.guard_learning_update() from public, anon, authenticated;

create trigger learner_learnings_guard_update
  before update on public.learner_learnings
  for each row execute function private.guard_learning_update();
