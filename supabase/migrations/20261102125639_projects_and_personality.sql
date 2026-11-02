-- Each person's projects & evaluations and personality results, instead of the prototype's fixed (empty) lists.
-- Evaluations come from staffing and the performance tool, so the app never writes them; they are read like the
-- formal learning track (private.can_view_track: the person, their counsellor, managing admins, General and System
-- Admins). Personality results are the person's alone (owner's Q8): nobody else reads them, View as included.

create table public.project_evaluations (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  client text not null,
  name text not null,
  role text not null default '',
  period text not null default '',
  hours integer not null default 0 check (hours >= 0),
  lead text not null default '',
  evaluator text not null default '',
  -- null while the evaluation is pending
  eval_date text,
  overall text,
  summary text,
  -- [[dimension, rating 0..2, comment], …]
  dims jsonb,
  quote text,
  -- [[learning id, advice], …]: feeds the projects cloud
  advice jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index project_evaluations_user_id_idx on public.project_evaluations (user_id);
alter table public.project_evaluations enable row level security;

create table public.personality_tests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  provider text not null default '',
  taken text not null default '',
  headline text not null default '',
  unit text not null default '%',
  -- [[label, value, colour?], …]
  bars jsonb not null default '[]'::jsonb,
  reading text not null default '',
  -- [[learning id, suggestion], …]: feeds the personality cloud
  sugg jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index personality_tests_user_id_idx on public.personality_tests (user_id);
alter table public.personality_tests enable row level security;

revoke all on public.project_evaluations, public.personality_tests from anon, authenticated;
grant select on public.project_evaluations, public.personality_tests to authenticated;

create policy "project_evaluations: read with the formal track" on public.project_evaluations for select to authenticated
  using ((select private.can_view_track(user_id)));
create policy "personality_tests: the person only" on public.personality_tests for select to authenticated
  using (user_id = (select auth.uid()));
