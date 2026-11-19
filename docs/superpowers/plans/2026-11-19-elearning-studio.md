# E-learning Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the eleventh studio of the 19 Nov 2026 design, the E-learning Studio. A creator lays out a course of scrolling lessons:
- text blocks and interactions;
- learnings made in the other studios;
- images.

The course goes through the normal check, peer review and publish. Learners play it in the Library. It completes by the rule the creator chose. A learning embedded in it completes on its own rules.

**Architecture:** The E-learning Studio is one more studio definition on the existing spine (`src/studioData.ts`, `src/studioVals.ts`, `src/screens/Studios.tsx`).
- **Course storage.** The course lives in `contributions.items`, the same way the Explainer keeps its check and the Animated flow its drawing:
  - the Draft step's lesson rows `[Lesson n, title, summary]`;
  - after them, one block object per block, each naming its lesson.
- **Checks and publishing.** The check gate, the client-name scan, the guard's lock and the publish dispatcher (`private.items_ok`, `private.contribution_content`, `private.contribution_problems`, `private.publish_contribution`) each gain one `E-learning` branch. The new tables are the learner-only reflections table (Phase 1) and none in Phase 2.
- **Player.** The course player is one pure view-model (`courseView`), used by the studio preview, the reviewer's read-only view and the Library.
- **Embedded learnings.** They play through the panels that already exist (`fmtVals` + `FormatPanels` for learners, `LearnerPanel` for play-tests). Nothing is programmed twice.

**Tech Stack:** React 19, Vite, TypeScript, Supabase (Postgres, RLS, Storage), Vitest, the PGlite RLS runner. No new dependency, no new edge function, no new AI use.

**Spec:**
- The design file `Design/Learning & Growth Development Platform/MyProfessionalMe.dc.html` (download of 19 Nov 2026, 686,546 bytes). Its additions over the 17 Nov file are:
  - the `elearn` entry of `STUDIOS`;
  - `EL_SHELF`, `EL_SEED`, `elNewBlock`, `elVals` and `elSync`;
  - the course editor (Produce), the player (Preview & test) and the export panel (Check & send).
- The analysis and the owner's answers: `.superpowers/sdd/design-v5-analysis.md`.

## Owner decisions this plan relies on

| # | Decision | Source |
|---|---|---|
| E1 | Build Phases 1–2 now: course editor, blocks, player and completion; then embedded studio learnings and image upload. The AI tutor (Phase 3) and LMS export or import (Phase 4) are decided later. | Owner, 19 Nov 2026 (Q1) |
| E2 | The creator chooses per course how it completes: all lessons seen, final check of 80 % or more, or both. The pass mark is fixed at 80 %. | Owner (Q4) |
| E3 | A learning embedded in a course and finished there also completes on its own rules and hours. The course's hours stay the creator's "Length?". | Owner (Q5) |
| E4 | Reflections are saved in a new learner-only table that nobody else can read: not the counsellor, not admins, not View as. | Owner (Q6) |
| E5 | Parked with Phase 4: export to a client LMS (SCORM 1.2 and 2004, cmi5), SCORM import, and the Belgian VAT calculator and graph widgets. The AI tutor comes later. | Owner (Q2, Q3, Q7, Q8) |

