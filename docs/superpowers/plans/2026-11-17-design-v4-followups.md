# Design v4 follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four gaps the owner answered on 17 Nov 2026: a business line on trajectories, industry/technology audience membership set by counsellors, a required comment on "Talk first", and credential renewal by submitting proof.

**Architecture:** Same as `2026-11-17-design-v4.md`: SQL is the authority (RLS, `security definer` RPCs), pure rules in `src/logic/` mirror it with sync tests, view-models in `src/*Vals.ts`, screens only read them. Continue on branch `feature/design-v4`; the v4 migrations are still unpushed, but add NEW migrations here (later than `20261117180000`), so the reviewed v4 files stay as reviewed.

**Tech Stack:** React 19, Vite, TypeScript, Supabase, Vitest, PGlite RLS runner (`node scripts/rls-pglite.mjs .`).

**Spec:** the owner's answers (17 Nov 2026), recorded in `docs/decisions.md` by Task 5:
1. Trajectories get a business-line field.
2. A person's industry (`ind:`) and technology (`tec:`) audiences are set by their counsellor (System, General and the person's Domain Admins can too). Membership makes `mandatory` trajectory maps on those audiences bind the person.
3. "Talk first" on a trajectory start request or step requires a comment; the learner sees it.
4. Renewal: from 30 days before a credential's expiry (and after it), the learner submits renewal proof (link or certificate number); the counsellor confirms; a new credential with a new expiry replaces the old one in the wallet.

## Global Constraints

- All constraints of `docs/superpowers/plans/2026-11-17-design-v4.md` (Global Constraints section) apply: Audit not Advisory; seven stages; no fictional people; honest UI; one permissive policy per table and action; `revoke all … from anon, authenticated` plus minimal grants on new tables; an RLS case per policy; rules mirrored in TS and SQL with a sync test; files under ~250 lines (UI ~220).
- No `supabase db push`, `functions deploy`, `vercel deploy` or `npm run test:db`. Verify SQL with `npm i --no-save @electric-sql/pglite@0.3.15 && node scripts/rls-pglite.mjs .`.
- Comment limits reuse `COMMENT_MIN` (10) and `COMMENT_MAX` (500) from `src/logic/record.ts` and their SQL twins.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A counsellor sets membership for someone who is not their counsellee.** Refused by RLS. Case in Task 2.
2. **Membership is removed while a person is mandatorily auto-enrolled.** They become an "open" enrollee (can leave if nothing is signed off); nothing errors. Test in Task 2.
3. **A renewal is submitted for a credential that is not the person's, not confirmed, or more than 30 days from expiry.** Refused. Cases in Task 4.
4. **Two renewals in a row.** Only one waiting renewal per credential; confirming it supersedes the old one exactly once. Cases in Task 4.
5. **"Talk first" with an empty or 9-character comment.** Refused in the UI and in SQL. Test and case in Task 3.

---

### Task 1: Business line on trajectories

**Files:** Modify `src/trajectoryAdminVals.ts`, `src/screens/TrajectoryEditor.tsx`, `src/logic/trajectoryEdit.ts`; tests beside them.

- [ ] **Step 1: Failing tests.** The editor shows a "Business line" select. A System or General Admin sees Firm-wide, Consulting, Audit, Tax & Legal. A Domain Admin sees only the lines they administer (no Firm-wide). Changing the line saves through `saveTrajectorySoon`. A change the database would refuse (via `refusal()`) is blocked with the existing toast. A Domain Admin with two lines creates new trajectories on their first line and can switch to the second.
- [ ] **Step 2–4:** RED, implement, GREEN (`npm test`, build, lint). No SQL change: `can_write_trajectory` already checks `can_edit_content(business_line)`.
- [ ] **Step 5: Commit** `feat(trajectories): business line in the editor`.

### Task 2: Industry and technology membership

