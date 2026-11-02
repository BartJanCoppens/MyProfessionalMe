// Runs every migration and supabase/tests/rls.sql on PGlite (Postgres 17 in Node), with a stand-in for Supabase's
// auth schema and roles, so the RLS checks can be tried without the live project and without Docker:
//   npm i --no-save @electric-sql/pglite@0.3.15 && node scripts/rls-pglite.mjs . [real]
// 'real' adds accounts in every line and a second General Admin, as in the live project (routing picks at random).
// Before the creation-rules migration (20261102080340) it inserts v0.6.0 data in the old topic model (one grant for
// format Micro-guide, the Micro-guide policy, a contribution at quality & risk), standing in for the live data that
// migration carries over. The live check stays `npm run test:db`.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || '.';
const extraUsers = process.argv[3] === 'real';
const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
`);
const dir = join(root, 'supabase/migrations');
let seeded = false;
const seed = async () => {
  seeded = true;
  // The first System Admin (the bootstrap email of the first migration)
  await db.exec(`insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'bart.jan.coppens@intelli-select.com');
  update public.profiles set business_line = 'Consulting', full_name = 'Admin Person' where id = '11111111-1111-1111-1111-111111111111';`);
  // v0.6.0 data in the topic model: a grant, the Micro-guide policy, a contribution at quality & risk
  await db.exec(`insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333331','author@x'),('33333333-3333-3333-3333-333333333332','peer@x'),('33333333-3333-3333-3333-333333333333','ga@x');
   update public.profiles set business_line = 'Consulting', full_name = 'Seed Author' where email in ('author@x','peer@x');
   insert into public.user_roles (user_id, role) values ('33333333-3333-3333-3333-333333333333','general_admin');
   insert into public.creator_grants (user_id, topic_kind, topic_value) values ('33333333-3333-3333-3333-333333333331','format','Micro-guide');
   insert into public.review_policies (topic_kind, topic_value, peers, expert, quality) values ('format','Micro-guide',1,false,true);
   insert into public.contributions (id, author_id, topic_kind, topic_value, type, title, domain, takeaway, status, step, submitted_at)
     values ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333331','format','Micro-guide','Micro-guide','Three questions that expose scope creep','prof','Ask what changed, who asked and what it costs.','review',3,now());
   insert into public.contribution_reviews (contribution_id, step, slot, reviewer_id, verdict) values
     ('44444444-4444-4444-4444-444444444444',1,1,'33333333-3333-3333-3333-333333333332','approved'),
     ('44444444-4444-4444-4444-444444444444',3,1,'33333333-3333-3333-3333-333333333333','pending');`);
};
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  if (!seeded && f >= '20261102080340') await seed();
  try { await db.exec(readFileSync(join(dir, f), 'utf8')); } catch (e) { console.error('MIGRATION FAILED', f, e.message); process.exit(1); }
}
if (extraUsers) {
  await db.exec(`insert into auth.users (id, email) values
   ('22222222-2222-2222-2222-222222222221','r1@x'),('22222222-2222-2222-2222-222222222222','r2@x'),('22222222-2222-2222-2222-222222222223','r3@x'),
   ('22222222-2222-2222-2222-222222222224','r4@x'),('22222222-2222-2222-2222-222222222225','r5@x');
   update public.profiles set business_line = 'Consulting' where email in ('r1@x','r2@x');
   update public.profiles set business_line = 'Tax & Legal' where email in ('r3@x');
   update public.profiles set business_line = 'Audit' where email in ('r4@x','r5@x');
   insert into public.user_roles (user_id, role) values ('22222222-2222-2222-2222-222222222225','general_admin');`);
}
// rls.sql ends with a rollback; here the whole database is thrown away instead, so the result rows can be read.
const sql = readFileSync(join(root, 'supabase/tests/rls.sql'), 'utf8').replace(/\nrollback;\s*$/, '\n');
let res;
try { res = await db.exec(sql); } catch (e) { console.error('RLS SCRIPT FAILED', e.message, e.where || ''); process.exit(1); }
const rows = res[res.length - 1].rows;
const bad = rows.filter((r) => r.result !== 'PASS');
bad.forEach((r) => console.log('FAIL', r.check_name, '| expected', r.expected, '| actual', r.actual));
console.log(rows.length - bad.length + '/' + rows.length + ' RLS checks pass (PGlite)');
process.exit(bad.length ? 1 : 0);
