# EchoGPT Backend

Production-ready backend for the [EchoGPT Chrome Extension](https://chromewebstore.google.com/detail/echogpt-multi-ai-chat-sid/negimdcamohmoheiifgecbjgjepkcfhj) — auth, subscriptions, AI provider management, chat, web search, and admin APIs. Built with NestJS, PostgreSQL, Prisma, and documented with Swagger/OpenAPI.

See [CLAUDE.md](./CLAUDE.md) for the full task breakdown, conventions, and working rules used to build this out.

## Tech Stack

- **Framework:** NestJS 11 (TypeScript, CommonJS)
- **Database:** PostgreSQL
- **ORM:** Prisma 7 (driver adapters — connects via `@prisma/adapter-pg` + `pg`, not an implicit env-based connection)
- **API docs:** Swagger / OpenAPI (`@nestjs/swagger`)
- **Validation:** class-validator / class-transformer
- **Config:** `@nestjs/config` with Joi env validation (fails fast on missing/invalid env vars)

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL 14+ (local install, or a hosted instance — connection string goes in `DATABASE_URL`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the env template and fill in real values:
   ```bash
   cp .env.example .env
   ```
3. Point `DATABASE_URL` in `.env` at a running PostgreSQL instance (local install or hosted, e.g. [Neon](https://neon.tech)/[Supabase](https://supabase.com)).
4. Generate the Prisma client, apply migrations, and seed default data (roles, disabled AI provider stubs):
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   npm run prisma:seed
   ```
5. Run the app:
   ```bash
   npm run start:dev
   ```

The API listens on `http://localhost:3000/api` by default (prefix configurable via `API_PREFIX`). Swagger docs are served at `http://localhost:3000/api/docs`.

## Environment Variables

See [.env.example](./.env.example) for the full list. Core variables validated at startup:

| Variable       | Description                                | Default       |
| -------------- | -------------------------------------------- | ------------- |
| `NODE_ENV`     | `development` \| `production` \| `test`      | `development` |
| `PORT`         | HTTP port                                    | `3000`        |
| `API_PREFIX`   | Global route prefix                          | `api`         |
| `CORS_ORIGIN`  | Allowed CORS origin                          | `*`           |
| `DATABASE_URL` | PostgreSQL connection string (required)      | —             |

Later parts add JWT and provider-key-encryption secrets — see `.env.example` for the current full set.

## Scripts

| Command              | Description                        |
| --------------------- | ----------------------------------- |
| `npm run start:dev`   | Start in watch mode                 |
| `npm run build`       | Compile to `dist/`                  |
| `npm run start:prod`  | Run the compiled build              |
| `npm run lint`        | Lint and auto-fix                   |
| `npm run test`        | Unit tests                          |
| `npm run test:e2e`    | End-to-end tests                    |
| `npm run prisma:generate` | Regenerate the Prisma client    |
| `npm run prisma:migrate`  | Create/apply a dev migration    |
| `npm run prisma:deploy`   | Apply migrations (production)   |
| `npm run prisma:seed`     | Seed default roles + AI provider stubs |
| `npm run prisma:studio`   | Open Prisma Studio (DB browser) |

## Project Status

Build is tracked part-by-part in [CLAUDE.md](./CLAUDE.md#task-breakdown). Detailed write-ups of what was implemented and how, part by part, live in [explanation/](./explanation).

## API Documentation

Once running, full interactive API docs (requests, responses, auth requirements) are available at `/api/docs` (Swagger UI).