**Files:**
- Create: `supabase/migrations/<ts>_audience_members.sql`, `src/lib/membershipStore.ts`, `src/logic/membership.ts`, `src/screens/Membership.tsx` (a small chip editor)
- Modify: `src/trajectoryCtx.ts` (person gets `audiences`), `src/logic/trajectory.ts` (`inMandatoryAudience`, `autoEnrolled`, `relevantMap` callers use line + audiences), `src/screens/Team.tsx` and `src/screens/Users.tsx` (hooks only), `supabase/tests/rls.sql`

**Interfaces:**
- Table `audience_members(user_id uuid references profiles on delete cascade, audience text check (audience ~ '^(ind|tec):[a-z]+$'), set_by uuid default auth.uid(), set_at timestamptz default now(), primary key (user_id, audience))`.
- Read: the person, and whoever `private.can_view_track(user_id)` allows. Write (insert, delete): the person's counsellor (`profiles.counsellor_id = auth.uid()`), or `private.can_manage_user(user_id)` (System, General, the person's Domain Admins). The person cannot set their own.
- `private.in_mandatory_audience(uid, maps)`: a map binds when it is `mandatory`, its stage is the person's `career_stage`, and its audience is the person's `business_line` **or** one of their `audience_members`. Execute stays revoked from `authenticated`.
- `private.trajectory_maps_ok`: `mandatory` allowed on business-line, `ind:` and `tec:` audiences; `amb:` and `pro:` stay advised-only. Replace the decisions.md entry "mandatory only for business-line audiences".
- TS: `inMandatoryAudience(t, person: { line; stage; audiences: string[] })` and `autoEnrolled` mirror the SQL; the trajectory sync test covers the new condition.
- Store: `loadAudiences(userId): Promise<string[]>`, `setAudience(userId, audience, on: boolean)`.

