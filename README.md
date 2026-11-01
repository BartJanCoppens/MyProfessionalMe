# MyProfessionalMe

Clickable prototype of a learning & growth platform for a professional-services firm: personal growth map (constellation, radar and road views), learning library with AI-avatar role-play practice, projects & evaluations, personality and ambitions profile with an assistant, a counsellor team view, and admin screens for the learning library and curriculum mapping by audience (business line, industry, technology, ambition, profile) with a curriculum copilot.

Built with React, Vite and TypeScript from a Claude Design prototype.

```bash
npm install
cp .env.example .env.local   # fill in the Supabase URL and publishable key
npm run dev
```

Sign-in is required. Accounts are created by a System Admin or a Domain Admin in **Administration → User management**; there is no self sign-up.

The app shows one person at a time: yourself, or (for admins and counsellors) someone you choose with **View as** in the sidebar, read-only. Progress, ambitions, interests and counsellor are stored per person.

Tests: `npm test` (unit) and `npm run test:db` (row-level security against the linked Supabase project).

URL options: `?bl=Consulting|Audit|Tax%20%26%20Legal`, `?screen=map|library|projects|profile|team|adminLib|adminMap|users` (admin screens need an admin role), `?view=constellation|radar|road`, `?marks=off`, `?live=off`, `?motion=off`.
