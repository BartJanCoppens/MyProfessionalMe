# MyProfessionalMe: functional verification

An independent check, by a functional analyst, of `docs/product/user-journeys-and-epics.md` (the product document). Every epic acceptance criterion (143) and every journey step (170) was re-checked against the code, the migrations and the tests. The product owner's (PO) status was not taken on trust: each row below gives the PO status, my status, the evidence I found and a note where it matters. The functional design for everything that is not Met is in `docs/product/functional-design.md`.

## 0. Scope and method

- **Code checked:** `main` at `92dd8a1` (1 Nov 2026), which includes the seven fixes of `0b955a2`. Behaviour was read in `src/model.ts` (`Logic`, `renderVals()`), `src/kbVals.ts`, `src/logic/*.ts`, `src/lib/*.ts`, `src/screens/*.tsx`, `src/data.ts`, all twelve migrations in `supabase/migrations/`, `supabase/functions/manage-users/index.ts`, `supabase/config.toml` and `supabase/tests/rls.sql`.
- **Tests run:** `npm test` with placeholder `VITE_SUPABASE_*` values: **514 of 514 tests pass in 25 files**. The tests use an in-memory fake client and never reach Supabase.
- **Not run:** `npm run test:db` (`supabase/tests/rls.sql`) needs the linked live project, which this review was not allowed to touch. Row-level security (RLS) statuses rest on the migrations and on the checks written in `rls.sql`, named by their check name ("Owner accepts own item").
- **Evidence ids** (`MAP-24`, `DET-16`…) are rows of `docs/testing/functional-test-cases.md`. A script confirmed that every test-case id and every criterion id the product document cites exists.
- **Facts taken from the owner, not from code:** v0.4.0 is deployed to production with the seven bug fixes (1 Nov 2026) and test accounts exist in the live project. They decide E12.10 and J24.6.
- **Status values** are the PO's (Met, Partial, Not built, Gap). I applied one rule more strictly than the PO: a row is **Partial** only when part of what the criterion asks for works. A row whose essence is missing (data not stored, no real data source, no concurrency control) is Gap or Not built, even when a screen or a toast exists. A user interaction that works but only on seeded or mocked data stays Partial.

## 1. Summary

### 1.1 Counts

| Status | Criteria: PO (tables) | PO (§4 summary) | Mine | Journey steps: PO | Mine |
|---|---|---|---|---|---|
| Met | 62 | 61 | **61** | 92 | **93** |
| Partial | 19 | 19 | **15** | 21 | **18** |
| Not built | 18 | 19 | **19** | 18 | **18** |
| Gap | 44 | 44 | **48** | 39 | **41** |
| Total | 143 | 143 | 143 | 170 | 170 |

The PO's own §4 summary does not match the PO's tables: E12.10 was changed to Met in commit `92dd8a1` but the totals (Met 61, Not built 19) and the E12 row (8 / 0 / 2 / 3, tables say 9 / 0 / 1 / 3) were not updated.

### 1.2 Criteria per epic (PO → mine)

| Epic | Met | Partial | Not built | Gap |
|---|---|---|---|---|
| E1 Growth map and readiness | 6 → 6 | 5 → 5 | 0 → 0 | 1 → 1 |
| E2 Library and discovery | 5 → 5 | 3 → **2** | 0 → 0 | 1 → **2** |
| E3 Completion, evidence, acceptance | 6 → 6 | 0 → 0 | 0 → 0 | 4 → 4 |
| E4 Counselling and team insight | 7 → 7 | 0 → 0 | 0 → 0 | 4 → 4 |
| E5 Curriculum mapping | 5 → 5 | 3 → **2** | 0 → 0 | 4 → **5** |
| E6 Catalogue administration | 5 → **6** | 2 → **0** | 0 → 0 | 2 → **3** |
| E7 Knowledge library, RAG, logic engine | 6 → 6 | 2 → **1** | 6 → **7** | 0 → 0 |
| E8 Create & share | 0 → 0 | 0 → 0 | 5 → 5 | 4 → 4 |
| E9 Podcasts and reels | 1 → 1 | 0 → 0 | 5 → 5 | 1 → 1 |
| E10 Avatar practice | 2 → 2 | 0 → 0 | 0 → 0 | 3 → 3 |
| E11 Profile, evaluations, personality | 1 → 1 | 3 → **2** | 0 → 0 | 4 → **5** |
| E12 Accounts, roles, governance | 9 → 9 | 0 → 0 | 1 → 1 | 3 → 3 |
| E13 Server-side AI | 2 → 2 | 0 → 0 | 1 → 1 | 2 → 2 |
| E14 Analytics and reporting | 0 → 0 | 1 → 1 | 0 → 0 | 6 → 6 |
| E15 Notifications and reminders | 1 → 1 | 0 → 0 | 0 → 0 | 4 → 4 |
| E16 Release readiness and robustness | 6 → **4** | 0 → **2** | 0 → 0 | 1 → 1 |

### 1.3 Disagreements (12)

| Id | PO | Mine | Reason |
|---|---|---|---|
| E2.6 | Partial | Gap | Nothing is stored or shown; "Post note" toasts "visible to colleagues" and discards the note (`saveNote`). Only a form exists. |
| E5.6 | Partial | Gap | The criterion is about the data source. `SIGNALS` is a constant with invented counts and client quotes; no source is built or planned. |
| E6.6 | Partial | Gap | No connection to any real catalogue; `PROGRAMS`, `IMPORT_RESULTS`, the sync times and "Sync programs" are all seed or toast. No plan item. |
| E6.9 | Partial | Met | The described behaviour works: `private.can_edit_audience()` checks only the audience. The open owner question (Q2) does not make it partial; the owner has since confirmed it. |
| E7.14 | Partial | Not built | Last writer wins (`saveBundleSoon()`); no part of "do not silently overwrite" exists. Roadmap §6 plans it. |
| E11.8 | Partial | Gap | No visibility control exists; RLS gives the counsellor every ambition and interest while the profile says "You decide what your counsellor sees". |
| E16.6 | Met | Partial | A failed counsellee load is caught as an empty team (`useTeam`) and reads "Nobody has you as counsellor yet": not explained, no retry. |
| E16.7 | Met | Partial | Several policies have no `rls.sql` case (listed in the row), and the script only runs against the live project because it hard-codes the live System Admin's UUID. |
| J03.4 | Partial | Gap | Same as E2.6. |
| J08.7 | Partial | Gap | Same as E11.8. |
| J24.6 | Not built | Met | v0.4.0 is in production (owner); the document already marks E12.10 Met. |
| J27.10 | Partial | Not built | Same as E7.14. |

Close calls I left as the PO had them, with a note in the row: E5.5 (Met if "reload" means a content reload; a browser refresh loses unpublished mapping edits), E2.9 (compound: the draft half is Met), E1.12 (unverified rather than broken).

### 1.4 Verdict per epic goal

| Epic | Goal verdict | Why |
|---|---|---|
| E1 Growth map and readiness | Partly met | One page, nine domains, readiness and next steps work for the business line. Targets are one constant for every stage and line, the road is a fixed window, lens audiences never reach the map, and hours are not dated. |
| E2 Library and discovery | Partly met | Finding and understanding learnings works. Colleagues' ratings and notes, removing an item from the path and launching it in its provider do not exist. |
| E3 Completion, evidence and acceptance | Partly met | Acceptance is enforced and durable in the database. There is no evidence, no send-back, no record of who accepted when, and readiness counts submissions before acceptance. |
| E4 Counselling and team insight | Partly met | Roster, heat map, badge and read-only View as work. No approvals queue, no last activity, no shared profile data, no conversation record. |
| E5 Curriculum mapping per audience | Partly met | The admin side works and is enforced per line. Four of five lenses reach nobody, reach and signals are constants, and there is no change log or deadline per mapping. |
| E6 Catalogue administration | Partly met | One clean, line-scoped catalogue with lifecycle and shared-learning guards. No deadlines, owners, review dates or real program connections. |
| E7 Knowledge library, RAG and logic engine | Not met | Curation works, but assistants do not answer from real retrieval: ranking is browser keyword matching with a synthetic similarity, and there is no ingestion, logic engine or theory import. |
| E8 Create & share | Not met | Not built. |
| E9 Podcasts, reels and micro-learning | Not met | Covers only; players are parked on a branch. |
| E10 Avatar practice | Not met | Characters are presented; nobody can practise. |
| E11 Profile | Partly met | Ambitions and interests are stored. Evaluations and personality results have no data, ambitions can only be added through the chat, and the privacy promise is not enforced. |
| E12 Accounts, roles and governance | Partly met | Met for a closed pilot: closed sign-up, password rule, role scoping in RLS and `manage-users`, last-admin protection, v0.4.0 live. No audit log, leaked-password protection, export or retention. |
| E13 Server-side AI assistants | Not met | Fallbacks and output validation work; there is no proxy, so outside Claude Design every assistant is scripted. |
| E14 Analytics and reporting | Not met | Only per-person and per-counsellor figures. |
| E15 Notifications and reminders | Not met | Only in-app toasts. |
| E16 Release readiness and robustness | Partly met | The four crash classes are fixed and late loads are handled. Deadlines are free text with two parsers, one failed load is masked as empty data, and RLS coverage has holes. |

