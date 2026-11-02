-- Podcasts and reels as learning formats (design v3, F11).
-- 1. The seven podcast and reel learnings join the catalogue (firm-wide, published).
-- 2. A podcast or reel completes itself: listening to 80% of a podcast, or answering a reel's question correctly,
--    marks it accepted (owner, Q3). The format decides, so a podcast or reel an admin adds later behaves the same.
--    Every other learning still needs a counsellor or a managing admin.

insert into public.learnings (id, title, domain, level, format, source, hours, cpd, due, why, business_line, status) values
  ('L42', 'Procurement tactics in energy tenders', 'prof', 3, 'Podcast', 'Peer contribution', 0.5, 0, '', 'Recorded by a Consulting peer with a former procurement director. Reviewed by two peers and the Energy sector lead before it was published.', null, 'published'),
  ('L43', 'The CFO’s first question', 'pers', 2, 'Podcast', 'Internal academy', 0.4, 0, '', '', null, 'published'),
  ('L44', 'Pillar Two in 90 seconds', 'reg', 2, 'Reel', 'Tax & Legal academy', 0.025, 0, '', '', null, 'published'),
  ('L45', 'One slide, one message', 'pers', 1, 'Reel', 'Peer contribution', 0.017, 0, '', '', null, 'published'),
  ('L46', 'Pivot tables you actually need', 'tec', 1, 'Reel', 'Peer contribution', 0.021, 0, '', '', null, 'published'),
  ('L47', 'Scope creep: spot it in the SOW', 'prof', 2, 'Reel', 'Peer contribution', 0.022, 0, '', '', null, 'published'),
  ('L48', 'Grid tariffs explained', 'ind', 2, 'Podcast', 'Internal academy', 0.6, 0, '', '', null, 'published');

create function private.is_self_complete(p_learning_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.learnings where id = p_learning_id and format in ('Podcast', 'Reel'));
$$;
revoke execute on function private.is_self_complete(text) from public, anon;
grant execute on function private.is_self_complete(text) to authenticated;

drop policy "learner_learnings: owner adds" on public.learner_learnings;
create policy "learner_learnings: owner adds" on public.learner_learnings for insert to authenticated
  with check (user_id = (select auth.uid()) and (state <> 'accepted' or private.is_self_complete(learning_id)));

create or replace function private.guard_learning_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if (select auth.uid()) = old.user_id then
    -- the learner: anything except acceptance itself, unless a podcast or reel completes itself
    if (new.state = 'accepted') is distinct from (old.state = 'accepted')
       and not (new.state = 'accepted' and private.is_self_complete(new.learning_id)) then
      raise exception 'Only your counsellor or an admin can accept a learning' using errcode = '42501';
    end if;
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
