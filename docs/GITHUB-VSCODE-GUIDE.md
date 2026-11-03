# AURA-X — GitHub and VS Code Quick-Start

This guide helps you save the AURA-X source in **your own private GitHub repository** and run it from VS Code. The published Manus website is already a separate deployment; GitHub stores source code, not a running app, database, or AI service.

## 1. What you need

- The supplied `auraxai-source.tar.gz` source archive.
- Git, VS Code, Node.js 22, Corepack/pnpm 10.18.0.
- A MySQL or MariaDB database for a standalone local/deployed copy.
- Authorized server-side Manus AI configuration for roadmap/chat/transcription features. Optional providers can need their own keys.

The archive excludes `.git`, `.env`, database contents, build outputs, and `node_modules`. It contains the migration files and `.env.example`. No production user data or credentials are bundled.

## 2. Open the project in VS Code

Extract the archive, open the extracted project folder in VS Code, and open a terminal at that folder (the one containing `package.json`). On macOS/Linux:

```bash
tar -xzf auraxai-source.tar.gz
cd auraxai
code .
```

On Windows, use **Extract All** for the `.tar.gz`, open the extracted `auraxai` folder in VS Code, and use the integrated PowerShell terminal.

## 3. Configure local services safely

Enable Corepack, install the pinned package manager, install dependencies, and make a private local environment file:

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

In Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp` if needed.

Edit `.env` locally and provide:

- `DATABASE_URL`: your own MySQL/MariaDB URL.
- `MANUS_PROJECT_ID`, `MANUS_API_URL`, `MANUS_API_KEY`: authorized server-side Manus AI settings, if you want managed AI and voice transcription in this standalone copy.
- `BRAVE_SEARCH_API_KEY`: optional additional web search.
- `ELEVENLABS_API_KEY`: optional hosted, standard (not cloned) TTS. Device speech is the default and does not need this key.

Never paste credentials into source code, a browser-side `VITE_*` variable, GitHub issues, or this PDF. `.env` is excluded by `.gitignore`; commit `.env.example` only.

## 4. Migrate and run

Create/select the local database first, then apply versioned migrations and start the dev server:

```bash
pnpm db:migrate
pnpm check
pnpm test
pnpm dev
```

Open `http://localhost:3000` and create an account from the website. For a production-mode check, stop the dev server and run:

```bash
pnpm build
pnpm start
```

`/api/health` is the unauthenticated health route. `pnpm db:migrate` applies pending migrations; do not reset or drop the database to update the schema.

## 5. Save to your GitHub account

Use a **Private** repository unless you intentionally want the source to be public. After extracting the archive, initialize Git and create the first commit:

```bash
git init -b main
git add .
git status --short
git commit -m "Prepare AURA-X source"
```

Before committing, confirm that `.env` is not listed in `git status`. Create an empty private repository on GitHub, then connect it and push:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the placeholders with your GitHub username and repository name. GitHub authentication may ask you to sign in in your browser or use your configured Git credential manager. Do not put a token in the remote URL.

## 6. Deploy the code

AURA-X is a full-stack Node/Express application with a MySQL database. **GitHub Pages cannot run its authenticated API/database.** Deploy the `Dockerfile` to a Node/container host with MySQL, configure the server-only environment variables as protected secrets, run `pnpm db:migrate` once against that deployment database, and set the host health check to `/api/health`. Honor the platform's supplied `PORT` value. Never copy a production database URL into GitHub Actions logs or the repository.

To build with GitHub Actions, store secrets in **Settings → Secrets and variables → Actions**. Use the same lockfile and commands (`pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm build`) in CI. Keep production secrets out of CI output.

## 7. What the source does—and does not—include

- A goal can start today, tomorrow, or on a selected calendar date; durations support up to 730 days.
- Attendance shows every goal date and lets the owner select a past/current date and set Present, Missed, or Clear. Unmarked dates stay unmarked; future check-ins are rejected.
- Auri stays in place unless deliberately dragged or moved with keyboard controls. Mouse/scroll does not reposition the mascot; her chat panel is clamped inside the viewport.
- Voice recording starts only after the user's action and microphone permission. Browser/device speech is the normal voice path; server transcription and AI need the authorized Manus project service. No voice clone is shipped.
- Provider results can be partial when a third-party search service is unavailable. AURA-X shows provider/error states and does not invent links or course credentials.

See the root `README.md` for the full feature set, tests, provider details, and limitations.


## 8. Code map — where each part is in VS Code

Open the `auraxai` folder in the Explorer. The main files are:

