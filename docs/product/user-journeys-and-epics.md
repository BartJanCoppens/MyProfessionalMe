# MyProfessionalMe: personas, epics and user journeys

Product analysis of the proof of concept as it stands on 1 Nov 2026 (code on `main` at `01cbc67`, which includes the seven fixes of `0b955a2`; release v0.4.0 in the database), written from the product owner's side. It defines who the platform serves, the epics that make up the product, the end-to-end journeys per persona, and checks every journey step and epic acceptance criterion against what is actually built.

## 0. How to read this document

**Sources, in order of authority:** owner decisions (`CLAUDE.md`, the plans in `docs/superpowers/plans/`), then the code and migrations, then the functional test catalogue, then the Claude Design prototype (`Design/Learning & Growth Development Platform/MyProfessionalMe.dc.html`, git-ignored). Owner decisions override the design: Audit replaces Advisory, there are no fictional people, podcasts and reels are parked, and the career path has seven stages (Analyst, Consultant, Senior consultant, Manager, Senior manager, Director, Partner).

**Status values** used for every journey step and every epic acceptance criterion:

| Status | Meaning |
|---|---|
| Met | Built and working. Evidence is a test-case id from the catalogue, a file and function, or a migration. |
| Partial | Something is built but not all of it; the cell says what is missing. A test that documents a bug (`it.fails`) makes a step Partial. |
| Not built | Planned but not there yet. The cell cites the roadmap or plan item. |
| Gap | Neither built nor planned. A product gap I recommend adding. |

**Evidence ids.** `AUTH-07`, `MAP-24` and so on are rows of the functional test catalogue `docs/testing/functional-test-cases.md` (289 cases, 511 tests at the time it was written). The seven bugs the catalogue first documented with `it.fails` tests (EDGE-01, EDGE-02, CUR-17, CUR-36, KB-12, TEAM-06, VIEW-11) are fixed on `main` (`0b955a2`) and their tests are plain tests now, so those cases count as Met here. `rls.sql` means `supabase/tests/rls.sql` (`npm run test:db`). Roadmap items are cited as `Roadmap §n` (`docs/superpowers/plans/2026-11-01-roadmap.md`) and plan tasks as `v3-remaining Task n` (`docs/superpowers/plans/2026-11-01-design-v3-remaining.md`).

**Ids in this document:** personas `P1`–`P10`, epics `E1`–`E16`, epic acceptance criteria `E1.1`, journeys `J01`–`J28`, journey steps `J01.1`.

### What is real today and what is still seed or browser-only

This decides most of the validation below, so it comes first.