### 1.5 Owner answers of 1 Nov 2026 that change how rows read

The owner answered the product document's seventeen open questions after it was written. The statuses above verify the document as written; these answers turn some rows into known defects against a decision:

| Answer | Rows affected | Effect today |
|---|---|---|
| Q1: "Needs review" learnings are hidden from learners like drafts | E2.9, E6.3 | Policy `learnings: read` shows `review` items to every signed-in user (L14 and L19 are `review` in the seed). Now a defect. |
| Q5: readiness counts accepted hours only | E1.3, MAP-24, `memberSummary()` | `progressHours()` and `memberSummary()` count submitted hours in full. Now a defect, also in My team. |
| Q7: a General Admin can also accept; evidence depends on the format | E3.3, E3.6 | `private.can_accept()` excludes General Admins (they manage nobody). |
| Q8: the counsellor sees the formal learning track, not ambitions or personality | E11.8, J08.7, J16.2 | RLS gives the counsellor ambitions and interests. J16.2 (Met) describes behaviour the owner does not want. |
| Q14: Domain Admins see signals for their own line | E5.6, CUR-19 | None of the seeded signals is on a business-line audience, so a Domain Admin sees none. |
| Q2, Q3, Q17 | E6.9, E9.4, E8.3 | Confirm current behaviour or the plan; no change. |

## 2. Epic acceptance criteria

Bold in the "Mine" column marks a disagreement with the product owner (PO).

### E1 Personal growth map and readiness

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E1.1 | The map shows nine domains with one dot per learning, filled by state and outlined by obligation | Met | Met | `Logic.constellation()` (fill `FILL[state]`, stroke and dash by obligation); MAP-01, MAP-03 |  |
| E1.2 | Each domain shows the level reached against the next-stage target for the person's stage and line | Partial | Partial | `TARGET` (`src/data.ts`) is one array of nine levels, read by hubs, radar, zoom and detail ladder; MAP-02, MAP-21 | No stage or line dimension anywhere in code or schema. |
| E1.3 | Readiness counts hours on mandatory and advised items up to the next stage; the person's own choices do not count | Met | Met | `Logic.readiness()`, `progressHours()`; MAP-24 | Submitted hours count before acceptance (Q5). A learner can set `submitted` on any learning through `save_learning`, because `private.guard_learning_update()` only blocks the accepted flip; readiness can therefore be raised without anyone accepting. |
| E1.4 | Constellation, radar and road views, with gaps on the radar and a rolling four-quarter road | Partial | Partial | `Logic.road()` hard-codes `['Q4 2026','Q1 2027','Q2 2027','Q3 2027']`; `dueQuarter()` clamps to 0..3; undated items spread with `free++ % 4`; MAP-07..14, EDGE-02 |  |
| E1.5 | Domain zoom with level rings, next step and pulling clouds | Met | Met | `Logic.zoomVals()`; MAP-19..23 |  |
| E1.6 | Clouds from evaluations, personality profiles and ambitions pull learnings onto the map | Partial | Partial | `Logic.clouds()`: `PROJECTS` and `TESTS` are empty arrays (`src/data.ts`); ambitions and interests come from the subject; MAP-15..17 |  |
| E1.7 | "Next up" lists four items, mandatory first, work in progress ahead | Met | Met | `renderVals()` `nextUp` (mandatory first, in progress next, `slice(0, 4)`); MAP-26 | Not ordered by due date. |
| E1.8 | Hours and CPD for the current year | Partial | Partial | `hoursYear` sums `progressHours()` over all items with no date; `hoursChip` appends the literal "of 80 h this year"; road `behind` says "since Jan 2026"; MAP-25 | `learner_learnings` has no completion date. |
| E1.9 | Only earned marks are shown | Met | Met | `renderVals()` `marks`; MAP-27 |  |
| E1.10 | All seven stages work; Partner is the top of the path | Met | Met | `STAGES`; `20261101092543_director_partner_stages.sql`; `Logic.atTop()`; STG-01..04 |  |
| E1.11 | Learnings mapped to the industry, technology, ambition and profile audiences a person belongs to appear on their map and in readiness | Gap | Gap | `Logic.mapping()` reads `state.maps[this.bl()]` only; no membership table in any migration |  |
| E1.12 | Usable at narrow widths and with the keyboard only | Partial | Partial | NAV-15, MAP-29 (manual, not run) | Unverified rather than known broken. |

### E2 Library and discovery

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E2.1 | Search matches title, source and domain, ignoring case | Met | Met | `renderVals()` `libItems` (title, source, domain label, lower case); LIB-01 |  |
| E2.2 | Filters by obligation, level, format tile and domain combine, with an empty state and "clear all" | Met | Met | LIB-02..07 |  |
| E2.3 | Cards show a cover by format, status, effort and the due date of mandatory items | Met | Met | `Logic.item()` `hasDue`, `dueLabel`; `cover()`; LIB-08, LIB-12 | "Due soon" colour is keyed to the literal `'30 Nov 2026'` (`item()` `dueSoon`). |
| E2.4 | Every learning says why it is listed (path, obligation or cloud evidence) | Met | Met | `Logic.item()` `why`; `det.why` with cloud evidence; LIB-03, LIB-10, DET-08 |  |
| E2.5 | The detail shows level ladder, outcomes, paths and facts | Met | Met | `det.ladder`, `outcomes`, `paths`, `kv`; DET-01, DET-02, DET-05 | The CPD fact reads "N · ACCA, ITAA" for every learning with CPD; the bodies are a literal, not data. |
| E2.6 | Ratings and colleague notes are stored and shown to others | Partial | **Gap** | `saveNote` only closes the form and toasts "Note posted · visible to colleagues on this learning"; `det.rating` is the literal "No ratings or notes yet"; no table; DET-03, DET-04 | Nothing of "stored and shown" exists, and the toast claims the opposite. Not Partial. |
| E2.7 | A learner adds a learning to their path and can take it off again | Partial | Partial | `Logic.addToPath()` saves `chosen: true`; nothing in `src/model.ts` saves `chosen: false`; DET-14, MAP-05 |  |
| E2.8 | A learning can be launched in its provider (course link, LMS deep link) | Gap | Gap | `public.learnings` (`20261101141745_content_tables.sql`) has no link column |  |
| E2.9 | Drafts are invisible to learners; the owner decides on "Needs review" | Partial | Partial | Policy `learnings: read` (`status <> 'draft' or can_edit_content`); rls.sql "Learner sees no drafts", "Learner sees no mapping to a draft" | Compound: the draft half is Met; the "Needs review" half is an owner decision (Q1), not a build item. |

### E3 Learning completion, evidence and acceptance

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E3.1 | A learner logs effort; when all hours are logged the item is submitted for acceptance | Met | Met | `Logic.logHours()`; DET-11, DET-12 | Logging the last hour of an open item also submits it, although the detail says "Open items need no approval". |
| E3.2 | A learner asks for approval of an item in progress | Met | Met | `renderVals()` `askApprove` (only `in-progress`); DET-15 |  |
| E3.3 | Only the counsellor, a Domain Admin of the person's line or a System Admin accepts; a learner never accepts their own item | Met | Met | `private.can_accept()` (`20261101072648_learner_data.sql`), `private.guard_learning_update()` (`20261101080326_atomic_learning_and_manageable.sql`), `Logic.canAccept()`; rls.sql "Counsellor accepts submitted item", "Owner accepts own item"; DET-16, DET-17 | rls.sql has no case for acceptance by a Domain or System Admin. Admins may accept even when the person has a counsellor. A General Admin cannot accept (Q7). |
| E3.4 | Acceptance is durable: the learner cannot clear it or delete an accepted row | Met | Met | rls.sql "Owner reopens accepted item", "Owner inserts accepted item", "Owner deletes accepted item" |  |
| E3.5 | A second accept on an already accepted item is explained, not repeated | Met | Met | `acceptLearning()` filters `state = 'submitted'` and throws "no longer waiting"; DET-18 |  |
| E3.6 | Evidence (certificate, file, link or short reflection) is attached to a submission and visible to the accepter | Gap | Gap | No column, table or storage bucket in any migration | `askApprove` toast still says "they see your evidence". |
| E3.7 | The accepter can return a submission with feedback ("changes requested") | Gap | Gap | `private.guard_learning_update()` lets others make only the submitted → accepted change |  |
| E3.8 | Each acceptance records who accepted and when | Gap | Gap | `learner_learnings` has `updated_at` only |  |
| E3.9 | Completions from connected providers (LMS, Coursera, Microsoft Learn) arrive automatically | Gap | Gap | `syncNow` is a toast (ADM-03) | The detail's approval note claims "Completion is logged automatically by <source> where connected". |
| E3.10 | Viewing someone else never writes their progress | Met | Met | `Logic.persist()` / `readOnly()`; update policy on `learner_learnings`; VIEW-06; rls.sql "DA edits managed user progress" |  |