| Area | File(s) | What is there |
| --- | --- | --- |
| Frontend boot and routes | `client/src/main.tsx`, `client/src/App.tsx` | React startup, tRPC client pointed at `/api/trpc`, app providers, route declarations. |
| Landing, dashboard and goal workspace | `client/src/pages/Home.tsx` | Public sign-in/create-account, dashboard, goals, tasks, attendance, resources, learning and coach UI. |
| New-goal wizard | `client/src/components/GoalCreationPage.tsx` | Spacious full-page steps, start date/duration choices, review, explicit save and retry state. |
| First-goal interview | `client/src/components/FirstGoalIntake.tsx` | Questions and editable first-goal draft. |
| Auri assistant | `client/src/components/AuraMascot.tsx` | Chat, speech bubbles, app-event reactions, goal context and intentional drag/move controls. |
| Auri face and style | `client/src/components/AuriFace.tsx`, `client/src/aura-*.css` | SVG face/expression/gesture states, mobile layout, voice and animation styling. |
| Microphone and playback | `client/src/hooks/useAuriVoice.ts` | Browser dictation/speech, user-started recording fallback, spoken reply controls. |
| Server entry | `server/_core/index.ts` | Express app, `/api/health`, and the `/api/trpc` tRPC mount. |
| API router registry | `server/routers.ts` | Top-level API namespaces: `auth`, `goals`, `learning`, `attendance`, and `auriVoice`. |
| Attendance API | `server/routers/attendance.ts` | Owner-protected date list, validated Present/Missed upsert, and clearing a date. |
| Learning/agent API | `server/routers/learning.ts`, `server/services/auri-agent.ts` | Goal-scoped coach, assessments, resource requests, action validation and reviewable plan proposals. |
| Voice API | `server/routers/auri-voice.ts`, `server/services/auri-transcription.ts`, `server/services/elevenlabs-tts.ts` | Protected status, speech transcription and optional hosted speech. |
| AI planning and search | `server/services/roadmap-ai.ts`, `server/services/resource-search.ts`, `server/services/resource-discovery.ts` | Structured roadmap generation and real provider adapters/ranking. |
| Database | `drizzle/schema.ts`, `drizzle/*.sql` | MySQL tables and ordered additive migrations; latest goal start-date migration is `0005_goal_start_date.sql`. |
| Shared contracts | `shared/aura-schemas.ts`, `shared/goal-dates.ts` | Validated goal/roadmap inputs and date-only scheduling logic shared between frontend/server. |
| Static routes and PWA | `client/public/manus-routes.json`, `client/public/` | Declared page routes, icons and installable-web-app assets. |

## 9. How the APIs and data fit together

The browser sends typed tRPC requests to the same-origin `/api/trpc`; the Express server validates them and invokes owner-checked routers. For example, `attendance.record` can update only a date in the signed-in user's selected goal and duration. The MySQL database stores users, goals, tasks, resources, attendance and progress through Drizzle migrations. The server—not the browser—calls the managed Manus AI service and optional search/TTS providers. Auri's voice upload is user-initiated; the protected transcription route processes the clip transiently and the app does not persist raw audio.

Resource discovery searches the selected goal plus the user's optional focus phrase. Provider adapters currently cover YouTube Search/playlist candidates through Manus API Hub, Open Library, Crossref, Wikipedia, Internet Archive, Library of Congress, OpenAlex, Europe PMC, arXiv, GitHub, Stack Exchange, Hugging Face and optional Brave Search. Availability varies by provider and query; partial outages are shown instead of fabricating URLs. A listed provider is not a promise that every provider returns results for every goal.

## 10. Technologies at a glance

- **UI:** React 19 + TypeScript, Vite, Wouter, TanStack React Query, tRPC client, Radix UI, Tailwind CSS and Recharts.
- **API/server:** Node.js 22, Express, tRPC, Zod and SuperJSON.
- **Storage:** MySQL/MariaDB-compatible database, Drizzle ORM and additive SQL migrations.
- **AI/services:** authorized server-side Manus LLM/speech service; real external resource-provider APIs; optional server-side Brave/ElevenLabs keys.
- **Tests/build:** Vitest, TypeScript `tsc --noEmit`, Vite production bundle and esbuild server bundle.

## 11. Small glossary

- **API:** the typed interface the browser uses to request server actions and saved data.
- **tRPC:** the project's type-safe request layer mounted at `/api/trpc`.
- **MySQL/MariaDB:** the relational database where account-owned app data is stored.
- **`.env`:** a private local file for connection strings and server-only keys; it must never be committed.
- **TTS:** text-to-speech, which reads Auri's reply aloud through a device or optional authorized server voice.
- **PWA:** a website that can be installed from a supported browser.
- **Dockerfile:** the build/run recipe used by compatible server-container hosts.
