# AURA-X GitHub and Production Deployment

## What GitHub does and does not do

GitHub stores the source, migration files, documentation, Dockerfile, and CI workflow. GitHub alone does not run the AURA-X Express backend, MySQL database, AI provider, or user sessions.

A complete independent deployment needs:

```text
GitHub repository
  + Docker-capable hosting
  + MySQL/MariaDB database
  + Server-side AI provider credentials
  + Manus API Hub resources or optional Brave Search key
  + HTTPS domain
```

## Create the repository

Create a private GitHub repository named `aurax` and push the prepared source:

```bash
git clone <your-github-repository-url>
cd aurax
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
```

If this folder is the source copy being uploaded:

```bash
git add .
git commit -m "Prepare AURA-X for independent deployment"
git branch -M main
git remote add origin https://github.com/<owner>/aurax.git
git push -u origin main
```

Never commit `.env` or real credentials.

## Database setup

Create a new MySQL/MariaDB database. Add its connection string to the hosting provider as `DATABASE_URL`.

Run migrations once against the intended database:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
```

Use a backup and migration review policy before production schema changes.

## Server variables

Configure these as protected server environment variables:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
MANUS_PROJECT_ID=...
MANUS_API_URL=https://...
MANUS_API_KEY=...
BRAVE_SEARCH_API_KEY=...
```

`BRAVE_SEARCH_API_KEY` is optional. In the Manus-managed project, Manus supplies the server-side AI/API Hub services; AI calls consume project credits. For an independent deployment, configure a compatible server-side AI endpoint and key; Wikipedia remains the no-key resource fallback.

## Docker deployment

Build and run locally:

```bash
docker build -t aurax:local .
docker run --rm --env-file .env -p 3000:3000 aurax:local
```

For a Docker host, set the application port to `3000` or pass the provider's `PORT`. Use `/api/health` as the health check. The container starts with `node dist/index.js`.

## GitHub Actions

The workflow in `.github/workflows/ci.yml` runs on pushes and pull requests. It installs the pinned pnpm version, installs from the lockfile, runs TypeScript checks, tests, and the production build.

Deployment should be connected separately through the chosen hosting provider's GitHub integration. Do not put deployment tokens in the repository.

## Custom domain

1. Add the custom domain in the hosting provider.
2. Add the provider's DNS record, usually a CNAME.
3. Wait for DNS and HTTPS certificate provisioning.
4. Verify `/` and `/api/health`.
5. Test signup, login, goal generation, progress persistence, learning checks, and logout.

## Independent migration from Manus

To move away from a managed Manus project, provision new equivalents for the database, AI endpoint, hosting, and secrets. Code and migrations are portable; database contents, sessions, API credits, provider keys, account ownership, and managed hosting URLs do not transfer automatically.

## Release checklist

- [ ] `pnpm install --frozen-lockfile` succeeds.
- [ ] `pnpm check` succeeds.
- [ ] `pnpm test` succeeds.
- [ ] `pnpm build` succeeds.
- [ ] Production database backup policy is confirmed.
- [ ] Migrations are applied to the intended database.
- [ ] All server secrets are configured outside Git.
- [ ] `/api/health` returns 200.
- [ ] Signup/login/logout work.
- [ ] Goal creation and AI roadmap generation work.
- [ ] Task completion survives reload and a new session.
- [ ] Learning checks and feedback work.
- [ ] Custom HTTPS domain works.
- [ ] Logs and backups are configured.
