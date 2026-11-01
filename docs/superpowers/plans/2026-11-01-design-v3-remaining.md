# Design v3 (remaining) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status (1 Nov 2026, owner's call):** Part D (Knowledge library) ships first, on branch `feature/knowledge-library`. Podcasts and reels are for later: Tasks 1–4 are built and reviewed on the parked branch `feature/design-v3-b`, whose migration `20261101095403_self_complete_media.sql` must not be pushed until that branch ships. Part C waits.

**Goal:** Implement the parts of Claude Design v3 not yet in the app: learner media and domain zoom (Part B), Create & share with peer review (Part C), and the admin Knowledge library (Part D).

**Architecture:** As before: design data goes verbatim into `src/data.ts`; logic lives in small pure modules under `src/logic/`, unit-tested and called by `Logic.renderVals()`; screens are transcribed from the template. Everything works on the *subject* model from Part A (`useSubject`, `persist()`, read-only View as). Data that other people act on (contributions and reviews) goes into Supabase. Catalogue-like data (bundles) stays in memory.

**Tech Stack:** React 19, Vite, TypeScript, Supabase (Postgres RLS, edge functions), Vitest, the RLS SQL harness (`npm run test:db`), Playwright MCP for UI checks.

**Spec:** the Claude Design file `MyProfessionalMe.dc.html` (project `797ed301-7b6d-47eb-9e2d-6d7d2e7483c3`), re-fetched 1 Nov 2026 after the Director/Partner change. Its first 256 KB are byte-identical to the snapshot behind `2026-11-01-real-users-and-design-v3.md`, so templates and seed data have not changed. The last ~8 KB (the end of `constellation()`, the zoom geometry, `renderVals`, Knowledge library and Create & share logic) are still beyond the design reader's 256 KB limit. That plan's Part A (Tasks 1–7) is done and merged; this plan replaces its Parts B–D.

## Global Constraints