### E4 Counselling and team insight

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E4.1 | "My team" lists counsellees with grade, readiness, hours and overdue items | Met | Met | `memberSummary()` (`src/logic/team.ts`); TEAM-01..03 | A counsellee without a business line shows 0% here (`memberSummary` reads only `member.businessLine`) but a non-zero readiness on their own map, which falls back to a line (`Logic.bl()`). |
| E4.2 | Levels by domain as a heat map with overdue markers | Met | Met | TEAM-05 |  |
| E4.3 | The "Expected at next stage" row matches the firm's targets | Met | Met | `heatTargets` reads `TARGET`; TEAM-06 | One row for counsellees of every stage (see E1.2). |
| E4.4 | A counsellor opens a counsellee's app read-only | Met | Met | `TeamScreen` `onOpen` → `select(id)`; `useSubject` `readOnly`; TEAM-04 |  |
| E4.5 | The sidebar badges counsellees with overdue mandatory items | Met | Met | `App.tsx` `Sidebar` `teamOverdue`; TEAM-07 | `deadline()` counts a submitted but not yet accepted item as overdue. |
| E4.6 | The counsellor accepts a submitted learning from the counsellee's detail | Met | Met | DET-16, DET-17 |  |
| E4.7 | A queue lists every submission waiting for this counsellor | Gap | Gap | No query or screen lists submissions across counsellees |  |
| E4.8 | Last activity per counsellee (a column in the design's roster) | Gap | Gap | The design's roster has a "Last activity" column; only `updated_at` exists |  |
| E4.9 | The counsellor sees the personality results and evaluations the counsellee chose to share | Gap | Gap | `AppState.share` is screen state; `TESTS` and `PROJECTS` are empty |  |
| E4.10 | Conversation notes and agreed actions are recorded | Gap | Gap | No table, screen or plan item |  |
| E4.11 | A counsellor reads only their counsellees' data | Met | Met | `private.can_view_learner()`; read policies on `learner_learnings`, `ambitions`, `interests`, `learner_prefs`; rls.sql "Other line reads ambitions" | rls.sql has no case for a counsellor reading someone who is not their counsellee. |

### E5 Curriculum mapping per audience

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E5.1 | Lenses, audiences and coverage per stage, including Director and Partner | Met | Met | `Logic.curriculum()` `covRows`; CUR-01..04, STG-04 |  |
| E5.2 | Map, move, re-obligate and unmap learnings by drag and drop or from the dock | Met | Met | CUR-05..13 |  |
| E5.3 | Ambition and profile audiences only ever suggest (advised) | Met | Met | Constraint `curriculum_mappings_advised_lenses`; `applyOps()` (`canMand`); rls.sql "Mandatory for an ambition audience"; CUR-14 |  |
| E5.4 | A Domain Admin edits only their line's audience; other audiences are read-only with a note on who edits them | Met | Met | `Logic.canEditAud()`, `private.can_edit_audience()`; rls.sql "DA maps for another line", "DA maps for an industry audience"; CUR-16, CUR-17 |  |
| E5.5 | Pending changes publish once, with clear refusals, and survive a reload | Met | Met | `Logic.publish()` (`BUSY`), `mergeMaps()`; CUR-31..35 | Read as a content reload. `pending` lives in `AppState` (`initState()` sets `{}`), so a browser refresh drops unpublished edits; if the criterion means a page refresh it is Partial. |
| E5.6 | Signals come from real evaluations, staffing and shared profiles | Partial | **Gap** | `SIGNALS` constant (`src/data.ts`) with invented statistics and client quotes; `sigDone` is screen state | The criterion is the data source, and none exists or is planned. Not Partial. |
| E5.7 | The copilot proposes valid operations that an admin applies in one go, within their rights | Partial | Partial | `scriptedCp()`, `validOps()`; CUR-23..27 | Live only through `window.claude.complete` (E13). |
| E5.8 | The learner's eye shows the viewed person's full stack across all their audiences | Partial | Partial | `Logic.mePersona()` sets `ind`, `tec`, `amb`, `pro` to `null`; VIEW-11 |  |
| E5.9 | Lens audiences reach the people who belong to them | Gap | Gap | No membership data |  |
| E5.10 | Reach per audience and stage comes from real headcount | Gap | Gap | `AUDS` reach numbers and `STAGE_FR` are constants; `reachAt()` |  |
| E5.11 | Every published change is logged (who, when, what) and can be rolled back | Gap | Gap | `curriculum_mappings` keeps `updated_at` only; deletes leave no trace |  |
| E5.12 | A deadline can be set per mandatory mapping | Gap | Gap | `curriculum_mappings` has no date; `learnings.due` is free text |  |

### E6 Learning catalogue administration

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E6.1 | List with effort, paths and status; search and status filter | Met | Met | ADM-01, ADM-02 |  |
| E6.2 | Add and edit with validation; the line choices follow the role | Met | Met | `Logic.editableLines()`, `saveLearningForm()` validation; ADM-04..12 |  |
| E6.3 | Draft, needs-review and published lifecycle; drafts visible to admins only | Met | Met | `PUB_STATUS`; policy `learnings: read`; rls.sql "Learner sees no drafts"; ADM-13 |  |
| E6.4 | A Domain Admin cannot remove or draft a learning another line still maps | Met | Met | `private.guard_shared_learning()` (`20261101144515_guard_shared_learnings.sql`), `Logic.foreignAudiences()`; rls.sql "DA removes own learning mapped for Audit", "DA drafts own learning mapped for Audit"; ADM-15, ADM-19, ADM-20 |  |
| E6.5 | Removing a learning removes its mappings; double clicks save once | Met | Met | `curriculum_mappings.learning_id … on delete cascade`; `BUSY`; ADM-17, ADM-18, ADM-21 |  |
| E6.6 | Connected programs sync and import from their real catalogues | Partial | **Gap** | `PROGRAMS`, `IMPORT_RESULTS` constants; `syncNow` toast; `adminLead` literal "last sync 28 Oct 2026 07:10"; ADM-03, ADM-10 | Nothing connects to a real catalogue and no plan item exists. Not Partial. |
| E6.7 | Admins set and change a deadline | Gap | Gap | `LearnForm` has no deadline; `saveLearningForm()` sends `due: old ? old[8] : ''`; ADM-14 |  |
| E6.8 | Each learning has an owner and a review date, and stale items are flagged | Gap | Gap | `learnings` has `created_by` and `updated_at` only |  |
| E6.9 | A Domain Admin may map another line's published learning into their line | Partial | **Met** | `private.can_edit_audience()` checks the audience only; the mapping palette lists every visible learning (`curriculum()` `palette`) | The behaviour the criterion describes works today. Whether to keep it is owner decision Q2; that does not make it Partial. |

### E7 Knowledge library, RAG and logic engine

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E7.1 | Bundle list with topics, tags, search and sort | Met | Met | KB-02..08 |  |
| E7.2 | Bundles are stored per line; a Domain Admin edits only their own; firm-wide ones are for General and System Admins | Met | Met | `knowledge_bundles` policies (`private.can_edit_content()`); rls.sql "DA edits own-line bundle", "DA edits other-line bundle", "DA edits firm-wide bundle", "GA edits any bundle"; KB-40..43 |  |
| E7.3 | Client and licensed sources are never retrieved | Met | Met | `retrieve()` skips `excluded(src)` (`src/logic/okf.ts`); KB-19, KB-22, KB-39 | Enforced in the browser only. Must be re-enforced in the database when E7.8/E7.9 land. |
| E7.4 | RAG models: create, duplicate, set default, delete (never the last) | Met | Met | KB-23..25 |  |
| E7.5 | OKF v0.2 files: browse, validate, download as tar, import | Met | Met | KB-26..32 (KB-29 manual) |  |
| E7.6 | Test retrieval returns ranked passages and a cited answer | Partial | Partial | `rankHits()` scores word overlap; the shown similarity `disp` is a formula, not a vector score; embedding, chunking, overlap and re-rank settings are never read; KB-33..38 | The panel does not say the ranking is simulated. |
| E7.7 | An empty Knowledge library renders | Met | Met | KB-12 |  |
| E7.8 | Sources are ingested: chunked, embedded with Multilingual E5 large on an EU host, stored in pgvector with their sensitivity | Not built | Not built | Roadmap §4 | "Re-index" is a `setTimeout` (KB-16); a new source gets `20 + Math.floor(Math.random() * 140)` passages (`kbVals.ts`). |
| E7.9 | Hybrid retrieval (vector plus full text) runs in the database | Not built | Not built | Roadmap §4 |  |
| E7.10 | RAG architectures (OKF graph, knowledge graph, query rewriting, metadata filters, agentic, logic-driven) fused by reciprocal rank fusion | Not built | Not built | Roadmap §5 |  |
| E7.11 | IDP-Z3 runs Verify or Infer per RAG model through `kb-ask`; Lean 4 shows "not connected" | Not built | Not built | Roadmap §5 |  |
| E7.12 | Formal theories are imported from Intelli-Core with versions, diff, migrate and roll back | Not built | Not built | Roadmap §5 |  |
| E7.13 | An evaluation set per bundle compares RAG models | Not built | Not built | Roadmap §5 |  |
| E7.14 | Two admins editing one bundle do not silently overwrite each other | Partial | **Not built** | `saveBundleSoon()` / `inOrder()` in `contentStore.ts`: last writer wins, no version check; Roadmap §6 | Nothing of the criterion exists; by the document's own definitions this is Not built, not Partial. |

### E8 Create & share with peer review

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E8.1 | A creator drafts content of five types with a title of at most 60 characters, one takeaway, domain, level and an audience stage from all seven | Not built | Not built | No `contributions` table or screen on `main`; v3-remaining Task 6 |  |
| E8.2 | Automatic checks block client names and over-long titles | Not built | Not built | v3-remaining Task 6 |  |
| E8.3 | Submitting assigns two peers (never the author or the author's counsellor), the domain expert, then the learning team | Not built | Not built | v3-remaining Task 5 |  |
| E8.4 | Reviewers approve only when all four rubric items hold, or request changes; the author resubmits | Not built | Not built | v3-remaining Tasks 5–6 |  |
| E8.5 | "Draft with AI" outlines from the chosen bundles and cites every source | Not built | Not built | Roadmap §3 |  |
| E8.6 | Media files (video, audio, transcript, captions) are uploaded and stored safely | Gap | Gap | No storage bucket in any migration or plan |  |
| E8.7 | A published contribution becomes a catalogue learning that admins can map | Gap | Gap | v3-remaining Task 5 creates `contributions` but no hand-over into `learnings` |  |
| E8.8 | Authors see views, ratings, saves and audiences mapped | Gap | Gap | No usage events, no stored ratings |  |
| E8.9 | Authors and reviewers get recognition (CPD credit, profile badge) | Gap | Gap | Not in design or plans |  |

### E9 Podcasts, reels and micro-learning

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E9.1 | Library covers and format tiles per format | Met | Met | `src/logic/covers.ts` `cover()`, `formatTiles()`; LIB-05, LIB-08 |  |
| E9.2 | Podcast player with chapters, seek and speed | Not built | Not built | Parked on `feature/design-v3-b` |  |
| E9.3 | Reels strip and viewer with a check-yourself question | Not built | Not built | Parked on `feature/design-v3-b` |  |
| E9.4 | A correct reel answer completes the reel without a counsellor; every other format still needs one | Not built | Not built | v3-remaining Task 3; no migration on `main` |  |
| E9.5 | The player stops when the learning or person changes; in View as it plays but saves nothing | Not built | Not built | v3-remaining Task 3 |  |
| E9.6 | Media items L42–L48 and `MEDIA` live in the database | Not built | Not built | Roadmap §2 |  |
| E9.7 | Captions and transcripts for every audio and video item | Gap | Gap | In no plan |  |

### E10 Avatar practice

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E10.1 | Avatar learnings introduce the character, role and skills | Met | Met | `AVATARS`, `det.av`; LIB-09, DET-09 |  |
| E10.2 | "Start a session" opens a voice or text role-play | Gap | Gap | `det.av.start` is a toast |  |
| E10.3 | Runs are scored per skill and stored privately; reaching the threshold completes the learning | Gap | Gap | `AVATARS[*].attempts` is `[]` |  |
| E10.4 | The learner shares their best run (scores and transcript) with their counsellor | Gap | Gap | `det.av.share` is a toast |  |
| E10.5 | Characters are role-play content, never fictional colleagues | Met | Met | Owner decision (v3-remaining, Global Constraints) keeps the `AVATARS` role-play characters; `noPersona.test.ts` | The test only bans three names; the L39 character is a fictional junior analyst, which is role-play content by the owner's rule. |

### E11 Profile: ambitions, interests, evaluations and personality profiles

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E11.1 | Ambitions and interests are listed with horizon, source and domains, and can be removed | Met | Met | PRO-01, PRO-02 |  |
| E11.2 | "Talk it through" proposes an ambition or interests that the person saves or drops | Partial | Partial | PRO-09..16 | Scripted outside Claude Design. |
| E11.3 | The person adds an ambition or interest directly, without the chat | Gap | Gap | `addAmbition()` / `addInterest()` are called only from `saveProposal()` |  |
| E11.4 | Avatar initials, colour and photo | Partial | Partial | `learner_prefs` initials and colour; photo in `localStorage` (`photoKey()`); PRO-03..08 |  |
| E11.5 | Projects and evaluations sync from staffing and the performance tool and feed the projects cloud | Gap | Gap | `PROJECTS = []`; PRJ-03 manual |  |
| E11.6 | "Request an evaluation" reaches the evaluator | Gap | Gap | `requestEval` toast; PRJ-01 |  |
| E11.7 | Personality results are added and their visibility (only me or counsellor) is stored | Gap | Gap | `addTest` toast; `AppState.share`; PRO-18 |  |
| E11.8 | What the person keeps private is not readable by their counsellor | Partial | **Gap** | `profLead` says "You decide what your counsellor sees"; `ambitions: read` and `interests: read` use `private.can_view_learner()`, which includes the counsellor; no visibility column | No control exists at all. Not Partial; the copy is wrong today. |

### E12 Accounts, roles and governance

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E12.1 | Sign-up is closed; admins create accounts with a temporary password the user must replace | Met | Met | `supabase/config.toml` `[auth] enable_signup = false`; `manage-users` `create` sets `must_change_password`; AUTH-07..13, USR-13..16 |  |
| E12.2 | Passwords need 12 characters with lower case, upper case and a digit | Met | Met | `PASSWORD_RULE` in `src/lib/supabase.ts` and `manage-users`; `config.toml` `minimum_password_length = 12`, `password_requirements`; AUTH-08, AUTH-20 |  |
| E12.3 | Only a System Admin grants or revokes roles; the last System Admin cannot be removed | Met | Met | Policies `user_roles: system admins grant/revoke`; trigger `user_roles_keep_one_system_admin`; rls.sql "DA grants domain admin", "GA grants a role", "Delete last system admin"; USR-04, USR-05 |  |
| E12.4 | A Domain Admin manages only people of their lines, never a System or General Admin or another line's Domain Admin | Met | Met | `private.can_manage_user()` (latest in `20261101141745_content_tables.sql`); `manage-users` `target()`; rls.sql "DA cannot see system admin", "DA update Audit admin", "DA manageable: General Admin excluded"; USR-06, USR-09, USR-16 |  |
| E12.5 | A General Admin edits all content and manages no users | Met | Met | `private.can_edit_content()`, `can_edit_audience()`; rls.sql "GA maps for every line and audience", "GA manages no users"; NAV-04 |  |
| E12.6 | Stage and counsellor are set by admins; nobody but a System Admin changes their own | Met | Met | `private.guard_profile_assignments()`; rls.sql "DA sets own counsellor", "DA assigns counsellor outside their line"; USR-08, USR-09 |  |
| E12.7 | View as is read-only and remembered per tab | Met | Met | `useSubject` (`sessionStorage` key `mpm-subject`); VIEW-01..13 |  |
| E12.8 | Members never reach admin screens | Met | Met | `Logic.go()`, `isAdmin()`; NAV-01, NAV-02 |  |
| E12.9 | Leaked-password protection is on | Not built | Not built | `config.toml` has no leaked-password setting; Roadmap §6 |  |
| E12.10 | v0.4.0 is in production and smoke-tested per role | Met | Met | Owner's statement (1 Nov 2026) and commit `92dd8a1`; `package.json` version 0.4.0 | Not verifiable from code; accepted on the owner's word. |
| E12.11 | Role, line, stage and counsellor changes are logged with who and when | Gap | Gap | `user_roles` has `created_by`, `created_at`; revocations and profile changes leave no trace |  |
| E12.12 | Single sign-on with the firm's identity provider; line and stage provisioned from HR | Gap | Gap | Not in plans |  |
| E12.13 | A person can export their learning record; deletion follows a retention policy | Gap | Gap | `on delete cascade` from `profiles`; no export |  |

### E13 Server-side AI assistants

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E13.1 | An edge function proxies the Claude API; the key is a function secret | Not built | Not built | Roadmap §4 |  |
| E13.2 | Every assistant falls back to a scripted reply when the model fails | Met | Met | `Logic.send()`, `askCp()`, `readAs()`, `kbVals` test answer; PRO-14, CUR-27, KB-37 |  |
| E13.3 | Model output is validated before it changes anything (known domains, at most five operations, ambitions never mandatory) | Met | Met | `send()` drops interests outside `DOMAINS`; `saveProposal()` filters ambition domains; `validOps()`; PRO-14, CUR-27 | The live copilot prompt asks for at most 4 operations; `validOps()` keeps 5. |
| E13.4 | The assistant sees only data the caller may see (it runs with the caller's token, not the service role) | Gap | Gap | Not specified in Roadmap §4 |  |
| E13.5 | Usage per user is limited and logged; prompts and data stay in the EU | Gap | Gap | Not specified |  |

### E14 Analytics and reporting

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E14.1 | Mandatory completion and overdue items per line, stage and audience | Gap | Gap | Only per counsellor (`memberSummary()`) |  |
| E14.2 | Readiness distribution per stage and line | Gap | Gap | Only per person |  |
| E14.3 | CPD units per person per professional body, exportable | Gap | Gap | `learnings.cpd` is one number with no body |  |
| E14.4 | Content use: starts, completions and ratings per learning and per contribution | Gap | Gap | No usage events; no ratings |  |
| E14.5 | Curriculum load per stage and audience | Partial | Partial | `covRows` per stage, `Logic.stack()` per person; CUR-04, CUR-28..30 |  |
| E14.6 | Time to competence (first start to accepted level per domain) | Gap | Gap | No dated state changes |  |
| E14.7 | Aggregates respect privacy (minimum group size, role scope) | Gap | Gap | Not designed |  |

### E15 Notifications and reminders

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E15.1 | Every action is confirmed in the app | Met | Met | `Logic.say()`; NAV-14 | Several toasts announce things that do not happen (see §5). |
| E15.2 | The counsellor (or the line's admins when there is none) is told when something is submitted | Gap | Gap | Nothing is sent |  |
| E15.3 | The learner is told when an item is accepted or returned | Gap | Gap | Nothing is sent |  |
| E15.4 | Reminders before a mandatory deadline | Gap | Gap | Nothing is sent |  |
| E15.5 | Reviewers are told when a contribution is assigned to them | Gap | Gap | v3-remaining Task 6 has a badge only |  |

### E16 Release readiness and robustness

| Id | Criterion | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| E16.1 | The app renders with an empty catalogue | Met | Met | `renderVals()` blank stand-in `d0`; EDGE-01 |  |
| E16.2 | A mandatory item with any deadline renders on the road | Met | Met | `dueQuarter()`; EDGE-02 |  |
| E16.3 | Removing a learning a signal names does not break the admin screens | Met | Met | `sigOpen` filters on `LEARN_BY[g.op.lid]`; CUR-36 |  |
| E16.4 | Deadlines are real dates, set per mapping and validated | Gap | Gap | `dueQuarter()` (regex, tolerant) and `deadline()` (exact tokens) parse differently; unreadable dates go to the first quarter on the road and are never overdue on My team |  |
| E16.5 | Late or overlapping loads never show the wrong person's data | Met | Met | `latestOnly()`; STORE-06, VIEW-12, TEAM-08, KB-38 |  |
| E16.6 | A failed load is explained and can be retried | Met | **Partial** | AUTH-19, STORE-02 for learner data and content; `useTeam` catches a failure as `members: []` (TEAM-08 asserts it) | A failed team load reads "Nobody has you as counsellor yet" with a zero badge: not explained, not retryable. |
| E16.7 | Every policy change has an RLS test | Met | **Partial** | `supabase/tests/rls.sql` (80 checks) covers most policies | No case for: interests or `learner_prefs` writes by another user; ambition delete by another user; bundle insert or delete by another line's Domain Admin; acceptance by a Domain or System Admin; a counsellor reading a non-counsellee; constraint `profiles_not_own_counsellor`. The script hard-codes the live System Admin's UUID, so it cannot run on a fresh project, and it was not run for this review. |

## 3. Journey steps

### J01 First sign-in and orientation

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J01.1 | Receives the temporary password from the admin | Met | Met | `Users.tsx` handover banner; `manageUsers({action:'create'})`; USR-10, USR-13 |  |
| J01.2 | Signs in; spaces around the email are ignored, wrong credentials are explained | Met | Met | AUTH-03, AUTH-04 |  |
| J01.3 | Must choose a password that meets the rule before anything else | Met | Met | `App.tsx` auth gate (`must_change_password`); AUTH-07..12 |  |
| J01.4 | Lands on the growth map with their name, stage → next stage and 0% readiness | Met | Met | AUTH-17, MAP-01 | `create` never sets a stage, so a joiner reads Analyst → Consultant until an admin sets one (STG-05). |
| J01.5 | Reads the sidebar card: stage, line, next stage, counsellor | Met | Met | `renderVals()` `who`; STG-08 |  |
| J01.6 | Gets a first-week checklist or guided tour of the map | Gap | Gap | Nothing in design, plans or code |  |

### J02 Complete a mandatory learning before its deadline

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J02.1 | Sees the mandatory item first in "Next up", with its due date | Met | Met | MAP-26, LIB-08 |  |
| J02.2 | Filters the library to Mandatory and reads for which line and stage | Met | Met | LIB-02 |  |
| J02.3 | Opens the detail: why, level ladder, facts, who approves | Met | Met | `det.approvalNote`; DET-01, DET-05, DET-07 |  |
| J02.4 | Launches the course in its provider | Gap | Gap | No link column (E2.8) |  |
| J02.5 | Logs hours as they go | Met | Met | DET-11 |  |
| J02.6 | The last hour submits it for acceptance | Met | Met | DET-12 |  |
| J02.7 | Attaches the certificate as evidence | Gap | Gap | E3.6 |  |
| J02.8 | Is reminded before the deadline if not yet done | Gap | Gap | E15.4 | The learner never sees "overdue" anywhere; only My team computes it. |
| J02.9 | Is told it was accepted; level and readiness rise | Partial | Partial | DET-17, MAP-24 | No notification (E15.3). |

### J03 Explore the library and add an open learning

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J03.1 | Searches by keyword | Met | Met | LIB-01 |  |
| J03.2 | Narrows by format tile, domain and level | Met | Met | LIB-04..06 |  |
| J03.3 | Reads why an open learning is listed | Met | Met | LIB-10 |  |
| J03.4 | Reads colleagues' ratings and notes, and leaves their own | Partial | **Gap** | DET-03, DET-04; see E2.6 | Nothing is read or stored; the toast says the note is visible to colleagues. |
| J03.5 | Adds it to their path; it shows with a green ring | Met | Met | DET-14, MAP-05 |  |
| J03.6 | Takes it off their path later | Gap | Gap | E2.7 |  |

### J04 Signed in without business line or stage (unhappy)

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J04.1 | Opens the app; it renders, treating them as an Analyst heading for Consultant | Met | Met | STG-05 |  |
| J04.2 | The map names the business line it shows instead | Met | Met | `noLineNote`; STG-06 |  |
| J04.3 | The sidebar card says "No business line yet" | Met | Met | STG-05 |  |
| J04.4 | Asks for the line and stage to be set | Gap | Gap | `toastHelp` only explains (PRO-19) |  |

### J05 No counsellor assigned (unhappy)

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J05.1 | The legend and states read "Awaiting counsellor" | Met | Met | MAP-28 |  |
| J05.2 | "Ask …" explains that no counsellor is assigned and that an admin assigns one | Met | Met | `toastHelp`; PRO-19 |  |
| J05.3 | Submits a learning | Met | Met | DET-12, DET-15 |  |
| J05.4 | A Domain Admin of their line or a System Admin can accept it | Met | Met | DET-16 |  |
| J05.5 | That admin learns something is waiting | Gap | Gap | E4.7, E15.2 |  |

### J06 Empty or failing data (unhappy)

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J06.1 | A newcomer sees zero readiness and hours, and no marks | Met | Met | MAP-01, MAP-27 |  |
| J06.2 | Profile, projects and team show empty states | Met | Met | PRO-01, PRJ-01, TEAM-02 |  |
| J06.3 | Learner data fails to load: the message, "Try again" and "Sign out" | Met | Met | AUTH-19 |  |
| J06.4 | With no learnings in the database the app still renders | Met | Met | EDGE-01 |  |
| J06.5 | Progress on a learning that no longer exists is ignored | Met | Met | EDGE-03 |  |

### J07 Close a gap before the next stage

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J07.1 | Opens the radar and reads the largest gaps | Met | Met | MAP-08, MAP-09 |  |
| J07.2 | Gaps are measured against the expectation for their own next stage and line | Partial | Partial | E1.2 |  |
| J07.3 | Zooms into the domain and reads the next step | Met | Met | MAP-19..22 |  |
| J07.4 | Plans the coming year on the road | Partial | Partial | E1.4 |  |
| J07.5 | Completes and gets the learning accepted | Met | Met | DET-11..17 |  |
| J07.6 | Sees readiness rise | Met | Met | MAP-24 |  |

### J08 Turn an ambition into a path

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J08.1 | Opens "Talk it through" on the profile | Met | Met | PRO-09, PRO-13 |  |
| J08.2 | The assistant proposes an ambition and interests | Partial | Partial | PRO-11, PRO-14 |  |
| J08.3 | Saves the proposal | Met | Met | PRO-15, PRO-16 |  |
| J08.4 | Adds an ambition directly, without the chat | Gap | Gap | E11.3 |  |
| J08.5 | The ambitions cloud pulls learnings onto the map, explained in the dock | Met | Met | MAP-16, MAP-17 |  |
| J08.6 | Learnings admins mapped to the matching ambition audience (`amb:*`) reach them | Gap | Gap | E5.9 |  |
| J08.7 | Decides whether the counsellor sees the ambition | Partial | **Gap** | E11.8 | No visibility choice exists, and RLS gives the counsellor every ambition. |

### J09 Act on a project evaluation

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J09.1 | The evaluation arrives from the performance tool | Gap | Gap | PRJ-03 |  |
| J09.2 | Reads dimensions, quote and advice | Partial | Partial | PRJ-02 (mocked data) |  |
| J09.3 | Adds an advised learning to the path | Partial | Partial | PRJ-02 (mocked data) |  |
| J09.4 | The projects cloud pulls related learnings onto the map | Partial | Partial | MAP-15 |  |
| J09.5 | Requests an evaluation for a finished engagement | Gap | Gap | PRJ-01 |  |

### J10 Practise a client conversation with an avatar

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J10.1 | Finds the learning ("Practise with …") | Met | Met | LIB-09 |  |
| J10.2 | Reads the character, skills and past runs | Met | Met | DET-09 |  |
| J10.3 | Starts a voice or text session | Gap | Gap | E10.2 |  |
| J10.4 | Gets scores per skill; the best run completes the learning | Gap | Gap | E10.3 |  |
| J10.5 | Shares the best run with the counsellor | Gap | Gap | E10.4 |  |

### J11 Add and share a personality profile

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J11.1 | Adds the test result | Gap | Gap | PRO-18 |  |
| J11.2 | Chooses "Only me" or the counsellor | Partial | Partial | PRO-17 (mocked data) | Unreachable in production until J11.1 exists. |
| J11.3 | Opens a learning the profile suggests | Partial | Partial | PRO-17 (mocked data) |  |
| J11.4 | The personality cloud and profile audiences shape the map | Gap | Gap | MAP-15; E5.9 |  |

### J12 Stay CPD-compliant for a professional body

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J12.1 | Reads CPD units earned on the map | Partial | Partial | MAP-25 | All time, no body; the detail claims "ACCA, ITAA" for every CPD item. |
| J12.2 | Finds learnings that carry CPD for their body | Gap | Gap | No CPD filter or body column |  |
| J12.3 | Records CPD from an external event (conference, webinar) | Gap | Gap | Only catalogue learnings can be logged |  |
| J12.4 | Exports a CPD statement for the year | Gap | Gap | E14.3 |  |

### J13 Partner at the top of the path

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J13.1 | Copy reads "Partner · top of the career path", never "Partner → Partner" | Met | Met | STG-03 |  |
| J13.2 | Readiness and gaps use the Partner-stage mappings and expectations | Partial | Partial | STG-04; E1.2 |  |
| J13.3 | Chooses learning for themselves | Met | Met | DET-14 |  |
| J13.4 | Shares expertise as a contribution | Not built | Not built | Roadmap §3 |  |

### J14 Weekly team check

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J14.1 | Sees the badge with the number of counsellees who have overdue mandatory items | Met | Met | TEAM-07 |  |
| J14.2 | Reads the roster: grade, readiness, hours, overdue or on track | Met | Met | TEAM-01..03 |  |
| J14.3 | Switches to levels by domain | Met | Met | TEAM-05 |  |
| J14.4 | Compares with "Expected at next stage" | Met | Met | TEAM-06 | One target row for every stage (E1.2). |
| J14.5 | Sees each counsellee's last activity | Gap | Gap | E4.8 |  |
| J14.6 | Opens a counsellee read-only | Met | Met | TEAM-04 |  |
| J14.7 | Nudges a counsellee about an overdue item | Gap | Gap | Nothing is sent |  |

### J15 Accept a completed learning

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J15.1 | Learns that a submission is waiting | Gap | Gap | E4.7, E15.2 |  |
| J15.2 | Opens the counsellee | Met | Met | TEAM-04, VIEW-03 |  |
| J15.3 | Finds the submitted learning ("Awaiting <first name>") | Met | Met | DET-19 |  |
| J15.4 | Reviews the evidence | Gap | Gap | E3.6 |  |
| J15.5 | Accepts; the toast names the counsellee | Met | Met | DET-16, DET-17 |  |
| J15.6 | Returns it with feedback instead | Gap | Gap | E3.7 |  |
| J15.7 | A double click or a second accepter is handled | Met | Met | DET-18 |  |

### J16 Prepare a development conversation

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J16.1 | Reads the counsellee's map, radar and readiness | Met | Met | VIEW-04, MAP-08 |  |
| J16.2 | Reads the counsellee's ambitions and interests | Met | Met | VIEW-04; `private.can_view_learner()` | Met only because E11.8 is not enforced; resolving Q8 may turn this step conditional. |
| J16.3 | Reads evaluations and personality results the counsellee shared | Gap | Gap | E4.9 |  |
| J16.4 | Records notes and agreed actions | Gap | Gap | E4.10 |  |

### J17 Read-only View as: attempts to change a counsellee's data (unhappy)

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J17.1 | The sidebar says "Viewing · read-only" and offers "Back to me" | Met | Met | VIEW-05 |  |
| J17.2 | Logging hours, adding to the path or asking approval saves nothing and says so | Met | Met | VIEW-06 |  |
| J17.3 | Removing ambitions, changing the avatar, chatting or saving a proposal does nothing | Met | Met | VIEW-07..09 |  |
| J17.4 | A direct API write to the counsellee's rows is refused | Met | Met | VIEW-13; rls.sql "Owner writes someone else's progress", "DA edits managed user progress" |  |
| J17.5 | The learner's eye shows only the viewed person's reading | Met | Met | VIEW-11 |  |
| J17.6 | A counsellor with nobody assigned sees "Nobody has you as counsellor yet" | Met | Met | TEAM-01, TEAM-02 | The same text shows after a failed load (E16.6). |

### J18 Onboard a joiner to the line

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J18.1 | Creates the account in their own line, without role choices | Met | Met | USR-16 |  |
| J18.2 | Hands over the temporary password once | Met | Met | USR-10, USR-13 |  |
| J18.3 | Sets the career stage | Met | Met | USR-08 |  |
| J18.4 | Assigns a counsellor they manage | Met | Met | USR-08; `private.guard_profile_assignments()` | A counsellor from another line needs a System Admin. |
| J18.5 | The joiner sees the line's mandatory path | Met | Met | STG-07 |  |
| J18.6 | Places the joiner in industry and technology audiences | Gap | Gap | E5.9 |  |
| J18.7 | Provisions joiners in bulk from HR | Gap | Gap | E12.12 |  |

### J19 Maintain the line's curriculum

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J19.1 | Opens Curriculum mapping on their own line | Met | Met | CUR-01 |  |
| J19.2 | Reads coverage, hours, mandatory items and reach per stage | Partial | Partial | CUR-04; E5.10 |  |
| J19.3 | Maps, moves and re-obligates learnings | Met | Met | CUR-05..13 |  |
| J19.4 | Checks the load on one real person with the learner's eye | Partial | Partial | CUR-28..30; E5.8 |  |
| J19.5 | Publishes the pending changes | Met | Met | CUR-31..34 |  |
| J19.6 | Sets a deadline on a new mandatory item | Gap | Gap | E5.12, E6.7 |  |
| J19.7 | Sees who changed what, and rolls back a mistake | Gap | Gap | E5.11 |  |

### J20 Add a learning to the line's catalogue

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J20.1 | Opens "+ Add learning"; the line defaults to their own | Met | Met | ADM-04, ADM-05 |  |
| J20.2 | Imports title, source, hours and domain from a connected program | Partial | Partial | ADM-10 (seeded `IMPORT_RESULTS`) |  |
| J20.3 | Is told what is missing or invalid | Met | Met | ADM-11 |  |
| J20.4 | Saves as draft, marks for review or publishes | Met | Met | ADM-12, ADM-13 |  |
| J20.5 | Adds a launch link and a deadline | Gap | Gap | E2.8, E6.7 |  |

### J21 Reach beyond the line: refused permissions (unhappy)

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J21.1 | User management lists only people they may manage; roles are tags, not chips | Met | Met | USR-01, USR-06 |  |
| J21.2 | A System Admin row has no controls; their own stage and counsellor are read-only | Met | Met | USR-09 |  |
| J21.3 | Editing another line's or a firm-wide learning is refused, naming who edits it | Met | Met | ADM-08 |  |
| J21.4 | Removing or drafting a learning another line maps is refused | Met | Met | ADM-15, ADM-19 |  |
| J21.5 | Another line's audience is read-only, with a note naming who edits it | Met | Met | CUR-16, CUR-17 |  |
| J21.6 | A copilot proposal outside the line is refused when applied | Met | Met | CUR-26 |  |
| J21.7 | Another line's bundle is read-only, but retrieval can still be tested | Met | Met | KB-40, KB-42 |  |
| J21.8 | A direct API call to manage a System Admin or another line's Domain Admin is refused | Met | Met | `manage-users` `target()`; rls.sql "DA update Audit admin"; USR-18 (manual) |  |

### J22 Steer the firm curriculum with signals and the copilot

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J22.1 | Sees User management hidden; content screens open | Met | Met | NAV-04 |  |
| J22.2 | Reads every open signal with its change, impact and evidence | Partial | Partial | CUR-19, CUR-20 (seeded `SIGNALS`) | The evidence text (counts, client quotes) is invented and not labelled as an example. |
| J22.3 | Applies or dismisses a signal | Met | Met | CUR-21, CUR-22 | Dismissals are screen state and reappear after a reload. |
| J22.4 | Asks the copilot to find duplicates or draft a path | Partial | Partial | CUR-23 |  |
| J22.5 | Applies the copilot's proposal in one go | Met | Met | CUR-24, CUR-27 |  |
| J22.6 | Edits every lens, including industry, technology, ambition and profile | Met | Met | CUR-18 |  |
| J22.7 | The lens changes reach the learners in those audiences | Gap | Gap | E5.9 |  |
| J22.8 | Publishes | Met | Met | CUR-31 |  |

### J23 Govern the firm-wide catalogue

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J23.1 | Publishes a firm-wide learning | Met | Met | ADM-12 |  |
| J23.2 | Finds learning nobody uses | Gap | Gap | E14.4 |  |
| J23.3 | Finds items past their review date | Gap | Gap | E6.8 |  |
| J23.4 | Removes a learning every line maps | Met | Met | ADM-20 |  |
| J23.5 | The admin screens survive the removal of a learning a signal names | Met | Met | CUR-36 |  |

### J24 Govern roles and release safely

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J24.1 | Grants or revokes System, General and Domain Admin roles | Met | Met | USR-04 |  |
| J24.2 | Cannot remove the last System Admin | Met | Met | USR-05 |  |
| J24.3 | Views any person read-only to support them | Met | Met | VIEW-03, VIEW-04 |  |
| J24.4 | Reads who changed which role, line, stage or counsellor, and when | Gap | Gap | E12.11 |  |
| J24.5 | Turns on leaked-password protection | Not built | Not built | Roadmap §6 |  |
| J24.6 | Ships v0.4.0 and smoke-tests each role | Not built | **Met** | Owner's statement; commit `92dd8a1` (E12.10) | The document marks E12.10 Met and this step Not built; the step is done. |
| J24.7 | Names the expert for each domain, for review routing | Not built | Not built | v3-remaining Task 5 |  |

### J25 Fresh database and broken references (unhappy)

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J25.1 | Opens the app with no learnings | Met | Met | EDGE-01 |  |
| J25.2 | Opens the Knowledge library with no bundles | Met | Met | KB-12 |  |
| J25.3 | Opens mapping with a mapping to a learning they cannot see | Met | Met | CUR-35 |  |
| J25.4 | Content loading fails: message and retry | Met | Met | STORE-02 |  |

### J26 Create and submit a contribution

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J26.1 | Opens Create & share | Not built | Not built | Roadmap §3 |  |
| J26.2 | Picks a type and fills title, domain, level, audience stage and takeaway | Not built | Not built | v3-remaining Task 6 |  |
| J26.3 | Chooses bundles and lets AI draft an outline with citations | Not built | Not built | Roadmap §3, §4 |  |
| J26.4 | Uploads the video, audio or document | Gap | Gap | E8.6 |  |
| J26.5 | Passes the automatic checks (title length, client names) | Not built | Not built | v3-remaining Task 6 |  |
| J26.6 | Submits and sees who will review | Not built | Not built | v3-remaining Task 5 |  |
| J26.7 | Receives "changes requested", edits and resubmits | Not built | Not built | v3-remaining Tasks 5–6 |  |
| J26.8 | The published piece becomes a library learning that admins can map | Gap | Gap | E8.7 |  |
| J26.9 | Sees views, ratings, saves and audiences mapped | Gap | Gap | E8.8 |  |

### J27 Curate a bundle and tune retrieval

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J27.1 | Creates a bundle or imports OKF files | Met | Met | KB-30..32 |  |
| J27.2 | Adds sources with their sensitivity | Met | Met | KB-21, KB-22 |  |
| J27.3 | Sources are chunked, embedded and indexed for real | Not built | Not built | Roadmap §4; KB-16 |  |
| J27.4 | Sets topics, tags and access | Met | Met | KB-13..18 |  |
| J27.5 | Validates the OKF files and downloads the bundle | Met | Met | KB-27, KB-28 | Staleness is a stored `status` plus a literal `'3 Mar'` date check in `kbVals.ts`, not computed from the freshness window. |
| J27.6 | Configures a RAG model | Partial | Partial | KB-23..25; E7.6 |  |
| J27.7 | Tests retrieval and reads the cited answer | Partial | Partial | KB-33..38 |  |
| J27.8 | Compares models on an evaluation set | Not built | Not built | Roadmap §5 |  |
| J27.9 | Imports a formal theory from Intelli-Core and runs IDP-Z3 Verify or Infer | Not built | Not built | Roadmap §5 |  |
| J27.10 | Sees another admin's change before overwriting it | Partial | **Not built** | `saveBundleSoon()`; Roadmap §6 | Same as E7.14. |

### J28 Review a colleague's contribution

| Step | What happens | PO | Mine | Evidence | Note |
|---|---|---|---|---|---|
| J28.1 | Is told a review is waiting (badge, message) | Not built | Not built | v3-remaining Task 6 (badge); E15.5 |  |
| J28.2 | Opens the Review tab: takeaway, preview and automatic checks | Not built | Not built | v3-remaining Task 6 |  |
| J28.3 | Can approve only when all four rubric items hold | Not built | Not built | v3-remaining Task 6 |  |
| J28.4 | Requests changes with a time-stamped comment | Not built | Not built | v3-remaining Tasks 5–6 |  |
| J28.5 | The author's counsellor is never chosen as reviewer | Not built | Not built | v3-remaining Task 5 |  |
| J28.6 | Gets credit for the review | Gap | Gap | E8.9 |  |

## 4. Findings the product document does not mention

| # | Finding | Evidence | Affects |
|---|---|---|---|
| N1 | **Readiness can be raised without anyone accepting.** The owner branch of `private.guard_learning_update()` blocks only the accepted flip, so a learner can set `submitted` / 100% on any learning through `save_learning` (or by pressing "Log 1 hour" repeatedly), and readiness counts submitted hours in full. | `20261101080326_atomic_learning_and_manageable.sql`; `Logic.progressHours()`; `memberSummary()` | E1.3, E4.1, Q5 |
| N2 | **A failed team load looks like an empty team.** `useTeam` catches the error as `members: []`; My team then says "Nobody has you as counsellor yet" and the badge shows 0. | `src/lib/useTeam.ts`; TEAM-08 | E16.6, J14.1, J17.6 |
| N3 | **Counsellor and learner see different readiness for a person without a line.** `memberSummary()` uses only `member.businessLine` (0% without one); the person's own map falls back to a line through `Logic.bl()`. | `src/logic/team.ts`; `Logic.bl()` | E4.1 |
| N4 | **Admins accept even when the person has a counsellor.** `private.can_accept()` lets any managing admin accept at any time; the product document presents admins as the fallback "when there is no counsellor" (E3 personas). | `20261101072648_learner_data.sql` | E3.3 |
| N5 | **The learner never sees "overdue".** Only My team computes overdue (`deadline()`); the learner's map and library colour one literal date (`'30 Nov 2026'`) as "soon". | `Logic.item()` `dueSoon`; `src/logic/team.ts` | E1, E16.4 |
| N6 | **Copy promises behaviour that does not exist.** "Note posted · visible to colleagues on this learning" (`saveNote`); "they see your evidence and the hours you logged" (`askApprove`); "Completion is logged automatically by <source> where connected" and "Open items need no approval. Adding one tells <counsellor> what you are curious about" (`det.approvalNote`); "N · ACCA, ITAA" as the CPD fact of every item (`det.kv`); "Mandatory items need Learning Council sign-off before they publish" (`LENSES`); "You decide what your counsellor sees" (`profLead`); "6 connected programs" (`libLead`); "3 need attention · last sync 28 Oct 2026 07:10" (`adminLead`); "since Jan 2026" (`road()`). | `src/model.ts`, `src/data.ts` | E2.6, E3.6, E3.9, E11.8, E14.3 |
| N7 | **Invented figures are shown as if real, without a label.** Signal evidence ("23 of 41 … evaluations", client quotes); audience reach (`AUDS`, `STAGE_FR`); passage counts of a new source (`Math.random()` in `kbVals.ts`); the "similarity" of a retrieved passage (`rankHits()` formula); program sync times (`PROGRAMS`); bundle staleness (a stored `status` plus a literal `'3 Mar'` check). | `src/data.ts`, `src/kbVals.ts`, `src/logic/okf.ts` | E5.6, E5.10, E7.6, E7.8 |
| N8 | **"Needs review" learnings are visible to learners.** Owner answer Q1 says they must be hidden. | Policy `learnings: read` | E2.9 |
| N9 | **The live copilot prompt and its validator disagree**: the prompt asks for at most 4 operations, `validOps()` keeps 5. | `Logic.askCp()`, `validOps()` | E13.3 |
| N10 | **Signal dismissals do not persist**; a dismissed signal returns after a reload (`sigDone` is screen state). | `AppState.sigDone` | E5.6, J22.3 |
| N11 | **Two deadline parsers.** `dueQuarter()` accepts "Sept 2027" or "Jan. 2027"; `deadline()` needs exact three-letter months, so the same text can be on the road and never overdue. | `src/logic/learner.ts`, `src/logic/team.ts` | E16.4 |
| N12 | **Dead state.** `AppState.blState` is never set; `Logic.bl()` reads it first. Harmless, but misleading for maintainers. | `src/model.ts` | none |

## 5. Internal consistency of the product document

### 5.1 Contradictions and stale statements

| # | Where | Issue |
|---|---|---|
| C1 | §4 Totals and per-epic table | Epic totals say Met 61 / Not built 19 and E12 8 / 0 / 2 / 3; the tables give 62 / 18 and 9 / 0 / 1 / 3 since E12.10 became Met in `92dd8a1`. |
| C2 | J24.6, §6 backlog rank 1, header | J24.6 "Ships v0.4.0" is Not built while E12.10 is Met. Backlog rank 1 still says "Production still serves v0.3.0" and depends on "Owner's go to deploy". The header says "release v0.4.0 in the database". |
| C3 | §0 vs §4 | §0 says the catalogue was written against 511 tests; §4 says 514. The catalogue header still says 511; the suite has 514. |
| C4 | J04 trigger | "The admin created the account without a line": `manage-users` `create` requires a business line, so an admin cannot. A lineless profile comes only from the bootstrap System Admin or a System Admin clearing the line (only a System Admin passes `can_manage_line(null)`). A missing stage, by contrast, is the normal case: `create` never sets one. |
| C5 | E3 personas | "P5 and P7 (accept when there is no counsellor)": they can accept whether or not there is a counsellor (N4). |
| C6 | E7 KPI "Stale sources: Yes, per bundle" | Staleness is not computed from the freshness window; it is a stored status and a literal date (N7). |
| C7 | E2.6, E5.6, E6.6, E11.8, E7.14 | Marked Partial although nothing of the criterion is built, against the document's own status definitions (§1.3). |
| C8 | E9.2–E9.6 | "Not built" although the code exists on `feature/design-v3-b`. A "Parked" status, or a note in the status column, would be clearer. |
| C9 | J16.2 vs E11.8 | J16.2 counts as Met exactly the behaviour E11.8 calls a defect; the owner's Q8 answer settles it against J16.2. |
| C10 | Source documents | Roadmap §1 is unchecked and says the site serves v0.3.0. v3-remaining open decision 3 ("Knowledge bundles stay in memory") is superseded by `20261101141745_content_tables.sql`. Roadmap §3 needs §4 but comes before it. |

### 5.2 Criteria that are compound, ambiguous or not testable as written

| Id | Issue | Suggested rewrite |
|---|---|---|
| E2.9 | Half requirement, half open decision | "Drafts and Needs-review learnings are invisible to learners" (Q1 answered). |
| E6.9 | A decision phrased as a criterion | "A Domain Admin can map any published learning into their line's audience." |
| E12.10 | A release event, not a capability | Move to a release checklist. |
| E1.12 | Manual only, no measurable bar | "WCAG 2.1 AA on the growth map, library and detail at 360 px and with keyboard only, checked with an automated scanner." |
| E1.8 | "Current year" undefined (calendar or CPD year) | "Hours and CPD units accepted in the current calendar year." |
| E5.5 | "Survive a reload" ambiguous | "…survive a content reload; a browser refresh warns about unpublished changes." |
| E7.10 | Six architectures plus fusion in one criterion | One criterion per retriever, one for fusion. |
| E8.1 | Five fields, five types and a length rule in one row | Split type and field rules. |
| E12.13 | Export and retention are separate capabilities | Two criteria. |
| E13.5 | Rate limit and EU residency are unrelated | Two criteria. |
| E14.7 | No threshold named | "Groups smaller than N are not shown." |
| E15.1 | "Every action" untestable; toasts are feedback, not notifications | Move to a UI-feedback criterion outside E15. |

### 5.3 Duplicates and overlaps

| Same requirement | Rows |
|---|---|
| Lens audiences reach their members | E1.11, E5.9 (and steps J08.6, J11.4, J18.6, J22.7) |
| Deadlines as dates, per mapping | E5.12, E6.7, E16.4 (and J19.6, J20.5) |
| Approvals queue and submission messages | E4.7, E15.2 (J05.5 and J15.1 combine both) |
| Sharing personality and evaluations with the counsellor | E4.9, E11.7 |
| Ratings visible to others and to authors | E2.6, E8.8 |
| Next-stage target per stage | E1.2, J07.2, J13.2, J14.4 |
| Leaked-password protection | E12.9, J24.5 |

### 5.4 Screens and features named by journeys that do not exist

Expected for Gap and Not built rows, listed so that the design covers each one:

| Screen or feature | Steps | Designed in |
|---|---|---|
| Onboarding checklist | J01.6 | F7 |
| Notifications, approvals queue | J02.8, J04.4, J05.5, J14.7, J15.1, J26.7, J28.1 | F3, F6 |
| Launch link in the detail | J02.4, J20.5 | F7 |
| Avatar studio | J10.3–J10.5 | parked (owner, Q16) |
| Reports, CPD statement | J12.4, J23.2 | F9 |
| Audit log | J24.4 | F10 |
| Domain experts | J24.7 | F12 |
| Create & share (Mine, Review, New) | J13.4, J26.x, J28.x | F12 |
| Ingestion, evaluation sets, logic engine | J27.3, J27.8, J27.9 | F13, F14 |
| Bulk provisioning from HR | J18.7 | not now (owner, Q13) |

### 5.5 Epic attribution

J04.4 ("asks for the line and stage to be set") is filed under E15 but is a request to an admin (E12 with an E15 message). J05.2 is filed under E4 but is header copy tested by PRO-19 (E11). Neither changes a status.
