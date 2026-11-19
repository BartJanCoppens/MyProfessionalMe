-- E-learning Studio, the format (E-learning Studio plan 2026-11-19, Task 1.1): the 'E-learning' format through the shared studio path. Client side:
-- src/logic/courseContent.ts (courseContent.sync.test.ts pins the caps and every sentence below). No new table, policy or grant: the contributions
-- policies and the check gate cover it, and is_self_complete already lists E-learning (a course completes by the rule its creator chose, saved by the player).
--
-- items     A course is 2 to 12 lesson rows [label, title, summary] (rows_ok, width 3), then block objects {block, id, lesson, ...} and nothing else: 20 blocks
--           per lesson at most, ids "b" + 4 to 20 lower-case letters or digits and unique, `lesson` the index (from 0) of a lesson row, the whole course up to
--           250,000 bytes and 252 items (private.item_max). Block kinds: text, callout, accordion, check (an exam question: private.question_ok, and `fin`),
--           sort, branch (at least one good choice), reflect and exercise. Each field has its cap (private.course_shape_ok); every limit is checked here, not
--           only in the editor, because items are untrusted content.
-- shape     'How is completion decided?' (All lessons viewed, Final check of 80 % or more, Both) and 'Length?' (15, 30 or 60 min): the hours.
-- content   private.course_content is courseContent in src/logic/courseContent.ts: the lessons' titles and their blocks rebuilt from the known keys, trimmed,
--           without `lesson`, and the completion rule. Summaries are not published.
-- check     contribution_problems refuses a course whose blocks are wrong (private.course_row_problems, in words), a lesson without blocks, a completion rule
--           that needs a final check when there is none, and two final checks. The client-name scan reads the items as text, so it covers every block.
-- hours     the creator's "Length?" (private.course_hours); CPD stays 0 like every peer contribution.
-- the format is made only in its studio: contributions_upload_formats is unchanged.

-- 1. The format lists: creation rules, review requirements and contributions.
alter table public.creator_rules drop constraint creator_rules_formats_check;
alter table public.creator_rules add constraint creator_rules_formats_check
  check (formats <@ array['Reel', 'Podcast', 'Micro-guide', 'Case write-up', 'Avatar', 'Flash cards', 'Practice exam', 'Presentation', 'Game', 'Slides', 'Animated flow', 'Interactive explainer', 'Job aid', 'Case exercise', 'E-learning']);
alter table public.review_policies drop constraint review_policies_formats_check;
alter table public.review_policies add constraint review_policies_formats_check
  check (formats <@ array['Reel', 'Podcast', 'Micro-guide', 'Case write-up', 'Avatar', 'Flash cards', 'Practice exam', 'Presentation', 'Game', 'Slides', 'Animated flow', 'Interactive explainer', 'Job aid', 'Case exercise', 'E-learning']);
alter table public.contributions drop constraint contributions_type_check;
alter table public.contributions add constraint contributions_type_check
  check (type in ('Reel', 'Podcast', 'Micro-guide', 'Case write-up', 'Avatar', 'Flash cards', 'Practice exam', 'Presentation', 'Game', 'Slides', 'Animated flow', 'Interactive explainer', 'Job aid', 'Case exercise', 'E-learning'));

