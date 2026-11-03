# AURA-X — Personal Goal OS with Auri

AURA-X is a full-stack, responsive personal-goal and learning workspace. It turns a user's goal, schedule, skill level, constraints, and preferences into a roadmap with milestones, daily tasks, learning resources, learning checks, and saved progress. Auri is the in-app, goal-scoped AI agent and animated mascot.

This is a **new managed AURA-X website/web app**. The legacy site at `https://auraxnew-kgtk8piu.manus.space` remains unchanged. Deliverables are the live website, a GitHub-ready source archive (`.tar.gz`, not ZIP), and a PDF guide for GitHub and VS Code. The published URL is reported only after the hosting platform confirms the release.

## Product capabilities

- Email/password account flows, private goals, ownership-checked data, and account preferences.
- A spacious, five-step full-page goal builder (not a blurred modal) with editable fields, Today/Tomorrow/date-picker start options, durations through 730 days, review and explicit save.
- Goal planning, AI-generated roadmaps, milestones, daily tasks, priorities, completion criteria, progress reflections, attendance, and activity history.
- A complete date-and-weekday attendance list covering each goal day. Users choose a past/current date with a calendar picker or the list and mark Present, Missed, or Clear; unmarked dates stay neutral, and future attendance cannot be recorded.
- A goal-scoped AI coach and Auri agent. Auri can answer in the user's language and perform only supported AURA-X actions on the selected user's goal: find/save resources, create a learning check, make explicitly requested goal edits, record user-reported task progress, or prepare a schedule change for review. It never silently applies schedule changes or claims an action succeeded before the server confirms it.
- Goal- and optional-topic-matched resource search through YouTube Search/playlist candidates (Manus API Hub), Open Library, Crossref, Wikipedia, Internet Archive, Library of Congress, OpenAlex, Europe PMC for relevant biomedical goals, arXiv for relevant STEM goals, GitHub and Stack Exchange for technical goals, Hugging Face for relevant AI/data goals, and optional Brave Search when configured. Results are HTTPS-checked, relevance-filtered, deduplicated, provider-labelled, saved to the selected goal, and never fabricated; playlist candidates are not represented as verified or accredited courses.
- Learning checks and saved attempts with explanations; quiz scores are not represented as proof of real-world mastery.
- Auri's 23 movement states and 27 facial-expression presets, with automatic app-event reactions, subtle face/gesture animation, reduced-motion support, and SVG/PNG/JSON export. Auri stays put unless the user deliberately drags the Move handle or uses keyboard controls; she never chases the mouse or scroll, preserves page scrolling, remembers her position, and keeps the full chat panel within the viewport.
- User-initiated Hindi/English/Hinglish voice conversation with an editable transcript, automatic reply-language matching, actual spoken Auri replies, and Start/Pause/Resume/Interrupt/Stop/Switch-to-text controls. When native browser dictation is unavailable, Auri can capture a short microphone clip only after a user tap, stop on Finish (30-second limit), and send it to the protected transcription service; raw audio is not persisted. Locale-matched device speech is the default. Optional server-side ElevenLabs TTS requires a valid protected key; no voice clone is included.
- Responsive desktop, tablet, and mobile layouts.

## Technology and project layout

- **Frontend:** React 19, TypeScript, Vite, Wouter, TanStack React Query, tRPC, Radix UI, Tailwind CSS, Lucide, and Recharts.
- **Backend:** Node.js 22, Express, tRPC, Zod, and SuperJSON.
- **Data:** MySQL/MariaDB-compatible database with Drizzle ORM and versioned SQL migrations.
- **Authentication:** server-side password hashing, database-backed sessions, HTTP-only cookies, ownership checks, rate limits, and same-origin POST protection.
- **AI:** server-side Manus LLM service. AI roadmap, coach, assessment, and agent calls use the project's AI credits; a permanent free allowance is not guaranteed.

```text
client/                   React app, pages, components, styles
server/                   Express/tRPC API, authentication, AI and provider services
shared/                   Shared validation schemas and types
drizzle/                  Database schema, relations, and SQL migrations
docs/                     Architecture, deployment, provider, and stack notes
.github/workflows/        GitHub CI workflow
Dockerfile                Production container
client/public/manus-routes.json
```

## Run locally

Requirements: Node.js 22+, pnpm 10.18.0, and a MySQL/MariaDB-compatible database.

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

Set a development `DATABASE_URL` and the server-only AI configuration in `.env`. Never commit `.env` or place secrets in `VITE_*` variables.

```bash
pnpm db:migrate
pnpm check
pnpm test
pnpm build
pnpm dev
```

The development server uses `PORT` (default `3000`); `/api/health` is the health endpoint. The database in this new project started without legacy AURA-X users, goals, or progress; the old site's records were not migrated.

## Server-only environment variables

See `.env.example` for placeholders. Depending on the environment, configure:

- `DATABASE_URL` — the database connection string.
- `MANUS_PROJECT_ID`, `MANUS_API_URL`, and `MANUS_API_KEY` — the server-side Manus AI configuration for a separately configured deployment. Never expose these to the browser.
- `BRAVE_SEARCH_API_KEY` — optional additional search provider.
- `ELEVENLABS_API_KEY` — optional server-only TTS key. When absent, Auri uses device speech if available. ElevenLabs usage depends on the account's plan and limits.

## Voice and OpenJarvis notes

Microphone capture starts only after the user taps a voice control and grants browser permission. Native browser recognition is used where available; otherwise a user-finished, at-most-30-second clip is sent to the protected transcription endpoint and discarded rather than saved. Transcripts remain editable before text submission. Auri replies in Auto, English, Hindi or Hinglish and speaks using a supported device voice. Typed chat remains the fallback. Optional hosted ElevenLabs TTS is disabled until a valid server-only key is configured; it is not a voice clone.

The separate `open-jarvis/OpenJarvis` GitHub repository is a local-first Python framework, not a hosted API endpoint. No secured OpenJarvis server URL was provided, so AURA-X does **not** run or claim to connect to an OpenJarvis deployment. Auri remains the native AURA-X agent. A live bridge would require a reachable, secured OpenJarvis API endpoint; see [provider notes](docs/PROVIDER-NOTES.md).

## Deployment and limits

The production Dockerfile builds the Vite client and Express server, honors `PORT`, and exposes `/api/health`. Configure the protected runtime variables and run migrations against the intended deployment database. GitHub is a source-code repository; it does not provide the database, AI runtime, private credentials, or hosting by itself.

The Manus-hosted website has a stable public URL after successful publication. Hosting may be on-demand and can sleep while idle; a permanent URL does not mean an always-on process. AI availability depends on the project's remaining credits, and external voice usage follows the ElevenLabs account plan.

## Checks recorded for this source

- `pnpm check` — passed.
- `pnpm test` — 28 tests passed.
- `pnpm build` — passed; Vite reports a bundle-size advisory and the existing platform config-script bundling notice.
- `pnpm db:migrate` — applied migrations to this project's new database; `startDate`, `course`/`dataset` resource types and nullable `bookmarkedAt` column were verified in the live schema.
- `/api/health` and `/manus-routes.json` — HTTP 200; route manifest contains the actual goal-create/workspace and public routes.

See [the GitHub and VS Code guide](docs/GITHUB-VSCODE-GUIDE.md), [architecture](docs/ARCHITECTURE.md), [deployment](docs/DEPLOYMENT.md), [tech stack](docs/TECH-STACK.md), and [provider notes](docs/PROVIDER-NOTES.md) for details.
