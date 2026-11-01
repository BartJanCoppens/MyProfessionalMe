-- Content in the database: the learning catalogue, curriculum mappings and knowledge bundles, edited by
-- System Admins and General Admins everywhere and by Domain Admins for their own business line.

-- ---------- roles ----------

alter table public.user_roles drop constraint user_roles_scope;
alter table public.user_roles add constraint user_roles_scope check (
  (role in ('system_admin', 'general_admin') and business_line is null)
  or (role = 'domain_admin' and business_line is not null)
);

create function private.is_general_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'general_admin');
$$;

-- Content of a business line: its Domain Admins, General and System Admins. A null line (firm-wide) is General or System only.
create function private.can_edit_content(line public.business_line)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_system_admin() or private.is_general_admin() or (line is not null and exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'domain_admin' and business_line = line
  ));
$$;

-- Any admin: sees drafts and every knowledge bundle.
create function private.is_content_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()));
$$;

-- A curriculum audience is a business line (its admins) or a lens audience such as ind:energy (General and System Admins).
create function private.can_edit_audience(audience text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when audience in ('Consulting', 'Audit', 'Tax & Legal') then private.can_edit_content(audience::public.business_line)
              else private.is_system_admin() or private.is_general_admin() end;
$$;

revoke execute on function private.is_general_admin(), private.can_edit_content(public.business_line), private.is_content_admin(), private.can_edit_audience(text) from public, anon;
grant execute on function private.is_general_admin(), private.can_edit_content(public.business_line), private.is_content_admin(), private.can_edit_audience(text) to authenticated;

-- Domain Admins never manage a General Admin, just as they never manage a System Admin.
create or replace function private.can_manage_user(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_system_admin() or (
    exists (
      select 1
      from public.profiles p
      join public.user_roles r on r.business_line = p.business_line
      where p.id = target and r.user_id = (select auth.uid()) and r.role = 'domain_admin'
    )
    and not exists (
      select 1 from public.user_roles where user_id = target and role in ('system_admin', 'general_admin')
    )
    and not exists (
      select 1 from public.user_roles t
      where t.user_id = target and t.role = 'domain_admin'
        and not exists (
          select 1 from public.user_roles c
          where c.user_id = (select auth.uid()) and c.role = 'domain_admin' and c.business_line = t.business_line
        )
    )
  );
$$;

-- ---------- learning catalogue ----------

create sequence public.learnings_seq start 100;
create table public.learnings (
  id text primary key default ('L' || nextval('public.learnings_seq')),
  title text not null check (char_length(title) between 1 and 160),
  domain text not null check (domain in ('tech', 'acad', 'pers', 'prof', 'ind', 'reg', 'corp', 'tec', 'lead')),
  level smallint not null check (level between 1 and 5),
  format text not null,
  source text not null default '',
  hours numeric(6, 2) not null check (hours > 0),
  cpd numeric(6, 2) not null default 0 check (cpd >= 0),
  due text not null default '',
  why text not null default '',
  business_line public.business_line, -- null: firm-wide
  status text not null default 'published' check (status in ('published', 'review', 'draft')),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
create index learnings_business_line_idx on public.learnings (business_line);
create index learnings_created_by_idx on public.learnings (created_by);

-- ---------- curriculum mappings ----------

create table public.curriculum_mappings (
  audience text not null check (audience in ('Consulting', 'Audit', 'Tax & Legal') or audience ~ '^(ind|tec|amb|pro):[a-z]+$'),
  learning_id text not null references public.learnings (id) on delete cascade,
  stage public.career_stage not null,
  obligation text not null check (obligation in ('mandatory', 'advised')),
  updated_at timestamptz not null default now(),
  primary key (audience, learning_id),
  -- ambitions and personality profiles only ever suggest
  constraint curriculum_mappings_advised_lenses check (obligation = 'advised' or audience !~ '^(amb|pro):')
);
create index curriculum_mappings_learning_id_idx on public.curriculum_mappings (learning_id);

-- ---------- knowledge bundles ----------

create sequence public.knowledge_bundles_seq start 100;
create table public.knowledge_bundles (
  id text primary key default ('B' || nextval('public.knowledge_bundles_seq')),
  business_line public.business_line, -- null: firm-wide
  access text not null default 'admins' check (access in ('all', 'tl', 'admins')),
  data jsonb not null, -- the bundle as the app uses it (name, topics, tags, sources, models, chunks, concepts)
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
create index knowledge_bundles_business_line_idx on public.knowledge_bundles (business_line);
create index knowledge_bundles_created_by_idx on public.knowledge_bundles (created_by);

-- ---------- grants and policies ----------

alter table public.learnings enable row level security;
alter table public.curriculum_mappings enable row level security;
alter table public.knowledge_bundles enable row level security;
revoke all on public.learnings, public.curriculum_mappings, public.knowledge_bundles from anon, authenticated;
grant select, insert, update, delete on public.learnings, public.curriculum_mappings, public.knowledge_bundles to authenticated;
revoke all on sequence public.learnings_seq, public.knowledge_bundles_seq from anon, authenticated;
grant usage on sequence public.learnings_seq, public.knowledge_bundles_seq to authenticated;

create policy "learnings: read" on public.learnings for select to authenticated
  using (status <> 'draft' or (select private.can_edit_content(business_line)));
create policy "learnings: admins add" on public.learnings for insert to authenticated
  with check ((select private.can_edit_content(business_line)));
create policy "learnings: admins edit" on public.learnings for update to authenticated
  using ((select private.can_edit_content(business_line))) with check ((select private.can_edit_content(business_line)));
create policy "learnings: admins remove" on public.learnings for delete to authenticated
  using ((select private.can_edit_content(business_line)));

create policy "curriculum_mappings: read" on public.curriculum_mappings for select to authenticated using (true);
create policy "curriculum_mappings: admins add" on public.curriculum_mappings for insert to authenticated
  with check ((select private.can_edit_audience(audience)));
create policy "curriculum_mappings: admins edit" on public.curriculum_mappings for update to authenticated
  using ((select private.can_edit_audience(audience))) with check ((select private.can_edit_audience(audience)));
create policy "curriculum_mappings: admins remove" on public.curriculum_mappings for delete to authenticated
  using ((select private.can_edit_audience(audience)));

-- Creators read bundles open to them; every admin reads all of them; editing follows the bundle's business line.
create policy "knowledge_bundles: read" on public.knowledge_bundles for select to authenticated
  using (
    access = 'all'
    or (access = 'tl' and exists (select 1 from public.profiles where id = (select auth.uid()) and business_line = 'Tax & Legal'))
    or (select private.is_content_admin())
  );
create policy "knowledge_bundles: admins add" on public.knowledge_bundles for insert to authenticated
  with check ((select private.can_edit_content(business_line)));
create policy "knowledge_bundles: admins edit" on public.knowledge_bundles for update to authenticated
  using ((select private.can_edit_content(business_line))) with check ((select private.can_edit_content(business_line)));
create policy "knowledge_bundles: admins remove" on public.knowledge_bundles for delete to authenticated
  using ((select private.can_edit_content(business_line)));

-- Seed content from src/data.ts (generated by scripts/seed-content.ts).

insert into public.learnings (id, title, domain, level, format, source, hours, cpd, due, why, business_line, status) values
  ('L1', 'Operating model design', 'tech', 3, 'E-learning', 'Internal academy', 6, 0, '', 'Every senior in Consulting designs at least one operating model a year. This is the firm method, with the templates we use in proposals.', null, 'published'),
  ('L2', 'Value-chain cost modelling in Excel', 'tech', 3, 'E-learning', 'Coursera', 8, 0, '', 'Advised for seniors who run cost workstreams.', null, 'published'),
  ('L3', 'Target operating model casebook', 'tech', 4, 'Book', 'Perlego', 10, 0, '', '', null, 'published'),
  ('L4', 'Transformation programme design', 'tech', 4, 'Classroom', 'Internal academy', 16, 0, 'Mar 2027', 'Mandatory before the Manager promotion review. Two days in Brussels with a live programme case and a partner panel.', null, 'published'),
  ('L5', 'Corporate finance refresher', 'acad', 3, 'E-learning', 'edX', 12, 6, '', '', null, 'published'),
  ('L6', 'Behavioural economics for advisors', 'acad', 3, 'Book', 'Perlego', 7, 0, '', '', null, 'published'),
  ('L7', 'Feedback that lands', 'pers', 2, 'Game', 'Internal academy', 1.5, 0, '', '', null, 'published'),
  ('L8', 'Resilience & energy management', 'pers', 2, 'Mentoring', 'Coaching', 4, 0, '', 'Four one-to-one sessions with a firm coach. Advised after the engagement-load survey.', null, 'published'),
  ('L9', 'Writing for executives', 'pers', 3, 'E-learning', 'Internal academy', 3, 0, '', '', null, 'published'),
  ('L10', 'Structured problem solving', 'prof', 3, 'Classroom', 'Internal academy', 14, 8, '', '', null, 'published'),
  ('L11', 'Client conversations simulator', 'prof', 3, 'Game', 'Internal academy', 2, 0, '', 'Branching conversation game. Your counsellor reviews your transcript before it counts.', null, 'published'),
  ('L12', 'Proposal craft: scoping & pricing', 'prof', 4, 'E-learning', 'Internal academy', 5, 4, 'Jan 2027', 'Managers own proposals. Mandatory in all three business lines before the promotion review.', null, 'published'),
  ('L13', 'Belgian retail & wholesale landscape', 'ind', 2, 'Website', 'Internal academy', 2, 0, '', '', null, 'published'),
  ('L14', 'Energy transition: market players', 'ind', 3, 'E-learning', 'Coursera', 6, 0, '', '', null, 'review'),
  ('L15', 'Life sciences value chains', 'ind', 3, 'Book', 'O’Reilly', 9, 0, '', '', null, 'published'),
  ('L16', 'Independence & ethics annual', 'reg', 1, 'E-learning', 'Internal academy', 1, 1, '', '', null, 'published'),
  ('L17', 'GDPR for consultants', 'reg', 2, 'E-learning', 'Internal academy', 1.5, 1, '30 Nov 2026', 'Mandatory for everyone who handles client data. Renewed every two years.', null, 'published'),
  ('L18', 'CSRD essentials', 'reg', 3, 'Certification', 'ITAA', 10, 10, '', 'Sustainability reporting now shapes most Manager-level proposals. Counts for 10 ITAA or ACCA units.', null, 'published'),
  ('L19', 'EU AI Act in practice', 'reg', 3, 'E-learning', 'edX', 4, 0, '', '', null, 'review'),
  ('L20', 'How finance closes the books', 'corp', 1, 'E-learning', 'Internal academy', 2, 0, '', '', null, 'published'),
  ('L21', 'HR for non-HR: workforce planning', 'corp', 2, 'Website', 'Internal academy', 2, 0, '', '', null, 'published'),
  ('L22', 'Procurement fundamentals', 'corp', 2, 'Book', 'Perlego', 5, 0, '', '', null, 'draft'),
  ('L23', 'Azure fundamentals AZ-900', 'tec', 2, 'Certification', 'Microsoft Learn', 12, 0, '', 'Advised for Consulting seniors: most transformation programmes now land on Azure, and clients expect you to read an architecture diagram.', null, 'published'),
  ('L24', 'Generative AI for client work', 'tec', 2, 'E-learning', 'Internal academy', 3, 0, '', '', null, 'published'),
  ('L25', 'Data literacy: reading dashboards', 'tec', 1, 'Game', 'Internal academy', 1, 0, '', '', null, 'published'),
  ('L26', 'Power BI for consultants', 'tec', 3, 'E-learning', 'Microsoft Learn', 9, 0, '', '', null, 'published'),
  ('L27', 'Leading a workstream', 'lead', 2, 'Classroom', 'Internal academy', 12, 0, 'Jun 2027', 'Mandatory before Manager. You lead a simulated workstream for three days with actors as the client team.', null, 'published'),
  ('L28', 'Coaching conversations', 'lead', 3, 'Mentoring', 'Coaching', 6, 0, '', '', null, 'published'),
  ('L29', 'Managing up and across', 'lead', 2, 'Book', 'Perlego', 6, 0, '', '', null, 'published'),
  ('L30', 'Inclusive leadership', 'lead', 2, 'E-learning', 'Internal academy', 2, 0, '', '', null, 'published'),
  ('L31', 'Reading a Belgian annual account', 'acad', 2, 'E-learning', 'Internal academy', 3, 2, '', '', null, 'published'),
  ('L32', 'Negotiating scope with procurement', 'prof', 3, 'Classroom', 'Internal academy', 7, 4, '', '', null, 'published'),
  ('L33', 'Facilitating executive workshops', 'prof', 3, 'Classroom', 'Internal academy', 8, 0, '', '', null, 'published'),
  ('L34', 'Sustainability strategy for industrials', 'ind', 3, 'E-learning', 'edX', 10, 6, '', '', null, 'published'),
  ('L35', 'ESG data and reporting tooling', 'tec', 3, 'E-learning', 'Microsoft Learn', 6, 0, '', '', null, 'published'),
  ('L36', 'Delegation and workload planning', 'lead', 2, 'E-learning', 'Internal academy', 2, 0, '', '', null, 'published'),
  ('L37', 'Storytelling with data', 'pers', 3, 'Game', 'Internal academy', 2, 0, '', '', null, 'published'),
  ('L38', 'Holding scope with a procurement director', 'prof', 3, 'Avatar', 'Avatar studio', 1.5, 0, '', 'A ten-minute spoken role-play with an AI avatar who reopens agreed scope. Three runs; the best one counts once it reaches 4 of 5 on every skill.', null, 'published'),
  ('L39', 'Giving hard feedback to a junior', 'lead', 2, 'Avatar', 'Avatar studio', 1, 0, '', 'Practise the conversation before you have it. The avatar is a capable analyst who missed two deadlines and does not see the problem.', null, 'published'),
  ('L40', 'Presenting a fee increase to a sceptical CFO', 'prof', 4, 'Avatar', 'Avatar studio', 1.5, 0, '', 'The avatar challenges every number. You are scored on clarity, calm and whether you protect the relationship.', null, 'published'),
  ('L41', 'Calming an escalating client call', 'pers', 3, 'Avatar', 'Avatar studio', 1, 0, '', '', null, 'published');

insert into public.curriculum_mappings (audience, learning_id, stage, obligation) values
  ('Consulting', 'L7', 'Analyst', 'mandatory'),
  ('Consulting', 'L16', 'Analyst', 'mandatory'),
  ('Consulting', 'L17', 'Analyst', 'mandatory'),
  ('Consulting', 'L20', 'Analyst', 'advised'),
  ('Consulting', 'L31', 'Analyst', 'advised'),
  ('Consulting', 'L10', 'Consultant', 'mandatory'),
  ('Consulting', 'L24', 'Consultant', 'mandatory'),
  ('Consulting', 'L30', 'Consultant', 'mandatory'),
  ('Consulting', 'L5', 'Consultant', 'advised'),
  ('Consulting', 'L13', 'Consultant', 'advised'),
  ('Consulting', 'L1', 'Senior consultant', 'mandatory'),
  ('Consulting', 'L2', 'Senior consultant', 'advised'),
  ('Consulting', 'L8', 'Senior consultant', 'advised'),
  ('Consulting', 'L11', 'Senior consultant', 'advised'),
  ('Consulting', 'L19', 'Senior consultant', 'advised'),
  ('Consulting', 'L23', 'Senior consultant', 'advised'),
  ('Consulting', 'L4', 'Manager', 'mandatory'),
  ('Consulting', 'L12', 'Manager', 'mandatory'),
  ('Consulting', 'L27', 'Manager', 'mandatory'),
  ('Consulting', 'L18', 'Manager', 'advised'),
  ('Consulting', 'L28', 'Manager', 'advised'),
  ('Consulting', 'L3', 'Senior manager', 'advised'),
  ('Audit', 'L7', 'Analyst', 'mandatory'),
  ('Audit', 'L16', 'Analyst', 'mandatory'),
  ('Audit', 'L17', 'Analyst', 'mandatory'),
  ('Audit', 'L31', 'Analyst', 'mandatory'),
  ('Audit', 'L20', 'Analyst', 'advised'),
  ('Audit', 'L10', 'Consultant', 'mandatory'),
  ('Audit', 'L24', 'Consultant', 'mandatory'),
  ('Audit', 'L30', 'Consultant', 'mandatory'),
  ('Audit', 'L5', 'Consultant', 'mandatory'),
  ('Audit', 'L13', 'Consultant', 'advised'),
  ('Audit', 'L2', 'Senior consultant', 'mandatory'),
  ('Audit', 'L23', 'Senior consultant', 'mandatory'),
  ('Audit', 'L1', 'Senior consultant', 'advised'),
  ('Audit', 'L8', 'Senior consultant', 'advised'),
  ('Audit', 'L11', 'Senior consultant', 'advised'),
  ('Audit', 'L19', 'Senior consultant', 'advised'),
  ('Audit', 'L12', 'Manager', 'mandatory'),
  ('Audit', 'L18', 'Manager', 'mandatory'),
  ('Audit', 'L27', 'Manager', 'mandatory'),
  ('Audit', 'L4', 'Manager', 'advised'),
  ('Audit', 'L28', 'Manager', 'advised'),
  ('Audit', 'L6', 'Senior manager', 'advised'),
  ('Tax & Legal', 'L7', 'Analyst', 'mandatory'),
  ('Tax & Legal', 'L16', 'Analyst', 'mandatory'),
  ('Tax & Legal', 'L17', 'Analyst', 'mandatory'),
  ('Tax & Legal', 'L31', 'Analyst', 'mandatory'),
  ('Tax & Legal', 'L20', 'Analyst', 'advised'),
  ('Tax & Legal', 'L24', 'Consultant', 'mandatory'),
  ('Tax & Legal', 'L30', 'Consultant', 'mandatory'),
  ('Tax & Legal', 'L5', 'Consultant', 'advised'),
  ('Tax & Legal', 'L10', 'Consultant', 'advised'),
  ('Tax & Legal', 'L18', 'Senior consultant', 'mandatory'),
  ('Tax & Legal', 'L19', 'Senior consultant', 'mandatory'),
  ('Tax & Legal', 'L2', 'Senior consultant', 'advised'),
  ('Tax & Legal', 'L8', 'Senior consultant', 'advised'),
  ('Tax & Legal', 'L15', 'Senior consultant', 'advised'),
  ('Tax & Legal', 'L26', 'Senior consultant', 'advised'),
  ('Tax & Legal', 'L12', 'Manager', 'mandatory'),
  ('Tax & Legal', 'L27', 'Manager', 'mandatory'),
  ('Tax & Legal', 'L28', 'Manager', 'advised'),
  ('Tax & Legal', 'L22', 'Senior manager', 'advised'),
  ('ind:energy', 'L14', 'Consultant', 'advised'),
  ('ind:energy', 'L38', 'Senior consultant', 'advised'),
  ('ind:energy', 'L34', 'Senior consultant', 'advised'),
  ('ind:energy', 'L18', 'Senior consultant', 'mandatory'),
  ('ind:health', 'L22', 'Consultant', 'advised'),
  ('ind:whole', 'L2', 'Senior consultant', 'advised'),
  ('tec:data', 'L23', 'Consultant', 'advised'),
  ('tec:data', 'L26', 'Consultant', 'advised'),
  ('tec:data', 'L35', 'Senior consultant', 'advised'),
  ('amb:sust', 'L34', 'Senior consultant', 'advised'),
  ('amb:sust', 'L35', 'Manager', 'advised'),
  ('amb:people', 'L36', 'Consultant', 'advised'),
  ('amb:people', 'L39', 'Senior consultant', 'advised'),
  ('amb:people', 'L28', 'Senior consultant', 'advised'),
  ('amb:bizdev', 'L12', 'Senior consultant', 'advised'),
  ('pro:blue', 'L37', 'Senior consultant', 'advised');

insert into public.knowledge_bundles (id, business_line, access, data) values
  ('B1', 'Consulting', 'all', '{"id":"B1","name":"Operating model & cost methods","owner":"Consulting learning team","topic":"cons.opm","topics2":["cons.cost","ind.whole"],"desc":"The firm methods for operating model design and cost-to-serve work. Use it for anything about how we structure consulting work.","access":"all","fresh":"12","status":"indexed","updated":"28 Oct 2026","usedBy":14,"tags":["operating model","cost-to-serve","target state","wholesale"],"sugg":[["logistics cost",86],["design principles",74]],"models":[{"id":"Mprecise0","def":true,"name":"Precise · cite everything","embed":"e5","chunk":"800","overlap":"10","topk":"5","hybrid":30,"thresh":"0.70","rerank":true,"gen":"sonnet","temp":"0","cite":"sentence"},{"id":"Mbroad1","def":false,"name":"Broad exploration","embed":"te3","chunk":"1200","overlap":"20","topk":"8","hybrid":20,"thresh":"0.55","rerank":false,"gen":"sonnet","temp":"0.5","cite":"paragraph"}],"sources":[["Operating model design method v4","upload","2.1 MB",212,"28 Oct","internal"],["Cost-to-serve playbook","upload","1.4 MB",138,"28 Oct","internal"],["Delcroix engagement files","sharepoint","118 files",0,"27 Oct","client"]],"chunks":[[1,"Size the cost-to-serve model on the activities that vary by customer: order handling, picking, delivery drops and returns. Fixed overhead stays out of the allocation."],[1,"Start with the top 20% of customers by volume; in most wholesale cases they explain 70 to 80% of variable logistics cost."],[0,"An operating model has six layers: customers, services, processes, organisation, technology and governance. Change one and check the five others."],[0,"Design the target state before the transition plan; agree three design principles with the client sponsor first."]],"concepts":[["operating-model-layers","method","Operating model layers","The six layers every operating model covers.","Customers, services, processes, organisation, technology and governance. A change in one layer is checked against the other five before it is agreed.",["target-state-first"],["operating model"],[0]],["target-state-first","principle","Target state before transition","Design where you are going before planning the route.","Agree three design principles with the client sponsor, design the target state, then write the transition plan.",["operating-model-layers"],["target state"],[0]],["cost-to-serve-scope","method","Scoping a cost-to-serve model","Which activities to allocate and which to leave out.","Allocate only activities that vary by customer: order handling, picking, delivery drops and returns. Fixed overhead stays out.",["operating-model-layers"],["cost-to-serve"],[1]]]}'::jsonb),
  ('B5', 'Consulting', 'all', '{"id":"B5","name":"Steering & storytelling standards","owner":"Consulting learning team","topic":"cons.comm","topics2":["ppl.fac"],"desc":"How the firm writes steering decks and tells a story with data.","access":"all","fresh":"24","status":"indexed","updated":"27 Oct 2026","usedBy":18,"tags":["steering committee","slides","storytelling"],"sugg":[["executive summary",81]],"models":[{"id":"Mprecise0","def":true,"name":"Precise · cite everything","embed":"e5","chunk":"800","overlap":"10","topk":"5","hybrid":30,"thresh":"0.70","rerank":true,"gen":"sonnet","temp":"0","cite":"sentence"}],"sources":[["Steering deck standard","sharepoint","36 files",410,"27 Oct","internal"],["Storytelling with data · course notes","lms","6 modules",88,"14 Oct","internal"]],"chunks":[[0,"One message per slide. The headline is a full sentence; evidence goes in the appendix."],[0,"A steering deck opens with the decision needed, then the options, then the recommendation."],[1,"Pick the chart for the comparison you want the reader to make: over time, between items, or part of a whole."]],"concepts":[["one-message-per-slide","standard","One message per slide","The firm headline rule.","Write the headline as a full sentence. If it needs “and”, it is two slides.",["decision-first"],["slides"],[0]],["decision-first","standard","Decision first","How a steering deck opens.","Open with the decision needed, then the options, then the recommendation.",["one-message-per-slide"],["steering committee"],[0]]]}'::jsonb),
  ('B2', 'Tax & Legal', 'tl', '{"id":"B2","name":"Belgian tax updates 2026","owner":"Tax & Legal knowledge desk","topic":"tax.cit","topics2":["tax.intl","tax.vat"],"desc":"Current legislation, rulings and internal tax alerts. Reviewed every month by the knowledge desk.","access":"tl","fresh":"6","status":"reindex","updated":"30 Oct 2026","usedBy":9,"tags":["Pillar Two","VAT","investment deduction","2026"],"sugg":[["QDMTT",79],["net VAT payer",71]],"models":[{"id":"Mlegal0","def":true,"name":"Legal strict","embed":"e5","chunk":"400","overlap":"20","topk":"3","hybrid":70,"thresh":"0.80","rerank":true,"gen":"sonnet","temp":"0","cite":"sentence"},{"id":"Mquick1","def":false,"name":"Quick answers","embed":"e5","chunk":"400","overlap":"0","topk":"3","hybrid":40,"thresh":"0.65","rerank":false,"gen":"haiku","temp":"0.2","cite":"paragraph"}],"sources":[["Pillar Two guidance and FAQ","web","64 pages",96,"30 Oct","public"],["Programme law 2026 summary","upload","820 KB",44,"12 Oct","internal"],["Internal tax alerts","confluence","212 pages",388,"30 Oct","internal"],["Belgian VAT code","web","1,140 pages",1620,"2 Oct","public"]],"chunks":[[0,"Pillar Two applies to groups with consolidated revenue of €750m or more in at least two of the last four years. The minimum effective rate is 15%."],[0,"Belgium applies a qualified domestic minimum top-up tax, so the top-up is collected locally before any other jurisdiction can claim it."],[3,"A company is a net VAT payer when output VAT in grids 54 to 63 exceeds deductible input VAT in grid 59."],[2,"Tax alert 2026/14: the investment deduction rate for digital investments rises to 20% for assets acquired from 1 January 2026."]],"concepts":[["pillar-two-scope","rule","Pillar Two scope","Which groups are in scope.","Groups with consolidated revenue of €750m or more in at least two of the last four years. Minimum effective rate 15%.",["belgian-qdmtt"],["Pillar Two"],[0]],["belgian-qdmtt","rule","Belgian QDMTT","How Belgium collects the top-up first.","Belgium applies a qualified domestic minimum top-up tax so the top-up is collected locally before any other jurisdiction.",["pillar-two-scope"],["Pillar Two","QDMTT"],[0]],["net-vat-payer","glossary-term","Net VAT payer","Reading the VAT return.","Output VAT in grids 54 to 63 exceeds deductible input VAT in grid 59.",[],["VAT"],[3]]]}'::jsonb),
  ('B3', 'Consulting', 'all', '{"id":"B3","name":"Energy transition sector pack","owner":"Energy sector lead","topic":"ind.energy","topics2":["cons.cost"],"desc":"Sector outlook, regulation and podcast transcripts for energy and utilities work.","access":"all","fresh":"6","status":"stale","updated":"3 Mar 2026","usedBy":5,"tags":["grid tariffs","hedging","procurement","capacity tariff"],"sugg":[["load flattening",77]],"models":[{"id":"Mbroad0","def":true,"name":"Broad exploration","embed":"te3","chunk":"1200","overlap":"20","topk":"8","hybrid":20,"thresh":"0.55","rerank":false,"gen":"sonnet","temp":"0.5","cite":"paragraph"}],"sources":[["Grid tariff methodology 2025","web","48 pages",72,"3 Mar","public"],["Sector outlook 2026","upload","3.4 MB",190,"3 Mar","internal"],["Podcast transcripts · energy series","lms","3 episodes",64,"21 Oct","internal"]],"chunks":[[0,"Distribution tariffs in Flanders move to a capacity component based on the monthly peak, which rewards customers who flatten their load."],[1,"Utilities hedge 60 to 80% of next year’s volume through forwards; treasury owns the policy, procurement owns execution."],[2,"Procurement directors reopen scope when the price is fixed but deliverables are loosely defined. Trade timing for scope, never price for scope."]],"concepts":[["capacity-tariff","concept","Capacity tariff","How the Flemish grid tariff works.","Distribution tariffs include a capacity component based on the monthly peak, which rewards flatter load.",["capacity-tariff-2027"],["capacity tariff"],[0]],["utility-hedging","concept","Utility hedging","Who hedges what, and how much.","Utilities hedge 60 to 80% of next year’s volume through forwards; treasury owns the policy, procurement owns execution.",["capacity-tariff"],["hedging"],[1]],["scope-for-timing","practice","Trade timing for scope","Holding scope with procurement.","When procurement reopens scope, trade timing for scope, never price for scope.",[],["procurement"],[2]]]}'::jsonb),
  ('B7', null, 'all', '{"id":"B7","name":"Generative AI at the firm","owner":"Technology & risk office","topic":"tec.ai","topics2":["tax.legal"],"desc":"The AI use policy and prompting guidance every creator and consultant follows.","access":"all","fresh":"6","status":"indexed","updated":"22 Oct 2026","usedBy":11,"tags":["prompting","AI policy","client data"],"sugg":[["model risk",68]],"models":[{"id":"Mprecise0","def":true,"name":"Precise · cite everything","embed":"e5","chunk":"800","overlap":"10","topk":"5","hybrid":30,"thresh":"0.70","rerank":true,"gen":"sonnet","temp":"0","cite":"sentence"},{"id":"Mquick1","def":false,"name":"Quick answers","embed":"e5","chunk":"400","overlap":"0","topk":"3","hybrid":40,"thresh":"0.65","rerank":false,"gen":"haiku","temp":"0.2","cite":"paragraph"}],"sources":[["Firm AI use policy v3","upload","420 KB",36,"22 Oct","internal"],["Prompting for consultants · course","lms","4 modules",52,"22 Oct","internal"],["Client engagement letters","sharepoint","2,310 files",0,"22 Oct","client"]],"chunks":[[0,"Never paste client-identifying data into a public AI tool. Use the firm workspace, which keeps data inside the EU tenant."],[1,"Give the model a role, the source material and the format you want back; ask it to cite the passage it used."],[0,"Every AI-assisted deliverable is reviewed by a person who signs off on the content, not the tool."]],"concepts":[["client-data-rule","policy","Client data in AI tools","What may and may not be shared.","Never paste client-identifying data into a public AI tool; use the firm workspace.",["human-sign-off"],["client data"],[0]],["human-sign-off","policy","Human sign-off","Who is accountable for AI output.","A named person reviews and signs off every AI-assisted deliverable.",["client-data-rule"],["AI policy"],[0]]]}'::jsonb),
  ('B4', null, 'all', '{"id":"B4","name":"Communication & feedback","owner":"Talent team","topic":"ppl.fb","topics2":["ppl.pers"],"desc":"Feedback models, facilitation guides and the avatar studio scenario library.","access":"all","fresh":"24","status":"indexed","updated":"19 Oct 2026","usedBy":21,"tags":["feedback","SBI","avatar practice"],"sugg":[["difficult conversations",83]],"models":[{"id":"Mprecise0","def":true,"name":"Precise · cite everything","embed":"e5","chunk":"800","overlap":"10","topk":"5","hybrid":30,"thresh":"0.70","rerank":true,"gen":"sonnet","temp":"0","cite":"sentence"}],"sources":[["Feedback model: situation, behaviour, impact","upload","610 KB",22,"19 Oct","internal"],["Avatar studio scenario library","lms","18 scenarios",144,"19 Oct","internal"],["Four Colours facilitator guide","upload","2.8 MB",0,"19 Oct","licensed"]],"chunks":[[0,"Describe the situation, the behaviour you saw and its impact. Ask before you suggest; agree one next step and a date."],[1,"Hard-feedback scenarios score directness, empathy and a concrete next step on a five-point scale."],[0,"Keep feedback within a week of the event; later feedback reads as a verdict instead of help."]],"concepts":[["sbi-feedback","model","Situation, behaviour, impact","The firm feedback model.","Describe the situation, the behaviour and its impact; ask before suggesting; agree one next step and a date.",["feedback-timing"],["feedback","SBI"],[0]],["feedback-timing","practice","Feedback within a week","Why timing matters.","Feedback given more than a week later reads as a verdict instead of help.",["sbi-feedback"],["feedback"],[0]]]}'::jsonb),
  ('B8', null, 'all', '{"id":"B8","name":"Facilitation toolkit","owner":"Talent team","topic":"ppl.fac","topics2":["cons.prog"],"desc":"Agendas, decision logs and techniques for running workshops in the room and online.","access":"all","fresh":"12","status":"indexed","updated":"9 Oct 2026","usedBy":7,"tags":["workshops","decision log","remote"],"sugg":[["introverts",64]],"models":[{"id":"Mquick0","def":true,"name":"Quick answers","embed":"e5","chunk":"400","overlap":"0","topk":"3","hybrid":40,"thresh":"0.65","rerank":false,"gen":"haiku","temp":"0.2","cite":"paragraph"}],"sources":[["Workshop agenda templates","sharepoint","14 files",46,"9 Oct","internal"],["Facilitating executive workshops · course","lms","5 modules",61,"9 Oct","internal"]],"chunks":[[0,"A 90-minute design workshop: 10 minutes frame, 50 minutes options, 20 minutes decide, 10 minutes next steps."],[1,"Keep a visible decision log: decision, owner, date. Read it back before the session closes."],[1,"For introverted groups, ask for written input first and discuss after."]],"concepts":[["ninety-minute-agenda","template","90-minute workshop agenda","Timings that work.","Frame, options, decide, next steps: 10, 50, 20 and 10 minutes.",["decision-log"],["workshops"],[0]],["decision-log","practice","Decision log","Recording what was decided.","Decision, owner and date, read back before the session closes.",["ninety-minute-agenda"],["decision log"],[1]]]}'::jsonb);
