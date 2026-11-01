# Real users and design v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the seeded persona Lena Mertens with real accounts (an admin can choose whose app they are looking at), then implement the design changes of 1 Nov 2026: learner media, domain zoom, Create & share with peer review, and the admin Knowledge library.

**Architecture:** Per-user learner data (progress, ambitions, interests, avatar prefs, counsellor) moves into Supabase with RLS; the app loads a *subject* (the person being viewed) and `Logic` derives everything from it instead of from seed constants. Design v3 is ported the same way as earlier versions: data verbatim into `src/data.ts`, logic into small pure modules under `src/logic/` (unit-tested) that `Logic.renderVals()` calls, screens transcribed from the template.

**Tech Stack:** React 19, Vite, TypeScript, Supabase (Postgres RLS, auth, edge functions), Vitest (new), Playwright MCP for UI checks.

**Spec:** the owner's requirements below, plus the Claude Design file `MyProfessionalMe.dc.html` (project `797ed301-7b6d-47eb-9e2d-6d7d2e7483c3`), version fetched 1 Nov 2026.

### Owner requirements (this round)

1. The card at the bottom of the sidebar (now "Lena Mertens · Counsellor: Thomas De Smet") shows an actual user. An admin can choose which user.
2. Remove all seeded information about Lena Mertens.
3. Implement the latest design changes.

## Global Constraints