-- 2. The cap and the studio's minimum: as before (20261118180000, 20261117220000), with the course.
create or replace function private.item_max(p_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select t.m from (values
    ('Flash cards', 40),
    ('Practice exam', 30),
    ('Presentation', 1),
    ('Avatar', 12),
    ('Reel', 10),
    ('Podcast', 50),
    ('Game', 10),
    ('Slides', 15),
    ('Animated flow', 8),
    ('Interactive explainer', 10),
    ('Job aid', 20),
    ('Case exercise', 12),
    ('E-learning', 252)
  ) as t(type, m)
  where t.type = p_type;
$$;

create or replace function private.studio_min_items(p_studio text, p_format text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select s.m from (values
    ('avatar', 'Avatar', 6),
    ('reel', 'Reel', 3),
    ('podcast', 'Podcast', 3),
    ('game', 'Game', 3),
    ('slides', 'Slides', 3),
    ('motion', 'Animated flow', 3),
    ('explainer', 'Interactive explainer', 3),
    ('aid', 'Job aid', 4),
    ('flash', 'Flash cards', 4),
    ('flash', 'Practice exam', 4),
    ('case', 'Case exercise', 4),
    ('elearn', 'E-learning', 2)
  ) as s(studio, format, m)
  where s.studio = p_studio and s.format = p_format;
$$;

-- 3. Small readers that never raise on a value of the wrong type: the value as a list, its length (-1 when it is not a list) and a text within its cap.
create function private.course_list(v jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end;
$$;

create function private.course_len(v jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(v) = 'array' then jsonb_array_length(v) else -1 end;
$$;

create function private.course_text_ok(v jsonb, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(v) = 'string' and private.trimmed(v #>> '{}') <> '' and char_length(v #>> '{}') <= p_max, false);
$$;

-- 4. A block's own fields, by kind, with the caps of COURSE_CAPS (a sort or a branch has its group and good-choice rules apart, in course_block_problem).
create function private.course_shape_ok(b jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case b ->> 'block'
    when 'text' then jsonb_typeof(b -> 'h') = 'string' and char_length(b ->> 'h') <= 120 and private.course_text_ok(b -> 't', 4000)
    when 'callout' then private.course_text_ok(b -> 't', 600)
    when 'accordion' then private.course_len(b -> 'panels') between 2 and 8
      and not exists (select 1 from jsonb_array_elements(private.course_list(b -> 'panels')) p
                      where not (private.course_len(p) = 2 and private.course_text_ok(p -> 0, 120) and private.course_text_ok(p -> 1, 1200)))
    when 'check' then private.question_ok(b -> 'question') and jsonb_typeof(b -> 'fin') = 'boolean'
    when 'sort' then private.course_text_ok(b -> 'p', 400) and private.course_len(b -> 'bins') = 2
      and not exists (select 1 from jsonb_array_elements(private.course_list(b -> 'bins')) x where not private.course_text_ok(x, 40))
      and private.course_len(b -> 'cards') between 2 and 10
      and not exists (select 1 from jsonb_array_elements(private.course_list(b -> 'cards')) c where not (private.course_len(c) >= 1 and private.course_text_ok(c -> 0, 160)))
    when 'branch' then private.course_text_ok(b -> 'q', 400) and private.course_len(b -> 'choices') between 2 and 4
      and not exists (select 1 from jsonb_array_elements(private.course_list(b -> 'choices')) c
                      where not (private.course_len(c) = 3 and private.course_text_ok(c -> 0, 200) and private.course_text_ok(c -> 1, 400) and jsonb_typeof(c -> 2) = 'boolean'))
    when 'reflect' then private.course_text_ok(b -> 'p', 400)
    when 'exercise' then private.course_text_ok(b -> 'q', 400) and jsonb_typeof(b -> 'a') = 'number'
      and case when jsonb_typeof(b -> 'tol') = 'number' then (b ->> 'tol')::numeric >= 0 else false end
      and jsonb_typeof(b -> 'unit') = 'string' and char_length(b ->> 'unit') <= 12
  end, false);
$$;

-- Whether a block's lesson is a whole number that names one of p_lessons lessons (from 0).
create function private.course_lesson_ok(b jsonb, p_lessons integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(b -> 'lesson') is distinct from 'number' or (b ->> 'lesson') !~ '^[0-9]{1,3}$' then false
              else (b ->> 'lesson')::integer < p_lessons end;
$$;

-- 5. The first problem with a block, in words, or null: blockProblem in src/logic/courseContent.ts. The kinds, their names and their sentences are one table.
create function private.course_block_problem(b jsonb, p_lessons integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(b) is distinct from 'object' or k.kind is null then 'A block has a kind that is not known'
    when jsonb_typeof(b -> 'id') is distinct from 'string' or (b ->> 'id') !~ '^b[0-9a-z]{4,20}$' then 'A block has an id that is missing or not allowed'
    when not private.course_lesson_ok(b, p_lessons) then 'A block points to a lesson that does not exist'
    when not private.course_shape_ok(b) then 'Lesson ' || ((b ->> 'lesson')::integer + 1) || ' · ' || k.name || ': ' || k.rule
    when k.kind = 'sort' and exists (select 1 from jsonb_array_elements(b -> 'cards') c where not (private.course_len(c) = 2 and jsonb_typeof(c -> 1) = 'number' and (c ->> 1) in ('0', '1')))
      then 'Lesson ' || ((b ->> 'lesson')::integer + 1) || ' · ' || k.name || ': give every item a group'
    when k.kind = 'branch' and not exists (select 1 from jsonb_array_elements(b -> 'choices') c where c ->> 2 = 'true')
      then 'Lesson ' || ((b ->> 'lesson')::integer + 1) || ' · ' || k.name || ': mark at least one good choice'
  end
  from (select 1) o left join (values
    ('text', 'Text', 'keep the heading to 120 characters and write the text, up to 4000'),
    ('callout', 'Callout', 'write the callout, up to 600 characters'),
    ('accordion', 'Accordion', 'give 2 to 8 panels, each with a title and a text'),
    ('check', 'Knowledge check', 'give four options, the right answer and why'),
    ('sort', 'Sort into groups', 'give a prompt, two group names and 2 to 10 items'),
    ('branch', 'Branching scenario', 'give a question and 2 to 4 choices, each with its reply and whether it is good'),
    ('reflect', 'Reflection', 'write the prompt for the learner, up to 400 characters'),
    ('exercise', 'Calculation exercise', 'give a question, the right number, the tolerance (0 or more) and a unit of up to 12 characters')
  ) as k(kind, name, rule) on k.kind = b ->> 'block';
$$;

-- 6. A course's items: 2 to 12 lesson rows first, then blocks only, every block right, ids unique, at most 20 blocks a lesson, within the bytes and items caps.
create function private.course_ok(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with e as (select x.v, x.n from jsonb_array_elements(private.course_list(p_items)) with ordinality as x(v, n)),
  l as (select count(*)::integer as c from e where jsonb_typeof(v) = 'array')
  select coalesce(jsonb_typeof(p_items) = 'array'
    and private.course_len(p_items) <= private.item_max('E-learning')
    and octet_length(p_items::text) <= 250000
    and (select c from l) between 2 and 12
    and private.rows_ok(private.rows_of(p_items), 12, 3)
    and not exists (select 1 from e a where jsonb_typeof(a.v) = 'array' and exists (select 1 from e b where jsonb_typeof(b.v) <> 'array' and b.n < a.n))
    and not exists (select 1 from e where jsonb_typeof(v) <> 'array' and private.course_block_problem(v, (select c from l)) is not null)
    and (select count(distinct v ->> 'id') = count(*) from e where jsonb_typeof(v) <> 'array')
    and not exists (select 1 from e where jsonb_typeof(v) <> 'array' group by v ->> 'lesson' having count(*) > 20), false);
$$;

-- 7. What is wrong with a course's blocks and structure, in words and in the order of courseRowProblems in src/logic/courseContent.ts. Empty when the rows are right
-- (or wrong in a way no line explains: a lesson row's blank title or width, how many lessons there are).
create function private.course_row_problems(p_items jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  p text[] := '{}';
  v_items jsonb := private.course_list(p_items);
  v_lessons integer := (select count(*) from jsonb_array_elements(private.course_list(p_items)) e where jsonb_typeof(e) = 'array');
  v_msg text;
  v_k integer;
begin
  if v_lessons > 12 then
    p := array_append(p, 'Keep at most 12 lessons');
  end if;
  if exists (select 1 from jsonb_array_elements(v_items) with ordinality a(v, n) where jsonb_typeof(a.v) = 'array'
             and exists (select 1 from jsonb_array_elements(v_items) with ordinality b(v, n) where jsonb_typeof(b.v) <> 'array' and b.n < a.n)) then
    p := array_append(p, 'Put every lesson before the blocks');
  end if;
  for v_msg in select private.course_block_problem(x.e, v_lessons) from jsonb_array_elements(v_items) with ordinality x(e, n) where jsonb_typeof(x.e) <> 'array' order by x.n loop
    if v_msg is not null and not (v_msg = any(p)) then
      p := array_append(p, v_msg);
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(v_items) e where jsonb_typeof(e) <> 'array' and jsonb_typeof(e -> 'id') = 'string' and (e ->> 'id') ~ '^b[0-9a-z]{4,20}$'
             group by e ->> 'id' having count(*) > 1) then
    p := array_append(p, 'Two blocks have the same id');
  end if;
  for v_k in 0 .. v_lessons - 1 loop
    if (select count(*) from jsonb_array_elements(v_items) e where jsonb_typeof(e) <> 'array' and jsonb_typeof(e -> 'lesson') = 'number' and (e ->> 'lesson') = v_k::text) > 20 then
      p := array_append(p, 'Lesson ' || (v_k + 1) || ' has more than 20 blocks');
    end if;
  end loop;
  if octet_length(v_items::text) > 250000 then
    p := array_append(p, 'The course is too large: shorten some text');
  end if;
  return p;
end;
$$;

-- 8. How the course completes and how long it takes, from the creator's answers (courseRule, courseHours): All lessons viewed when unanswered, half an hour.
create function private.course_rule(p_shape jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_shape ->> 'How is completion decided?' when 'Final check of 80 % or more' then 'score' when 'Both' then 'both' else 'seen' end;
$$;

create function private.course_hours(p_shape jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_shape ->> 'Length?' when '15 min' then 0.25 when '30 min' then 0.5 when '60 min' then 1 else 0.5 end;
$$;

-- 9. A block as learners get it: its known fields, trimmed, without `lesson` (publicBlock). Only called for a block course_ok accepted.
create function private.course_block_public(b jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case b ->> 'block'
    when 'text' then jsonb_build_object('block', 'text', 'id', b -> 'id', 'h', private.trimmed(b ->> 'h'), 't', private.trimmed(b ->> 't'))
    when 'callout' then jsonb_build_object('block', 'callout', 'id', b -> 'id', 't', private.trimmed(b ->> 't'))
    when 'accordion' then jsonb_build_object('block', 'accordion', 'id', b -> 'id', 'panels',
      (select jsonb_agg(jsonb_build_array(private.trimmed(p ->> 0), private.trimmed(p ->> 1)) order by x.n) from jsonb_array_elements(b -> 'panels') with ordinality x(p, n)))
    when 'check' then jsonb_build_object('block', 'check', 'id', b -> 'id', 'fin', b -> 'fin', 'question', jsonb_build_object(
      't', private.trimmed(b #>> '{question,t}'), 'q', private.trimmed(b #>> '{question,q}'), 'a', b #> '{question,a}', 'why', private.trimmed(b #>> '{question,why}'),
      'o', (select jsonb_agg(private.trimmed(o #>> '{}') order by x.n) from jsonb_array_elements(b #> '{question,o}') with ordinality x(o, n))))
    when 'sort' then jsonb_build_object('block', 'sort', 'id', b -> 'id', 'p', private.trimmed(b ->> 'p'),
      'bins', jsonb_build_array(private.trimmed(b #>> '{bins,0}'), private.trimmed(b #>> '{bins,1}')),
      'cards', (select jsonb_agg(jsonb_build_array(private.trimmed(c ->> 0), c -> 1) order by x.n) from jsonb_array_elements(b -> 'cards') with ordinality x(c, n)))
    when 'branch' then jsonb_build_object('block', 'branch', 'id', b -> 'id', 'q', private.trimmed(b ->> 'q'), 'choices',
      (select jsonb_agg(jsonb_build_array(private.trimmed(c ->> 0), private.trimmed(c ->> 1), c -> 2) order by x.n) from jsonb_array_elements(b -> 'choices') with ordinality x(c, n)))
    when 'reflect' then jsonb_build_object('block', 'reflect', 'id', b -> 'id', 'p', private.trimmed(b ->> 'p'))
    when 'exercise' then jsonb_build_object('block', 'exercise', 'id', b -> 'id', 'q', private.trimmed(b ->> 'q'), 'a', b -> 'a', 'tol', b -> 'tol', 'unit', private.trimmed(b ->> 'unit'))
  end;
$$;

-- The course: each lesson's title and its blocks in order, and the completion rule (courseContent). Summaries are not published.
create function private.course_content(p_items jsonb, p_shape jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', 'course', 'rule', private.course_rule(p_shape), 'lessons', coalesce((
    select jsonb_agg(jsonb_build_object('title', private.trimmed(l.e ->> 1), 'blocks', coalesce((
      select jsonb_agg(private.course_block_public(b.e) order by b.n) from jsonb_array_elements(private.course_list(p_items)) with ordinality b(e, n)
      where jsonb_typeof(b.e) = 'object' and (b.e ->> 'lesson') = (l.n - 1)::text), '[]'::jsonb)) order by l.n)
    from jsonb_array_elements(private.rows_of(p_items)) with ordinality l(e, n)), '[]'::jsonb));
$$;

-- 10. items_ok, contribution_content and contribution_problems, as before (20261118190000), each with one E-learning branch.
create or replace function private.items_ok(p_type text, p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_items is null or jsonb_typeof(p_items) <> 'array' then false
    when p_type = 'Flash cards' then private.rows_ok(p_items, private.item_max(p_type), 2)
    when p_type = 'Practice exam' then jsonb_array_length(p_items) between 1 and private.item_max(p_type) and not exists (select 1 from jsonb_array_elements(p_items) e where not private.question_ok(e))
    when p_type = 'Presentation' then jsonb_array_length(p_items) = 1 and private.horizon_ok(p_items -> 0)
    when p_type = 'Slides' then private.slides_ok(p_items)
    when p_type = 'Podcast' then private.podcast_ok(p_items)
    when p_type = 'Game' then private.game_ok(p_items)
    when p_type = 'Reel' then private.reel_ok(p_items)
    when p_type = 'Avatar' then private.avatar_ok(p_items)
    when p_type = 'E-learning' then private.course_ok(p_items)
    when p_type = 'Interactive explainer' then private.explainer_ok(p_items)
    when p_type = 'Animated flow' then private.motion_ok(p_items)
    when p_type in ('Job aid', 'Case exercise') then private.rows_ok(p_items, private.item_max(p_type), 3)
      and (p_type <> 'Case exercise' or (
        not exists (select 1 from jsonb_array_elements(p_items) e where (e ->> 0) not in ('Brief', 'Deliverable', 'Criterion'))
        and (select count(distinct e ->> 0) from jsonb_array_elements(p_items) e) = 3))
    else false
  end;
$$;

create or replace function private.contribution_content(p_type text, p_items jsonb, p_shape jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case p_type
    when 'Flash cards' then private.flash_content(p_items)
    when 'Practice exam' then private.exam_content(p_items)
    when 'Presentation' then private.horizon_content(p_items)
    when 'Job aid' then private.aid_content(p_items)
    when 'Case exercise' then private.case_content(p_items, p_shape)
    when 'Interactive explainer' then private.explainer_content(p_items, p_shape)
    when 'Animated flow' then private.motion_content(p_items)
    when 'Slides' then private.slides_content(p_items, p_shape)
    when 'Podcast' then private.podcast_content(p_items)
    when 'Game' then private.game_content(p_items, p_shape)
    when 'Reel' then private.reel_content(p_items, p_shape)
    when 'Avatar' then private.avatar_content(p_items, p_shape)
    when 'E-learning' then private.course_content(p_items, p_shape)
  end;
$$;

create or replace function private.contribution_problems(c public.contributions)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  p text[] := '{}';
  v_min integer := private.studio_min_items(c.studio, c.type);
  v_term text;
  v_check boolean;
  v_speakers text[];
  v_game jsonb;
  v_review public.game_reviews;
  v_row jsonb;
  v_role text;
  v_knows text;
  v_video jsonb;
  v_voiced boolean;
  v_secs numeric;
  v_scene integer;
  v_paths text[];
  v_n integer;
  v_title text;
  v_finals integer;
begin
  if char_length(btrim(c.title)) not between 1 and 60 then
    p := array_append(p, 'The title needs 1 to 60 characters');
  end if;
  if btrim(c.takeaway) = '' then
    p := array_append(p, 'Write the one takeaway first');
  end if;
  if c.studio is not null and v_min is null then
    p := array_append(p, format('This studio does not make %s', c.type));
  elsif private.carries_items(c.type, c.studio) and not private.items_ok(c.type, c.items) then
    -- an avatar's rows say what is wrong with them (the character, the learning points, the quiz), a course's its blocks, then its lesson count; anything else they get wrong is the generic line
    if c.type = 'Avatar' and cardinality(private.avatar_row_problems(c.items)) > 0 then
      p := p || private.avatar_row_problems(c.items);
    elsif c.type = 'E-learning' and cardinality(private.course_row_problems(c.items)) > 0 then
      p := p || private.course_row_problems(c.items);
    elsif c.type = 'E-learning' and (select count(*) from jsonb_array_elements(private.course_list(c.items)) e where jsonb_typeof(e) = 'array') < 2 then
      p := array_append(p, 'Add at least 2 lessons');
    else
      p := array_append(p, case c.type when 'Flash cards' then 'Add the cards first: generate them with AI or import a CSV'
        when 'Practice exam' then 'Add the questions first: generate them with AI or import a CSV'
        when 'Presentation' then 'Add the .horizon file first'
        when 'Animated flow' then 'Add the stages, build the animation and write its text alternative first'
        when 'Slides' then 'Add the slides first: each needs a title, bullets and a talk-over'
        when 'Podcast' then 'Add the script first: a chapter, then a line for each speaker'
        when 'Reel' then 'Check the reel''s rows first: a Hook, scenes, a Close and a check with 2 to 4 options, the right one first' else 'Add the items first' end);
    end if;
  elsif c.studio is not null and (select count(*) from jsonb_array_elements(c.items) e where c.type not in ('Interactive explainer', 'Animated flow', 'Slides', 'Podcast', 'Game', 'Reel') or jsonb_typeof(e) = 'array') < v_min then
    p := array_append(p, format('Add at least %s items', v_min));
  end if;
  if c.type = 'Presentation' and private.items_ok(c.type, c.items) then
    if private.media_files_missing(c.author_id, c.id, array[c.items -> 0 ->> 'path']) then
      p := array_append(p, 'The .horizon file is not there · add it again');
    end if;
  end if;
  if c.type = 'Slides' and c.studio is not null and private.items_ok(c.type, c.items) then
    if coalesce(c.shape ->> 'Who presents?', '') = 'AI voice' and not private.slides_voiced(c.items, c.shape) then
      p := array_append(p, 'Voice every slide in Produce, or choose Captions only in Shape it');
    end if;
    if private.slides_seconds(c.items, c.shape) > 900 then
      p := array_append(p, 'The talk runs longer than 15 minutes: shorten the talk-over or cut slides');
    end if;
    -- every voice-over file the slides use must be in the contribution's own folder and in Storage
    if private.slides_voiced(c.items, c.shape) and private.media_files_missing(c.author_id, c.id,
        array(select private.slide_clip(c.items, n) ->> 'path' from generate_series(0, jsonb_array_length(private.rows_of(c.items)) - 1) n)) then
      p := array_append(p, 'A voice-over file is not there · voice the slides again');
    end if;
  end if;
  if c.type = 'Podcast' and c.studio is not null and private.items_ok(c.type, c.items) then
    v_speakers := case coalesce(c.shape ->> 'Format?', 'Interview with an expert') when 'Two AI hosts' then array['Host', 'Co-host'] when 'Solo talk' then array['Host'] else array['Host', 'Guest'] end;
    if exists (select 1 from jsonb_array_elements(private.podcast_turns(c.items)) t where (t ->> 'speaker') <> all (v_speakers)) then
      p := array_append(p, 'A line has a speaker this format does not have: ' || array_to_string(v_speakers, ' and ') || ' only');
    end if;
    if not private.podcast_voiced(c.items) then
      p := array_append(p, 'Voice every line in Produce: an episode is always told by the AI voice, with a different voice for each speaker');
    end if;
    if private.podcast_seconds(c.items) > 1800 then
      p := array_append(p, 'The episode runs longer than 30 minutes: shorten the script');
    end if;
    -- every voice-over file the episode uses must be in the contribution's own folder and in Storage
    if private.podcast_voiced(c.items) and private.media_files_missing(c.author_id, c.id,
        array(select private.turn_clip(c.items, n) ->> 'path' from generate_series(0, jsonb_array_length(private.podcast_turns(c.items)) - 1) n)) then
      p := array_append(p, 'A voice-over file is not there · voice the episode again');
    end if;
  end if;
  if c.type = 'Game' and c.studio is not null and private.items_ok(c.type, c.items) then
    v_role := private.game_role(c.shape);
    v_row := private.game_role_row(c.items);
    v_game := (select e from jsonb_array_elements(c.items) e where jsonb_typeof(e) = 'object');
    if v_role <> 'No AI role' and v_row is null then
      p := array_append(p, 'Add the AI role: who it plays and what it knows');
    elsif v_role = 'No AI role' and v_row is not null then
      p := array_append(p, 'Remove the AI role row, or choose a role in Shape it');
    end if;
    if v_game is null then
      p := array_append(p, 'Build the game in Produce first');
    else
      p := p || private.game_scan(v_game -> 'files');
      select * into v_review from public.game_reviews where contribution_id = c.id;
      if not found then
        p := array_append(p, 'The house-rules check has not passed');
      elsif v_review.review_hash is distinct from private.game_review_hash(c.title, c.items, c.shape, c.takeaway) then
        p := array_append(p, 'Run the house-rules check again');
      elsif not v_review.passed then
        p := array_append(p, 'The house-rules check has not passed' || coalesce(': ' || nullif(v_review.reasons[1], ''), ''));
      end if;
      if v_game -> 'for' ->> 'role' <> v_role then
        p := array_append(p, 'You changed the AI role after the build · build the game again');
      end if;
      -- what the AI role knows (its text 2, 12 characters or more) must not be in the game's own code: learners read the code
      v_knows := private.trimmed(coalesce(v_row ->> 2, ''));
      if private.text_echoes(v_knows, v_game -> 'files' ->> 'index.html', true) or private.text_echoes(v_knows, v_game -> 'files' ->> 'game.js', true) then
        p := array_append(p, 'The game''s code repeats what the AI role hides');
      end if;
      -- nor may the texts learners read: the concept, win, rounds and who the AI plays (everything but the role's own text 2)
      if exists (select 1 from jsonb_array_elements(private.rows_of(c.items)) r
          where private.text_echoes(v_knows, r ->> 1, true) or (r ->> 0 <> 'AI role' and private.text_echoes(v_knows, r ->> 2, true))) then
        p := array_append(p, 'The game''s text repeats what the AI role hides');
      end if;
    end if;
  end if;
  if c.type = 'Reel' and c.studio is not null and private.items_ok(c.type, c.items) then
    v_voiced := private.reel_voiced(c.items, c.shape);
    v_secs := private.reel_seconds(c.items, c.shape);
    v_video := (select e from jsonb_array_elements(c.items) e where jsonb_typeof(e) = 'object' and e ->> 'kind' = 'video');
    v_paths := array(select private.reel_clip(c.items, n) ->> 'path' from generate_series(0, jsonb_array_length(private.reel_scenes(c.items)) - 1) n);
    if private.reel_check(c.items) is null then
      p := array_append(p, 'Add the check question: one question, the right answer first');
    end if;
    if private.reel_wants_voice(c.shape) and not v_voiced then
      p := array_append(p, 'Voice every scene in Produce, or choose Text and music only in Shape it');
    elsif v_voiced then
      select n + 1 into v_scene from generate_series(0, jsonb_array_length(private.reel_scenes(c.items)) - 1) n where not (private.reel_clip(c.items, n) ? 'words') order by n limit 1;
      if v_scene is not null then
        p := array_append(p, format('Voice scene %s again · its word timing is missing', v_scene));
      end if;
    end if;
    if v_secs > 90 and not (private.reel_wants_voice(c.shape) and not v_voiced) then
      p := array_append(p, format('The reel runs %s s · at most 90 s', ceil(v_secs)));
    end if;
    if v_video is null then
      p := array_append(p, 'Make the final cut in Produce');
    else
      -- the cut is made from these rows and these clips (rows and clips are compared as the browser stored them)
      if v_video -> 'made' -> 'rows' is distinct from private.rows_of(c.items)
         or (v_voiced and v_video -> 'made' -> 'clips' is distinct from to_jsonb(v_paths))
         or (not private.reel_wants_voice(c.shape) and v_video -> 'made' -> 'clips' <> '[]'::jsonb)
         or (c.shape ->> 'Who presents?' = 'Stock presenter and AI voice') is distinct from (v_video -> 'made' ->> 'look' is not null) then
        p := array_append(p, 'You changed the reel after the final cut · make the final cut again');
      end if;
      if (v_voiced or not private.reel_wants_voice(c.shape)) and abs((v_video ->> 'seconds')::numeric - v_secs) > 1.5 then
        p := array_append(p, 'The video''s length does not match the voice-over · make the final cut again');
      end if;
      -- a stock presenter needs an active stock look (one can be switched off after it was picked)
      if c.shape ->> 'Who presents?' = 'Stock presenter and AI voice' and v_video -> 'made' ->> 'look' is not null
         and not exists (select 1 from public.stock_looks l where l.active and l.id::text = v_video -> 'made' ->> 'look') then
        p := array_append(p, 'That look is not on the stock list');
      end if;
      -- every file must be in the contribution's own folder and in Storage; the video must be the type and size it claims
      if v_voiced and private.media_files_missing(c.author_id, c.id, v_paths) then
        p := array_append(p, 'A voice-over file is not there · voice the reel again');
      end if;
      if private.media_files_missing(c.author_id, c.id, array[v_video ->> 'path']) then
        p := array_append(p, 'The video file is not there · make the final cut again');
      elsif exists (select 1 from storage.objects o where o.bucket_id = 'media' and o.name = v_video ->> 'path'
                    and (coalesce(o.metadata ->> 'mimetype', '') <> v_video ->> 'mime' or coalesce((o.metadata ->> 'size')::numeric, 52428801) > 52428800)) then
        p := array_append(p, 'The video file is not the type or size it claims');
      end if;
    end if;
  end if;
  if c.type = 'Avatar' and c.studio is not null and private.items_ok(c.type, c.items) then
    if coalesce(c.shape ->> 'How long is a run?', '') not in ('5 minutes', '10 minutes', '15 minutes') then
      p := array_append(p, 'Choose how long a run is');
    end if;
    if coalesce(c.shape ->> 'Language', '') not in ('English', 'Dutch', 'French') then
      p := array_append(p, 'Choose the language');
    end if;
    if coalesce(c.shape ->> 'Difficulty', '') not in ('Gentle', 'Realistic', 'Tough') then
      p := array_append(p, 'Choose the difficulty');
    end if;
    if coalesce(c.shape ->> 'How is it scored?', '') not in ('AI scores, counsellor confirms', 'Practice only') then
      p := array_append(p, 'Choose how it is scored');
    end if;
    -- the look is chosen in Produce and is an active stock look; the voice is optional, and an active stock voice when it is set
    if coalesce(c.shape ->> 'Look', '') = '' then
      p := array_append(p, 'Choose a look in Produce');
    elsif not exists (select 1 from public.stock_looks l where l.active and l.id::text = c.shape ->> 'Look') then
      p := array_append(p, 'That look is not on the stock list');
    end if;
    if coalesce(c.shape ->> 'Voice', '') <> '' and not exists (select 1 from public.stock_voices v where v.active and v.id::text = c.shape ->> 'Voice') then
      p := array_append(p, 'That voice is not on the stock list');
    end if;
    -- what the character reveals or hides must not be in the texts learners read
    if private.avatar_echo(c.items, c.shape) then
      p := array_append(p, 'The scenario''s public text repeats what the character keeps back');
    end if;
  end if;
  if c.type = 'E-learning' and c.studio is not null and private.items_ok(c.type, c.items) then
    -- every lesson has a block; a completion rule that scores needs one final check, and a course never has two
    for v_n, v_title in select l.n, private.trimmed(l.e ->> 1) from jsonb_array_elements(private.rows_of(c.items)) with ordinality l(e, n)
                        where not exists (select 1 from jsonb_array_elements(c.items) b where jsonb_typeof(b) = 'object' and b ->> 'lesson' = (l.n - 1)::text) order by l.n loop
      p := array_append(p, format('Lesson %s “%s” has no blocks yet', v_n, v_title));
    end loop;
    v_finals := (select count(*) from jsonb_array_elements(c.items) e where jsonb_typeof(e) = 'object' and e ->> 'block' = 'check' and e -> 'fin' = 'true'::jsonb);
    if v_finals = 0 and private.course_rule(c.shape) <> 'seen' then
      p := array_append(p, 'Add a final check (a knowledge check marked “Final check”), or choose “All lessons viewed” in Shape it');
    end if;
    if v_finals > 1 then
      p := array_append(p, 'Keep one final check');
    end if;
  end if;
  if c.type = 'Interactive explainer' and c.studio is not null and jsonb_typeof(c.items) = 'array' then
    v_check := exists (select 1 from jsonb_array_elements(c.items) e where jsonb_typeof(e) = 'object');
    if coalesce(c.shape ->> 'End with?', '') = 'A three-question check' and not v_check then
      p := array_append(p, 'Ending with a three-question check needs its three questions');
    elsif coalesce(c.shape ->> 'End with?', '') <> 'A three-question check' and v_check then
      p := array_append(p, 'The check is only shown when the explainer ends with it: remove it, or choose “A three-question check” in Shape it');
    end if;
  end if;
  v_term := private.blocked_term(c.title || ' ' || c.takeaway || ' ' || c.outline || ' ' || array_to_string(c.sources, ' ') || ' ' || coalesce(c.items::text, '')
    || ' ' || coalesce((select string_agg(a.key || ' ' || a.value, ' ') from jsonb_each_text(c.shape) a), ''));
  if v_term is not null then
    p := array_append(p, format('“%s” looks like a client name · anonymise it', initcap(v_term)));
  end if;
  return p;
end;
$$;

-- 11. Publishing: as before (20261118250000), with the course's hours: the creator's "Length?".
create or replace function private.publish_contribution(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contributions%rowtype;
  v_id text;
  v_content jsonb;
begin
  select * into c from public.contributions where id = p_id;
  if not (private.rules_allow(c.author_id, c.business_line, c.type, c.domain, c.audience) or (private.plan_draft_matches(c.for_trajectory, c.for_step, c.business_line, c.type, c.domain, c.audience, c.id) and public.plan_trajectory_allowed(c.author_id, c.for_trajectory))) then
    raise exception 'The author''s creation rules no longer allow this contribution, and it is not the material of a placeholder its author can still plan, so it cannot be published' using errcode = '42501';
  end if;
  if private.carries_items(c.type, c.studio) then
    if not private.items_ok(c.type, c.items) then
      raise exception 'This contribution has no usable items, so it cannot be published' using errcode = 'P0001';
    end if;
    v_content := private.contribution_content(c.type, c.items, c.shape);
  end if;
  insert into public.learnings (title, domain, level, format, source, hours, cpd, due, why, business_line, status, created_by, content, ai_made)
  values (btrim(c.title), c.domain, c.level, c.type, 'Peer contribution',
          case c.type when 'Reel' then 0.025
                      when 'Podcast' then case when c.studio is not null then private.media_hours((v_content ->> 'seconds')::numeric) else 0.5 end
                      when 'Micro-guide' then 0.1 when 'Practice exam' then 0.5
                      when 'Case exercise' then private.case_hours(c.shape) when 'Animated flow' then 0.025
                      when 'Presentation' then private.media_hours((v_content ->> 'seconds')::numeric)
                      when 'Slides' then private.media_hours((v_content ->> 'seconds')::numeric)
                      when 'E-learning' then private.course_hours(c.shape) else 0.25 end,
          0, '', btrim(c.takeaway), c.business_line, 'published', c.author_id, v_content,
          c.ai_assisted or coalesce(v_content ->> 'made', '') = 'ai')
  returning id into v_id;
  update public.contributions set status = 'published', step = 4, learning_id = v_id, published_at = now() where id = p_id;
  return v_id;
end;
$$;

revoke execute on function private.course_list(jsonb), private.course_len(jsonb), private.course_text_ok(jsonb, integer), private.course_shape_ok(jsonb), private.course_lesson_ok(jsonb, integer),
  private.course_block_problem(jsonb, integer), private.course_ok(jsonb), private.course_row_problems(jsonb), private.course_rule(jsonb), private.course_hours(jsonb),
  private.course_block_public(jsonb), private.course_content(jsonb, jsonb) from public, anon, authenticated;
