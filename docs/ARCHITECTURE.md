# AURA-X Architecture

## Product flow

```text
Browser
  -> React pages and components
  -> tRPC client with React Query cache
  -> Express /api/trpc endpoint
  -> tRPC routers and protected procedures
  -> ownership checks + Zod validation
  -> Drizzle ORM
  -> MySQL/MariaDB database

Goal generation and assessments:
  tRPC router -> server AI service -> server-side LLM endpoint

Resource search:
  tRPC router -> Manus API Hub YouTube Search / Wikipedia fallback -> HTTPS validation -> database
```

## Frontend

The frontend entry point is `client/src/main.tsx`. It creates the React Query client and tRPC client, enables credentials for session cookies, and mounts `client/src/App.tsx`.

The main product surface is `client/src/pages/Home.tsx`. It contains the authenticated workspace, dashboard, goal intake, goal workspace tabs, daily task actions, resource search controls, learning checks, coach UI, attendance, preferences, and account actions. Shared UI primitives live under `client/src/components/ui/`.

The visual system is preserved in `client/src/aura.css`, `client/src/aura-overrides.css`, and `client/src/index.css`. The design uses warm ivory, charcoal, lavender accents, DM Sans/Manrope-style typography, and orbit/star brand motifs.

## Backend

`server/_core/index.ts` creates the Express server, health route, platform configuration route, tRPC middleware, Vite development serving, and production static serving.

`server/routers.ts` owns the main tRPC router groups:

- authentication and account management;
- goal creation and goal listing;
- roadmap generation and persistence;
- task progress, reflections, evidence, and attendance;
- dashboard and activity calculations;
- plan-adjustment suggestions;
- coach history and chat actions.

`server/routers/learning.ts` owns resource search, saved resources, learning checks, and assessment attempts. `server/routers/attendance.ts` owns daily attendance records.

## AI services

- `server/_core/llm.ts` is the server-only OpenAI-compatible HTTP adapter. It normalizes messages, tools, JSON-schema output, model settings, retries, and safe provider failures.
- `server/services/roadmap-ai.ts` creates a structured roadmap and validates the result against `shared/aura-schemas.ts` before persistence. It enforces duration and daily-minute limits.
- `server/services/assessment-ai.ts` creates validated learning checks and explanations.
- AI secrets are read from server environment variables and are never bundled into Vite output.

## Authentication and security

`server/services/auth.ts` handles normalization, scrypt hashing, password verification, opaque session tokens, session persistence, cookie attributes, logout, account deletion, and rate limits.

`server/_core/context.ts` authenticates each request from the session cookie. `server/_core/trpc.ts` exposes public and protected procedures. Protected routers require a user and use ownership filters for user-owned records.

`server/_core/security.ts` applies same-origin POST protection. It supports the managed HTTPS proxy's internal Origin rewrite while rejecting ordinary cross-site form requests.

## Database

The Drizzle schema is in `drizzle/schema.ts`, with relations in `drizzle/relations.ts` and migrations in `drizzle/*.sql`. Durable records include users, sessions, goals, roadmaps, milestones, tasks, task progress, learning resources, assessments, attempts, activity, and plan adjustments.

Use `pnpm db:migrate` to apply checked-in migrations. Do not run migrations against a production database until the target and backup policy are reviewed.

## Deployment boundaries

- Development: `pnpm dev` starts the TypeScript server with Vite.
- Production: `pnpm build` creates Vite assets and bundles the server into `dist/index.js`.
- Container: `Dockerfile` installs dependencies, builds the project, and starts `node dist/index.js`.
- Health: `GET /api/health` returns a JSON success response without authentication.
- Route manifest: `client/public/manus-routes.json` declares page routes for managed hosting.

## Adding a feature safely

1. Add or update a shared Zod schema in `shared/`.
2. Add a protected tRPC procedure with an ownership filter.
3. Add the database field/table and a reviewed migration if persistence changes.
4. Add the client mutation/query and loading, empty, success, and error states.
5. Keep secrets server-side.
6. Add tests for validation, authorization, and persistence.
7. Run `pnpm check && pnpm test && pnpm build`.
