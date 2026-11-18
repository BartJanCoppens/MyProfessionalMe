-- Stock looks (Studios Phase 5, Task 5.2): the faces a creator may choose for a Reel or an avatar (owner S5: only stock looks
-- and voices, never a real person's face; there is no upload anywhere).
--
-- stock_looks   name is a role and an age ("HR director · 50s"), never a person's name. portrait is the key of one of the
--               four illustrations drawn in code (src/reel/portraits.ts), checked against that bundled list here, so
--               no row can point at an image from elsewhere. color is the look's accent. licence says where the picture
--               comes from. Nobody deletes a look (stored reels were made with it): an admin switches it off.
--               System and General Admins add, edit and switch off on the AI connections page; every signed-in
--               person reads the active looks.

create table public.stock_looks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  portrait text not null check (portrait in ('p1','p2','p3','p4')),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  licence text not null check (length(trim(licence)) between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- A look is chosen by its id (a draft stores it), and a role is on the list once, so the admin list never has twins.
create unique index stock_looks_name_key on public.stock_looks (lower(trim(name)));

alter table public.stock_looks enable row level security;
revoke all on public.stock_looks from anon, authenticated;
grant select on public.stock_looks to authenticated;
grant insert (name, portrait, color, licence, active), update (name, portrait, color, licence, active) on public.stock_looks to authenticated;

create policy "stock_looks: read" on public.stock_looks for select to authenticated
  using (active or (select private.is_system_admin()) or (select private.is_general_admin()));
create policy "stock_looks: add" on public.stock_looks for insert to authenticated
  with check ((select private.is_system_admin()) or (select private.is_general_admin()));
create policy "stock_looks: edit" on public.stock_looks for update to authenticated
  using ((select private.is_system_admin()) or (select private.is_general_admin()))
  with check ((select private.is_system_admin()) or (select private.is_general_admin()));

-- The four looks the studios had built in, as roles.
insert into public.stock_looks (name, portrait, color, licence) values
  ('HR director · 50s', 'p1', '#8a5a8c', 'Drawn in code for MyProfessionalMe · no real person · no third-party image'),
  ('CFO · 40s', 'p2', '#2f7fc1', 'Drawn in code for MyProfessionalMe · no real person · no third-party image'),
  ('Consultant · 30s', 'p3', '#4c7a10', 'Drawn in code for MyProfessionalMe · no real person · no third-party image'),
  ('Engineer · 50s', 'p4', '#b5762a', 'Drawn in code for MyProfessionalMe · no real person · no third-party image');
