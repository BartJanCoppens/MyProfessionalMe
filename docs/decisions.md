# Decisions

## PoC shortcuts

Known proof-of-concept shortcuts and what a production version replaces them with. From the readiness audit of 2026-11-07. Add a row when you take a shortcut; remove it when it is replaced.

| Shortcut | Where | Production replacement |
|---|---|---|
| Untyped Supabase client; row types hand-written, no generated DB types | `src/lib/supabase.ts:8` | `supabase gen types` output passed as `createClient<Database>` |
| Profile photos kept in browser localStorage | `src/model.ts:184`, `src/lib/useSubject.ts:23` | Supabase Storage with a path on the profile row |
| Users screen queries Supabase directly | `src/screens/Users.tsx:19` | Move the fetches into a store in `src/lib/` |
| One Supabase project, no staging | `AGENTS.md` (Data & deploy) | Separate staging project |
| No CI workflow | `.github` not found | CI running build, lint, tests and `test:db` |
| Legacy oversized files: `src/model.ts`, `src/screens/Library.tsx`, `src/ds/index.tsx` | same paths | Split by behaviour when touched |