| Data | Where it lives | Evidence |
|---|---|---|
| Accounts, roles (System, General, Domain Admin), business line, career stage, counsellor | Supabase, RLS | `20261030210558_auth_and_roles.sql`, `20261101141744_general_admin_role.sql`, `20261101073229_guard_counsellor_and_accept.sql` |
| Learner progress (state, %, chosen), ambitions, interests, avatar initials and colour | Supabase, RLS, per person | `20261101072648_learner_data.sql`, `src/lib/learnerStore.ts` |
| Learning catalogue, curriculum mappings, knowledge bundles | Supabase, RLS, per business line | `20261101141745_content_tables.sql`, `src/lib/contentStore.ts` |
| Avatar photo | This browser only (`localStorage['mpm-avatar:<userId>']`) | `CLAUDE.md`, PRO-06 |
| Ratings and colleague notes | Not stored; "Post note" only shows a toast | `src/model.ts` `renderVals()` (`rating: 'No ratings or notes yet'`, `saveNote`), DET-03, DET-04 |
| Projects, evaluations, personality test results | Empty seed arrays (`PROJECTS`, `TESTS`); actions are prototype toasts | PRJ-01, PRO-18 |
| Avatar-practice runs | Empty seed (`AVATARS[*].attempts`); "Start a session" is a prototype toast | DET-09, DET-10 |
| Curriculum signals, connected programs, program import results | Seed constants (`SIGNALS`, `PROGRAMS`, `IMPORT_RESULTS`); "Sync programs" is a toast | CUR-19..22, ADM-03, ADM-10 |
| Firm next-stage targets per domain, stage population shares, annual hours goal | Constants: `TARGET`, `STAGE_FR`, "of 80 h this year" | `src/data.ts`, `src/model.ts` `renderVals()` (`hoursChip`) |
| Membership of lens audiences (industry, technology, ambition, personality profile) | Not recorded anywhere; the learner's own map reads only the business-line audience | `src/model.ts` `mapping()` (`maps[this.bl()]`), `mePersona()` (`ind`, `tec`, `amb`, `pro` all `null`) |
| AI assistants (profile chat, copilot, learner's eye, test retrieval) | `window.claude.complete` inside Claude Design only; scripted elsewhere | `CLAUDE.md` § Assistants, PRO-10, CUR-23, KB-37 |

## 1. Personas

Personas are roles, not people. The app knows a learner's band from `profiles.career_stage`, a counsellor from `profiles.counsellor_id` pointing at them, and admins from `user_roles`. The content creator, the reviewer and the knowledge manager have no role of their own today.

| Id | Persona | How the app recognises them today |
|---|---|---|
| P1 | Early-career learner (Analyst, Consultant) | `career_stage` in the first two stages; a person without a stage is treated as an Analyst (STG-05) |
| P2 | Mid-career learner (Senior consultant, Manager) | `career_stage` |
| P3 | Senior learner (Senior manager, Director, Partner) | `career_stage`; Partner is the top of the path (STG-03) |
| P4 | Counsellor | Anyone named in another person's `profiles.counsellor_id` (any stage, usually P2 or P3) |
| P5 | Domain Admin | `user_roles.role = 'domain_admin'` with a business line; may hold several lines |
| P6 | General Admin | `user_roles.role = 'general_admin'`, no line |
| P7 | System Admin | `user_roles.role = 'system_admin'`, no line |
| P8 | Content creator (Create & share) | Nobody yet. Bundles already carry an access level for "creators" (`knowledge_bundles.access` `all` / `tl`), but there is no creator role or screen |
| P9 | Knowledge manager | Nobody as such. Today a General or Domain Admin curates bundles in the Knowledge library |
| P10 | Reviewer (peer, domain expert, learning team) | Nobody yet. The design routes every contribution through two peers, a domain expert and the learning team (Quality & risk) |

### P1 Early-career learner (Analyst, Consultant)

- **Goals:** know exactly what the firm expects before the next stage; finish mandatory items on time; build a base in the nine domains; get early feedback.
- **Pains:** too much mandatory learning in the first year; not knowing which learning counts; waiting for acceptance; long courses that do not fit project weeks.
- **Success measures:** mandatory items done before their deadline; readiness for Consultant (or Senior consultant) rising every quarter; first certification accepted; at least one item touched in every domain in year one.

### P2 Mid-career learner (Senior consultant, Manager)

- **Goals:** close the domain gaps that block promotion to Manager or Senior manager; specialise along an industry or technology; turn project feedback into learning; start coaching others.
- **Pains:** generic catalogue that ignores the projects they are on; evaluations that never reach the learning plan; no time; unclear Manager expectations.
- **Success measures:** readiness for the next stage at or above 80% before the promotion round; largest gaps closed; advice from evaluations taken up; CPD hours met.

### P3 Senior learner (Senior manager, Director, Partner)

- **Goals:** keep CPD compliance for professional bodies (ITAA, IBR/IRE, ACCA); stay current on regulation; build thought leadership; give back by sharing what they know.
- **Pains:** platforms aimed at juniors; low-value mandatory content; no way to contribute expertise; reporting CPD by hand.
- **Success measures:** CPD units per professional body met and exportable; content they shared reused by others; time spent learning that they chose themselves.

### P4 Counsellor

- **Goals:** see each counsellee's readiness, gaps and overdue mandatory items at a glance; accept completed learning quickly; prepare development conversations with evidence.
- **Pains:** chasing people about deadlines; accepting work without evidence; no history to bring to the promotion committee; no signal when something waits for them.
- **Success measures:** time from submitted to accepted; counsellees with overdue mandatory items; counsellees ready for the next stage at the promotion round.

### P5 Domain Admin (per business line)

- **Goals:** run the line's people (accounts, stages, counsellors) and the line's curriculum; keep mandatory learning lean; publish changes safely.
- **Pains:** changes in one line breaking another; not knowing who a mapping reaches; no view of completion across the line.
- **Success measures:** mandatory completion rate for the line; mandatory hours per stage within budget; zero access incidents across lines; time to onboard a new joiner.

### P6 General Admin

- **Goals:** own firm-wide content and every audience (business lines plus industry, technology, ambition and profile lenses); keep the catalogue current and deduplicated; steer the curriculum with signals.
- **Pains:** duplicates arriving through several audiences; signals that are not grounded in real data; no reporting.
- **Success measures:** duplicate-free stacks per persona; share of curriculum changes driven by signals; catalogue freshness; content reuse.

### P7 System Admin

- **Goals:** keep the platform secure and governable: roles, first admins, last-admin protection, auditability, releases.
- **Pains:** role changes without an audit trail; security settings off (leaked-password protection); manual release steps.
- **Success measures:** zero unauthorised writes (RLS tests green); every role change traceable; release cadence; security advisors clean.

### P8 Content creator

- **Goals:** turn a project lesson into a reel, podcast, micro-guide, case write-up or avatar scenario; draft it fast from firm knowledge; get it published and see it used.
- **Pains:** fear of leaking client names; slow, opaque review; no credit for sharing.
- **Success measures:** time from submission to publication; first-pass approval rate; views, ratings and reuse of their content (the design shows Views, Rating, Saved, Mapped to).

### P9 Knowledge manager

- **Goals:** curate trustworthy knowledge bundles (sources, concepts, formal theories), keep them fresh, and tune retrieval so assistants answer from cited firm knowledge only.
- **Pains:** stale sources; client or licensed material leaking into answers; no way to evaluate retrieval quality; theory versions drifting from Intelli-Core.
- **Success measures:** share of answers with valid citations; zero retrievals from client or licensed sources; stale-source count; evaluation-set score per RAG model.

### P10 Reviewer (peer, domain expert, learning team)

- **Goals:** review colleagues' contributions quickly against a clear rubric; catch confidentiality problems before publication.
- **Pains:** review requests outside their domain; no time allowance; unclear criteria.
- **Success measures:** reviews done within five working days; rubric completeness; confidentiality issues caught before publication.

## 2. Epics

Each epic has a goal, the business value, the personas it serves, the KPIs an L&D leader would track (with whether the app can measure them today), and acceptance criteria at epic level with their validation status.

### Epic overview

| Id | Epic | Personas | Overall status |
|---|---|---|---|
| E1 | Personal growth map and readiness | P1, P2, P3, P4 | Mostly met; targets and lens audiences missing |
| E2 | Library and discovery | P1, P2, P3 | Mostly met; ratings and notes not stored |
| E3 | Learning completion, evidence and acceptance | P1–P5, P7 | Core met; no evidence, no send-back, no acceptance record |
| E4 | Counselling and team insight | P4 | Mostly met; no approvals queue or conversation record |
| E5 | Curriculum mapping per audience | P5, P6 | Admin side met; lens audiences never reach a learner |
| E6 | Learning catalogue administration | P5, P6, P7 | Met; deadlines and program connectors missing |
| E7 | Knowledge library, RAG and logic engine | P9, P5, P6 | Admin UI met; real retrieval and logic engine not built |
| E8 | Create & share with peer review | P8, P10, P3 | Not built (Roadmap §3) |
| E9 | Podcasts, reels and micro-learning | P1, P2 | Covers met; players parked (Roadmap §2) |
| E10 | Avatar practice | P1, P2, P4 | Presentation met; the studio is a gap |
| E11 | Profile: ambitions, interests, evaluations, personality profiles | P1–P4 | Ambitions and interests met; evaluations and profiles are gaps |
| E12 | Accounts, roles and governance | P5, P6, P7 | Met; audit log, SSO and deploy open |
| E13 | Server-side AI assistants | all | Fallbacks met; proxy not built (Roadmap §4) |
| E14 | Analytics and reporting | P4–P7 | Gap |
| E15 | Notifications and reminders | P1–P4, P8, P10 | Gap |
| E16 | Release readiness and robustness | P7, all | Mostly met since the seven bug fixes; the deadline model remains |

### E1 Personal growth map and readiness

- **Goal:** every learner sees, on one page, where they stand in the nine domains against what the firm expects at their next stage, and what to do next.
- **Business value:** makes promotion criteria transparent, steers learning hours to the gaps that matter, and gives counsellors and learners the same picture.
- **Personas:** P1, P2, P3 (own map), P4 (a counsellee's map in View as).
- **KPIs:**

| KPI | Definition | Measurable today? |
|---|---|---|
| Readiness distribution | Share of people per stage and line at 80% readiness or more for the next stage | Per person only (`Logic.readiness()`); no aggregate (E14) |
| Domains at target | Average number of domains where the level reached meets the next-stage target | Per person only (radar `gapText`) |
| Learning hours per person per year | Hours on accepted, submitted and in-progress items in the calendar year | No: hours are not dated; the "of 80 h this year" goal is a constant |
| Monthly active learners | People who open their map or log progress in a month | No: no usage events are recorded |

- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E1.1 | The map shows nine domains with one dot per learning, filled by state and outlined by obligation | Met | MAP-01, MAP-03 |
| E1.2 | Each domain shows the level reached against the next-stage target for the person's stage and line | Partial | MAP-02, MAP-21. `TARGET` is one firm-wide constant for every stage and line, so an Analyst and a Senior manager see the same target |
| E1.3 | Readiness counts hours on mandatory and advised items up to the next stage; the person's own choices do not count | Met | MAP-24, `Logic.readiness()`. Submitted items count before they are accepted (`progressHours`), see Q5 |
| E1.4 | Constellation, radar and road views, with gaps on the radar and a rolling four-quarter road | Partial | MAP-07..14, EDGE-02. The road is a fixed window, Q4 2026 to Q3 2027 (`road()`, `dueQuarter()`), not four quarters from today; later items pile into the last column |
| E1.5 | Domain zoom with level rings, next step and pulling clouds | Met | MAP-19..23 |
| E1.6 | Clouds from evaluations, personality profiles and ambitions pull learnings onto the map | Partial | Ambitions and interests work (MAP-16, MAP-17); the projects and personality clouds are always empty because no data source exists (MAP-15) |
| E1.7 | "Next up" lists four items, mandatory first, work in progress ahead | Met | MAP-26 |
| E1.8 | Hours and CPD for the current year | Partial | MAP-25 sums all progress ever; no completion dates; the annual goal is a constant |
| E1.9 | Only earned marks are shown | Met | MAP-27 |
| E1.10 | All seven stages work; Partner is the top of the path | Met | STG-01..03 |
| E1.11 | Learnings mapped to the industry, technology, ambition and profile audiences a person belongs to appear on their map and in readiness | Gap | `Logic.mapping()` reads only `maps[this.bl()]`; no table records audience membership |
| E1.12 | Usable at narrow widths and with the keyboard only | Partial | NAV-15 and MAP-29 are manual and unverified |

### E2 Library and discovery

- **Goal:** learners find the right learning quickly, understand why it is suggested, and learn from colleagues' ratings and notes.
- **Business value:** higher uptake of the catalogue the firm pays for; less time searching; social proof drives quality.
- **Personas:** P1, P2, P3.
- **KPIs:**

| KPI | Definition | Measurable today? |
|---|---|---|
| Search-to-start conversion | Searches followed by "Add to my path" or logged hours | No usage events |
| Dead content | Catalogue items with no start in 90 days | No: progress rows have `updated_at` but no start date, and no report exists |
| Average rating | Mean rating per learning | No: ratings are not stored |
| Recommendation uptake | Share of starts on items a cloud suggested | No usage events |

- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E2.1 | Search matches title, source and domain, ignoring case | Met | LIB-01 |
| E2.2 | Filters by obligation, level, format tile and domain combine, with an empty state and "clear all" | Met | LIB-02..07 |
| E2.3 | Cards show a cover by format, status, effort and the due date of mandatory items | Met | LIB-08, LIB-12 |
| E2.4 | Every learning says why it is listed (path, obligation or cloud evidence) | Met | LIB-03, LIB-10, DET-08 |
| E2.5 | The detail shows level ladder, outcomes, paths and facts | Met | DET-01, DET-02, DET-05 |
| E2.6 | Ratings and colleague notes are stored and shown to others | Partial | The form works but nothing is stored: "No ratings or notes yet" is hard-coded (DET-03, DET-04) |
| E2.7 | A learner adds a learning to their path and can take it off again | Partial | Adding works (DET-14, MAP-05); there is no "remove from my path" action |
| E2.8 | A learning can be launched in its provider (course link, LMS deep link) | Gap | `learnings` has no URL or launch field |
| E2.9 | Drafts are invisible to learners; the owner decides on "Needs review" | Partial | Drafts are hidden by RLS (`learnings: read`, rls.sql); "Needs review" visibility is an open owner decision (Roadmap §1) |

### E3 Learning completion, evidence and acceptance

- **Goal:** completed learning counts only once a counsellor or responsible admin has accepted it, with evidence and a durable record.
- **Business value:** trustworthy levels and readiness for promotion decisions; auditable CPD; mandatory compliance the firm can prove.
- **Personas:** P1, P2, P3 (submit), P4 (accept), P5 and P7 (accept when there is no counsellor).
- **KPIs:**

| KPI | Definition | Measurable today? |
|---|---|---|
| Mandatory completion on time | Mandatory items accepted before their deadline, over mandatory items due | Partly: overdue items per counsellee (TEAM-03); no acceptance date |
| Time to acceptance | Median time from submitted to accepted | No: state changes are not timestamped |
| Evidence rate | Accepted items with evidence attached | No: there is no evidence |
| CPD compliance | People meeting their professional body's CPD units | No (E14) |

- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E3.1 | A learner logs effort; when all hours are logged the item is submitted for acceptance | Met | DET-11, DET-12. Effort goes in one-hour steps only, with no activity date |
| E3.2 | A learner asks for approval of an item in progress | Met | DET-15 |
| E3.3 | Only the counsellor, a Domain Admin of the person's line or a System Admin accepts; a learner never accepts their own item | Met | DET-16, DET-17, `private.can_accept`, `private.guard_learning_update()` (`20261101080326_atomic_learning_and_manageable.sql`), rls.sql "Counsellor reads and accepts" |
| E3.4 | Acceptance is durable: the learner cannot clear it or delete an accepted row | Met | `20261101080326_atomic_learning_and_manageable.sql`, rls.sql |
| E3.5 | A second accept on an already accepted item is explained, not repeated | Met | DET-18 |
| E3.6 | Evidence (certificate, file, link or short reflection) is attached to a submission and visible to the accepter | Gap | No field, table or storage bucket |
| E3.7 | The accepter can return a submission with feedback ("changes requested") | Gap | The guard allows only submitted → accepted |
| E3.8 | Each acceptance records who accepted and when | Gap | Only `updated_at` on `learner_learnings` |
| E3.9 | Completions from connected providers (LMS, Coursera, Microsoft Learn) arrive automatically | Gap | "Sync programs" only shows a toast (ADM-03) |
| E3.10 | Viewing someone else never writes their progress | Met | VIEW-06, VIEW-13 (rls.sql) |

### E4 Counselling and team insight

- **Goal:** counsellors see their counsellees' readiness, gaps and overdue items, act on submissions, and prepare development conversations from evidence.
- **Business value:** counselling time goes to conversations instead of chasing; promotion committees get consistent evidence.
- **Personas:** P4.
- **KPIs:**

| KPI | Definition | Measurable today? |
|---|---|---|
| Counsellees with overdue mandatory items | Count per counsellor | Yes, per counsellor (TEAM-03, TEAM-07) |
| Submissions waiting more than five working days | Count per counsellor | No: no state-change timestamps, no queue |
| Development conversations held | Per counsellee per quarter | No |

- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E4.1 | "My team" lists counsellees with grade, readiness, hours and overdue items | Met | TEAM-01..03, `src/logic/team.ts` `memberSummary()` |
| E4.2 | Levels by domain as a heat map with overdue markers | Met | TEAM-05 |
| E4.3 | The "Expected at next stage" row matches the firm's targets | Met | TEAM-06 (fixed in `0b955a2`; `heatTargets` now reads `TARGET`) |
| E4.4 | A counsellor opens a counsellee's app read-only | Met | TEAM-04, VIEW-04, VIEW-05 |
| E4.5 | The sidebar badges counsellees with overdue mandatory items | Met | TEAM-07 |
| E4.6 | The counsellor accepts a submitted learning from the counsellee's detail | Met | DET-16, DET-17 |
| E4.7 | A queue lists every submission waiting for this counsellor | Gap | Submissions are found only by opening each counsellee |
| E4.8 | Last activity per counsellee (a column in the design's roster) | Gap | In the design, in no plan; needs activity timestamps |
| E4.9 | The counsellor sees the personality results and evaluations the counsellee chose to share | Gap | No data; the share choice lives only in screen state (`AppState.share`) |
| E4.10 | Conversation notes and agreed actions are recorded | Gap | Not in design or plans |
| E4.11 | A counsellor reads only their counsellees' data | Met | `private.can_view_learner`, rls.sql, VIEW-01 |

### E5 Curriculum mapping per audience

- **Goal:** admins decide, per audience and stage, which learnings are mandatory or advised, see what that does to one person's year, and publish safely.
- **Business value:** one curriculum model for lines, industries, technologies, ambitions and profiles; lean mandatory load; no duplicates.
- **Personas:** P5 (own line), P6 (every audience).
- **KPIs:**

| KPI | Definition | Measurable today? |
|---|---|---|
| Mandatory hours per stage | Mandatory hours a person receives at a stage, per line | Per person in the learner's eye (CUR-28..30); the scripted reading warns above 40 h |
| Duplicates per stack | Learnings arriving through two audiences | Per person (CUR-30) |
| Signal adoption | Signals applied over signals shown | No: applies and dismissals live in screen state (`sigDone`) |
| Time to publish | From the first pending change to publish | No |

- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E5.1 | Lenses, audiences and coverage per stage, including Director and Partner | Met | CUR-01..04, STG-04 |
| E5.2 | Map, move, re-obligate and unmap learnings by drag and drop or from the dock | Met | CUR-05..13 (CUR-37 manual) |
| E5.3 | Ambition and profile audiences only ever suggest (advised) | Met | CUR-14, constraint `curriculum_mappings_advised_lenses` |
| E5.4 | A Domain Admin edits only their line's audience; other audiences are read-only with a note on who edits them | Met | CUR-16, CUR-17 (fixed in `0b955a2`) |
| E5.5 | Pending changes publish once, with clear refusals, and survive a reload | Met | CUR-31..35 |
| E5.6 | Signals come from real evaluations, staffing and shared profiles | Partial | Seeded `SIGNALS` (CUR-19..22); a signal naming a removed learning is now skipped (CUR-36) |
| E5.7 | The copilot proposes valid operations that an admin applies in one go, within their rights | Partial | CUR-23..27 met for the scripted copilot; live answers need E13 |
| E5.8 | The learner's eye shows the viewed person's full stack across all their audiences | Partial | Business-line layer only (`mePersona()`); readings are kept per person (VIEW-11) |
| E5.9 | Lens audiences reach the people who belong to them | Gap | No membership data; learners' maps read only the business line (see E1.11) |
| E5.10 | Reach per audience and stage comes from real headcount | Gap | `AUD_INFO` reach and `STAGE_FR` are constants |
| E5.11 | Every published change is logged (who, when, what) and can be rolled back | Gap | `curriculum_mappings` keeps only `updated_at` |
| E5.12 | A deadline can be set per mandatory mapping | Gap | `due` is free text on the learning, not on the mapping; see E6.7 |

### E6 Learning catalogue administration

- **Goal:** admins keep one clean catalogue, by line and firm-wide, imported from connected programs where possible.
- **Business value:** one source of truth; no orphaned or broken paths; less manual entry.
- **Personas:** P5, P6, P7.
- **KPIs:** catalogue freshness (share of items reviewed in the last 12 months; not measurable: no review date); share of items with at least one learner (not measurable: no report); time from draft to published (not measurable: no status history).
- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E6.1 | List with effort, paths and status; search and status filter | Met | ADM-01, ADM-02 |
| E6.2 | Add and edit with validation; the line choices follow the role | Met | ADM-04..12 |
| E6.3 | Draft, needs-review and published lifecycle; drafts visible to admins only | Met | ADM-13, `learnings: read` policy, rls.sql |
| E6.4 | A Domain Admin cannot remove or draft a learning another line still maps | Met | ADM-15, ADM-19, ADM-20, `20261101144515_guard_shared_learnings.sql` |
| E6.5 | Removing a learning removes its mappings; double clicks save once | Met | ADM-17, ADM-18, ADM-21 |
| E6.6 | Connected programs sync and import from their real catalogues | Partial | `PROGRAMS` and `IMPORT_RESULTS` are seed; sync is a toast (ADM-03, ADM-10) |
| E6.7 | Admins set and change a deadline | Gap | The form has no deadline field; `saveLearningForm()` keeps the old `due` (ADM-14) |
| E6.8 | Each learning has an owner and a review date, and stale items are flagged | Gap | `created_by` only |
| E6.9 | A Domain Admin may map another line's published learning into their line | Partial | Allowed today; owner decision open (Roadmap §1) |

### E7 Knowledge library, RAG and logic engine

- **Goal:** curated, versioned knowledge bundles that assistants answer from, with citations, never touching client or licensed sources, and with a logic engine that verifies or infers answers from formal rules.
- **Business value:** trustworthy AI answers on tax and regulation; reuse of Intelli-Core theories; a defensible position on confidentiality.
- **Personas:** P9 (curate), P5 and P6 (their bundles), P8 (drafts from bundles).
- **KPIs:**

| KPI | Definition | Measurable today? |
|---|---|---|
| Citation rate | Answers whose claims all cite a passage | No |
| Retrieval quality | Precision at k on the bundle's evaluation set | No (evaluation sets not built) |
| Restricted-source leaks | Retrievals from client or licensed sources | Guarded to zero in code (KB-39); not logged |
| Stale sources | Sources past their freshness window | Yes, per bundle (KB-19, KB-27) |

- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E7.1 | Bundle list with topics, tags, search and sort | Met | KB-02..08 |
| E7.2 | Bundles are stored per line; a Domain Admin edits only their own; firm-wide ones are for General and System Admins | Met | KB-40..43, `knowledge_bundles` policies |
| E7.3 | Client and licensed sources are never retrieved | Met | KB-19, KB-22, KB-39 |
| E7.4 | RAG models: create, duplicate, set default, delete (never the last) | Met | KB-23..25 |
| E7.5 | OKF v0.2 files: browse, validate, download as tar, import | Met | KB-26..32 (KB-29 manual) |
| E7.6 | Test retrieval returns ranked passages and a cited answer | Partial | KB-33..38: keyword and term-frequency ranking in the browser (`src/logic/okf.ts` `rankHits()`); the embedding, chunking and re-rank settings have no effect |
| E7.7 | An empty Knowledge library renders | Met | KB-12 (fixed in `0b955a2`) |
| E7.8 | Sources are ingested: chunked, embedded with Multilingual E5 large on an EU host, stored in pgvector with their sensitivity | Not built | Roadmap §4 |
| E7.9 | Hybrid retrieval (vector plus full text) runs in the database | Not built | Roadmap §4 |
| E7.10 | RAG architectures (OKF graph, knowledge graph, query rewriting, metadata filters, agentic, logic-driven) fused by reciprocal rank fusion | Not built | Roadmap §5 |
| E7.11 | IDP-Z3 runs Verify or Infer per RAG model through `kb-ask`; Lean 4 shows "not connected" | Not built | Roadmap §5 |
| E7.12 | Formal theories are imported from Intelli-Core with versions, diff, migrate and roll back | Not built | Roadmap §5, owner's answer 3 |
| E7.13 | An evaluation set per bundle compares RAG models | Not built | Roadmap §5 |
| E7.14 | Two admins editing one bundle do not silently overwrite each other | Partial | Last writer wins (Roadmap §6) |

### E8 Create & share with peer review

- **Goal:** any professional turns what they learned into a reel, podcast, micro-guide, case write-up or avatar scenario, grounded in firm knowledge and reviewed by peers, an expert and the learning team before it reaches the library.
- **Business value:** captures tacit project knowledge, lowers content cost and builds a sharing culture; seniors (P3) give back.
- **Personas:** P8, P10, P3, P6 (learning team).
- **KPIs:** submissions per month; median time from submission to publication (the design allows five working days per peer step); first-pass approval rate; confidentiality issues caught in review; reuse (views, saves, audiences mapped). None is measurable today.
- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E8.1 | A creator drafts content of five types with a title of at most 60 characters, one takeaway, domain, level and an audience stage from all seven | Not built | Roadmap §3, v3-remaining Task 6 |
| E8.2 | Automatic checks block client names and over-long titles | Not built | v3-remaining Task 6 (`contentChecks`) |
| E8.3 | Submitting assigns two peers (never the author or the author's counsellor), the domain expert, then the learning team | Not built | v3-remaining Task 5 (`private.submit_contribution`, `domain_experts`) |
| E8.4 | Reviewers approve only when all four rubric items hold, or request changes; the author resubmits | Not built | v3-remaining Tasks 5–6 |
| E8.5 | "Draft with AI" outlines from the chosen bundles and cites every source | Not built | Roadmap §3; needs E13 |
| E8.6 | Media files (video, audio, transcript, captions) are uploaded and stored safely | Gap | No storage bucket or upload in any plan |
| E8.7 | A published contribution becomes a catalogue learning that admins can map | Gap | The plan creates `contributions` but not the hand-over into `learnings` |
| E8.8 | Authors see views, ratings, saves and audiences mapped | Gap | Needs usage events and stored ratings (E2.6, E14) |
| E8.9 | Authors and reviewers get recognition (CPD credit, profile badge) | Gap | Not in design or plans |

### E9 Podcasts, reels and micro-learning

- **Goal:** short formats that fit a project week: podcasts with chapters, and reels with a one-question check that completes them.
- **Business value:** more learning moments per person, especially for P1 and P2; higher completion for short items.
- **Personas:** P1, P2.
- **KPIs:** completion rate of short formats against long ones; reel check pass rate; minutes listened per active learner.
- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E9.1 | Library covers and format tiles per format | Met | LIB-05, LIB-08, `src/logic/covers.ts` |
| E9.2 | Podcast player with chapters, seek and speed | Not built | Parked on `feature/design-v3-b` (Roadmap §2) |
| E9.3 | Reels strip and viewer with a check-yourself question | Not built | Roadmap §2 |
| E9.4 | A correct reel answer completes the reel without a counsellor; every other format still needs one | Not built | Roadmap §2; migration `…_self_complete_media.sql` waits for the owner's go |
| E9.5 | The player stops when the learning or person changes; in View as it plays but saves nothing | Not built | v3-remaining Task 3 |
| E9.6 | Media items L42–L48 and `MEDIA` live in the database | Not built | Roadmap §2 |
| E9.7 | Captions and transcripts for every audio and video item | Gap | Named in the design's content types, in no acceptance criterion |

### E10 Avatar practice

- **Goal:** learners rehearse client conversations with AI role-play characters, get scored per skill, and share their best run with their counsellor.
- **Business value:** safe practice of soft skills that classroom training covers poorly; measurable skill progress.
- **Personas:** P1, P2 (practise), P4 (sees shared runs).
- **KPIs:** sessions per learner; share of avatar learnings completed (the design completes at 4 of 5 on every skill); score gain between the first and the best run.
- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E10.1 | Avatar learnings introduce the character, role and skills | Met | LIB-09, DET-09 |
| E10.2 | "Start a session" opens a voice or text role-play | Gap | Prototype toast (DET-09); no roadmap item |
| E10.3 | Runs are scored per skill and stored privately; reaching the threshold completes the learning | Gap | `AVATARS[*].attempts` is empty seed |
| E10.4 | The learner shares their best run (scores and transcript) with their counsellor | Gap | Toast only (DET-10 manual) |
| E10.5 | Characters are role-play content, never fictional colleagues | Met | STORE-07 (`noPersona.test.ts`) |

### E11 Profile: ambitions, interests, evaluations and personality profiles

- **Goal:** the person records where they want to go and what drives them, sees project feedback and personality results, and decides who sees what.
- **Business value:** personalisation beyond the business line; evaluations turn into learning instead of sitting in the performance tool.
- **Personas:** P1, P2, P3 (own profile), P4 (what is shared).
- **KPIs:** people with at least one ambition; evaluation advice taken up within 90 days; share of personality results shared with the counsellor.
- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E11.1 | Ambitions and interests are listed with horizon, source and domains, and can be removed | Met | PRO-01, PRO-02 |
| E11.2 | "Talk it through" proposes an ambition or interests that the person saves or drops | Partial | PRO-09..16 met with the scripted assistant; live replies need E13 (PRO-20 manual) |
| E11.3 | The person adds an ambition or interest directly, without the chat | Gap | `addAmbition` and `addInterest` are reached only through `saveProposal()` |
| E11.4 | Avatar initials, colour and photo | Partial | PRO-03..08; the photo stays in one browser (PRO-06) |
| E11.5 | Projects and evaluations sync from staffing and the performance tool and feed the projects cloud | Gap | PRJ-01, PRJ-03 (no connector, no roadmap item) |
| E11.6 | "Request an evaluation" reaches the evaluator | Gap | Prototype toast (PRJ-01) |
| E11.7 | Personality results are added and their visibility (only me or counsellor) is stored | Gap | "+ Add a test result" is a toast (PRO-18); the share choice is screen state only |
| E11.8 | What the person keeps private is not readable by their counsellor | Partial | The profile says "You decide what your counsellor sees", but `private.can_view_learner` gives the counsellor every ambition and interest (`ambitions: read`, `interests: read`) |

### E12 Accounts, roles and governance

- **Goal:** the right people get the right rights, enforced in the database, with closed sign-up and a safe hand-over of accounts.
- **Business value:** confidentiality of personal development data across business lines; audit readiness.
- **Personas:** P5, P6, P7, and every user at sign-in.
- **KPIs:** RLS checks passing (`npm run test:db`); time to provision a joiner; open security advisor warnings.
- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E12.1 | Sign-up is closed; admins create accounts with a temporary password the user must replace | Met | AUTH-07..13, USR-13..16 |
| E12.2 | Passwords need 12 characters with lower case, upper case and a digit | Met | AUTH-08, AUTH-20 |
| E12.3 | Only a System Admin grants or revokes roles; the last System Admin cannot be removed | Met | USR-04, USR-05, trigger `user_roles_keep_one_system_admin` |
| E12.4 | A Domain Admin manages only people of their lines, never a System or General Admin or another line's Domain Admin | Met | USR-06, USR-09, USR-16, USR-18 (manual), `private.can_manage_user` |
| E12.5 | A General Admin edits all content and manages no users | Met | NAV-04 |
| E12.6 | Stage and counsellor are set by admins; nobody but a System Admin changes their own | Met | USR-08, USR-09, `private.guard_profile_assignments()` |
| E12.7 | View as is read-only and remembered per tab | Met | VIEW-01..13 |
| E12.8 | Members never reach admin screens | Met | NAV-01, NAV-02 |
| E12.9 | Leaked-password protection is on | Not built | Roadmap §6 |
| E12.10 | v0.4.0 is in production and smoke-tested per role | Met | Deployed 1 Nov 2026 with the bug fixes; smoke-tested on the live site as learner, Domain Admin, General Admin and a person without a line, including publishing curriculum changes (System Admin by the owner) |
| E12.11 | Role, line, stage and counsellor changes are logged with who and when | Gap | No audit table |
| E12.12 | Single sign-on with the firm's identity provider; line and stage provisioned from HR | Gap | Not in plans |
| E12.13 | A person can export their learning record; deletion follows a retention policy | Gap | Deletion cascades from `profiles`; no export or retention rule |

### E13 Server-side AI assistants

- **Goal:** the profile chat, curriculum copilot, learner's eye and test retrieval run on Claude through a server-side proxy, with the key never in the client.
- **Business value:** the AI features become real outside Claude Design; prerequisite for E7, E8 and a live E11.
- **Personas:** all.
- **KPIs:** share of assistant calls answered live rather than by fallback; cost per active user per month; proposals accepted by users.
- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E13.1 | An edge function proxies the Claude API; the key is a function secret | Not built | Roadmap §4 |
| E13.2 | Every assistant falls back to a scripted reply when the model fails | Met | PRO-14, CUR-27, KB-37 |
| E13.3 | Model output is validated before it changes anything (known domains, at most five operations, ambitions never mandatory) | Met | PRO-14, CUR-27 |
| E13.4 | The assistant sees only data the caller may see (it runs with the caller's token, not the service role) | Gap | Not specified in Roadmap §4 |
| E13.5 | Usage per user is limited and logged; prompts and data stay in the EU | Gap | Not specified |

### E14 Analytics and reporting

- **Goal:** L&D leaders, Domain Admins and counsellors get aggregate views of mandatory completion, readiness, CPD and content use.
- **Business value:** standard LXP reporting the firm will be asked for (professional bodies, partner meetings, regulators); without it the pilot cannot prove impact.
- **Personas:** P5, P6, P7, P4.
- **KPIs:** this epic delivers the KPIs of the other epics.
- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E14.1 | Mandatory completion and overdue items per line, stage and audience | Gap | Only per counsellor (TEAM-03) |
| E14.2 | Readiness distribution per stage and line | Gap | Only per person |
| E14.3 | CPD units per person per professional body, exportable | Gap | `cpd` is one number per learning, with no body |
| E14.4 | Content use: starts, completions and ratings per learning and per contribution | Gap | No events, no ratings |
| E14.5 | Curriculum load per stage and audience | Partial | Coverage per stage (CUR-04) and per-person stacks (CUR-28..30); no firm-wide view |
| E14.6 | Time to competence (first start to accepted level per domain) | Gap | No dated state changes |
| E14.7 | Aggregates respect privacy (minimum group size, role scope) | Gap | Not designed |

### E15 Notifications and reminders

- **Goal:** the right person hears about the right event: submissions, acceptances, deadlines, review requests.
- **Business value:** shorter acceptance and review cycles; fewer overdue mandatory items.
- **Personas:** P1–P4, P8, P10.
- **KPIs:** median time to acceptance and to review; overdue mandatory items per month.
- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E15.1 | Every action is confirmed in the app | Met | Toasts (NAV-14) |
| E15.2 | The counsellor (or the line's admins when there is none) is told when something is submitted | Gap | Nothing is sent |
| E15.3 | The learner is told when an item is accepted or returned | Gap | Nothing is sent |
| E15.4 | Reminders before a mandatory deadline | Gap | Nothing is sent |
| E15.5 | Reviewers are told when a contribution is assigned to them | Gap | The plan has a nav badge only (v3-remaining Task 6 `reviewBadge`) |

### E16 Release readiness and robustness

- **Goal:** the app survives real data: empty tables, any deadline, removed learnings, concurrent admins and failed loads.
- **Business value:** a pilot cannot afford blank pages. Four of the seven bugs the test suite found (EDGE-01, EDGE-02, CUR-36, KB-12) blanked a screen or the whole app for a role; all seven are fixed on `main`.
- **Personas:** P7, and everyone affected.
- **KPIs:** open `it.fails` bugs (none since `0b955a2`); production errors per week (not collected: no error monitoring).
- **Acceptance criteria:**

| Id | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| E16.1 | The app renders with an empty catalogue | Met | EDGE-01 (fixed in `0b955a2`) |
| E16.2 | A mandatory item with any deadline renders on the road | Met | EDGE-02 (fixed in `0b955a2`, `dueQuarter()`) |
| E16.3 | Removing a learning a signal names does not break the admin screens | Met | CUR-36 (fixed in `0b955a2`) |
| E16.4 | Deadlines are real dates, set per mapping and validated | Gap | Free text on the learning; `dueQuarter()` (`src/logic/learner.ts`) and `deadline()` (`src/logic/team.ts`) each parse it their own way, and an unreadable date silently lands in the first quarter |
| E16.5 | Late or overlapping loads never show the wrong person's data | Met | STORE-06, VIEW-12, TEAM-08, KB-38 |
| E16.6 | A failed load is explained and can be retried | Met | AUTH-19, STORE-02 |
| E16.7 | Every policy change has an RLS test | Met | `supabase/tests/rls.sql`, `npm run test:db` |

## 3. User journeys

Each journey runs from a trigger to an outcome. Every step names the screen or feature, the epic, and its validation status. Unhappy paths are journeys of their own (marked *unhappy*) so their steps are counted and validated like the rest.

### Journey index

| Id | Persona | Journey | Kind |
|---|---|---|---|
| J01 | P1 | First sign-in and orientation | happy |
| J02 | P1 | Complete a mandatory learning before its deadline | happy |
| J03 | P1 | Explore the library and add an open learning | happy |
| J04 | P1 | Signed in without business line or stage | unhappy |
| J05 | P1 | No counsellor assigned | unhappy |
| J06 | P1 | Empty or failing data | unhappy |
| J07 | P2 | Close a gap before the next stage | happy |
| J08 | P2 | Turn an ambition into a path | happy |
| J09 | P2 | Act on a project evaluation | happy |
| J10 | P2 | Practise a client conversation with an avatar | happy |
| J11 | P2 | Add and share a personality profile | happy |
| J12 | P3 | Stay CPD-compliant for a professional body | happy |
| J13 | P3 | Partner at the top of the path | happy |
| J14 | P4 | Weekly team check | happy |
| J15 | P4 | Accept a completed learning | happy |
| J16 | P4 | Prepare a development conversation | happy |
| J17 | P4 | Read-only View as: attempts to change a counsellee's data | unhappy |
| J18 | P5 | Onboard a joiner to the line | happy |
| J19 | P5 | Maintain the line's curriculum | happy |
| J20 | P5 | Add a learning to the line's catalogue | happy |
| J21 | P5 | Reach beyond the line: refused permissions | unhappy |
| J22 | P6 | Steer the firm curriculum with signals and the copilot | happy |
| J23 | P6 | Govern the firm-wide catalogue | happy |
| J24 | P7 | Govern roles and release safely | happy |
| J25 | P7 | Fresh database and broken references | unhappy |
| J26 | P8 | Create and submit a contribution | happy |
| J27 | P9 | Curate a bundle and tune retrieval | happy |
| J28 | P10 | Review a colleague's contribution | happy |

### P1 Early-career learner

#### J01 First sign-in and orientation

- **Trigger:** a Domain Admin created the account and handed over a temporary password.
- **Outcome:** the joiner has their own password and understands what the firm expects before the next stage.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J01.1 | Receives the temporary password from the admin | User management handover banner | E12 | Met | USR-10, USR-13. Handover is copy and paste; no invitation email |
| J01.2 | Signs in; spaces around the email are ignored, wrong credentials are explained | Sign in | E12 | Met | AUTH-03, AUTH-04 |
| J01.3 | Must choose a password that meets the rule before anything else | Choose your own password | E12 | Met | AUTH-07..12 |
| J01.4 | Lands on the growth map with their name, stage → next stage and 0% readiness | Growth map | E1 | Met | AUTH-17, MAP-01 |
| J01.5 | Reads the sidebar card: stage, line, next stage, counsellor | Sidebar | E1 | Met | STG-08 |
| J01.6 | Gets a first-week checklist or guided tour of the map | Onboarding | E1 | Gap | Nothing in design or plans |

#### J02 Complete a mandatory learning before its deadline

- **Trigger:** "Next up" shows a mandatory learning with a deadline.
- **Outcome:** the learning is accepted before the deadline and counts toward level and readiness.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J02.1 | Sees the mandatory item first in "Next up", with its due date | Growth map, Next up | E1 | Met | MAP-26, LIB-08 |
| J02.2 | Filters the library to Mandatory and reads for which line and stage | Library | E2 | Met | LIB-02 |
| J02.3 | Opens the detail: why, level ladder, facts, who approves | Learning detail | E2 | Met | DET-01, DET-05, DET-07 |
| J02.4 | Launches the course in its provider | Learning detail | E2 | Gap | No launch URL (E2.8) |
| J02.5 | Logs hours as they go | Learning detail, "Log 1 hour" | E3 | Met | DET-11 |
| J02.6 | The last hour submits it for acceptance | Learning detail | E3 | Met | DET-12 |
| J02.7 | Attaches the certificate as evidence | Learning detail | E3 | Gap | E3.6 |
| J02.8 | Is reminded before the deadline if not yet done | Notifications | E15 | Gap | E15.4 |
| J02.9 | Is told it was accepted; level and readiness rise | Map, detail | E3, E15 | Partial | Acceptance updates the map on next load (DET-17, MAP-24); no notification (E15.3) |

#### J03 Explore the library and add an open learning

- **Trigger:** curiosity, or a colleague's tip.
- **Outcome:** a learning the person chose is on their path and counts toward hours and levels (not readiness).

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J03.1 | Searches by keyword | Library search | E2 | Met | LIB-01 |
| J03.2 | Narrows by format tile, domain and level | Library filters | E2 | Met | LIB-04..06 |
| J03.3 | Reads why an open learning is listed | Library card | E2 | Met | LIB-10 |
| J03.4 | Reads colleagues' ratings and notes, and leaves their own | Learning detail | E2 | Partial | DET-03, DET-04: nothing is stored (E2.6) |
| J03.5 | Adds it to their path; it shows with a green ring | Learning detail, map dock | E2 | Met | DET-14, MAP-05 |
| J03.6 | Takes it off their path later | Learning detail | E2 | Gap | E2.7 |

#### J04 Signed in without business line or stage (unhappy)

- **Trigger:** the admin created the account without a line or stage (for example a System Admin's own account).
- **Outcome:** the app still works and tells the person what is missing.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J04.1 | Opens the app; it renders, treating them as an Analyst heading for Consultant | Growth map | E1 | Met | STG-05 |
| J04.2 | The map names the business line it shows instead | Growth map notice | E1 | Met | STG-06 |
| J04.3 | The sidebar card says "No business line yet" | Sidebar | E1 | Met | STG-05 |
| J04.4 | Asks for the line and stage to be set | "Ask …" in the header | E15 | Gap | The header button only explains that no counsellor is assigned (PRO-19); nothing reaches an admin |

#### J05 No counsellor assigned (unhappy)

- **Trigger:** the person's `counsellor_id` is empty.
- **Outcome:** copy stays correct and someone can still accept their work.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J05.1 | The legend and states read "Awaiting counsellor" | Growth map, detail | E1 | Met | MAP-28 |
| J05.2 | "Ask …" explains that no counsellor is assigned and that an admin assigns one | Header | E4 | Met | PRO-19 |
| J05.3 | Submits a learning | Learning detail | E3 | Met | DET-12, DET-15 |
| J05.4 | A Domain Admin of their line or a System Admin can accept it | Learning detail (View as) | E3 | Met | DET-16 |
| J05.5 | That admin learns something is waiting | Notifications, approvals queue | E15, E4 | Gap | E4.7, E15.2 |

#### J06 Empty or failing data (unhappy)

- **Trigger:** a newcomer with no progress, a fresh database, or a failed load.
- **Outcome:** clear empty states and a way to retry, never a blank page.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J06.1 | A newcomer sees zero readiness and hours, and no marks | Growth map | E1 | Met | MAP-01, MAP-27 |
| J06.2 | Profile, projects and team show empty states | Profile, Projects, My team | E11, E4 | Met | PRO-01, PRJ-01, TEAM-02 |
| J06.3 | Learner data fails to load: the message, "Try again" and "Sign out" | Load error page | E16 | Met | AUTH-19 |
| J06.4 | With no learnings in the database the app still renders | All screens | E16 | Met | EDGE-01 (fixed in `0b955a2`) |
| J06.5 | Progress on a learning that no longer exists is ignored | Growth map | E16 | Met | EDGE-03 |

### P2 Mid-career learner

#### J07 Close a gap before the next stage

- **Trigger:** a promotion conversation names a domain to strengthen.
- **Outcome:** the gap closes and readiness rises before the promotion round.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J07.1 | Opens the radar and reads the largest gaps | Growth map, radar | E1 | Met | MAP-08, MAP-09 |
| J07.2 | Gaps are measured against the expectation for their own next stage and line | Radar, hubs | E1 | Partial | One firm-wide `TARGET` for every stage and line (E1.2) |
| J07.3 | Zooms into the domain and reads the next step | Domain zoom | E1 | Met | MAP-19..22 |
| J07.4 | Plans the coming year on the road | Road | E1 | Partial | MAP-11..14, EDGE-02; a fixed Q4 2026 – Q3 2027 window, not rolling (E1.4) |
| J07.5 | Completes and gets the learning accepted | Detail, acceptance | E3 | Met | DET-11..17 |
| J07.6 | Sees readiness rise | Map, sidebar | E1 | Met | MAP-24 |

#### J08 Turn an ambition into a path

- **Trigger:** the person wants to move toward sustainability or a technology.
- **Outcome:** the ambition is saved and pulls the right learnings onto the map.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J08.1 | Opens "Talk it through" on the profile | Profile chat | E11 | Met | PRO-09, PRO-13 |
| J08.2 | The assistant proposes an ambition and interests | Profile chat | E11, E13 | Partial | Scripted (PRO-11); live only inside Claude Design (PRO-14, PRO-20); proxy Not built (Roadmap §4) |
| J08.3 | Saves the proposal | Profile chat | E11 | Met | PRO-15, PRO-16 |
| J08.4 | Adds an ambition directly, without the chat | Profile | E11 | Gap | E11.3 |
| J08.5 | The ambitions cloud pulls learnings onto the map, explained in the dock | Growth map, clouds | E1 | Met | MAP-16, MAP-17 |
| J08.6 | Learnings admins mapped to the matching ambition audience (`amb:*`) reach them | Map, readiness | E5 | Gap | E5.9 |
| J08.7 | Decides whether the counsellor sees the ambition | Profile | E11 | Partial | Promised by the profile copy, not enforced by RLS (E11.8) |

#### J09 Act on a project evaluation

- **Trigger:** an engagement evaluation is completed in the performance tool.
- **Outcome:** the evaluation's advice turns into learnings on the path.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J09.1 | The evaluation arrives from the performance tool | Projects & evaluations | E11 | Gap | PRJ-03 (no connector) |
| J09.2 | Reads dimensions, quote and advice | Projects & evaluations | E11 | Partial | Screen works on mocked data (PRJ-02); nothing real to show |
| J09.3 | Adds an advised learning to the path | Projects & evaluations | E11, E2 | Partial | PRJ-02 on mocked data |
| J09.4 | The projects cloud pulls related learnings onto the map | Growth map | E1 | Partial | Always empty (MAP-15) |
| J09.5 | Requests an evaluation for a finished engagement | Projects & evaluations | E11 | Gap | Toast (PRJ-01) |

#### J10 Practise a client conversation with an avatar

- **Trigger:** an avatar-practice learning is on the path.
- **Outcome:** the skill is practised, scored and, at the threshold, completed.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J10.1 | Finds the learning ("Practise with …") | Library card | E10 | Met | LIB-09 |
| J10.2 | Reads the character, skills and past runs | Learning detail | E10 | Met | DET-09 ("No runs yet") |
| J10.3 | Starts a voice or text session | Avatar studio | E10 | Gap | E10.2 |
| J10.4 | Gets scores per skill; the best run completes the learning | Avatar studio | E10 | Gap | E10.3 |
| J10.5 | Shares the best run with the counsellor | Learning detail | E10 | Gap | E10.4 |

#### J11 Add and share a personality profile

- **Trigger:** the person took a personality test in a workshop.
- **Outcome:** the result is on the profile, shared as they choose, and suggests learnings.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J11.1 | Adds the test result | Profile | E11 | Gap | Toast (PRO-18) |
| J11.2 | Chooses "Only me" or the counsellor | Profile | E11 | Partial | PRO-17 on mocked data; the choice is not stored (E11.7) |
| J11.3 | Opens a learning the profile suggests | Profile | E11 | Partial | PRO-17 on mocked data |
| J11.4 | The personality cloud and profile audiences shape the map | Growth map | E1, E5 | Gap | Cloud always empty (MAP-15); no audience membership (E5.9) |

### P3 Senior learner

#### J12 Stay CPD-compliant for a professional body

- **Trigger:** the yearly CPD declaration for ITAA, IBR/IRE or ACCA is due.
- **Outcome:** the person declares their CPD from the platform.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J12.1 | Reads CPD units earned on the map | Growth map | E1 | Partial | MAP-25: accepted items only, all time, no professional body |
| J12.2 | Finds learnings that carry CPD for their body | Library | E2 | Gap | No CPD filter; no body per learning |
| J12.3 | Records CPD from an external event (conference, webinar) | Profile or detail | E3 | Gap | Only catalogue learnings can be logged |
| J12.4 | Exports a CPD statement for the year | Reports | E14 | Gap | E14.3 |

#### J13 Partner at the top of the path

- **Trigger:** a Partner opens the app.
- **Outcome:** meaningful copy and learning for someone with no next stage.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J13.1 | Copy reads "Partner · top of the career path", never "Partner → Partner" | Map, sidebar | E1 | Met | STG-03 |
| J13.2 | Readiness and gaps use the Partner-stage mappings and expectations | Map, radar | E1 | Partial | Mappings per stage work (STG-04); targets are the same constant for everyone (E1.2) |
| J13.3 | Chooses learning for themselves | Library | E2 | Met | DET-14 |
| J13.4 | Shares expertise as a contribution | Create & share | E8 | Not built | Roadmap §3 (see J26) |

### P4 Counsellor

#### J14 Weekly team check

- **Trigger:** the start of the week, or the "My team" badge.
- **Outcome:** the counsellor knows who is behind and acts.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J14.1 | Sees the badge with the number of counsellees who have overdue mandatory items | Sidebar | E4 | Met | TEAM-07 |
| J14.2 | Reads the roster: grade, readiness, hours, overdue or on track | My team | E4 | Met | TEAM-01..03 |
| J14.3 | Switches to levels by domain | My team heat map | E4 | Met | TEAM-05 |
| J14.4 | Compares with "Expected at next stage" | My team heat map | E4 | Met | TEAM-06 (fixed in `0b955a2`); one target set for every stage (E1.2) |
| J14.5 | Sees each counsellee's last activity | My team | E4 | Gap | E4.8 |
| J14.6 | Opens a counsellee read-only | My team → View as | E4 | Met | TEAM-04 |
| J14.7 | Nudges a counsellee about an overdue item | My team | E15 | Gap | Nothing is sent |

#### J15 Accept a completed learning

- **Trigger:** a counsellee logged their last hour or asked for approval.
- **Outcome:** the learning is accepted, with evidence, and counts toward the counsellee's levels.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J15.1 | Learns that a submission is waiting | Notifications, approvals queue | E15, E4 | Gap | E4.7, E15.2 |
| J15.2 | Opens the counsellee | My team or View as | E4 | Met | TEAM-04, VIEW-03 |
| J15.3 | Finds the submitted learning ("Awaiting <first name>") | Library, detail | E3 | Met | DET-19 |
| J15.4 | Reviews the evidence | Learning detail | E3 | Gap | E3.6 |
| J15.5 | Accepts; the toast names the counsellee | Learning detail | E3 | Met | DET-16, DET-17 |
| J15.6 | Returns it with feedback instead | Learning detail | E3 | Gap | E3.7 |
| J15.7 | A double click or a second accepter is handled | Learning detail | E3 | Met | DET-18 |

#### J16 Prepare a development conversation

- **Trigger:** a quarterly conversation or the promotion round.
- **Outcome:** the counsellor arrives with evidence and leaves with agreed actions on record.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J16.1 | Reads the counsellee's map, radar and readiness | View as | E1, E4 | Met | VIEW-04, MAP-08 |
| J16.2 | Reads the counsellee's ambitions and interests | View as, profile | E11 | Met | PRO-01 in View as (VIEW-04); `private.can_view_learner`, rls.sql |
| J16.3 | Reads evaluations and personality results the counsellee shared | View as, profile | E11 | Gap | E4.9 |
| J16.4 | Records notes and agreed actions | My team | E4 | Gap | E4.10 |

#### J17 Read-only View as: attempts to change a counsellee's data (unhappy)

- **Trigger:** a counsellor or admin views someone else and clicks an action.
- **Outcome:** nothing is written and the reason is clear.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J17.1 | The sidebar says "Viewing · read-only" and offers "Back to me" | Sidebar | E12 | Met | VIEW-05 |
| J17.2 | Logging hours, adding to the path or asking approval saves nothing and says so | Detail | E12 | Met | VIEW-06 |
| J17.3 | Removing ambitions, changing the avatar, chatting or saving a proposal does nothing | Profile | E12 | Met | VIEW-07..09 |
| J17.4 | A direct API write to the counsellee's rows is refused | Database | E12 | Met | VIEW-13 (rls.sql) |
| J17.5 | The learner's eye shows only the viewed person's reading | Curriculum mapping | E5 | Met | VIEW-11 (fixed in `0b955a2`) |
| J17.6 | A counsellor with nobody assigned sees "Nobody has you as counsellor yet" | My team | E4 | Met | TEAM-01, TEAM-02 |

### P5 Domain Admin

#### J18 Onboard a joiner to the line

- **Trigger:** a new hire starts in the line.
- **Outcome:** the joiner has an account, a stage, a counsellor and the line's path.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J18.1 | Creates the account in their own line, without role choices | User management | E12 | Met | USR-16 |
| J18.2 | Hands over the temporary password once | User management | E12 | Met | USR-13, USR-10 |
| J18.3 | Sets the career stage | User management | E12 | Met | USR-08 |
| J18.4 | Assigns a counsellor they manage | User management | E12, E4 | Met | USR-08, `private.guard_profile_assignments()` |
| J18.5 | The joiner sees the line's mandatory path | Growth map, library | E5 | Met | STG-07 |
| J18.6 | Places the joiner in industry and technology audiences | User management or profile | E5 | Gap | E5.9 |
| J18.7 | Provisions joiners in bulk from HR | — | E12 | Gap | E12.12 |

#### J19 Maintain the line's curriculum

- **Trigger:** a regulatory change or a new firm priority for the line.
- **Outcome:** a lean, published path for each stage of the line.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J19.1 | Opens Curriculum mapping on their own line | Curriculum mapping | E5 | Met | CUR-01 |
| J19.2 | Reads coverage, hours, mandatory items and reach per stage | Coverage grid | E5 | Partial | CUR-04; reach comes from constants (E5.10) |
| J19.3 | Maps, moves and re-obligates learnings | Board, palette, dock | E5 | Met | CUR-05..13 |
| J19.4 | Checks the load on one real person with the learner's eye | Learner's eye | E5 | Partial | CUR-28..30; business-line layer only (E5.8) |
| J19.5 | Publishes the pending changes | Curriculum mapping | E5 | Met | CUR-31..34 |
| J19.6 | Sets a deadline on a new mandatory item | Curriculum mapping or admin library | E5, E6 | Gap | E5.12, E6.7 |
| J19.7 | Sees who changed what, and rolls back a mistake | Curriculum mapping | E5 | Gap | E5.11 |

#### J20 Add a learning to the line's catalogue

- **Trigger:** a new course becomes available.
- **Outcome:** the learning is published for the line and ready to map.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J20.1 | Opens "+ Add learning"; the line defaults to their own | Admin library drawer | E6 | Met | ADM-04, ADM-05 |
| J20.2 | Imports title, source, hours and domain from a connected program | Admin library drawer | E6 | Partial | ADM-10 on seeded results (E6.6) |
| J20.3 | Is told what is missing or invalid | Admin library drawer | E6 | Met | ADM-11 |
| J20.4 | Saves as draft, marks for review or publishes | Admin library drawer | E6 | Met | ADM-12, ADM-13 |
| J20.5 | Adds a launch link and a deadline | Admin library drawer | E6, E2 | Gap | E2.8, E6.7 |

#### J21 Reach beyond the line: refused permissions (unhappy)

- **Trigger:** a Domain Admin tries something outside their line or role.
- **Outcome:** a clear refusal naming who can do it; nothing changes.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J21.1 | User management lists only people they may manage; roles are tags, not chips | User management | E12 | Met | USR-01, USR-06 |
| J21.2 | A System Admin row has no controls; their own stage and counsellor are read-only | User management | E12 | Met | USR-09 |
| J21.3 | Editing another line's or a firm-wide learning is refused, naming who edits it | Admin library | E6 | Met | ADM-08 |
| J21.4 | Removing or drafting a learning another line maps is refused | Admin library | E6 | Met | ADM-15, ADM-19 |
| J21.5 | Another line's audience is read-only, with a note naming who edits it | Curriculum mapping | E5 | Met | CUR-16, CUR-17 (fixed in `0b955a2`) |
| J21.6 | A copilot proposal outside the line is refused when applied | Curriculum mapping | E5 | Met | CUR-26 |
| J21.7 | Another line's bundle is read-only, but retrieval can still be tested | Knowledge library | E7 | Met | KB-40, KB-42 |
| J21.8 | A direct API call to manage a System Admin or another line's Domain Admin is refused | `manage-users`, RLS | E12 | Met | USR-18 (manual), rls.sql |

### P6 General Admin

#### J22 Steer the firm curriculum with signals and the copilot

- **Trigger:** new signals from evaluations and staffing, or a strategic theme.
- **Outcome:** curriculum changes grounded in evidence, checked on a learner's stack, and published.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J22.1 | Sees User management hidden; content screens open | Sidebar | E12 | Met | NAV-04 |
| J22.2 | Reads every open signal with its change, impact and evidence | Signals | E5 | Partial | CUR-19, CUR-20 on seeded signals (E5.6) |
| J22.3 | Applies or dismisses a signal | Signals | E5 | Met | CUR-21, CUR-22 |
| J22.4 | Asks the copilot to find duplicates or draft a path | Copilot | E5, E13 | Partial | Scripted (CUR-23); live needs E13 |
| J22.5 | Applies the copilot's proposal in one go | Copilot | E5 | Met | CUR-24, CUR-27 |
| J22.6 | Edits every lens, including industry, technology, ambition and profile | Curriculum mapping | E5 | Met | CUR-18 |
| J22.7 | The lens changes reach the learners in those audiences | Learners' maps | E5 | Gap | E5.9 |
| J22.8 | Publishes | Curriculum mapping | E5 | Met | CUR-31 |

#### J23 Govern the firm-wide catalogue

- **Trigger:** the yearly catalogue review.
- **Outcome:** unused and outdated learning is retired; firm-wide items stay current.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J23.1 | Publishes a firm-wide learning | Admin library | E6 | Met | ADM-12 |
| J23.2 | Finds learning nobody uses | Reports | E14 | Gap | E14.4 |
| J23.3 | Finds items past their review date | Admin library | E6 | Gap | E6.8 |
| J23.4 | Removes a learning every line maps | Admin library | E6 | Met | ADM-20 |
| J23.5 | The admin screens survive the removal of a learning a signal names | All admin screens | E16 | Met | CUR-36 (fixed in `0b955a2`) |

### P7 System Admin

#### J24 Govern roles and release safely

- **Trigger:** a role change request, or a release.
- **Outcome:** the right roles, traceably granted, on a secure and current production.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J24.1 | Grants or revokes System, General and Domain Admin roles | User management | E12 | Met | USR-04 |
| J24.2 | Cannot remove the last System Admin | User management | E12 | Met | USR-05 |
| J24.3 | Views any person read-only to support them | View as | E12 | Met | VIEW-03, VIEW-04 |
| J24.4 | Reads who changed which role, line, stage or counsellor, and when | Audit log | E12 | Gap | E12.11 |
| J24.5 | Turns on leaked-password protection | Supabase auth settings | E12 | Not built | Roadmap §6 |
| J24.6 | Ships v0.4.0 and smoke-tests each role | Release | E12 | Not built | Roadmap §1 |
| J24.7 | Names the expert for each domain, for review routing | Domain experts | E8 | Not built | v3-remaining Task 5 |

#### J25 Fresh database and broken references (unhappy)

- **Trigger:** a new environment, or content removed while other content still points to it.
- **Outcome:** every screen renders with an empty state.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J25.1 | Opens the app with no learnings | All screens | E16 | Met | EDGE-01 (fixed in `0b955a2`) |
| J25.2 | Opens the Knowledge library with no bundles | Knowledge library | E7 | Met | KB-12 (fixed in `0b955a2`) |
| J25.3 | Opens mapping with a mapping to a learning they cannot see | Curriculum mapping | E5 | Met | CUR-35 |
| J25.4 | Content loading fails: message and retry | Load error page | E16 | Met | STORE-02 |

### P8 Content creator

#### J26 Create and submit a contribution

- **Trigger:** a project lesson worth sharing.
- **Outcome:** a published piece in the library that colleagues use.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J26.1 | Opens Create & share | Create & share | E8 | Not built | Roadmap §3 |
| J26.2 | Picks a type and fills title, domain, level, audience stage and takeaway | Create & share, New | E8 | Not built | v3-remaining Task 6 |
| J26.3 | Chooses bundles and lets AI draft an outline with citations | Create & share, New | E8, E7, E13 | Not built | Roadmap §3, §4 |
| J26.4 | Uploads the video, audio or document | Create & share, New | E8 | Gap | E8.6 |
| J26.5 | Passes the automatic checks (title length, client names) | Create & share, New | E8 | Not built | v3-remaining Task 6 |
| J26.6 | Submits and sees who will review | Create & share, New | E8 | Not built | v3-remaining Task 5 |
| J26.7 | Receives "changes requested", edits and resubmits | Create & share, Mine | E8, E15 | Not built | v3-remaining Tasks 5–6; no notification (E15) |
| J26.8 | The published piece becomes a library learning that admins can map | Library, mapping | E8, E6 | Gap | E8.7 |
| J26.9 | Sees views, ratings, saves and audiences mapped | Create & share, Mine | E8 | Gap | E8.8 |

### P9 Knowledge manager

#### J27 Curate a bundle and tune retrieval

- **Trigger:** a new regulation or an updated firm methodology.
- **Outcome:** a current, validated bundle whose answers cite only allowed sources, checked by the logic engine where rules exist.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J27.1 | Creates a bundle or imports OKF files | Knowledge library | E7 | Met | KB-30..32 |
| J27.2 | Adds sources with their sensitivity | Sources tab | E7 | Met | KB-21, KB-22 |
| J27.3 | Sources are chunked, embedded and indexed for real | Ingestion | E7 | Not built | Roadmap §4 (KB-16 only simulates re-indexing) |
| J27.4 | Sets topics, tags and access | Overview | E7 | Met | KB-13..18 |
| J27.5 | Validates the OKF files and downloads the bundle | Files tab | E7 | Met | KB-27, KB-28 |
| J27.6 | Configures a RAG model | Models tab | E7 | Partial | KB-23..25 store every setting; only top-k, threshold and hybrid weight affect ranking (E7.6) |
| J27.7 | Tests retrieval and reads the cited answer | Test tab | E7 | Partial | KB-33..38; browser keyword ranking, live answer only inside Claude Design |
| J27.8 | Compares models on an evaluation set | Test tab | E7 | Not built | Roadmap §5 |
| J27.9 | Imports a formal theory from Intelli-Core and runs IDP-Z3 Verify or Infer | Models, Test tab | E7 | Not built | Roadmap §5 |
| J27.10 | Sees another admin's change before overwriting it | Knowledge library | E7 | Partial | Last writer wins (Roadmap §6) |

### P10 Reviewer

#### J28 Review a colleague's contribution

- **Trigger:** the reviewer is assigned as peer, expert or learning team.
- **Outcome:** an approval or a clear request for changes within five working days.

| Step | What happens | Screen / feature | Epic | Status | Evidence / what is missing |
|---|---|---|---|---|---|
| J28.1 | Is told a review is waiting (badge, message) | Sidebar, notifications | E8, E15 | Not built | Badge in v3-remaining Task 6; a message is a gap (E15.5) |
| J28.2 | Opens the Review tab: takeaway, preview and automatic checks | Create & share, Review | E8 | Not built | v3-remaining Task 6 |
| J28.3 | Can approve only when all four rubric items hold | Create & share, Review | E8 | Not built | v3-remaining Task 6 (`rubricComplete`) |
| J28.4 | Requests changes with a time-stamped comment | Create & share, Review | E8 | Not built | v3-remaining Tasks 5–6 |
| J28.5 | The author's counsellor is never chosen as reviewer | Routing | E8 | Not built | v3-remaining Task 5 |
| J28.6 | Gets credit for the review | Profile | E8 | Gap | E8.9 |

## 4. Validation summary

**Method.** Each status comes from the code (`src/model.ts`, `src/kbVals.ts`, `src/logic/*`, `src/screens/*`), the migrations and `supabase/tests/rls.sql`, and the functional test catalogue. The design was used only to know what was intended. On `main` at `01cbc67`, `npm test` passes 514 of 514 tests in 25 files (run with placeholder `VITE_SUPABASE_*` values; the tests swap in a fake client and never reach Supabase). Nothing touched Supabase or Vercel, so the RLS suite (`npm run test:db`) was not run; RLS statuses rest on `supabase/tests/rls.sql` and the migrations as written.

### Totals

| Status | Journey steps | Share | Epic acceptance criteria | Share |
|---|---|---|---|---|
| Met | 92 | 54% | 61 | 43% |
| Partial | 21 | 12% | 19 | 13% |
| Not built | 18 | 11% | 19 | 13% |
| Gap | 39 | 23% | 44 | 31% |
| **Total** | **170** (28 journeys) | | **143** (16 epics) | |

### Acceptance criteria per epic

| Epic | Met | Partial | Not built | Gap |
|---|---|---|---|---|
| E1 Growth map and readiness | 6 | 5 | 0 | 1 |
| E2 Library and discovery | 5 | 3 | 0 | 1 |
| E3 Completion, evidence, acceptance | 6 | 0 | 0 | 4 |
| E4 Counselling and team insight | 7 | 0 | 0 | 4 |
| E5 Curriculum mapping | 5 | 3 | 0 | 4 |
| E6 Catalogue administration | 5 | 2 | 0 | 2 |
| E7 Knowledge library, RAG, logic engine | 6 | 2 | 6 | 0 |
| E8 Create & share | 0 | 0 | 5 | 4 |
| E9 Podcasts and reels | 1 | 0 | 5 | 1 |
| E10 Avatar practice | 2 | 0 | 0 | 3 |
| E11 Profile, evaluations, personality | 1 | 3 | 0 | 4 |
| E12 Accounts, roles, governance | 8 | 0 | 2 | 3 |
| E13 Server-side AI | 2 | 0 | 1 | 2 |
| E14 Analytics and reporting | 0 | 1 | 0 | 6 |
| E15 Notifications and reminders | 1 | 0 | 0 | 4 |
| E16 Release readiness and robustness | 6 | 0 | 0 | 1 |

### Reading the numbers

- **The core learner loop is real and well tested.** Map, library, logging, acceptance, View as and roles are Met, enforced in the database and covered by RLS tests. More than half of all journey steps are Met, and the seven bugs the functional suite found are fixed.
- **The loop has no memory.** Nothing records when something was started, submitted or accepted, by whom, or with what evidence. That single absence makes E3.6–E3.8, E4.7–E4.8, E14 and most "measurable today?" answers fail.
- **Admins configure more than learners receive.** Four of the five curriculum lenses can be mapped but reach nobody (E5.9), and signals, reach figures and targets are constants.
- **The "Not built" items are well planned; the "Gap" items are not.** Everything Not built has a roadmap or plan item. The 44 Gap criteria cluster in reporting, notifications, evidence, data sources (evaluations, personality, avatar runs) and governance (audit log, SSO, export).

## 5. Top gaps

Ranked by how much they block a credible pilot with an L&D buyer in a professional-services firm.

| Rank | Gap | Why it matters | Where |
|---|---|---|---|
| 1 | **Lens audiences never reach a learner.** No one is a member of an industry, technology, ambition or profile audience; the learner's map, readiness and learner's eye read only the business line. | The design's core idea ("a person's path is the stack of every audience they belong to") works for admins only. Admins can map to four lenses with no effect on anybody's path. | E1.11, E5.8, E5.9, J08.6, J18.6, J22.7; `Logic.mapping()`, `mePersona()` |
| 2 | **Acceptance without evidence, send-back or record.** No evidence attachment, no "changes requested", no `accepted_by` or `accepted_at`, no state history. | Levels feed promotion decisions and CPD; without evidence and a record the firm cannot defend either, and counsellors can only accept or ignore. | E3.6–E3.8, J02.7, J15.4, J15.6 |
| 3 | **No reporting.** No view of mandatory completion, readiness or CPD beyond one counsellor's team; no CPD per professional body; no export. | Reporting is the first thing an L&D leader, a partner meeting or a professional body asks for. Without it the pilot cannot show impact. | E14, J12, J23.2 |
| 4 | **No notifications or approvals queue.** Submissions, acceptances, deadlines and (later) review requests reach nobody. | Acceptance stalls, overdue items grow, and Create & share's five-day review steps cannot work. | E15, E4.7, J05.5, J15.1, J28.1 |
| 5 | **Deadlines and targets are not modelled.** Deadlines are free text on the learning, admins cannot set them, they are not per audience, two parsers read them differently, and an unreadable date silently lands in the first quarter; the road is a fixed Q4 2026 – Q3 2027 window; next-stage targets are one constant for every stage and line. | Mandatory compliance needs dates per audience; readiness for a Senior manager cannot use an Analyst's target. | E1.2, E1.4, E5.12, E6.7, E16.4 |

Other notable findings:

- **Privacy promise not enforced (E11.8).** The profile says "You decide what your counsellor sees", but RLS lets the counsellor read every ambition and interest. Either the copy or the policy must change before real people use it.
- **Ratings and notes are not stored (E2.6).** "Post note" only shows a toast, which a pilot user will notice at once.
- **No "remove from my path" (E2.7)** and **no direct way to add an ambition (E11.3).**
- **Create & share has no hand-over into the catalogue and no media storage** (E8.6, E8.7), and the plan has no notification for reviewers. Planning these now avoids rework.
- **Avatar practice, evaluations and personality profiles have no data source and no roadmap item** (E10, E11.5–E11.7). They are visible in the app as prototype toasts.
- **Roadmap order conflict.** Roadmap §4 (server-side AI) is a stated prerequisite for §3 (Create & share, "Draft with AI"), yet is ordered after it.

## 6. Product backlog view

Effort is a rough size for the current team (one developer working with agents): S up to one week, M two to three weeks, L four to six weeks, XL more than six weeks. Value is for a pilot with real users in one or two business lines.

| Rank | Backlog item | Epics | Value | Effort | Depends on | Recommendation |
|---|---|---|---|---|---|---|
| 1 | **Finish hardening v0.4.0** (deployed and smoke-tested 1 Nov 2026): leaked-password protection, settle the counsellor-privacy mismatch | E12, E16, E11.8 | High | S | Owner's go to deploy | Do first. Production still serves v0.3.0; the fixes of `0b955a2` remove four blank-page crashes, and the privacy copy must match the policy before real users arrive |
| 2 | **Close the completion loop:** a `learning_events` history (who, what, when), `accepted_by`/`accepted_at`, evidence upload (Supabase Storage), "changes requested" with a comment, an approvals queue on My team, last activity | E3, E4 | High | M | 1 | Next. It turns levels into defensible evidence and is the base for reporting and notifications |
| 3 | **Deadlines, targets and audience membership:** dates per mandatory mapping set by admins; next-stage targets per stage (and optionally per line); an `audience_members` model (ambitions and personality opt-in by the learner, industry and technology by admins or staffing) that `mapping()`, readiness and the learner's eye stack | E1, E5, E6, E16 | High | M | 1 | Do with 2. It makes the curriculum model the design promises actually reach people |
| 4 | **Server-side AI proxy** (first half of Roadmap §4): one edge function, caller's token, rate limit, EU processing; switch the four assistants to it | E13, E11, E5 | High | M | 1 | Move ahead of Create & share, as the roadmap itself says it is a prerequisite |
| 5 | **Notifications MVP:** email or Teams digest for submissions, acceptances and returns, deadline reminders, overdue nudges from My team | E15 | High | M | 2, 3 | Cheap once events exist; shortens acceptance time |
| 6 | **Reporting MVP:** mandatory completion and overdue per line and stage, readiness distribution, CPD per person per professional body with CSV export, content use; minimum group size | E14 | High | M | 2, 3 | The L&D buyer's first question; build on the event history |
| 7 | **Podcasts and reels** (Roadmap §2): rebase the parked branch, move media to the database, decide self-completion | E9 | Medium | S | 1 | Quick win; most of it is built. Can run in parallel with 2–3 |
| 8 | **Library polish:** store ratings and notes, "remove from my path", launch links, add an ambition directly | E2, E11 | Medium | S | 1 | Small items users notice immediately |
| 9 | **Create & share with peer review** (Roadmap §3), extended with media storage, reviewer notifications, the hand-over of a published piece into `learnings`, and author statistics | E8 | Medium–High | L | 4, 5, 8 | After the loop is solid; it reuses events, notifications and ratings |
| 10 | **Real ingestion and retrieval** (second half of Roadmap §4): E5 embeddings on an EU host, pgvector, hybrid retrieval in the database | E7 | Medium | L | 4 | Needed for trustworthy "Draft with AI" and test retrieval |
| 11 | **RAG architectures and the logic engine** (Roadmap §5): `kb-ask`, IDP-Z3 Verify and Infer, theory import from Intelli-Core, evaluation sets | E7 | Medium (high for Tax & Legal) | XL | 10, hosted IDP Studio | Start with evaluation sets and Verify on one Tax & Legal bundle to prove value before the full fusion |
| 12 | **Governance for production:** audit log of role and assignment changes, SSO with the firm's identity provider, HR provisioning, personal data export and retention | E12 | High before go-live, low for the pilot | M–L | 1 | Required before firm-wide roll-out, not for a closed pilot |
| 13 | **Evaluations and personality data sources:** performance-tool connector, personality result upload, stored visibility | E11, E1, E5 | Medium | L | external systems | Decide with the owner whether a manual upload is enough for the pilot |
| 14 | **Avatar studio:** sessions, scoring, private runs, sharing | E10 | Medium | XL | 4 | Decide build, buy or park, as was done for podcasts; today it shows as a prototype toast |
| 15 | **Real program connectors and catalogue review dates** | E6, E3.9 | Medium | L | external systems | After the pilot proves which providers matter |

**Recommendation as product owner.** Keep Roadmap §1 first, then insert the "learning record" work (items 2, 3, 5 and 6) before Create & share and the RAG work. An LXP in a professional-services firm is judged first on mandatory compliance, evidence and reporting; Create & share and the logic engine are strong differentiators but only pay off once completions are trustworthy and reach the right people. Move the server-side AI proxy ahead of Create & share, and run podcasts and reels in parallel as the quick visible win.

## 7. Owner's answers (1 Nov 2026)

Overall: keep it simple and do not over-engineer. It is a proof of concept, but whatever is there must work and be consistent.

| Id | Question | Context | Answer |
|---|---|---|---|
| Q1 | Should "Needs review" learnings be visible to learners? | Roadmap §1; today only drafts are hidden (E2.9) | No: hide them from learners, like drafts. |
| Q2 | May a Domain Admin map another line's published learning into their own line? | Roadmap §1; allowed today (E6.9) | Yes. |
| Q3 | Does a correct reel answer complete the reel without a counsellor (trust-based)? | v3-remaining open decision 2 (E9.4) | Yes. |
| Q4 | Who decides membership of industry, technology, ambition and profile audiences: the learner, admins, staffing data, or a mix per lens? | Gap 1 (E5.9) | The System Admin configures it in a matrix of roles (learner, Domain Admin, General Admin, counsellor) against audiences. |
| Q5 | Should readiness count submitted hours before they are accepted? | Today it does (`progressHours`), so readiness can rise without acceptance (E1.3) | No: only accepted hours count. |
| Q6 | Are next-stage targets firm-wide, or per stage and per business line? | One constant `TARGET` today (E1.2) | Per stage and per business line. |
| Q7 | What evidence does each format need (certificate, attendance, reflection), and may a General Admin accept? | E3.6; today only the counsellor, a Domain Admin of the line or a System Admin accept | Depends on the learning type; a General Admin can also accept. |
| Q8 | What may a counsellor see by default: everything, or only what the learner shares? | Profile copy and RLS disagree (E11.8) | The counsellor sees the formal learning track, not the personality and ambition parts. |
| Q9 | Are ratings and notes public to all colleagues, and are they moderated? | E2.6 | Yes. |
| Q10 | Who is a "creator": everyone, or people who opt in? Do authors and reviewers earn CPD or recognition? | E8.9; bundle access already distinguishes "All creators" and "Tax & Legal creators" | Everyone. |
| Q11 | Which reports are needed first, for whom, and under which privacy rules (works council, minimum group size)? | E14 | Keep it minimal (proof of concept). |
| Q12 | Which notification channel: email, Microsoft Teams or in-app only? | E15 | Keep it simple. |
| Q13 | When are single sign-on and HR provisioning needed: for the pilot or only for the firm-wide roll-out? | E12.12 | Keep it simple; not now. |
| Q14 | Should Domain Admins see curriculum signals for their own line? | Today none of the seeded signals reach a Domain Admin (CUR-19) | Yes. |
| Q15 | Is the 80-hour annual goal firm policy, and does it vary by stage or professional body? | Constant in `renderVals()` (E1.8) | It varies; make it configurable, simply. |
| Q16 | Avatar studio: build, buy or park? Evaluations and personality data: connector or manual upload for the pilot? | E10, E11.5–E11.7 | Park the avatar studio; it will later be integrated with the Taxatar project. Keep evaluations and personality simple. |
| Q17 | Is the `domain_experts` table (filled by System Admins) the right source for expert reviewers, with any System Admin as fallback? | v3-remaining open decision 5 | Yes. |
