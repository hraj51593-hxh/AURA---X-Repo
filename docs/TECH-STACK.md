# AURA-X Technology Stack

## Runtime and language

- Node.js 22+
- TypeScript 5.9
- pnpm 10.18.0
- ES modules
- Docker with `node:22-bookworm-slim`

## Frontend stack

- React 19 and React DOM
- Vite 7
- Wouter for client routing
- TanStack React Query 5 for server state and cache invalidation
- tRPC React 11 for type-safe API calls
- Radix UI primitives for accessible interaction components
- Tailwind CSS 4 and `tailwind-merge`
- Lucide React icons
- Recharts for data visualizations
- React Hook Form and Zod resolvers where form helpers are used
- date-fns for date calculations
- Framer Motion for interaction animation

## Backend stack

- Express 4 HTTP server
- tRPC 11 server adapter
- SuperJSON transformer
- Zod 4 request and output validation
- Node crypto `scrypt` for password hashing
- Cookie and HTTP-only session handling
- Native `fetch` with bounded retry/backoff for upstream AI calls

## Data stack

- MySQL/MariaDB-compatible database
- Drizzle ORM
- Drizzle Kit migration generation and execution
- Relational ownership model for multi-user records

## AI and external services

- OpenAI-compatible Manus server-side LLM endpoint
- Structured JSON-schema roadmap and assessment output
- Manus API Hub YouTube Search with a Wikipedia fallback for real HTTPS learning links; optional Brave Search for independent deployments
- Optional platform services already represented by the starter for storage, maps, speech, and notifications; activate only when a feature requires them and their credentials are configured

## Build and delivery

- Vite builds the client bundle.
- esbuild bundles the server into `dist/index.js`.
- Docker installs with the pinned pnpm lockfile, builds, and starts the production server.
- `/api/health` is the unauthenticated container health check.
- GitHub Actions runs install, type check, tests, and production build.

## Why this stack fits AURA-X

React and Vite provide a fast responsive workspace. tRPC keeps the client and server contracts aligned. Drizzle and MySQL provide durable multi-user progress. Zod prevents invalid AI and user input from being persisted. Express and Docker make the application portable to managed container services or a VPS. Server-only environment variables keep database and AI credentials away from the browser.
