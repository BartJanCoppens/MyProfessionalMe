# MyProfessionalMe: clickable prototype of a learning and growth platform (growth map, library with avatar practice, projects and evaluations, counsellor view, admin library, curriculum mapping). Proof of concept.

React 19 + Vite + TypeScript, npm. Built from a Claude Design file (`MyProfessionalMe.dc.html`) on the TaxConnect design system. GitHub `BartJanCoppens/MyProfessionalMe`. Production: https://myprofessionalme.vercel.app (Vercel project `myprofessionalme`).

## Run
Working folder: repo root.
- `npm run dev`: dev server
- `npm run build`: `tsc -b` then Vite build; use it as the typecheck
- `npm run lint`: oxlint
- `npm test`: Vitest (`src/**/*.test.ts`, plus `*.test.tsx` screen tests on jsdom). `npm run test:coverage` adds coverage. Tests never reach Supabase (`src/test/setup.ts` installs a fake client; `src/test/harness.ts` builds a `Logic` for view-model tests). Test catalogue: `docs/testing/functional-test-cases.md`.
- `npm run test:db`: row-level-security checks in `supabase/tests/rls.sql` against the linked project, in a transaction that rolls back. Add a case for every policy change.

## Architecture
- `src/data.ts`: seed data. `src/types.ts`: types. `src/config.ts`: prototype props, overridable from the URL (`?bl=Audit&screen=team&live=off`).
- `src/model.ts`: `Logic`, a near-verbatim port of the prototype's `DCLogic`. `renderVals()` derives the whole view-model (`VM`). Change behaviour here, not in screens.
- `src/screens/*.tsx`: one file per screen group; they only read from `VM`. `src/App.tsx`: auth gate, one `AppState`, sidebar, header, screen switch.
- `src/logic/`: pure, unit-tested rules. `src/lib/`: Supabase client and stores (`supabase.ts`, `useAuth.ts`, `useSubject.ts`, `contentStore.ts`, `learnerStore.ts`, `ai.ts`).
- The subject is the person the app shows ("View as"); `Logic` writes through `persist()`, which refuses when read-only.
- `src/ds/index.tsx`: DS components with inline styles. `src/styles/tokens/*.css`: DS tokens.
- `supabase/migrations/`, `supabase/functions/manage-users/` and `supabase/functions/ai/`: schema, user management, the one AI path.
- Per-feature file maps and database rules: `docs/implementation-notes.md`.

## Conventions
- Inline style objects on the token values. No Tailwind.
- `Logic` is rebuilt every render; after an `await` use the functional `setState((s) => ...)` form.
- No seeded persona or fictional colleagues: data comes from the subject. `src/logic/noPersona.test.ts` fails if the old names return. Avatar-practice characters in `AVATARS` are role-play content and stay.
- Career stages: `STAGES` (`src/data.ts`) and the `public.career_stage` enum must match; change both, keep `STAGE_FR` summing to 1. The design has five stages; do not copy its `STAGES` back.
- Business lines are Consulting, Audit and Tax & Legal. Audit replaced the design's Advisory on purpose; keep it when pulling design changes.
- Learners see published learnings only. Readiness counts accepted hours only. Owner decisions: `docs/product/user-journeys-and-epics.md`; next steps: `docs/product/functional-design.md`.
- Rules mirrored in code and SQL (evidence and completion in `src/logic/record.ts`, `CLIENT_WORDS`, `canEditLine`) change together; `src/logic/record.sync.test.ts` checks the migration.
- One AI path: `complete()` in `src/lib/ai.ts`. A failure never falls through to another source. Never label scripted output as AI.

## Done means
- `npm run build`, `npm run lint` and `npm test` pass.
- For a policy or grant change, `npm run test:db` passes with a new case.

## Data & deploy
- Supabase project `myprofessionalme` (ref `njhrxshysipssjyeyivm`, West EU Paris). Accounts, roles, learner data, catalogue, mappings and knowledge bundles live there.
- No Docker. Apply with the CLI: `supabase db push`, `supabase config push`, `supabase functions deploy manage-users --use-api`, `supabase functions deploy ai --use-api`, `supabase functions deploy voice --use-api`, `supabase functions deploy avatar --use-api` (`ai`, `voice` and `avatar` import `supabase/functions/_shared/`: redeploy all three when it changes). Run `supabase db advisors --linked` after schema changes.
- Each new table needs `revoke all ... from anon, authenticated` plus minimal grants (this project still has Supabase's default grants). One permissive policy per table and action.
- Roles: System Admin, Domain Admin (per business line), General Admin. Enforcement is in RLS, `private.*` helpers and `manage-users`; the UI only hides. Sign-up is closed; `[auth.email] enable_signup` must stay `true`.
- Ship with `vercel deploy --prod`.

## Never
- Use `user_metadata` for authorization.
- Put a secret, `service_role` key or AI API key in the app; `.env.local` holds only the URL and publishable key (see `.env.example`).
- Remove the last System Admin or let a Domain Admin manage a System Admin.

## Agents
None; use the standard agents.

## Pointers
- `docs/implementation-notes.md`, `docs/decisions.md`, `docs/product/`, `docs/testing/functional-test-cases.md`.
- `Design/` holds the full design export (git-ignored).