- Business lines are `Consulting`, `Audit`, `Tax & Legal`. Where the design says Advisory (EXPERTS, AUDS, MAPS0, copy), use Audit.
- Career stages are the app's seven: `Analyst`, `Consultant`, `Senior consultant`, `Manager`, `Senior manager`, `Director`, `Partner`. The design still has five. Never overwrite `STAGES`, `STAGE_FR` or `STG_SHORT` from the design. Grids that show one column per stage size from `STAGES.length`. `REVIEW_STAGES` (Draft → Published) is a different list; port it verbatim.
- No fictional people (owner's decision, 1 Nov 2026): `src/logic/noPersona.test.ts` must stay green, and the design's named colleagues (`PEERS`, `EXPERTS`, authors and reviewers in `CONTRIB0`/`REVIEWS0`/`REVIEW_WHO`, podcast and reel hosts) are not ported. Reviewers, authors and experts are real accounts; where the design shows a host or source name, use a role ("Peer contribution", "Tax & Legal expert"). The `AVATARS` role-play characters stay.
- Viewing another user is read-only. Learner data is written only by its owner, through `persist()`. RLS and triggers enforce this; the UI only mirrors it.
- Every new table: `revoke all … from anon, authenticated`, then minimal grants, RLS on, policies `to authenticated` with predicates, and one permissive policy per table and action. Every policy change gets a case in `supabase/tests/rls.sql`.
- Create migrations with `perl -e 'alarm 25; exec @ARGV' supabase migration new <name>` (the CLI hangs otherwise). Push with `supabase db push`, then run `supabase db advisors --linked`.
- No secret or `service_role` key in the app. AI features use `window.claude.complete` when present, otherwise a scripted reply.
- Respect `?motion=off` and `prefers-reduced-motion` for every new animation (`[data-pm-motion]` rules in `src/styles/index.css`).
- Inline styles on DS tokens; no Tailwind. Match the design's pixel values.
- After editing `CLAUDE.md`, run `npm run agents` and commit `AGENTS.md` with it.

## Review Focus

1. **A brand-new user opens media.** A podcast or reel with no progress row plays and saves without `undefined` or NaN times. Test in Task 3 (`podView` at `t = 0`).
2. **A learner self-accepts a non-reel learning through the API.** This is rejected even after the reel exception. RLS test in Task 3.
3. **Switching learning or subject while a player runs.** The interval stops and no write lands on the wrong learning. Test in Task 3 (`usePlayer` clears on unmount).
4. **A Partner or Director author or reviewer.** Routing and audience selection accept the two new stages. RLS test in Task 5; the Create form lists all seven stages (Task 6).
5. **A malformed OKF file on import.** It yields a validation row and never throws. Test in Task 8.

---

### Task 0: Full design source (blocks Tasks 1–9)

The missing tail holds logic that Tasks 2–4 and 6–9 port. Either option below unblocks it.

- [ ] **Step 1:** The owner exports `MyProfessionalMe.dc.html` from Claude Design (Share → Download, or copy the source) and saves it as `design/MyProfessionalMe.dc.html`. Alternatively, the owner moves the `<script>` logic in Claude Design into a separate file under 256 KB, so the design reader can fetch both parts.
- [ ] **Step 2:** Add `design/` to `.gitignore`. The file references the TaxConnect design system, and the repo is public.
- [ ] **Step 3:** Verify completeness. `tail -c 200 design/MyProfessionalMe.dc.html` ends with `</html>`. `grep -c "kbDetailMode\|reviewBadge" design/MyProfessionalMe.dc.html` returns at least 2.

---

# Part B: Learner media and domain zoom (release v0.5.0)

### Task 1: v3 seed data, keyframes and DS Stepper

**Files:** `src/data.ts`, `src/types.ts`, `src/styles/index.css`, `src/ds/index.tsx`, `src/logic/data.test.ts`

**Interfaces:**
- Produces the data exports listed below and the types `PodMedia`, `ReelMedia`, `RagModel` and `Bundle`.

- [ ] **Data:**
  - Add learnings `L42`–`L48` in the app's 10-column `LEARN` shape (no state or pct columns).
  - `L45`'s source "Peer · Lena Mertens" becomes "Peer contribution". Drop its "Your own reel…" text. `MEDIA` `by` fields that name a person become a role.
  - Port verbatim: `MEDIA` (names → roles), `REVIEW_STAGES`, `NEW_TYPES`, `CLIENT_WORDS`, `KB_TYPES`, `TOPICS`, `TOPIC_BY`, `RAG_PRESETS`, `RAG_OPTS`, `ragOptLabel`, `mkModels`, `BUNDLES0`, `KB_ACCESS`, `RUBRIC`, `slugify`, `isoDate`, `yamlList`, `yq`.
  - Do not port `CONTRIB0`, `REVIEWS0`, `REVIEW_WHO`, `PEERS` or `EXPERTS`: they are fictional people. Part C uses real accounts. Bundle `owner` fields that name a person become the owning business line.
- [ ] **Types** in `src/types.ts`, matching the data shapes:
  - `PodMedia = { kind: 'pod'; by; len; dur: number; ch: [number, string][] }`
  - `ReelMedia = { kind: 'reel'; by; len; dur: number; caps: string[]; take; q; opts: string[]; ans: number }`. Check the answer field name against the full source.
  - `RagModel = { id; def: boolean; name; embed; chunk; overlap; topk; hybrid: number; thresh; rerank: boolean; gen; temp; cite }`
  - `Bundle = { id; name; owner; topic; topics2: string[]; desc; access; fresh; status; updated; usedBy: number; tags: string[]; sugg: [string, number][]; models: RagModel[]; sources: [string, string, string, number, string, string][]; chunks: [number, string][]; concepts: … }`. Take the `concepts` shape from the full source.
- [ ] **Styles and DS:** add keyframes `pmEq`, `pmBlink`, `pmFlip`, `pmPage`, `pmTravel`, `pmScan`, `pmZoomIn` and `pmBob`. Port the DS `Stepper` (`steps`, `current`) from `_ds_bundle.js`.
- [ ] **Tests** (`src/logic/data.test.ts`), red first:
  - every `MEDIA` key exists in `LEARN` with format `Podcast` or `Reel`
  - every bundle `topic` and `topics2` entry is in `TOPIC_BY`
  - `slugify('Écoles & Taxes!') === 'ecoles-taxes'`
  - `isoDate('3 Oct 2026') === '2026-10-03'`
  - `yamlList(['a', 'b:c']) === '[a, "b:c"]'`
  - `STAGES.length === 7` and `STAGE_FR` sums to 1 (±0.001)
- [ ] **Commit:** `feat(data): design v3 seed data, keyframes, Stepper`.

### Task 2: Library format tiles, quick-learning reels, illustrated covers

**Files:** `src/logic/covers.ts`, `src/logic/covers.test.ts`, `src/model.ts`, `src/screens/Library.tsx`

**Interfaces:**
- `cover(row: Learn, index: number, state: LearnState): Cover`, ported from the design's `cover(r, i)`.
  - `Cover.kind` is one of `'pod' | 'reel' | 'avatar' | 'game' | 'book' | 'class' | 'elearn' | 'mentor' | 'web' | 'cert'`.
  - `Cover` also carries the fields the template binds: `cvTag`, `cvBg`, `cvFg`, `cvLine`, `cvMeta`, `tiles`, `lvDots`, `seats`, `segs`, `cvDone`.
- `fmtTiles` replaces the format `Select`: one tile per format plus "All", each with a count. Clicking a tile toggles `libFormat`.
- `reelStrip` lists the Reel learnings.

- [ ] **Tests,** red first:
  - the cover kind for each format in `LEARN`
  - `cvDone` is true only for `accepted`
  - tile counts sum to `LEARN.length`
  - Playwright: a combined filter with no matches shows the "No learnings match" empty state
- [ ] **Commit:** `feat(library): format tiles, reels strip, covers`.

### Task 3: Podcast player and reel viewer

**Files:** `src/logic/media.ts`, `src/logic/media.test.ts`, `src/lib/usePlayer.ts`, `src/model.ts`, `src/screens/Library.tsx`, `supabase/migrations/<ts>_self_complete_reels.sql`, `supabase/tests/rls.sql`

**Interfaces:**
- `podView(media: PodMedia, t: number, speed: '1' | '1.25' | '1.5'): { w: string; time: string; left: string; chapters: { t: string; label: string; on: boolean }[] }`
- `reelView(media: ReelMedia, t: number, answer: number | null): { caption: string; feedback: …; correct: boolean | null }`
- `usePlayer(durationSec: number, key: string): { t, playing, toggle, seek(sec), speed, setSpeed }`. It uses `setInterval` and clears the interval on unmount and whenever `key` (learning id + subject id) changes.

- [ ] **Database exception for reels.** A correct reel answer saves the learning as `accepted` with pct 100, once, through `persist()` and `save_learning`. Part A blocks owners from accepting in two places, so add one migration:
  - `private.is_self_complete(learning_id text) returns boolean`, an immutable SQL function over a literal list of the Reel ids.
  - The owner branch of `private.guard_learning_update()` allows the accepted toggle when `is_self_complete(new.learning_id)`.
  - The `learner_learnings: owner adds` insert policy allows `state = 'accepted'` when `is_self_complete(learning_id)`.
  - The owner delete policy stays: accepted rows are kept.
- [ ] **Tests,** red first:
  - `podView` at `t = 600` on `L42` marks chapter 2 as `on`; at `t = 0` it shows `0:00` and no NaN
  - seeking past the duration clamps to the duration
  - changing speed keeps `t`
  - answering correctly twice calls `saveProgress` once (stub `saveProgress`)
  - `usePlayer` stops ticking after unmount (fake timers)
  - in `rls.sql`: an owner can accept a Reel via `save_learning`, but not a Classroom item
- [ ] **Read-only:** in View as, the player plays but answering does not save.
- [ ] **Commit:** `feat(detail): podcast player and reel viewer`.

### Task 4: Growth map domain zoom and avatar photo in SVG

**Files:** `src/logic/zoom.ts`, `src/logic/zoom.test.ts`, `src/model.ts`, `src/screens/Map.tsx`, `src/types.ts`

**Interfaces:**
- `zoomView(domainIndex: number, items: Item[], levels: number[], targets: number[]): Zoom`, ported from the design's `zm`. It returns `origin`, `clouds`, `band`, `rings`, `nodes`, `cur`, `name`, `levelText`, `hoursText`, `pulls`, `nextTitle`, and `prev`/`next`, which wrap 0↔8. `targets` is `TARGET`.
- `AppState.zoom: number | null`.
  - Double-clicking a hub, or clicking its zoom button, sets it.
  - "← All domains" clears it.
- The `cHint` copy comes from the design and names `nextStage()`.
- `avatarSvgC` and `avatarSvgR` render the photo `<image>` with clip paths when a photo exists in `localStorage['mpm-avatar:<userId>']`.

- [ ] **Tests,** red first:
  - the `zoomView` node count equals the domain's learnings
  - `prev` of 0 is 8 and `next` of 8 is 0
  - a domain with no accepted items has the level text "Not started"
  - for a Partner subject the hint reads "top of the career path" instead of naming a next stage
- [ ] **Commit:** `feat(map): domain zoom`.
- [ ] **Release:** Playwright sweep of Library, Detail and Map, then release v0.5.0 on the owner's go.

---

# Part C: Create & share with peer review (release v0.6.0)

### Task 5: Contributions and reviews in the database

**Files:** `supabase/migrations/<ts>_contributions.sql`, `supabase/functions/contributions/index.ts`, `supabase/tests/rls.sql`

**Interfaces:**
- Produces the tables and `submit_contribution(id uuid)` that Task 6 calls through the `contributions` edge function.

- [ ] **Tables:**
  - `public.contributions`:
    - `id uuid pk default gen_random_uuid()`
    - `author_id` → `profiles`, on delete cascade
    - `type text`, checked against the `NEW_TYPES` labels
    - `title text check (char_length(title) <= 60)`
    - `domain text`, `level smallint`
    - `audience_stage public.career_stage` (includes Director and Partner)
    - `takeaway text`, `bundle_ids text[]`
    - `review_stage smallint check (review_stage between 0 and 4)` (index into `REVIEW_STAGES`)
    - `status text check in ('draft','review','changes','published')`
    - `created_at`, `updated_at`
  - `public.contribution_reviews`:
    - `contribution_id` → `contributions`, on delete cascade
    - `reviewer_id` → `profiles`
    - `step smallint 1..3`
    - `verdict text check in ('pending','approved','changes')`
    - `comment text`, `rubric boolean[4]`, `decided_at`
    - `primary key (contribution_id, reviewer_id, step)`
  - `public.domain_experts(domain text pk, user_id)`, maintained by System Admins.
- [ ] **RLS:**
  - The author has full access to their own drafts.
  - Reviewers read the contributions they are assigned to, and update only their own review row.
  - System Admins read everything.
  - Every authenticated user can read published contributions.
- [ ] **Routing:** `private.submit_contribution(id uuid)`, `security definer`, is called by the new `contributions` edge function.
  - It assigns two peers who share the `domain` interest or the business line. The author and the author's counsellor are never chosen.
  - It also assigns the domain's expert.
- [ ] **SQL tests,** red first:
  - the author cannot read other people's drafts
  - a reviewer sees only assigned contributions
  - a user who is not assigned cannot update a review
  - the author's counsellor is never assigned
  - a contribution aimed at `Partner` inserts
- [ ] **Commit.**

### Task 6: Create & share screen

**Files:** `src/logic/content.ts`, `src/logic/content.test.ts`, `src/lib/contributionStore.ts`, `src/screens/Create.tsx`, `src/model.ts`, `src/App.tsx`

**Interfaces:**
- `contentChecks(draft: { title: string; takeaway: string; type: string }): { text: string; ok: boolean }[]`. The checks:
  - the title is at most 60 characters
  - a takeaway is present
  - no `CLIENT_WORDS` in the title or takeaway (case-insensitive, whole words)
- `rubricComplete(rubric: boolean[]): boolean`: true only when all four items hold.
- Tabs Mine, Review and New follow the template (`contribList`, `cs`, `revList`, `rs`, `newTypes`, `nw*`).
- The audience-stage select lists all of `STAGES`.
- The nav item is "Create & share", with `reviewBadge` = open reviews for the signed-in user (not the subject).
- The AI outline from bundles uses the bundle passages from Task 9 when present; otherwise it uses the design's scripted outline.

- [ ] **Tests,** red first:
  - "Delcroix" in the takeaway fails the check
  - a 61-character title fails
  - Approve stays disabled until all four rubric items hold
- [ ] **Playwright:** an author submits, a peer approves, and the author sees the stage advance.
- [ ] **Commit,** then release v0.6.0 on the owner's go.

---

# Part D: Knowledge library (admin; release v0.7.0)

### Task 7: Bundle list and detail (Overview, Sources, Models)

**Files:** `src/logic/kb.ts`, `src/logic/kb.test.ts`, `src/screens/Knowledge.tsx`, `src/screens/KnowledgeBundle.tsx`, `src/model.ts`, `src/App.tsx`, `src/config.ts`

**Interfaces:**
- `filterBundles(bundles: Bundle[], q: string, topic: string | null, tag: string | null, sort: 'updated' | 'name' | 'used'): Bundle[]`
- `topicTree(bundles: Bundle[]): { key: string; label: string; count: number; pad: number }[]`
- Model CRUD: `setDefault`, `duplicate` and `deleteModel`.
  - Deleting the last model is refused.
  - Deleting the default promotes the next model.
- Navigation: "Knowledge library" under Administration, with the bundle count. Add `'kb'` to `ADMIN_SCREENS` and to the screens in `config.ts`.
- Bundles stay in memory. The edit gate is the existing admin check.

- [ ] **Tests,** red first:
  - the search matches name, tag and concept title
  - topic counts include secondary topics
  - deleting the only model is refused
- [ ] **Commit.**

### Task 8: OKF files, import and download

**Files:** `src/logic/okf.ts`, `src/logic/okf.test.ts`, `src/logic/tar.ts`, `src/logic/tar.test.ts`

**Interfaces:**
- `bundleToOkf(b: Bundle): { path: string; front: string; body: string }[]` produces Open Knowledge Format v0.2 Markdown with YAML frontmatter. It uses `slugify`, `isoDate`, `yamlList` and `yq`, with the layout of the design's `kbTreeFiles` and `kbFileView`.
- `parseOkf(text: string): { front: Record<string, string | string[]>; body: string } | { error: string }`
- `validateOkf(files): { ok: boolean; text: string }[]`
- `tar(files: { path: string; content: string }[]): Uint8Array` (ustar, 512-byte blocks)

- [ ] **Tests,** red first:
  - round trip: `parseOkf` on each `bundleToOkf` file returns the name and tags
  - a file with no frontmatter, unclosed frontmatter, or no content returns `{ error }`, is skipped on import with a validation row, and never throws
  - the tar header checksum is correct for one file; the archive length is a multiple of 512 and ends with two zero blocks
- [ ] **Commit.**

### Task 9: Test retrieval

**Files:** `src/logic/retrieval.ts`, `src/logic/retrieval.test.ts`, `src/screens/KnowledgeBundle.tsx`

**Interfaces:**
- `retrieve(bundle: Bundle, model: RagModel, query: string): { n: number; text: string; src: string; score: number }[]`
  - The score blends keyword overlap with a simple term-frequency "vector" score, weighted by `model.hybrid`.
  - Hits below `model.thresh` are dropped, and at most `model.topk` are kept.
  - Chunks whose source sensitivity is `client` or `licensed` are never returned.
- The answer comes from `window.claude.complete` with the cited passages, or else from the design's scripted answer.

- [ ] **Tests,** red first:
  - a query that matches only a client-confidential source returns no hits and the "no passages" banner
  - `topk = 3` caps the results
  - a higher threshold never returns more hits than a lower one
- [ ] **Finish:** commit, run the Playwright sweep, update `CLAUDE.md` and run `npm run agents`, then release v0.7.0 on the owner's go.

---

## Open decisions for the owner (defaults used above)

1. **Getting the full design (Task 0):** download the file into `design/`, or split the script in Claude Design. Default: download.
2. **Reels self-complete:** a correct quiz answer marks a reel accepted without a counsellor. Default: yes, as the design shows; every other format still needs a counsellor or admin.
3. **Knowledge bundles** stay in memory rather than in Supabase. Default: in memory.
4. **Fictional colleagues** are removed (decided 1 Nov 2026); Learner's eye shows the viewed person.
5. **Expert per domain** for review routing comes from a new `domain_experts` table that System Admins fill. Default: yes. Until it is filled, step 2 falls back to any System Admin.
