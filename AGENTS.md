# AGENTS.md

MyProfessionalMe: a clickable prototype of a learning & growth platform (growth map, library with avatar-practice learnings, projects & evaluations, profile, counsellor view, admin library and audience-based curriculum mapping). React 19 + Vite + TypeScript, npm. No backend; all data is seed data in memory.

Source design: Claude Design project `797ed301-7b6d-47eb-9e2d-6d7d2e7483c3`, file `MyProfessionalMe.dc.html`, built on the TaxConnect design system. GitHub: `BartJanCoppens/MyProfessionalMe` (public).

## Commands

- `npm run dev`: dev server
- `npm run build`: `tsc -b` then Vite build (use this as the typecheck)
- `npm run lint`: oxlint
- `npm run agents`: regenerate `AGENTS.md` from this file. Run it after every edit to `CLAUDE.md`; never edit `AGENTS.md` by hand.

## Layout

- `src/styles/tokens/*.css`: design-system tokens (colours, type, spacing, motion), copied from the DS. `src/styles/index.css` adds globals and the `pm*` keyframes.
- `src/ds/index.tsx`: TSX port of the DS components the app uses (Button, StatusChip, Tag, Card, Drawer…), inline styles on CSS variables. `Hover` stands in for the prototype's `style-hover` attribute.
- `src/data.ts`: seed data, verbatim from the prototype script. `src/types.ts`: tuple and state types.
- `src/model.ts`: `Logic` is a near-verbatim port of the prototype's `DCLogic` class. `renderVals()` derives the whole view-model (`VM`), including the constellation, radar and road geometry. Change behaviour here, not in the screens.
- `Logic.curriculum()` builds the curriculum-mapping view-model; `applyOps()` is the single write path for mappings (drags, signals and copilot proposals all go through it).
- `src/screens/*.tsx`: one file per screen group; each is a transcription of its template block and only reads from `VM`. `Mapping.tsx` is the curriculum-mapping screen.
- `src/App.tsx`: state (one `AppState` object, merged patches like class `setState`), sidebar, header, screen switch.

## Conventions

- Styling is inline style objects using the token values, matching the DS. No Tailwind here.
- `Logic` is rebuilt every render from the current state. After an `await`, use the functional `setState((s) => …)` form because `this.state` is stale (see `send()`).
- The prototype's editable props live in `src/config.ts` and can be overridden from the URL: `?bl=Advisory&screen=team&view=radar&marks=off&live=off&motion=off`.
- The avatar is stored in `localStorage['mpm-avatar']`.
- Curriculum mappings live in one `maps` record keyed by audience: business-line keys (`'Consulting'`, …) plus lens-prefixed keys (`'ind:energy'`, `'amb:sust'`, …). `LENSES[i][3]` (canMand) decides whether an audience can carry mandatory items; ambition and profile audiences are always advised. `pending` keys are `audience|learningId`.
- Avatar-practice learnings have format `'Avatar'`; persona, skills and past runs are in `AVATARS` (data.ts).

## Assistants

Three features call `window.claude.complete` when it exists (only inside Claude Design): the profile chat ("Talk it through"), the curriculum copilot, and "Read it as …" in the learner's eye. Elsewhere they fall back to scripted replies in `Logic.scripted()`, `scriptedCp()` and `scriptedRead()`. To make it live, add a server-side proxy to the Claude API; never put an API key in the client bundle.
