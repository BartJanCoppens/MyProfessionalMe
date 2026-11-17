-- Explainer Studio (studios plan, Task 2.2): the 'Interactive explainer' format through the shared studio path of
-- 20261117230000 (items_ok, contribution_content, the check gate), and its completion.
--
-- items     An explainer's steps are [label, text] rows (rows_ok, as every studio). After them may come its check: exactly
--           three exam questions, each checked like a Practice exam question (private.question_ok, the one question
--           rule, now used by both). The check's questions do not count toward the studio's minimum of steps.
--           Mirrored by itemsValid and CHECK_SIZE in src/logic/studios.ts.
-- content   private.explainer_content: kind 'explainer', the steps, the "Depth?" answer, the "End with?" answer, and the
--           check only when that answer is the check (studioContent in src/logic/studioContent.ts builds the same).
--           Unanswered or unknown answers read as an overview with a summary card. No step drawing (svg) is made here.
-- problems  The ending and the check agree: ending with the check needs its questions, and a check needs that ending
--           (explainerProblems). The client-name scan reads the "Shape it" questions as well as the answers.
-- completion An interactive explainer completes itself ('mark' in COMPLETION, src/logic/record.ts): its panel does it when
--           the learner has seen the last step and finished the check, if there is one.

-- One exam question: topic, question and explanation as text, four options, the right one by index (0 to 3); the caps
-- of SHORT_MAX and LONG_MAX (isQuestion in src/logic/items.ts).
create function private.question_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(e) is distinct from 'object' then false
    else jsonb_typeof(e -> 't') is not distinct from 'string' and jsonb_typeof(e -> 'q') is not distinct from 'string' and jsonb_typeof(e -> 'why') is not distinct from 'string'
      and btrim(e ->> 't') <> '' and btrim(e ->> 'q') <> '' and btrim(e ->> 'why') <> ''
      and char_length(e ->> 't') <= 300 and char_length(e ->> 'q') <= 300 and char_length(e ->> 'why') <= 600
      and jsonb_typeof(e -> 'o') is not distinct from 'array' and jsonb_array_length(e -> 'o') = 4
      and not exists (select 1 from jsonb_array_elements(e -> 'o') o where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '' or char_length(o #>> '{}') > 300)
      and jsonb_typeof(e -> 'a') is not distinct from 'number' and (e ->> 'a') in ('0', '1', '2', '3')
  end;
$$;

-- An explainer's items: its steps (the array items) as studio rows, and no other items or exactly three questions.
create function private.explainer_ok(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.rows_ok(coalesce((select jsonb_agg(x.e order by x.n) from jsonb_array_elements(p_items) with ordinality as x(e, n) where jsonb_typeof(x.e) = 'array'), '[]'::jsonb),
      private.item_max('Interactive explainer'), 3)
    and (select count(*) from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array') in (0, 3)
    and not exists (select 1 from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'array' and not private.question_ok(e));
$$;

-- As before (20261117230000), with the one question rule for exam questions and the explainer's own branch.
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
    when p_type = 'Interactive explainer' then private.explainer_ok(p_items)
    when p_type in ('Job aid', 'Case exercise') then private.rows_ok(p_items, private.item_max(p_type), 3)
      and (p_type <> 'Case exercise' or (
        not exists (select 1 from jsonb_array_elements(p_items) e where (e ->> 0) not in ('Brief', 'Deliverable', 'Criterion'))
        and (select count(distinct e ->> 0) from jsonb_array_elements(p_items) e) = 3))
    else false
  end;
$$;

-- An explainer: its steps in order, as a step-through, at the chosen depth, with the chosen ending; the check's questions
-- only when it ends with the check.
create function private.explainer_content(p_items jsonb, p_shape jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', 'explainer', 'style', 'Step-through',
      'depth', case p_shape ->> 'Depth?' when 'With technical detail' then 'With technical detail' else 'Overview' end,
      'steps', (select jsonb_agg(jsonb_build_object('label', btrim(x.e ->> 0), 'text', btrim(x.e ->> 1)) order by x.n)
                from jsonb_array_elements(p_items) with ordinality as x(e, n) where jsonb_typeof(x.e) = 'array'),
      'end', v.ending)
    || case when v.ending = 'A three-question check' and v.questions is not null then jsonb_build_object('check', v.questions) else '{}'::jsonb end
  from (select case p_shape ->> 'End with?' when 'A three-question check' then 'A three-question check' when 'Nothing' then 'Nothing' else 'A summary card' end as ending,
               (select jsonb_agg(x.e order by x.n) from jsonb_array_elements(p_items) with ordinality as x(e, n) where jsonb_typeof(x.e) = 'object') as questions) v;
$$;

-- As before (20261117230000), with the explainer.
create or replace function private.contribution_content(p_type text, p_items jsonb, p_shape jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'Flash cards' then private.flash_content(p_items)
    when 'Practice exam' then private.exam_content(p_items)
    when 'Job aid' then private.aid_content(p_items)
    when 'Case exercise' then private.case_content(p_items, p_shape)
    when 'Interactive explainer' then private.explainer_content(p_items, p_shape)
  end;
$$;

-- As before (20261117230000); an explainer's check questions do not count toward its minimum, its ending and check
-- agree, and the client-name scan reads every "Shape it" question with its answer.
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
    p := array_append(p, case c.type when 'Flash cards' then 'Add the cards first: generate them with AI or import a CSV'
      when 'Practice exam' then 'Add the questions first: generate them with AI or import a CSV' else 'Add the items first' end);
  elsif c.studio is not null and (select count(*) from jsonb_array_elements(c.items) e where c.type <> 'Interactive explainer' or jsonb_typeof(e) = 'array') < v_min then
    p := array_append(p, format('Add at least %s items', v_min));
  end if;
  if c.type = 'Interactive explainer' and c.studio is not null and jsonb_typeof(c.items) = 'array' then
    v_check := exists (select 1 from jsonb_array_elements(c.items) e where jsonb_typeof(e) = 'object');
    if coalesce(c.shape ->> 'End with?', '') = 'A three-question check' and not v_check then
      p := array_append(p, 'Ending with a three-question check needs its questions: draft them with AI, or choose another ending in Shape it');
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

-- As before (20261117150000), with the interactive explainer.
create or replace function private.is_self_complete(p_learning_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.learnings where id = p_learning_id and status = 'published'
                 and format in ('Podcast', 'Reel', 'E-learning', 'Avatar', 'Classroom', 'Flash cards', 'Job aid', 'Practice exam', 'Teach-back', 'Webinar', 'Interactive explainer'));
$$;

revoke execute on function private.question_ok(jsonb), private.explainer_ok(jsonb), private.explainer_content(jsonb, jsonb) from public, anon, authenticated;