**Decisions settled here** (from the design, the owner's answers and the Phase 1–7 rulings; recorded in `decisions.md` at each release):
- **The course lives in the items.**
  - **Shape.** An E-learning contribution's `items` are 2 to 12 lesson rows `[label, title, summary]`, then 0 to 240 block objects `{block, id, lesson, …}` (at most 20 per lesson).
  - **Validation.** One cap in `ITEM_MAX` and `private.item_max` (252). One validator in SQL (`private.course_ok`) mirrored in TS (`courseRowProblems`).
  - **Why.** The fingerprint, the client-name scan (`private.blocked_term` over `items::text`), the submit lock and the save path then cover the course without a new column or grant.
  - **Alternative refused:** a `contributions.course` column, which would need a new grant, a fingerprint signature, the guard and copies of five functions.
- **A block names its lesson by index and has a stable id** (`b` + 4–20 lower-case letters or digits, unique in the course).
  - Removing or moving a lesson re-indexes its blocks in one pure function.
  - The id keys the learner's answers and reflections.
- **The knowledge check is an exam question.**
  - **Shape.** `{block: 'check', question: ExamQuestion, fin}`: four options, one right answer and an explanation. It is checked by the existing `private.question_ok` and played as a one-question round (`roundView`, `QuestionRound`).
  - **Departure from the design**, whose check has 2–4 options and no explanation: the existing question rule and component are reused, and the learner learns why.
  - Owner question 2.
- **The score** (design `elVals`):
  - right answers over every scored block: knowledge checks, sorts and calculation exercises;
  - it is known once every scored block is answered;
  - the pass mark is 80 % (`PASS_MARK`);
  - "Final check of 80 % or more" needs a block marked final.
  - Owner question 1.
- **Completion stays `mark`.** `E-learning` is already self-completing (`COMPLETION`, `private.is_self_complete`), so no completion SQL changes.
  - A catalogue E-learning without content keeps "Mark as completed".
  - A course with content completes through its panel, the Explainer's pattern: `saveDetail(…, {complete: true})` once the rule is met.
  - It is trust-based like reels and explainers: the database does not re-score (shortcut, recorded).
- **Hours.** The course counts the creator's "Length?" (15, 30 or 60 minutes) through `private.course_hours`. CPD stays 0, as for every peer contribution (owner question 3).
- **Answers are kept for the session.** A run (lesson, answers, open embed) lives in `AppState.course`, keyed by subject and learning like `AppState.fmt`. Saved progress is `detail = {seen, best}`: the lessons seen and the best score. Reflections are saved separately (E4). Owner question 4.
- **Embedded learnings play through their own panels.**
  - **For a learner,** the course renders `FormatPanels` over `fmtVals(L, item)` of the embedded learning, so it completes and counts exactly as on its own page (E3). One embed is open at a time, because `AppState.fmt` holds one draft.
  - **Avatar and Case exercise** finish through cards outside their panel (the evaluation quiz, the evidence form). They open their own page with "← Back to the course".
  - **In the studio preview and for reviewers,** the embed shows the learning's content in `LearnerPanel`, a play-test that is never saved.
  - Only published learnings can be embedded. A course is never embedded in a course.
- **Images reuse the private `media` bucket as it is.**
  - Path: `<author>/<contribution>/<file>`.
  - Types: PNG, JPEG and WebP, which the bucket already lists. SVG is never allowed.
  - Learners read an image because the published content names its `path`, the rule of 20261117270000.
  - Storage SQL does not change.

**Reused, not rebuilt** (owner rule: nothing is programmed twice):

| Need | Reused |
|---|---|
| Studio, steps, Draft with AI, check, send, publish | `STUDIOS`, `visibleSteps`, `stepVals`, `draftItems` + `studioSpec` (`studio_draft`), `runCheck`, `submitSaved`, `saveForm`, `studioContent` `BUILDERS`, `private.items_ok`/`contribution_content`/`contribution_problems`/`publish_contribution`, `private.blocked_term` |
| Knowledge check | `ExamQuestion`, `private.question_ok`, `isQuestion`/`itemRows` (`src/logic/items.ts`), `roundView`/`NEW_ROUND` (`src/fmtRound.ts`), `QuestionRound.tsx` |
| Reordering, chips, labels | `MoveButtons.tsx`, `ChipGroup.tsx`, `labelStyle.ts`, DS `Input`/`Textarea`/`Select`/`Button`/`Card`/`SegmentedControl`/`Tag` |
| Learner progress | `saveDetail`, `detailOf`, `completedToast` (`src/fmtShared.ts`), `DetailOf`, `completionVals` (`panel` hides "Mark as completed") |
| Embedded learnings | `fmtVals` (`src/fmtVals.ts`) + `FormatPanels`; `LearnerPanel`/`SavedContent` (`src/screens/studioPreviews.tsx`); `AvatarPanel` through its own page; `studioFor` (`src/logic/planDraft.ts`) for "Make a new one in the … Studio" |
| Images | `MEDIA_KINDS`, `mediaProblem`, `mediaFileName` (`src/logic/mediaFiles.ts`); `uploadMedia`, `removePaths` (`src/lib/mediaStore.ts`); `saveWithFile` (`src/createSave.ts`, the Presentation's save-then-upload); `useAudioLinks` (signs any media path); `private.media_files_missing` |
| Debounced learner writes | `saveSoon` (`src/lib/saveSoon.ts`) |
| Covers, provenance | `COVER_KIND['E-learning'] = 'elearn'` (exists), `AiMadeTag`, `provenance.ts` |

**Not ported** (honest UI, see the analysis §2):
- the SCORM import box and its canned report;
- the "Where will it run?" question;
- the build steps (packaging, offline copies, manifest, "Testing against SCORM …");
- the export panel: standard chips, manifest, "Build the packages", the size estimate and the size check;
- "What the LMS receives", including the fictional "Lena Mertens";
- the AI tutor, its keyword answers and `window.claude.complete`;
- the fee and VAT calculator and the interactive graph;
- gradient image placeholders;
- the toast "Prototype: opens … inline".

## Global Constraints

- All Global Constraints of `docs/superpowers/plans/2026-11-17-studios.md` that still apply:
  - inline styles on tokens;
  - no fictional people (`noPersona.test.ts`);
  - honest UI;
  - View as is read-only;
  - one permissive policy per table and action, with an RLS case per policy;
  - TS and SQL rules mirrored, with sync tests;
  - files of about 250 lines at most (UI about 220); `src/model.ts` and `src/screens/Library.tsx` are legacy-oversized, so touch them minimally;
  - the commit trailer.
- No new AI use. "Draft with AI" uses `studio_draft` through `complete()`, with the existing labelled scripted fallback. A course whose rows were AI-drafted publishes "Made with AI" (`ai_assisted` → `ai_made`).
- Every E-learning "Send for review" goes through the shared contribution path: creation rules, the check gate and the client-words check. The format lists grow in TS and SQL together (`items.test.ts`).
- Creator text is rendered as React text, never as HTML or markdown.
- A preview, a play-test or a reviewer's try never writes progress, answers or reflections (S6).
- Migrations: new files only, after `20261118250000`. Verify with PGlite. Push with `supabase db push` at each phase release (owner's standing permission of 17 Nov 2026), then run `npm run test:db` and `supabase db advisors --linked`.

## Review Focus

1. **Reflection privacy.** Only the learner reads or writes their reflections: not the counsellor, admins, View as, reviewers or a definer function. Tests in 1.5.
2. **Completion claims.** A course completes only by its published rule; the preview and View as write nothing; a completed course is not completed twice. Tests in 1.4.
3. **An embedded learning.** It completes once, on its own rules and hours, and only for a published learning; the course's hours do not double-count it; the course cannot embed itself or another course. Tests in 2.1 and 2.2.
4. **The check gate cannot be skipped.** The course shape is validated in SQL; an edit after the check needs a new check; an embed or image that disappears after the check is caught at submit. Tests in 1.1, 2.2 and 2.3.
5. **Untrusted creator content.** Block text is plain text; hotspot coordinates are bounded; image types are only PNG, JPEG and WebP; client names in any block are refused. Tests in 1.1 and 2.3.
6. **Image files.** Only the author reads them while drafting, reviewers once sent, and every signed-in person once published and named in the content; a deleted image block deletes its file. Tests in 2.3.

---

# Phase 1: E-learning Studio, text course (release v0.17.0)

### Task 1.1: The E-learning format, the course shape and the database
**Files:**
- Create:
  - migration `supabase/migrations/20261119100000_elearning_studio.sql`;
  - `src/logic/courseContent.ts` (pure: types, caps, `isCourseBlock`, `lessonsOf`, `courseRowProblems`, `courseProblems`, `courseContent`, `courseRule`, `courseHours`), with `courseContent.test.ts` and `courseContent.sync.test.ts`.
- Modify:
  - `src/types.ts`: `CourseContent` joins `FormatContent`; `DetailOf.course`;
  - `src/logic/items.ts`: `ITEM_MAX['E-learning'] = 252`; `Item` adds `CourseBlock`;
  - `src/logic/studios.ts`: `StudioEntry` adds `CourseBlock`; `questionsOf` skips course blocks; `SCHEMAS.elearn = courseRowProblems`;
  - `src/logic/studioContent.ts`: `BUILDERS['E-learning']`;
  - `src/lib/contentStore.ts`: `parseFormatContent` reads `kind: 'course'`;
  - `supabase/tests/rls.sql`: cases `EL`.

**Interfaces** (`src/logic/courseContent.ts`):
- `BLOCK_KINDS = ['text', 'callout', 'accordion', 'check', 'sort', 'branch', 'reflect', 'exercise'] as const` (Phase 2 adds `'embed'`, `'image'` and `'hotspot'`); `type BlockKind`.
- `BLOCK_ID = /^b[0-9a-z]{4,20}$/`.
- `COURSE_CAPS = {lessons: [2, 12], blocksPerLesson: 20, heading: 120, text: 4000, callout: 600, panels: [2, 8], panelTitle: 120, panelBody: 1200, cards: [2, 10], bin: 40, card: 160, choices: [2, 4], choice: 200, outcome: 400, prompt: 400, unit: 12, bytes: 250000}`.
- `type BlockBase = {block: BlockKind; id: string; lesson: number}`. Then:
  - `TextBlock = BlockBase & {block: 'text'; h: string; t: string}` (h may be empty);
  - `CalloutBlock = {block: 'callout'; t: string}`;
  - `AccordionBlock = {block: 'accordion'; panels: [title: string, body: string][]}`;
  - `CheckBlock = {block: 'check'; question: ExamQuestion; fin: boolean}`;
  - `SortBlock = {block: 'sort'; p: string; bins: [string, string]; cards: [label: string, bin: 0 | 1][]}`;
  - `BranchBlock = {block: 'branch'; q: string; choices: [label: string, outcome: string, good: boolean][]}` (at least one good);
  - `ReflectBlock = {block: 'reflect'; p: string}`;
  - `ExerciseBlock = {block: 'exercise'; q: string; a: number; tol: number; unit: string}` (a finite, tol ≥ 0);
  - `CourseBlock` is their union, each also with `BlockBase`.
- `isCourseBlock(x: unknown): x is CourseBlock` (an object with a string `block`).
- `lessonsOf(items: StudioEntry[]): {title: string; summary: string; blocks: CourseBlock[]}[]`.
- `COMPLETION_QUESTION = 'How is completion decided?'`; `COURSE_RULES = {'All lessons viewed': 'seen', 'Final check of 80 % or more': 'score', Both: 'both'} as const`; `courseRule(shape): 'seen' | 'score' | 'both'` (unanswered: 'seen'); `PASS_MARK = 80`.
- `COURSE_LENGTH = 'Length?'`; `COURSE_HOURS = {'15 min': 0.25, '30 min': 0.5, '60 min': 1}`; `courseHours(shape)` (unanswered: 0.5).
- `courseRowProblems(items): string[]`: words per block, e.g. "Lesson 2 · Drag and sort: give every item a group". It serves `itemsValid` and mirrors `private.course_row_problems`.
- `courseProblems(items, shape): string[]`:
  - "Lesson 1 “Where is a service taxed?” has no blocks yet";
  - "Add a final check (a knowledge check marked “Final check”), or choose “All lessons viewed” in Shape it" when the rule is score or both and there is none;
  - "Keep one final check".
- `CourseContent = {kind: 'course'; lessons: {title: string; blocks: Omit<CourseBlock, 'lesson'>[]}[]; rule: 'seen' | 'score' | 'both'}`.
- `courseContent(items, shape): CourseContent | null` (null when `courseRowProblems` is not empty).
- `DetailOf.course = {seen: number[]; best?: number}`.

**SQL** (`20261119100000_elearning_studio.sql`):
- **Format lists.** Drop and re-add `creator_rules_formats_check`, `review_policies_formats_check` and `contributions_type_check` with `'E-learning'` added. `contributions_upload_formats` is unchanged: E-learning is made only in its studio.
- **Caps.** `private.item_max` (as 20261118180000) adds `('E-learning', 252)`. `private.studio_min_items` (as 20261117220000) adds `('elearn', 'E-learning', 2)`.
- **Validators** (immutable):
  - `private.course_block_ok(b jsonb, p_lessons integer)` and `private.course_ok(p_items jsonb)`: 2–12 width-3 lesson rows first, then blocks only, ids matching and unique, `lesson` in range, at most 20 per lesson, `octet_length ≤ 250000`;
  - `check` uses `private.question_ok(b -> 'question')`;
  - `private.course_row_problems(p_items) returns text[]` gives the same words as TS, as `private.avatar_row_problems` does.
- **Content and hours:**
  - `private.course_rule(p_shape) returns text`;
  - `private.course_hours(p_shape) returns numeric`;
  - `private.course_content(p_items jsonb, p_shape jsonb) returns jsonb` (`{kind: 'course', lessons: [{title, blocks}], rule}`, blocks without `lesson`, summaries not published).
- **Dispatcher.** `private.items_ok`, `private.contribution_content` and `private.contribution_problems` are copied from 20261118190000 with one `E-learning` branch each:
  - the row problems;
  - "Add at least 2 lessons";
  - the empty-lesson and final-check problems.
- **Publish.** `private.publish_contribution` is copied from 20261118250000, with hours `when 'E-learning' then private.course_hours(c.shape)`.
- **Completion.** `private.is_self_complete` is unchanged (E-learning is listed).
- **Permissions.** `revoke execute … from public, anon, authenticated` on every new private function.

- [ ] **Failing tests first:**
  - `courseContent.test.ts`:
    - the design's example course (three lessons, as `EL_SEED` but with four-option checks) gives no problems and three lessons in its content;
    - a block with `lesson: 3` in a two-lesson course gives "A block points to a lesson that does not exist";
    - a duplicate id is refused;
    - 21 blocks in one lesson give "Lesson 1 has more than 20 blocks";
    - a check with three options gives "Lesson 1 · Knowledge check: give four options, the right answer and why";
    - a sort with an unsorted card is refused;
    - a branch with no good choice gives "Lesson 3 · Branching scenario: mark at least one good choice";
    - an exercise with `tol: -1` is refused;
    - `courseRule({})` is 'seen' and `courseHours({'Length?': '60 min'})` is 1;
    - the score rule without a final check gives the final-check problem, and two final checks give "Keep one final check";
    - `courseContent` drops `lesson` and the summaries.
  - `studios.test.ts`: `questionsOf` of an E-learning item list is `[]`.
  - `courseContent.sync.test.ts`: the TS caps (12, 20, 252, 250000, 4000, 600, 1200) and every problem sentence appear in the migration; `COURSE_HOURS` equals the SQL `course_hours` cases.
  - `items.test.ts`: the creation-rule, policy and type lists in the latest migration equal `TYPE_NAMES`, which now has 'E-learning'; `contributions_upload_formats` still equals `CREATE_TYPES`.
  - `contentStore.test.ts`: a `course` content parses; one with a block without `id` is `null`.
  - `EL` cases in `rls.sql`, written before the migration:
    - a creator with an E-learning rule saves an `elearn` draft, checks it and submits;
    - the same rows without `studio` are refused (`contributions_upload_formats`);
    - a Podcast-only rule cannot create E-learning;
    - unknown kind `'script'`, an out-of-range lesson or a three-option check fail `items_ok` with words in `contribution_problems`;
    - the score rule without a final check is refused at check;
    - a client name in a callout is refused;
    - an edit after the check makes submit refuse (stale fingerprint);
    - publish writes format 'E-learning', `content ->> 'kind' = 'course'`, `hours` 0.5 for '30 min', and `ai_made` from `ai_assisted`;
    - a learner sets the published course accepted through `save_learning` (self-complete).
- [ ] Implement, GREEN (PGlite, `npm test`, build, lint), commit.

**Honest UI:** none on screen here (1.2–1.4).

**Review Focus owned:**
- **4, the check gate.** Every block shape is enforced in SQL, not only in the editor.
- **5, untrusted content.** The caps and the client-name scan of every block.

### Task 1.2: The studio definition, Draft and the spine
**Files:**
- Modify:
  - `src/studioData.ts`: the `elearn` entry;
  - `src/logic/studios.ts`: `StudioDef.produce?: 'course'`; `visibleSteps` keeps Produce when `def.produce` is set;
  - `src/studioStepVals.ts`: editing rows keeps course blocks, and removing a lesson row calls `dropLesson`; `stepVals` adds `course` (1.3);
  - `src/studioVals.ts`: the Produce lead for `elearn`;
  - `src/logic/courseEdit.ts` (created here with `dropLesson`, `seedLessons` and `blockId`; 1.3 adds the rest);
  - `src/studioVals.test.ts` and `src/screens/StudioSpine.test.tsx` ("ten" becomes "eleven", 11 studios).

**Interfaces:**
- The `elearn` entry:
  - `{id: 'elearn', name: 'E-learning Studio', out: 'E-learning', format: 'E-learning', available: true, compact: false, glyph: '▦', time: 'about 45 min', dom: 'reg', lvl: 2, min: 2, cast: null, pv: 'elearn', produce: 'course', build: null, rows: []}`;
  - `tag: 'A course of scrolling lessons, with learnings from the other studios'`;
  - `idea: 'Cross-border services: where VAT is due and how to invoice it'`, `title: 'Cross-border services: where is the VAT due?'`;
  - `qs`:
    - `['Who is it for?', ['Consultants who invoice clients', 'Finance and billing teams', 'Tax specialists'], 'draft']`;
    - `[COMPLETION_QUESTION, ['All lessons viewed', 'Final check of 80 % or more', 'Both']]`;
    - `[COURSE_LENGTH, ['15 min', '30 min', '60 min']]`;
  - `items`: the design's three lesson rows.
- `dropLesson(items, k)`: removes lesson row k and its blocks, and lowers `lesson` of later blocks by one.
- `seedLessons(items)`: every lesson without blocks gets one text block `{h: title, t: summary}` (the creator's own words; no placeholder question).
- `blockId(): string`.
- Moving from Draft to Produce runs `seedLessons` (the design's `elSync`, without the placeholder check).
- "Draft with AI" drafts the lesson rows only, through `studioSpec(def, nw)` (width 3, "Lesson n"). Without AI, the existing scripted rows are used, labelled "Scripted from the bundle".

- [ ] **Failing tests first:**
  - `studios.test.ts`:
    - `visibleSteps(studioById('elearn'))` gives the six steps, Produce included;
    - Job aid still has no Produce when `rows` is empty and there is no cast (unchanged);
    - `noPersona` covers the new entry.
  - `courseEdit.test.ts`:
    - `dropLesson` of lesson 1 of 3 removes its 4 blocks, and lesson 2's blocks get `lesson: 1`;
    - `seedLessons` gives an empty lesson one text block with its title and summary, and leaves a lesson with blocks unchanged;
    - `blockId()` matches `BLOCK_ID`.
  - `studioVals.test.ts`:
    - the hub lists eleven studios;
    - editing a lesson title in Draft keeps its blocks;
    - removing lesson 2 in Draft removes its blocks;
    - the AI draft of the E-learning studio asks for "Lesson" rows and a malformed answer falls back to scripted rows (never marked AI).
  - `StudioSpine.test.tsx`: E-learning on the hub; greyed "Not in your creation rules" for a Podcast-only creator.
- [ ] Implement, GREEN, commit.

**Honest UI** (the design's options):
- **Kept:**
  - "Who is it for?", captioned "Steers the AI draft";
  - "How is completion decided?", published as the course's rule;
  - "Length?", published as the hours.
- **Removed:**
  - "Where will it run?" (no client LMS);
  - the SCORM import box (Idea & sources);
  - the build steps;
  - "SCORM" in the tag.
- The hub's lead names the formats from `MAKEABLE_FORMATS`, so E-learning appears with no copy change. There is no hard-coded "eleven".

**Review Focus owned:** none (a structural task).

### Task 1.3: The course editor (Produce)
**Files:**
- Modify:
  - `src/logic/courseEdit.ts` (pure edits) and `courseEdit.test.ts`;
  - `src/studioStepVals.ts` (`course: courseEditVals(…)` when `def.produce === 'course'`);
  - `src/screens/StudioSteps.tsx` (`Produce` renders `CourseEditor` when `st.course` is set);
  - `src/types.ts` (`AppState.courseEdit: {lesson: number; block: string | null}`).
- Create:
  - `src/courseEditVals.ts`: the editor's view-model, with lessons, blocks, inspector fields and shelf;
  - `src/screens/CourseEditor.tsx`: three columns, the outline, the canvas, and the inspector or shelf;
  - `src/screens/CourseBlock.tsx`: **one** block renderer for edit and play, with props `{b: BlockView; mode: 'edit' | 'play'}`;
  - `src/screens/CourseEditor.test.tsx`.

**Interfaces** (`src/logic/courseEdit.ts`, all `(items: StudioEntry[], …) => StudioEntry[]`):
- `newBlock(kind: BlockKind, lesson: number): CourseBlock`. Fields start empty, so the check names what is missing. The check block is `{question: {t: lesson title, q: '', o: ['', '', '', ''], a: 0, why: ''}, fin: false}`.
- `insertBlock(items, lesson, after: string | null, block)`: after the selected block, or at the end of the lesson.
- `moveBlock(items, id, -1 | 1)` stays inside its lesson.
- `duplicateBlock(items, id)` gives the copy a new id.
- `removeBlock(items, id)` and `patchBlock(items, id, patch: Partial<CourseBlock>)`.
- `addLesson(items)` adds the row `['Lesson n', 'New lesson', '']`. `renameLesson(items, k, title)`.
- `removeLesson(items, k)` is `dropLesson`, refused below 2 lessons ("A course needs at least two lessons").

**`courseEditVals(L, nw, setNw)`:**
- `lessons: {n, title, meta: 'n blocks', on, pick}[]`;
- `blocks: BlockView[]` (the shared view of `fmtCourse.blockView`, from 1.4, in edit mode);
- `inspector: {type, fields: {label, kind: 'input' | 'area' | 'select', value, options?, set}[], up, down, duplicate, remove, done} | null`;
- `shelf: {group, items: {label, glyph, add}[]}[]`;
- `count: 'n lessons · n blocks · n scored'`;
- `addLesson`, `removeLesson`, `setLessonTitle`.
- Everything is a no-op in View as, and in a submitted contribution (`readOnly`).

**Shelf (Phase 1):**
- Blocks: Text, Callout, Accordion.
- Interactions: Knowledge check, Drag and sort, Branching scenario, Reflection, Calculation exercise.
- The design's "From the studios", "Practice and reference" and image groups come in Phase 2. The "AI tutor" and "Calculators and graphs" groups are not shown (E5).

- [ ] **Failing tests first:**
  - `courseEdit.test.ts`:
    - `insertBlock` after the second block of lesson 1 lands third in lesson 1 and leaves lesson 2 alone;
    - `moveBlock` up on a lesson's first block changes nothing;
    - `duplicateBlock` gives a new unique id;
    - `removeLesson` with two lessons left is refused;
    - `patchBlock` of a check's option 3 keeps the others.
  - `CourseEditor.test.tsx`:
    - picking lesson 2 shows its blocks;
    - "Knowledge check" on the shelf adds a check after the selected block and opens it in the inspector;
    - the inspector's "Right answer" select offers Answer A–D;
    - "Final check" is a select ("Knowledge check" or "Final check");
    - ↑/↓ are `MoveButtons`;
    - View as shows the course with no shelf, no inspector actions and no lesson buttons;
    - the problems from `courseProblems` show under the editor.
- [ ] Implement, GREEN, commit.

**Honest UI:**
- An empty field says what is missing ("Write the question"). The design's placeholder texts ("Your question", "Right answer") are not written into the course.
- Only working blocks are on the shelf; nothing is greyed "coming".
- The knowledge check asks for four options and why (owner question 2).

**Review Focus owned:** **5, untrusted content.** Text is shown as text; field lengths are capped in the inputs and by the check.

### Task 1.4: The course player, the preview and completion
**Files:**
- Create:
  - `src/fmtCourse.ts`: pure `blockView`, `courseView`, `courseScore` and `courseDone`, plus the learner's `courseVals(L, it, content)`;
  - `src/fmtCourse.test.ts`;
  - `src/screens/CoursePanel.tsx` (lesson position, progress bar, blocks through `CourseBlock` in play mode, Previous/Next lesson, the score line);
  - `src/screens/CoursePanel.test.tsx`.
- Modify:
  - `src/types.ts`: `AppState.course: (CourseRun & {key: string}) | null`;
  - `src/fmtVals.ts`: `co: course && courseVals(L, it, course)`;
  - `src/screens/FormatPanels.tsx`: renders `det.co`;
  - `src/screens/studioPreviews.tsx`: a `CourseTry` in `LearnerPanel` for `kind: 'course'`, its own state, and a Desktop/Phone `SegmentedControl` and "Start over" in the preview only; `PREVIEWS.elearn`;
  - `src/completionVals.ts` and `src/logic/record.ts`: `completionText('E-learning', …, panel)` says the course's rule.

**Interfaces** (`src/fmtCourse.ts`):
- `CourseAnswer = number | {[card: number]: 0 | 1} | {v: string; checked: boolean} | {[panel: number]: boolean}`. The answer is by block kind: a check's pick, a sort's bins, an exercise's value, an accordion's open panels, a branch's choice.
- `CourseRun = {at: number; answers: Record<string, CourseAnswer>; rounds: Record<string, RoundState>; open: string | null}`; `NEW_RUN`.
- `blockView(b, mode, answer, patch, o: {ro: boolean; lessonTitle: string})` returns `BlockView`. The check is a one-question `roundView` over `b.question`.
- `courseScore(content, answers): {scored: number; answered: number; right: number; pct: number}`. An exercise is right when `|value − a| ≤ tol`.
- `courseDone(rule, seen: number[], lessons: number, score)`:
  - `seen`: every lesson index is in `seen`;
  - `score`: every scored block is answered and `pct ≥ PASS_MARK`;
  - `both`: both.
- `CourseOpts = {ro: boolean; seen: number[]; done: boolean; onProgress: (seen: number[], pct: number | null) => void; preview: boolean}`.
- `courseView(content, run, patch, o)` returns `{title, pos: 'Lesson 2 of 3', progW, blocks, prev, next, noPrev, noNext, scoreLine: 'Score 67 % · 4 of 6 scored items right · pass mark 80 %', ruleLine, note}`.
- `courseVals(L, it, content)`:
  - the run comes from `AppState.course`, keyed `subject|learning`;
  - opening a lesson adds it to `seen` and saves `detail.seen` through `saveDetail`;
  - once `courseDone` is met it saves `{seen, best}` with `complete: true` and the toast `completedToast(it, 'Course finished')`;
  - nothing is saved in View as, nothing again after accepted, and `best` keeps the highest score.

- [ ] **Failing tests first:**
  - `fmtCourse.test.ts`:
    - the design's example with every scored item right gives `pct` 100, and with one of six wrong gives 83;
    - unanswered scored items give no pass;
    - an exercise of 2520 with tolerance 1 is right for "2,519" (digits read as the design's `replace(/[^0-9.\-]/g, '')`);
    - a sort with all cards placed but one wrong is not right;
    - `courseDone('seen', [0, 1], 3, …)` is false and `[0, 1, 2]` is true;
    - `courseDone('both', all seen, pct 75)` is false;
    - `courseVals` in View as calls no store;
    - `courseVals` once accepted does not save again.
  - `CoursePanel.test.tsx`:
    - Next lesson shows "Lesson 2 of 3" and moves the progress bar;
    - a knowledge check shows "Correct." or "Not quite." and the explanation, with "Try again" (round restart);
    - the branch shows its outcome and "Try another choice";
    - the preview's Phone toggle narrows the player to 380 px, and "Start over" clears answers;
    - in the preview, finishing writes nothing (store spy) and the note reads "A play-test, as learners will see it: nothing is saved or counted.".
  - `screens.test.tsx` (Library detail): a published course hides "Mark as completed" and shows "It completes when you have seen every lesson"; a catalogue E-learning without content still shows "Mark as completed".
  - `completionVals.test.ts`: `completionText` for the three rules.
- [ ] Implement, GREEN, commit.

**Honest UI:**
- **Kept from the design:** the score line and pass mark, the Desktop/Phone toggle (preview only) and "Start over".
- **Not ported:** "What the LMS receives", and the copy "plays live and counts toward hours, CPD and trajectory steps". The panel says "counts toward your hours and trajectory steps", because CPD is 0 (owner question 3).
- A course whose rows were AI-drafted shows `AiMadeTag`.

**Review Focus owned:** **2, completion claims.**

### Task 1.5: Reflections, readable only by the learner
**Files:**
- Create:
  - migration `supabase/migrations/20261119110000_course_reflections.sql`;
  - `src/lib/reflectionStore.ts` and `reflectionStore.test.ts`;
  - `src/logic/reflections.sync.test.ts`.
- Modify:
  - `src/fmtCourse.ts`: the reflect block's view;
  - `src/screens/CourseBlock.tsx`;
  - `src/types.ts`: `AppState.reflections: Record<string, string>`, loaded per course when its panel opens, keyed `learning|block`;
  - `supabase/tests/rls.sql`: cases `CR`.

**Interfaces:**
- `REFLECTION_MAX = 2000`.
- `loadReflections(learningId): Promise<Record<string, string>>`, keyed by block id.
- `saveReflectionSoon(learningId, blockId, text, onError, wait = 800)`: an upsert of `learning_id, block_id, text` through `saveSoon`. A blank text deletes the row.
- `courseVals` passes `reflection: {value, set, note}` to the reflect block. In the preview, View as and for reviewers, `set` is a no-op and nothing is loaded.

**SQL** (`20261119110000_course_reflections.sql`):
- **Table** `public.course_reflections`:
  - `user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade`;
  - `learning_id text not null references public.learnings (id) on delete cascade`;
  - `block_id text not null check (block_id ~ '^b[0-9a-z]{4,20}$')`;
  - `text text not null check (char_length(btrim(text)) between 1 and 2000)`;
  - `updated_at timestamptz not null default now()`, set by `private.stamp_reflection` (before update);
  - `primary key (user_id, learning_id, block_id)`.
- **Helper.** `private.course_has_reflection(p_learning text, p_block text)` (definer, stable): the learning is published, of format 'E-learning', and its content has a reflect block with that id. Revoked from public and anon; granted to authenticated.
- **Grants.** `revoke all on public.course_reflections from anon, authenticated`; `grant select, insert (learning_id, block_id, text), update (text), delete on public.course_reflections to authenticated`.
- **Policies** (one per action, only the owner):
  - `"course_reflections: own read"` (select, using `user_id = (select auth.uid())`);
  - `"course_reflections: own write"` (insert, with check `user_id = (select auth.uid()) and private.course_has_reflection(learning_id, block_id)`);
  - `"course_reflections: own change"` (update, using and with check `user_id = (select auth.uid())`);
  - `"course_reflections: own remove"` (delete, using `user_id = (select auth.uid())`).
- **No other access.** No definer function selects from the table: no counsellor, admin or `can_view` branch.

- [ ] **Failing tests first:**
  - `CR` cases in `rls.sql`:
    - a learner inserts and reads their reflection on the published course, then updates and deletes it;
    - another learner, the learner's counsellor, a Domain Admin of their line, a General Admin and a System Admin each select 0 rows;
    - an insert with another person's `user_id` is refused;
    - a block id that is not a reflect block of that course is refused, and so is a non-course learning or an unpublished one;
    - an update of `user_id` or `learning_id` is refused (no column grant);
    - 2,001 characters and blank text are refused;
    - anon reads nothing;
    - deleting the learning removes the rows.
  - `reflections.sync.test.ts`: `course_reflections` appears in no migration but its own (a later function cannot leak it unnoticed), and `REFLECTION_MAX` equals the SQL check.
  - `reflectionStore.test.ts` (fake client):
    - two saves within 800 ms write once;
    - the upsert sends only the three columns;
    - a blank text deletes.
  - `CoursePanel.test.tsx`:
    - the learner's reflection shows "Saved · only you can read this";
    - View as shows "Reflections are private: nothing is shown in View as" and no text;
    - the preview shows "Preview: not saved".
- [ ] Implement, GREEN (PGlite, `npm test`, build, lint), commit.

**Honest UI:**
- The design's note "Kept in your notes only; nobody else sees it" becomes "Saved · only you can read this" once saved, and is true by RLS.
- In View as, the app never says "No reflection yet", because it cannot know.

**Review Focus owned:** **1, reflection privacy.**

### Task 1.6: Phase release
As in 7.6:
- **Phase review** (whole phase, the most capable model available), with the Review Focus lines 1, 2, 4 and 5.
- **Docs:**
  - `decisions.md`: E1–E5; the decisions block above and the reuse table.
  - Shortcuts in `decisions.md`:
    - course completion is trust-based (the database does not re-score);
    - answers are kept for the session only;
    - one final check per course;
    - no LMS export;
    - "Draft with AI" drafts the outline, not the blocks.
  - `implementation-notes.md`: the E-learning Studio (items shape, validators, player, reflections).
  - `functional-test-cases.md`: STU-213 onwards.
  - Journeys §7 (owner answers of 19 Nov 2026); the E8 and E9 stories.
  - The auto-memory: product answers (course completion, reflections private).
  - Version 0.17.0.
- **Push** `20261119100000` and `20261119110000`; then run `npm run test:db` and `supabase db advisors --linked` (`course_has_reflection` is an intended definer).
- **No function deploy:** no edge function changed.
- **Live checks:**
  - one course drafted, checked, peer-reviewed and published;
  - a learner completes it under each rule;
  - a reflection saved and not visible in View as from a General Admin.
- **Manual browser check before tagging:** the editor at 1280 px and the player at phone width (380 px) in Chrome and Safari.
- **Merge, tag, release, deploy.**
- **Release notes:** creators need a creation rule for E-learning; catalogue E-learnings keep "Mark as completed".

---

# Phase 2: Learnings from the other studios, and images (release v0.18.0)

### Task 2.1: One panel per learning, and the embed in the player
**Files:**
- Modify:
  - `src/screens/FormatPanels.tsx`: `FormatPanels({det})` instead of `{vm}`; `Library.tsx` passes `vm.det`;
  - `src/fmtCourse.ts`: the embed block's view;
  - `src/screens/CourseBlock.tsx`: the embed card;
  - `src/screens/CoursePanel.tsx`: renders the open embed through a render prop;
  - `src/screens/studioPreviews.tsx`: the preview's render prop uses `LearnerPanel` over the embedded learning's content;
  - `src/model.ts`: `openDetail(id, origin, backTo?: string)` and `goBack`/`backLabel` for `backTo`, "← Back to the course";
  - `src/types.ts`: `AppState.backTo: string | null`; `EmbedBlock`.
- Create:
  - `src/courseEmbed.ts`: `embedVals(L, learningId)`;
  - `src/courseEmbed.test.ts`.

**Interfaces:**
- `EMBED_FORMATS = ['Avatar', 'Reel', 'Podcast', 'Game', 'Slides', 'Animated flow', 'Interactive explainer', 'Flash cards', 'Practice exam', 'Job aid', 'Case exercise'] as const`. These are the design's `EL_FMT_STUDIO` keys in the app's format names ('Slides', not 'Slides with voice-over').
- `EMBED_ON_PAGE = ['Avatar', 'Case exercise']`. They finish through the evaluation quiz or the evidence form, which live outside their panel.
- `EmbedBlock = BlockBase & {block: 'embed'; format: EmbedFormat; learning: string}` (`''` until picked).
- `embedVals(L, learningId): {item: Item; det: ReturnType<typeof fmtVals>} | null`. It is built from `L.item(LEARN_BY[id])` and `fmtVals(L, item)`, and is null when the learning is missing or unpublished.
- The embed's view: `{format, glyph (the studio's), title, meta: 'Reel · 2 min', openLabel, isOpen, open, close, gone}`:
  - `openLabel` is "Play" for a game, "Start the conversation" for an avatar, "Open" otherwise;
  - `open` sets `CourseRun.open`, so one embed is open at a time;
  - for `EMBED_ON_PAGE`, `open` calls `openDetail(id, origin, courseId)`;
  - `gone` gives "This learning is no longer available".
- `CoursePanel` takes `renderEmbed: (learningId: string) => ReactNode`. The Library renders `<FormatPanels det={embedVals(L, id)!.det} />`. The preview and `SavedContent` render `<LearnerPanel t={{content: LEARN_META[id].content, …}} />`.

- [ ] **Failing tests first:**
  - `courseEmbed.test.ts`:
    - a published Reel embed gives `det.rl`, and an unpublished one gives `null`;
    - completing the embedded reel through its panel saves progress on the reel's learning id (E3), and the course's detail is unchanged;
    - an Avatar embed's `open` calls `openDetail` with `backTo` set to the course.
  - `CoursePanel.test.tsx`:
    - opening a second embed closes the first;
    - an embed of a retired learning shows "This learning is no longer available" and blocks nothing;
    - the course's completion does not depend on embeds.
  - `screens.test.tsx`:
    - the Library detail still renders every format panel through `FormatPanels({det})`;
    - "← Back to the course" returns to the course detail.
  - `studioPreviews.test.tsx`: the course preview plays an embedded explainer as a play-test and writes nothing.
- [ ] Implement, GREEN, commit.

**Honest UI:**
- The design's toast "Prototype: opens … inline" is not ported. An embed always plays the real panel, or opens the learning's own page.
- The design's "Packaged as an offline copy in the SCORM export" note is removed (E5).

**Review Focus owned:** **3, an embedded learning.**

### Task 2.2: Embeds in the editor, and the check
**Files:**
- Create: migration `supabase/migrations/20261119120000_course_embeds.sql`.
- Modify:
  - `src/logic/courseContent.ts`: `BLOCK_KINDS` adds 'embed'; the problems;
  - `src/logic/courseEdit.ts`;
  - `src/courseEditVals.ts`: the shelf groups, the source picker and "Make a new one in the … Studio";
  - `src/screens/CourseEditor.tsx`;
  - `src/createSave.ts`: `openStudioFromCourse(L, format)`;
  - `courseContent.sync.test.ts`;
  - `supabase/tests/rls.sql`: cases `EE`.

**Interfaces:**
- **Shelf groups** (design `EL_SHELF`, in the app's names):
  - "From the studios": Avatar conversation, Reel, Podcast, Game, Slides, Animated flow, Explainer;
  - "Practice and reference": Flash cards, Practice exam, Job aid, Case exercise.
- **The inspector's "Source".** A select of the published learnings of that format, newest first, from `LEARN`/`LEARN_META`. E-learning is never offered. The empty option reads "Pick from the library…", or "Nothing in the library yet" when there is none.
- **`openStudioFromCourse(L, format)`:**
  1. saves the course draft through `saveForm(L, false)`;
  2. opens `studioFor(format)` with a blank draft of that format (`changeFormat`);
  3. shows the banner "Your course “…” is saved in My contributions · open it there to continue".
  - It is refused in View as and for a submitted course. It follows the creator's rules (`reachable`); otherwise "No creation rule for <format> in <line>".
- **`courseProblems` adds:**
  - "Lesson 2 · Reel: pick the learning from the library";
  - "Lesson 2 · “<title>” is no longer published: pick another".

**SQL** (`20261119120000_course_embeds.sql`):
- `private.course_block_ok` (as 20261119100000) accepts `{block: 'embed', format, learning}`, with `format` in the embed list and `learning` matching `^(L[0-9]{1,6})?$`.
- `private.course_embed_problems(p_items) returns text[]` (stable, definer): every embed names a learning that exists, is published, is of that format and is not 'E-learning'.
- `private.contribution_problems` is copied from 20261119100000 and adds those problems for E-learning. A course whose embedded learning is unpublished after the check is refused at submit, because submit re-runs the problems.
- `revoke execute` on the new function.

- [ ] **Failing tests first:**
  - `EE` cases:
    - a course with a Reel embed naming a published Reel checks and submits;
    - an embed with an empty learning is refused with "pick the learning";
    - an unpublished, missing or other-format learning is refused;
    - an embedded E-learning is refused;
    - a learning retired between check and submit is refused at submit;
    - the published content keeps `{block: 'embed', format, learning}`.
  - `courseContent.test.ts`: the embed problems in TS for an empty source.
  - `CourseEditor.test.tsx`:
    - the Reel shelf item adds an embed and opens the Source select;
    - the select lists only published Reels;
    - "Make a new one in the Reel Studio" saves the course, opens the Reel Studio and shows the banner;
    - without a Reel rule it shows the refusal;
    - View as shows no shelf.
- [ ] Implement, GREEN (PGlite, `npm test`, build, lint), commit.

**Honest UI:**
- The picker says "Only published learnings can be added. A new one appears here once it is published."
- The design's "your course is kept as you left it" becomes "saved in My contributions", because the course is a saved draft, not a held screen.

**Review Focus owned:**
- **3, an embedded learning** (no nesting, published only).
- **4, the check gate** (a source that disappears is caught at submit).

### Task 2.3: Image and hotspot blocks
**Files:**
- Create: migration `supabase/migrations/20261119130000_course_images.sql`.
- Modify:
  - `src/logic/mediaFiles.ts`: `MEDIA_KINDS` adds png, jpg, jpeg and webp, each "An image", 5 MB;
  - `src/logic/courseContent.ts`: 'image' and 'hotspot', with the alt-text problem;
  - `src/logic/courseEdit.ts`: `removeBlock` returns the removed image path;
  - `src/courseEditVals.ts`: upload through `saveWithFile` + `uploadMedia`; delete through `removePaths`;
  - `src/screens/CourseBlock.tsx`: images via `useAudioLinks`; hotspot points as buttons with `aria-label`, plus a text list;
  - `src/logic/mediaFiles.test.ts`, `courseContent.sync.test.ts`;
  - `supabase/tests/rls.sql`: cases `EI`.

**Interfaces:**
- `ImageBlock = BlockBase & {block: 'image'; path: string; alt: string; cap: string}`.
- `HotspotBlock = BlockBase & {block: 'hotspot'; path: string; alt: string; cap: string; spots: [x: number, y: number, title: string, text: string][]}`. There are 2–8 spots, and x and y are percentages from 0 to 100.
- `IMAGE_MAX_BYTES = 5 MB`.
- `courseImagePaths(items): string[]`.
- `courseProblems` adds:
  - "Lesson 2 · Image: add the image";
  - "Lesson 2 · Image: write the alt text (read aloud by screen readers)".
- The design's "No alt text yet" tag shows in the editor.

**SQL** (`20261119130000_course_images.sql`):
- `private.course_block_ok` (as 20261119120000) accepts image and hotspot:
  - `path` is `private.media_path_ok` and ends in `.png`, `.jpg`, `.jpeg` or `.webp`;
  - `alt` is 1–600 characters (blank is allowed in a draft and refused by the problems);
  - `cap` is at most 200 characters;
  - spots are bounded.
- `private.contribution_problems` (as 20261119120000) adds, for E-learning:
  - the alt-text problem;
  - "An image is not there · add it again", via `private.media_files_missing(c.author_id, c.id, private.course_image_paths(c.items))`.
- Storage is unchanged:
  - the bucket already lists `image/png`, `image/jpeg` and `image/webp`;
  - learners read an image only once the published content names its `path` (`private.can_read_media`, 20261118230000).

- [ ] **Failing tests first:**
  - `mediaFiles.test.ts`:
    - `mediaProblem('diagram.png', 6 * MB)` gives "An image is at most 5 MB · this one is 6.0 MB";
    - `mediaProblem('x.svg', 10)` is refused;
    - the bucket list in the migrations contains the three image types.
  - `courseContent.test.ts`:
    - an image without alt text gives the alt problem;
    - a hotspot spot at x 120 is refused;
    - a hotspot with one spot is refused.
  - `EI` cases:
    - the author uploads `<uid>/<contribution>/invoice.png` and reads it;
    - another creator cannot read it while it is a draft, and a reviewer can once sent;
    - after publishing, a learner reads the image named in the content, and not another file of the same folder;
    - a course naming an image of another contribution is refused at check;
    - an image deleted from storage after the check is refused at submit;
    - `x.svg` is refused by the bucket.
  - `CourseEditor.test.tsx`:
    - adding an image block offers "Add an image" and saves the draft first when it is unsaved;
    - deleting the block calls `removePaths` with its path;
    - the alt-text field is labelled "Alt text (read aloud by screen readers)".
  - `CoursePanel.test.tsx`: a hotspot point opens its title and text; the points are reachable by keyboard; the text list shows every point.
- [ ] Implement, GREEN (PGlite, `npm test`, build, lint), commit.

**Honest UI:**
- No gradient placeholder: an image block without a file says "Add an image".
- Alt text is required before sending, as the design's check asks ("Every image has alt text").

**Review Focus owned:**
- **5, untrusted content** (image types, bounded coordinates).
- **6, image files.**

### Task 2.4: Phase release
As in 7.6:
- **Phase review** (whole phase), with the Review Focus lines 3, 4, 5 and 6.
- **Docs:**
  - `decisions.md`:
    - embeds and images;
    - "Avatar and Case open their own page";
    - **Subprocessors:** none new;
    - **shortcuts:** an embed whose learning is retired after publish shows "no longer available" (the course is not re-checked); images are not resized or re-encoded.
  - `implementation-notes.md`; `functional-test-cases.md`; journeys E8 and E9.
  - Version 0.18.0.
- **Push** `20261119120000` and `20261119130000`; then run `npm run test:db` and `supabase db advisors --linked`.
- **No function deploy.**
- **Live checks:**
  - a course with a published Reel and Job aid embedded, and one image with a hotspot, drafted, checked, reviewed and published;
  - a learner finishes the embedded reel inside the course, and the reel shows as completed in the Library with its own hours;
  - the Avatar embed opens its page and comes back.
- **Manual browser check before tagging:** image upload in Chrome, Safari and Firefox; a 6 MB PNG and an SVG are refused before upload.
- **Merge, tag, release, deploy.**
- **Release notes:** what can be embedded; images need alt text.

### Owner questions (Phases 1–2)
1. **What the 80 % covers.** The design scores every scored block (knowledge checks, sorts, calculation exercises), and this plan does the same, with a final check required. Should "Final check of 80 % or more" score the final check alone instead?
2. **Knowledge check format.** It reuses the existing exam question: four options and an explanation, where the design allows 2–4 options and no explanation. Agreed?
3. **CPD.** A published course counts its "Length?" in hours, with CPD 0 as for every peer contribution, although the design's copy says it counts toward CPD. Keep it at 0?
4. **Answers across sessions.** Lessons seen and the best score are saved, but answers are kept only for the session, so a learner who leaves mid-course re-answers. Acceptable?

---

## Execution

Phases run in order with superpowers:subagent-driven-development: one implementer per task, a review per task, a whole-phase review, then the phase release.
