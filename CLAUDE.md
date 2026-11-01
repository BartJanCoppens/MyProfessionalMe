# CLAUDE.md

MyProfessionalMe: a clickable prototype of a learning & growth platform (growth map, library with avatar-practice learnings, projects & evaluations, profile, counsellor view, admin library and audience-based curriculum mapping). React 19 + Vite + TypeScript, npm. Accounts and roles live in Supabase (project `myprofessionalme`, ref `njhrxshysipssjyeyivm`, West EU Paris); all learning data is still seed data in memory.

Source design: Claude Design project `797ed301-7b6d-47eb-9e2d-6d7d2e7483c3`, file `MyProfessionalMe.dc.html`, built on the TaxConnect design system. GitHub: `BartJanCoppens/MyProfessionalMe` (public).

## Commands

- `npm run dev`: dev server
- `npm run build`: `tsc -b` then Vite build (use this as the typecheck)
- `npm run lint`: oxlint
- `supabase db push` / `supabase config push` / `supabase functions deploy manage-users --use-api`: apply migrations, auth config and the edge function to the linked project (no Docker needed). `supabase db advisors --linked` after schema changes.
- `npm test`: Vitest unit tests (`src/**/*.test.ts`). `npm run test:db`: row-level security checks in `supabase/tests/rls.sql` against the linked project, inside a transaction that rolls back; add a case there for every policy change.
- `npm run agents`: regenerate `AGENTS.md` from this file. Run it after every edit to `CLAUDE.md`; never edit `AGENTS.md` by hand.

## Layout

- `src/styles/tokens/*.css`: design-system tokens (colours, type, spacing, motion), copied from the DS. `src/styles/index.css` adds globals and the `pm*` keyframes.
- `src/ds/index.tsx`: TSX port of the DS components the app uses (Button, StatusChip, Tag, Card, Drawer…), inline styles on CSS variables. `Hover` stands in for the prototype's `style-hover` attribute.
- `src/data.ts`: seed data, verbatim from the prototype script. `src/types.ts`: tuple and state types.
- `src/model.ts`: `Logic` is a near-verbatim port of the prototype's `DCLogic` class. `renderVals()` derives the whole view-model (`VM`), including the constellation, radar and road geometry. Change behaviour here, not in the screens.
- `Logic.curriculum()` builds the curriculum-mapping view-model; `applyOps()` is the single write path for mappings (drags, signals and copilot proposals all go through it).
- `src/screens/*.tsx`: one file per screen group; each is a transcription of its template block and only reads from `VM`. `Mapping.tsx` is the curriculum-mapping screen.
- `src/App.tsx`: auth gate (sign-in → forced password change → app), then state (one `AppState` object, merged patches like class `setState`), sidebar, header, screen switch.
- `src/lib/supabase.ts` (client, `manageUsers()`, password rule), `src/lib/useAuth.ts` (session, profile, roles → `Access`). `src/screens/SignIn.tsx`, `src/screens/Users.tsx` (User management).
- `supabase/migrations/`: `profiles`, `user_roles`, RLS, private helper functions, first-admin bootstrap. `supabase/functions/manage-users/`: create / remove / reset password / change own password via the auth admin API.

## Conventions

- Styling is inline style objects using the token values, matching the DS. No Tailwind here.
- `Logic` is rebuilt every render from the current state. After an `await`, use the functional `setState((s) => …)` form because `this.state` is stale (see `send()`).
- The prototype's editable props live in `src/config.ts` and can be overridden from the URL: `?bl=Audit&screen=team&view=radar&marks=off&live=off&motion=off`.
- The avatar is stored in `localStorage['mpm-avatar']`.
- Curriculum mappings live in one `maps` record keyed by audience: business-line keys (`'Consulting'`, …) plus lens-prefixed keys (`'ind:energy'`, `'amb:sust'`, …). `LENSES[i][3]` (canMand) decides whether an audience can carry mandatory items; ambition and profile audiences are always advised. `pending` keys are `audience|learningId`.
- Business lines are Consulting, Audit and Tax & Legal. Audit replaced the design's Advisory on purpose (owner's decision); keep it when pulling new design changes.
- Avatar-practice learnings have format `'Avatar'`; persona, skills and past runs are in `AVATARS` (data.ts).

## Accounts and roles

- **System Admin** (`user_roles.role = 'system_admin'`, no line): everything, and the only role that grants or revokes roles.
- **Domain Admin** (`'domain_admin'` + a business line; a person may hold several): creates, edits, resets and removes users of that line, and edits that line's curriculum mapping. Never manages a System Admin.
- Enforcement is in the database (RLS + `private.*` helpers) and in `manage-users`; the UI only hides what the role cannot do. Library and curriculum data are still in-memory, so their per-line limits (`Logic.canEditAud`, `applyOps`) are UI-only until that data moves to Supabase.
- Sign-up is closed; admins create accounts with a temporary password (`must_change_password`), which the user replaces at first sign-in. `[auth.email] enable_signup` must stay `true`: false disables email/password login entirely.
- Never use `user_metadata` for authorization; never put a secret or `service_role` key in the app. `.env.local` holds only the URL and publishable key (see `.env.example`).
- `private.bootstrap_admins` is one-shot: a listed email becomes System Admin only while none exists, and the row is consumed (it is empty now). The database refuses to remove the last System Admin.
- Learner data is per user: `learner_learnings` (state, pct, chosen), `ambitions`, `interests`, `learner_prefs`, plus `profiles.career_stage` and `profiles.counsellor_id`. Read: the person, admins who manage them, their counsellor (`private.can_view_learner`). Write: only the person; only a counsellor or managing admin may set `accepted` (`private.can_accept`). Keep one permissive policy per table and action (merge with OR).
- Nobody but a System Admin may manage a person who is Domain Admin for a line the caller does not administer (`private.can_manage_user` and `manage-users` both enforce it).
- This project still applies Supabase's default table grants; every new table needs an explicit `revoke all … from anon, authenticated` plus the minimal grants (see `20261030210928_tighten_table_grants.sql`).

## Assistants

Three features call `window.claude.complete` when it exists (only inside Claude Design): the profile chat ("Talk it through"), the curriculum copilot, and "Read it as …" in the learner's eye. Elsewhere they fall back to scripted replies in `Logic.scripted()`, `scriptedCp()` and `scriptedRead()`. To make it live, add a server-side proxy to the Claude API; never put an API key in the client bundle.