- Business lines are `Consulting`, `Audit`, `Tax & Legal`. The design still says Advisory; keep Audit everywhere (EXPERTS, AUDS, MAPS0, copy).
- Roles stay as built: System Admin sees and manages everyone; Domain Admin only users of the line(s) they administer, never a System Admin or another line's admin (`private.can_manage_user`).
- Viewing another user is read-only. Only the person themselves writes their learner data; RLS enforces it, the UI only mirrors it.
- Every new table: `revoke all … from anon, authenticated`, then minimal grants, RLS on, policies `to authenticated` with predicates (this project applies Supabase's default ALL grants).
- No secret or `service_role` key in the app. AI calls keep the pattern: `window.claude.complete` if present, otherwise a scripted reply.
- Respect `?motion=off` and `prefers-reduced-motion` for every new animation (`[data-pm-motion]` rules in `src/styles/index.css`).
- After editing `CLAUDE.md`, run `npm run agents` and commit `AGENTS.md` with it.
- Inline styles on DS tokens; no Tailwind. Match the design's pixel values.

## Review Focus

1. **A brand-new user with no data.** Map, radar, road, library and profile render without `undefined`, `L0`-index errors or NaN: domain level 0 shows as "Not started", readiness 0%, clouds empty. Test: `levelsByDomain` returns zeros for empty progress (Task A1), plus the Playwright sweep (Task A7).
2. **A user without business line or career stage** (for example the System Admin). The app renders with a notice instead of crashing. Test: `stageIndex(null) === 0`; render check in Task A7.
3. **An admin viewing someone else tries to change something.** No write reaches the database: buttons are disabled and RLS rejects direct writes. SQL test in Task A2; UI check in Task A7.
4. **Switching the viewed user quickly.** The screen never shows user A's data under user B's name. Test: `useSubject` ignores a stale load (Task A4).
5. **A learner marking their own mandatory item `accepted` through the API.** Rejected; only a counsellor or admin may accept. SQL test in Task A2.

---

## Task 0: Full design source (blocks Parts B–D)

The design tool's file reader stops at 256 KB, and `MyProfessionalMe.dc.html` is now about 264 KB. Templates and data arrived complete; the `Component` class is cut off inside `constellation()`. Missing: the zoom geometry, `renderVals`, and all Knowledge-library and Create & share logic.

- [ ] **Step 1:** The owner exports the file from Claude Design (Share → Download, or copy the source) and saves it as `design/MyProfessionalMe.dc.html` in this repo. Add `design/` to `.gitignore`: the file references the TaxConnect design system, and the repo is public.
- [ ] **Step 2:** Verify it is complete: `tail -c 200 design/MyProfessionalMe.dc.html` ends with `</html>`, and `grep -c "kbDetailMode\|reviewBadge" design/MyProfessionalMe.dc.html` is at least 2.

Part A does not depend on this task.

---

# Part A: Real users instead of Lena (release v0.4.0)

### Task 1 · A1: Test harness and learner derivations

**Files:**
- Modify: `package.json` (devDependency `vitest`, pinned exact; script `"test": "vitest run"`)
- Create: `src/logic/learner.ts`, `src/logic/learner.test.ts`

**Interfaces:**
- Produces:
  - `type LearnState = 'not-started' | 'in-progress' | 'submitted' | 'accepted'`
  - `type Progress = Record<string, { state: LearnState; pct: number; chosen: boolean }>`
  - `levelsByDomain(progress: Progress, learn: Learn[]): number[]`: 9 entries in `DOMAINS` order; each is the highest `lvl` among `accepted` learnings in that domain, 0 if none.
  - `stageIndex(stage: string | null | undefined): number`: index in `STAGES`; 0 when unknown.
  - `levelLabel(level: number): string`: `'Not started'` for 0, otherwise `LEVELS[level - 1] + ' · L' + level`.

- [ ] **Step 1: Write the failing tests.** `levelsByDomain({}, LEARN)` deep-equals `[0,0,0,0,0,0,0,0,0]`. With `{ L1: accepted, L3: accepted }` (both `tech`, levels 3 and 4), index 0 is 4. An `in-progress` item does not count. `stageIndex(null) === 0`, `stageIndex('Senior consultant') === 2`. `levelLabel(0) === 'Not started'`, `levelLabel(3) === 'Advanced · L3'`.
- [ ] **Step 2:** `npm test`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement the three functions in `src/logic/learner.ts`.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `test: add vitest and learner derivations`.

### Task 2 · A2: Learner data in Supabase

**Files:**
- Create: `supabase/migrations/<ts>_learner_data.sql` (with `supabase migration new learner_data`; never invent the timestamp)
- Create: `supabase/tests/rls.sql`: move the rolled-back RLS script from the session scratchpad into the repo and extend it
- Modify: `CLAUDE.md` (Accounts and roles section; mention `supabase/tests/rls.sql`)

**Interfaces:**
- Produces, in Postgres:
  - enum `public.career_stage` (`Analyst`, `Consultant`, `Senior consultant`, `Manager`, `Senior manager`)
  - `profiles.career_stage public.career_stage` (nullable), `profiles.counsellor_id uuid references profiles on delete set null`, both added to the column-level `grant update (…)` that admins use
  - `public.learner_learnings(user_id uuid → profiles on delete cascade, learning_id text, state text check in ('not-started','in-progress','submitted','accepted'), pct smallint check 0..100, chosen boolean default false, updated_at timestamptz, primary key (user_id, learning_id))`
  - `public.ambitions(id bigint identity pk, user_id → profiles cascade, text text not null, horizon text, domains text[] not null default '{}', source text, created_at)`
  - `public.interests(id bigint identity pk, user_id → profiles cascade, label text not null, domain text not null, created_at, unique (user_id, label))`
  - `public.learner_prefs(user_id pk → profiles cascade, avatar_initials text, avatar_color text)`
  - `private.can_view_learner(target uuid) returns boolean`: `target = auth.uid()` or `private.can_manage_user(target)` or the caller is the target's counsellor. Same `security definer stable set search_path = ''` pattern and grants as the existing helpers.
- RLS on all four tables. SELECT: `can_view_learner(user_id)`. INSERT, UPDATE, DELETE: `user_id = (select auth.uid())`. On `learner_learnings`, the owner's `with check` additionally requires `state <> 'accepted'`. A second UPDATE policy lets the counsellor or `can_manage_user` set `state = 'accepted'`.
- Profiles SELECT policy also admits a counsellor reading their counsellees.

- [ ] **Step 1: Write the failing SQL tests** in `supabase/tests/rls.sql`, inside the existing `begin … rollback` harness. Cases:
  - the owner inserts progress (1 row)
  - the owner sets `accepted` (blocked, 42501)
  - a Consulting Domain Admin reads a Consulting user's progress (1 row) but updates it (0 rows)
  - a Tax & Legal user cannot see the Consulting user's ambitions (0 rows)
  - the counsellor reads the counsellee's progress (1 row) and sets `accepted` (1 row)
  - anon reads `learner_learnings` (blocked)
- [ ] **Step 2:** `supabase db query --linked -f supabase/tests/rls.sql`. Expected: the new cases FAIL (relation does not exist).
- [ ] **Step 3:** Write the migration as specified above.
- [ ] **Step 4:** `supabase db push`, rerun the tests (all PASS), then `supabase db advisors --linked` (no new warnings).
- [ ] **Step 5:** Commit: `feat(db): per-user learner data with RLS`.

### Task 3 · A3: Strip Lena from the seed data

**Files:**
- Modify: `src/data.ts`, `src/types.ts`, `src/logic/learner.test.ts`

**Interfaces:**
- Produces: `Learn` becomes `[id, title, dom, lvl, format, source, hours, cpd, due, why]`. The `state` and `pct` columns are removed, so every `row[8]` and `row[9]` destructuring in `model.ts` shifts.
- Removed exports: `MY_STAGE`, `CUR`, `AMB0`, `INT0`. `PROJECTS` and `TESTS` become empty arrays (keep their types for later sync). Every `AVATARS[*].attempts` becomes `[]`. `PERSONAS` loses the `lena` entry.
- `why` texts that speak about Lena's history ("Thomas added it after your Delcroix engagement review", "You chose this one yourself on …") get neutral firm wording. Keep the rest of each sentence.

- [ ] **Step 1: Write the failing test.** No string in `JSON.stringify` of any `src/data.ts` export matches `/Lena|Mertens|Thomas/`, and every `LEARN` row has length 10.
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Edit `src/data.ts` and `src/types.ts` as specified.
- [ ] **Step 4:** `npm test` PASS. `npx tsc -b` will now fail in `model.ts`; that is Task A4's starting point. Do not commit a broken build: continue straight into A4 and commit them together.

### Task 4 · A4: The subject: whose app you are looking at

**Files:**
- Create: `src/lib/learnerStore.ts`, `src/lib/useSubject.ts`, `src/lib/useSubject.test.ts`
- Modify: `src/model.ts`, `src/App.tsx`, `src/types.ts`

**Interfaces:**
- Consumes: `Progress`, `levelsByDomain`, `stageIndex`, `levelLabel` (A1); the tables from A2; `useAuth()` / `Auth` (existing).
- Produces:
  - `type LearnerData = { progress: Progress; ambitions: Ambition[]; interests: Interest[]; prefs: { initials: string; color: string } }`
  - `type Subject = { id: string; name: string; email: string; businessLine: string | null; stage: string | null; counsellor: { id: string; name: string } | null; readOnly: boolean; data: LearnerData }`
  - `learnerStore.ts`: `loadLearner(userId: string): Promise<LearnerData>`, `saveProgress(userId: string, learningId: string, patch: Partial<{ state: LearnState; pct: number; chosen: boolean }>): Promise<void>` (upsert), `addAmbition(userId, a: Omit<Ambition, 'id'>): Promise<Ambition>`, `removeAmbition(id: string)`, `addInterest(userId, i: Interest)`, `removeInterest(userId, label: string)`, `savePrefs(userId, prefs)`. Each throws `Error` with the Supabase message.
  - `useSubject(auth: Auth): { subject: Subject | null; options: { id: string; label: string }[]; select: (id: string) => void; reload: () => Promise<void> }`. `options` is the RLS-visible profiles (self first); non-admins get only themselves. The selection is kept in `sessionStorage` under `mpm-subject` and falls back to self.
  - `Logic` constructor gains `subject: Subject` as its last parameter. `bl()` returns `subject.businessLine ?? props.businessLine`. `MY_STAGE` is replaced by `stageIndex(subject.stage)`, and `CUR[i]` by `levelsByDomain(subject.data.progress, LEARN)[i]`. `item()` reads state, pct and chosen from `subject.data.progress[id]` (default `not-started`, 0, false). `AppState` drops `states`, `pcts`, `chosen`, `ambitions`, `interests`, `avatar`.
  - Every write action (`addToPath`, `logHours`, `askApprove`, `saveProposal`, ambition/interest remove, avatar changes) calls `learnerStore` and then `useSubject.reload()`. When `subject.readOnly`, it does nothing and toasts `'Viewing <name> · read-only'`.

- [ ] **Step 1: Write the failing test** in `useSubject.test.ts`. Mock `loadLearner` with deferred promises, select A then B, resolve B then A: `subject.id` ends as B and B's data is shown (the stale-load guard).
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `learnerStore.ts` and `useSubject.ts`. Guard stale loads with the same `live` flag pattern as `useAuth`.
- [ ] **Step 4:** Rewire `model.ts` and `App.tsx` as specified. `Workspace` waits for `subject` (blank page while loading, like `useAuth`). The avatar photo stays in `localStorage`, keyed `mpm-avatar:<userId>`.
- [ ] **Step 5:** `npm test`, `npx tsc -b`, `npm run lint`. All clean.
- [ ] **Step 6:** Commit A3 and A4 together: `feat: learner app follows a real user; remove Lena seed data`.

### Task 5 · A5: Sidebar subject picker and counsellor assignment

**Files:**
- Modify: `src/App.tsx` (sidebar top card and footer card), `src/screens/Users.tsx`
- Create: `src/screens/SubjectPicker.tsx`

**Interfaces:**
- Consumes: `useSubject` (A4); `profiles.career_stage` and `counsellor_id` (A2).
- Produces: `SubjectPicker({ options, current, onSelect, onClose })`, a DS `Drawer` titled "View as" with a search `Input` and a list of `options`.
- Sidebar **top card**: subject name, `stage · business line` (or "No business line yet"), readiness bar and `N% ready for <next stage>`. The review date is gone.
- Sidebar **footer card** (the one in the screenshot): the subject's avatar, name and `Counsellor: <name>` (or "No counsellor"). For admins the card is a button ("Change" link, `title="View the app as another user"`) that opens `SubjectPicker`. When the subject is not the signed-in user, a `Tag tone="amber"` says "Viewing · read-only", and a `LinkButton` "Back to me" selects self.
- **User management**: two new columns, **Stage** (`Select` of the `career_stage` values) and **Counsellor** (`Select` of the visible users plus "None"). Both update `profiles` under the existing RLS; reuse `setLineOf`'s pattern.

- [ ] **Step 1:** Implement the drawer and the two sidebar cards.
- [ ] **Step 2:** Add the Stage and Counsellor columns to `Users.tsx`. Widen `COLS` and check the table still fits 1440 px with horizontal scroll below.
- [ ] **Step 3:** Playwright: sign in as a throwaway System Admin, create a user with stage Consultant and counsellor = the admin, pick them in "View as", and check name, stage and the read-only tag. "Back to me" returns. Delete the throwaway accounts afterwards.
- [ ] **Step 4:** Commit: `feat: choose the viewed user; stage and counsellor in user management`.

### Task 6 · A6: Copy and empty states without Lena or Thomas

**Files:**
- Modify: `src/model.ts`, `src/screens/Map.tsx`, `src/screens/Library.tsx`, `src/screens/Projects.tsx`, `src/screens/Profile.tsx`, `src/screens/Team.tsx`, `src/data.ts` (`STATE_LABEL`)

**Interfaces:**
- Counsellor references use `subject.counsellor?.name` with the fallback "your counsellor". This covers "Ask <name>", "Awaiting <first name>", approval notes, the share toggle label and toasts. `STATE_LABEL.submitted` becomes `'Awaiting counsellor'`; the component substitutes the name.
- Map centre text: the subject's name. Readiness labels say "next stage" instead of "Manager". `TARGET` stays the firm's next-stage expectation.
- Marks card: shown only when earned. "All nine domains touched" when every domain has one accepted item; "First certification" when any accepted item has format `Certification`. The streak mark goes.
- Projects & evaluations: with `PROJECTS` empty, show an empty state: "No evaluations yet. They appear here once the performance tool is connected."
- Profile: personality tests show an empty state with the existing "+ Add a test result" button. The chat greeting is built from the subject's ambition and interest counts. `sysPrompt()` uses the subject's name, line and stage, and drops the hard-coded personality and project feedback.
- My team: the subject's real counsellees (`profiles.counsellor_id = subject.id`), with readiness and hours from their learner data (`loadLearner` per counsellee) and levels via `levelsByDomain`. The empty state reads "Nobody has you as counsellor yet". `TEAM` is removed from `data.ts`.

- [ ] **Step 1: Write the failing test.** `grep -rn "Lena\|Thomas\|Mertens" src` returns nothing. Make it a Vitest test reading the files with `node:fs`, so it keeps guarding.
- [ ] **Step 2:** Make the edits above.
- [ ] **Step 3:** `npm test`, `npx tsc -b`, `npm run lint` clean.
- [ ] **Step 4:** Commit: `feat: counsellor and empty states from real data`.

### Task 7 · A7: Verify, document, release v0.4.0

- [ ] **Step 1:** Playwright sweep against the dev server with throwaway accounts (System Admin, Consulting Domain Admin, plain member with and without stage and line):
  - every screen renders with a clean console
  - Review Focus 1–3 hold
  - logging an hour persists across reload
- [ ] **Step 2:** `supabase db query --linked -f supabase/tests/rls.sql`: all PASS. Delete the throwaway accounts and confirm only real accounts remain.
- [ ] **Step 3:** Update `CLAUDE.md`: subject model, learner tables, the picker, Lena removed. Then run `npm run agents`, update the README, commit, and `vercel deploy --prod`. Tag and release v0.4.0 on the owner's go.

---

# Part B: Learner media and domain zoom (design v3; release v0.5.0)

All of Part B needs Task 0. Port names come from the template (`fmtTiles`, `reelStrip`, `zm`, `det.pod`, `det.reel`). Logic comes from the full design source, adapted to the Part A subject model.

### Task 8 · B1: v3 seed data, keyframes and DS Stepper

**Files:** `src/data.ts`, `src/types.ts`, `src/styles/index.css`, `src/ds/index.tsx`, `src/logic/data.test.ts`
- Add learnings `L42`–`L48` (without the removed state and pct columns). Change `L45`'s source from "Peer · Lena Mertens" to a non-Lena peer, and drop its "Your own reel…" text. Add `MEDIA`, `REVIEW_STAGES`, `REVIEW_WHO`, `NEW_TYPES`, `CLIENT_WORDS`, `PEERS`, `EXPERTS` (with Advisory → Audit), `KB_TYPES`, `TOPICS`, `TOPIC_BY`, `RAG_PRESETS`, `RAG_OPTS`, `ragOptLabel`, `mkModels`, `BUNDLES0`, `KB_ACCESS`, `RUBRIC`, `slugify`, `isoDate`, `yamlList`, `yq` verbatim. `CONTRIB0` and `REVIEWS0` are not ported (Part C makes them real).
- New types in `src/types.ts`, matching the data shapes verbatim:
  - `PodMedia = { kind: 'pod'; by; len; dur: number; ch: [number, string][] }`
  - `ReelMedia = { kind: 'reel'; by; len; dur: number; caps: string[]; take; q; opts: string[]; ans: number }` (check the answer field name against the full source)
  - `RagModel = { id; def: boolean; name; embed; chunk; overlap; topk; hybrid: number; thresh; rerank: boolean; gen; temp; cite }`
  - `Bundle = { id; name; owner; topic; topics2: string[]; desc; access; fresh; status; updated; usedBy: number; tags: string[]; sugg: [string, number][]; models: RagModel[]; sources: [string, string, string, number, string, string][]; chunks: [number, string][]; concepts: unknown[] }` (tighten `concepts` from the full source)
- Keyframes `pmEq`, `pmBlink`, `pmFlip`, `pmPage`, `pmTravel`, `pmScan`, `pmZoomIn`, `pmBob`. Port the DS `Stepper` from the bundle (`steps`, `current`).
- [ ] **Tests:**
  - every `MEDIA` key exists in `LEARN` with format `Podcast` or `Reel`
  - every bundle `topic` and `topics2` is in `TOPIC_BY`
  - `slugify('Écoles & Taxes!') === 'ecoles-taxes'`
  - `isoDate('3 Oct 2026') === '2026-10-03'`
  - `yamlList(['a', 'b:c']) === '[a, "b:c"]'`
- [ ] Commit: `feat(data): design v3 seed data, keyframes, Stepper`.

### Task 9 · B2: Library: format tiles, quick-learning reels, illustrated covers

**Files:** `src/logic/covers.ts`, `src/logic/covers.test.ts`, `src/model.ts`, `src/screens/Library.tsx`
- **Interfaces:** `cover(row: Learn, index: number, state: LearnState): Cover`, ported from the design's `cover(r, i)`. `Cover` carries `kind: 'pod' | 'reel' | 'avatar' | 'game' | 'book' | 'class' | 'elearn' | 'mentor' | 'web' | 'cert'` plus the per-kind fields the template binds (`cvTag`, `cvBg`, `cvFg`, `cvLine`, `cvMeta`, `tiles`, `lvDots`, `seats`, `segs`, `cvDone`). `fmtTiles` replaces the format `Select` (one tile per format plus "All", with counts; clicking toggles `libFormat`).
- [ ] **Tests:**
  - the cover kind for each format in `LEARN`
  - `cvDone` is true only for `accepted`
  - tile counts sum to `LEARN.length`
  - Review Focus: a combined filter that yields nothing shows the "No learnings match" empty state (Playwright)
- [ ] Commit: `feat(library): format tiles, reels strip, covers`.

### Task 10 · B3: Detail: podcast player and reel viewer

**Files:** `src/logic/media.ts`, `src/logic/media.test.ts`, `src/lib/usePlayer.ts`, `src/model.ts`, `src/screens/Library.tsx`
- **Interfaces:**
  - `podView(media: PodMedia, t: number, speed: '1' | '1.25' | '1.5'): { w: string; time: string; left: string; chapters: { t: string; label: string; on: boolean }[] }`
  - `reelView(media: ReelMedia, t: number, answer: number | null)`, which returns the caption for `t` and the quiz feedback
  - `usePlayer(durationSec: number)`: `{ t, playing, toggle, seek(sec), speed, setSpeed }`. It uses `setInterval` and must clear on unmount and when the learning changes.
  - A correct reel answer saves the learning as `accepted` with pct 100, once. Note that A2 only lets a counsellor or admin set `accepted`, so reels need a narrow exception: extend the owner `with check` to allow `accepted` when `learning_id` is a Reel. Put the Reel id list in a SQL immutable function `private.is_self_complete(text)` in a small migration, and add an RLS test.
- [ ] **Tests:**
  - `podView` at `t = 600` on `L42` marks chapter 2 as `on`
  - seeking past the duration clamps to the duration
  - changing speed keeps `t`
  - answering twice saves once (mock `saveProgress`)
  - the RLS test: an owner can accept a Reel but not a Classroom item
- [ ] Commit: `feat(detail): podcast player and reel viewer`.

### Task 11 · B4: Growth map domain zoom and avatar SVG photo

**Files:** `src/logic/zoom.ts`, `src/logic/zoom.test.ts`, `src/model.ts`, `src/screens/Map.tsx`
- **Interfaces:** `zoomView(domainIndex: number, items: Item[], levels: number[], targets: number[]): Zoom`, ported from the design (`zm`: `origin`, `clouds`, `band`, `rings`, `nodes`, `cur`, `name`, `levelText`, `hoursText`, `pulls`, `nextTitle`), plus `prev` and `next` that wrap 0↔8. `AppState.zoom: number | null`. Double-clicking a hub or clicking its zoom button sets it; "← All domains" clears it. `cHint` copy comes from the design. `avatarSvgC` and `avatarSvgR` render the photo `<image>` with clip paths when a photo exists.
- [ ] **Tests:**
  - `zoomView` node count equals the domain's learnings
  - `prev` of 0 is 8 and `next` of 8 is 0
  - a domain with no accepted items renders level text "Not started"
- [ ] Commit: `feat(map): domain zoom`.

---

# Part C: Create & share with peer review (release v0.6.0)

Reviews are done by other people, so this part persists in Supabase. Reviewers are real users.

### Task 12 · C1: Contributions and reviews in the database

**Files:** `supabase/migrations/<ts>_contributions.sql`, `supabase/tests/rls.sql`
- **Tables:**
  - `public.contributions(id uuid pk default gen_random_uuid(), author_id → profiles cascade, type text check in NEW_TYPES labels, title text check (char_length(title) <= 60), domain text, level smallint, audience_stage public.career_stage, takeaway text, bundle_ids text[], stage smallint 0..4, status text check in ('draft','review','changes','published'), created_at, updated_at)`
  - `public.contribution_reviews(contribution_id → contributions cascade, reviewer_id → profiles, step smallint 1..3, verdict text check in ('pending','approved','changes'), comment text, rubric boolean[4], decided_at, primary key (contribution_id, reviewer_id, step))`
- **RLS:** the author has full access to their own drafts. Reviewers read contributions they are assigned to and update their own review row. System Admins read all. Published contributions are readable by every authenticated user.
- **Routing** happens in a `security definer` function `private.submit_contribution(id uuid)`, called through a thin edge-function action on `manage-users`, or a new function `contributions` (prefer the new function). It assigns two peers with the same `domain` interest or business line (excluding the author and the author's counsellor) and one expert. Expert mapping: a new `public.domain_experts(domain text pk, user_id)` table maintained by System Admins.
- [ ] **SQL tests:**
  - the author cannot read others' drafts
  - a reviewer sees only assigned contributions
  - a non-assigned user cannot update a review
  - the author's counsellor is never assigned
- [ ] Commit.

### Task 13 · C2: Create & share screen

**Files:** `src/logic/content.ts`, `src/logic/content.test.ts`, `src/lib/contributionStore.ts`, `src/screens/Create.tsx`, `src/model.ts`, `src/App.tsx` (nav item "Create & share" with `reviewBadge` = open reviews for the signed-in user)
- **Interfaces:**
  - `contentChecks(draft: { title: string; takeaway: string; type: string }): { text: string; ok: boolean }[]`: title ≤ 60 characters, takeaway present, no `CLIENT_WORDS` (case-insensitive, whole words, in title or takeaway).
  - `rubricComplete(rubric: boolean[]): boolean`: all four true.
  - Tabs Mine, Review and New follow the template (`contribList`, `cs`, `revList`, `rs`, `newTypes`, `nw*`). The AI outline from bundles uses the KB passages from Part D when present; otherwise the design's scripted outline.
- [ ] **Tests:**
  - "Delcroix" in the takeaway fails the check
  - a 61-character title fails
  - Approve stays disabled until all four rubric items hold
- [ ] Playwright: author submits, a peer approves, the author sees the stage advance.
- [ ] Commit, then release v0.6.0 on the owner's go.

---

# Part D: Knowledge library (admin; release v0.7.0)

### Task 14 · D1: Bundle list and detail (Overview, Sources, Models)

**Files:** `src/logic/kb.ts`, `src/logic/kb.test.ts`, `src/screens/Knowledge.tsx`, `src/screens/KnowledgeBundle.tsx`, `src/model.ts`, `src/App.tsx` (Administration nav "Knowledge library", count = bundles; add `'kb'` to `ADMIN_SCREENS` and the `config.ts` screens)
- **Interfaces:**
  - `filterBundles(bundles: Bundle[], q: string, topic: string | null, tag: string | null, sort: 'updated' | 'name' | 'used'): Bundle[]`
  - `topicTree(bundles): { key, label, count, pad }[]`
  - Model CRUD: `setDefault`, `duplicate`, `deleteModel`. Deleting the last model is refused; deleting the default promotes the next one.
- **Storage decision (confirm with owner):** bundles stay in memory, like the learning library, until the RAG backend exists. The edit gate is the existing `isAdmin()`.
- [ ] **Tests:**
  - the search matches name, tag and concept title
  - topic counts include secondary topics
  - deleting the only model is refused
- [ ] Commit.

### Task 15 · D2: OKF files, import and download

**Files:** `src/logic/okf.ts`, `src/logic/okf.test.ts`, `src/logic/tar.ts`, `src/logic/tar.test.ts`
- **Interfaces:**
  - `bundleToOkf(b: Bundle): { path: string; front: string; body: string }[]`: Open Knowledge Format v0.2 markdown with YAML frontmatter, using `slugify`, `isoDate`, `yamlList` and `yq` (the layout comes from the design's `kbTreeFiles` and `kbFileView`).
  - `parseOkf(text: string): { front: Record<string, string | string[]>; body: string } | { error: string }`
  - `validateOkf(files): { ok: boolean; text: string }[]`
  - `tar(files: { path: string; content: string }[]): Uint8Array` (ustar, 512-byte blocks)
- [ ] **Tests:**
  - round trip: `parseOkf` of each `bundleToOkf` file gives back the name and tags
  - a file without frontmatter, with unclosed frontmatter or empty returns `{ error }` and is skipped on import with a validation row; it never throws
  - the tar header checksum is correct for one file, and the archive length is a multiple of 512 with two trailing zero blocks
- [ ] Commit.

### Task 16 · D3: Test retrieval

**Files:** `src/logic/retrieval.ts`, `src/logic/retrieval.test.ts`, `src/screens/KnowledgeBundle.tsx`
- **Interfaces:**
  - `retrieve(bundle: Bundle, model: RagModel, query: string): { n: number; text: string; src: string; score: number }[]`: keyword overlap blended with a simple term-frequency "vector" score using `model.hybrid`. Drop hits below `model.thresh`, keep `model.topk`, and never return chunks whose source sensitivity is `client` or `licensed`.
  - The answer comes from `window.claude.complete` with the cited passages, or else the design's scripted answer.
- [ ] **Tests:**
  - a query matching only a client-confidential source returns no hits and the "no passages" banner
  - `topk` = 3 caps the results
  - a higher threshold returns no more hits than a lower one
- [ ] Commit, Playwright sweep, docs and `npm run agents`, then release v0.7.0 on the owner's go.

---

## Open decisions for the owner (defaults used above)

1. **Viewing another user is read-only.** Default: yes.
2. **Projects & evaluations and personality tests** start empty for everyone until a real source (performance tool, uploads) is connected. Default: empty states.
3. **Knowledge bundles** stay in memory (Part D) rather than in Supabase. Default: in memory for now.
4. **Seeded fictional colleagues** (Jonas, Amira and others in learner's-eye personas, signals and review texts) stay as demo content. Only Lena (and Thomas as her counsellor) is removed. Default: keep them.