- [ ] **Step 1: Failing RLS cases.** A counsellor sets and removes an audience for their counsellee. Another counsellor is blocked. The person cannot set their own. A Domain Admin of the person's line can set one; a Domain Admin of another line cannot. A General Admin can. A mandatory `tec:data` map binds a member at the map's stage (they can't withdraw) and not a non-member. Removing the membership makes the row withdrawable while no step is done (Review Focus 1, 2).
- [ ] **Step 2: Failing TS tests.** `inMandatoryAudience` with audiences; the editor allows `mandatory` on `ind:`/`tec:`, still not on `amb:`/`pro:`; the sync test fails until the SQL fragment matches.
- [ ] **Step 3: UI.** In My team, each counsellee row (or the person panel the roster already has) gets "Industries & technologies": chips from the `ind` and `tec` audiences in `AUDS`, toggling through `setAudience`, then reloading that person. On the Users page, admins get the same chip editor per person. Hidden in View as. The trajectory screens and the person zoom (`trjFor`) use line + audiences.
- [ ] **Step 4: Run** PGlite, `npm test`, build, lint → green.
- [ ] **Step 5: Commit** `feat(audiences): counsellors set industry and technology membership`.

Out of scope (record as a PoC shortcut): membership does not yet change which single learnings are mandatory or advised for a learner. Learnings still follow the business-line curriculum only.

### Task 3: A comment with "Talk first"

**Files:** Create `supabase/migrations/<ts>_trajectory_decisions.sql`; modify `src/lib/trajectoryStore.ts`, `src/teamTrjVals.ts`, `src/screens/TeamTrajectories.tsx`, `src/trajectoryPage.ts`, `src/screens/Trajectory.tsx`; tests and `rls.sql`.

**Interfaces:**
- Table `trajectory_decisions(id uuid pk default gen_random_uuid(), user_id uuid, trajectory_id text, step_id text null, decision text check in ('approve','talk'), comment text check (comment is null or char_length(comment) between 10 and 500), decided_by uuid default auth.uid(), decided_at timestamptz default now())`. Read: the person and `can_view_track`. No direct writes; only `decide_trajectory` inserts.
- `decide_trajectory(p_user, p_trajectory, p_step, p_decision, p_comment text default null)`: `talk` requires a comment of 10–500 characters (trimmed); `approve` takes an optional comment. Every decision inserts a log row. Drop the 4-argument overload and re-grant.
- Store: `decideTrajectory(..., comment?)`; `loadDecisions(userId)`.
- Learner: the trajectory page shows the latest `talk` comment on the step or start request it concerns ("<Counsellor first name>: <comment>"), until a newer submission or decision replaces it.

- [ ] **Step 1: Failing tests.** "Talk first" opens a comment field and stays disabled under 10 characters, with the same counter style as `decide_learning`'s comment. SQL refuses `talk` with no comment or 9 characters (P0001). The log row is written for both decisions. The learner sees the comment; another learner can't read it.
- [ ] **Step 2–4:** RED, implement, GREEN (PGlite, `npm test`, build, lint).
- [ ] **Step 5: Commit** `feat(trajectories): talk first needs a comment the learner sees`.

### Task 4: Renewal by proof

**Files:** Create `supabase/migrations/<ts>_credential_renewal.sql`; modify `src/lib/trajectoryStore.ts`, `src/walletVals.ts`, `src/screens/Wallet.tsx`, `src/teamTrjVals.ts`, `src/screens/TeamTrajectories.tsx`, `src/logic/trajectoryLearner.ts`; tests and `rls.sql`.

**Interfaces:**
- `credentials` gains `renewal_of uuid null references credentials(id)` and `superseded_at timestamptz null`. A partial unique index allows one waiting renewal per credential: `(renewal_of) where status = 'waiting'`.
- `submit_renewal(p_credential uuid, p_link text, p_ref text, p_expires date default null)`, as security definer. The caller must own a `confirmed`, not superseded credential that has `expires_on` within 30 days or in the past. A link or a ref is required, using the existing credential proof rule. It inserts a `waiting` row that copies name, issuer and trajectory_id, sets `renewal_of`, and takes `expires_on` from `p_expires` (only for credentials without a trajectory; required then).
- `confirm_credential(p_id)` additionally handles renewals:
  - It sets the new row's `earned_on` to today.
  - For a trajectory credential it sets `expires_on` = today + the trajectory's `valid_months`.
  - It stamps `superseded_at = now()` on the old row, in the same transaction.
  - The exam-acceptance "already holds a valid credential" guard ignores superseded rows.
- Wallet: confirmed, not superseded credentials only. From 30 days before expiry and after it, a "Renew" action opens a form: link or number, plus a new expiry for external credentials. The trajectory's renewal rule shows as the hint. A waiting renewal shows "Renewal waiting for <counsellor>", with the existing Remove. Superseded credentials are hidden, or listed under "History"; choose the smaller one and say which.
- Counsellor "Waiting for you": renewal rows have kind "Renewal" and show the proof and Confirm, the same path as external credentials.
- Learner page and table: "Credential earned" counts the newest confirmed, not superseded, unexpired credential.

- [ ] **Step 1: Failing RLS cases** for Review Focus 3 and 4:
  - Renewing someone else's credential is refused.
  - Renewing a waiting credential is refused.
  - Renewing more than 30 days before expiry is refused.
  - Renewing an expired one is allowed.
  - A second waiting renewal is refused.
  - Confirming supersedes the old row once.
  - The exam guard ignores superseded rows.
- [ ] **Step 2: Failing TS tests** for the wallet, renewal form and counsellor row.
- [ ] **Step 3–4:** Implement, then GREEN (PGlite, `npm test`, build, lint).
- [ ] **Step 5: Commit** `feat(credentials): renew by submitting proof`.

### Task 5: Docs and version

- [ ] `docs/decisions.md`:
  - Record the four owner answers.
  - Replace the "mandatory only for business-line audiences" entry.
  - Remove the "no re-take/renewal path" and "Talk leaves no reason" shortcuts.
  - Add the shortcut "membership does not yet steer single learnings".
- [ ] `docs/product/user-journeys-and-epics.md` §7: add the four answers.
- [ ] `docs/implementation-notes.md`: add the new tables and RPCs.
- [ ] `docs/testing/functional-test-cases.md`: add rows for each task's tests.
- [ ] `package.json` and `package-lock.json`: version 0.9.0.
- [ ] Commit `docs: v4 follow-ups, version 0.9.0`.
