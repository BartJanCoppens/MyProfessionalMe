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

## Trajectory start month and who an auto-enrol trajectory binds (design v4, Task 5, 2026-11-17)

- **What.** An `auto` trajectory is mandatory only for a person inside one of its `mandatory` maps: the map's audience is the person's business line and the map's stage is their career stage (`private.in_mandatory_audience`). For them the row is written at their first action and cannot be withdrawn; its `start_month` is the month the trajectory was published (`published_at`, or the current month if it has none). For everyone else an `auto` trajectory behaves like `open`. Rows for `open` and `approval` trajectories start in the current month, and approving a start request resets it to the approval month. Months are year * 12 + month index (UTC).
- **Why.** Owner decision D6 says the start is the later of the publication and the month the person joined that stage; the schema records no stage-since date, so the publication month is the closest rule the database can enforce, and it keeps the start stable whatever the person's first action is. `src/logic` (Task 6) mirrors this rule.
- **Alternatives.** Add `profiles.stage_since` (stamped when `career_stage` changes) and take the later of the two months; a production version should do this. ind:/tec: audiences have no membership data in the database either; see the next entry.

## Trajectories are mandatory only for business-line audiences (design v4, Task 5, 2026-11-17)

- **What.** A trajectory map may be `mandatory` only on a business-line audience (Consulting, Audit, Tax & Legal). `ind:` and `tec:` audiences are advised only, like `amb:` and `pro:` (`private.trajectory_maps_ok`, a check constraint).
- **Why.** The database stores no industry or technology membership, so it cannot tell who a mandatory `ind:`/`tec:` trajectory binds (auto-enrolment, no withdrawal). Refusing the map keeps the SQL and the screens consistent.
- **Production replacement.** Store `ind:`/`tec:` membership per person (a table with versioned changes), extend `private.in_mandatory_audience` to it, then allow `mandatory` on those audiences.

