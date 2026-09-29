# EchoGPT Backend

Backend REST API for the [EchoGPT Chrome Extension](https://chromewebstore.google.com/detail/echogpt-multi-ai-chat-sid/negimdcamohmoheiifgecbjgjepkcfhj), a multi-AI chat sidebar. It covers authentication, subscriptions with usage limits, admin-managed AI providers (OpenAI, Claude, Gemini), chat with streaming, AI-assisted web search, and admin APIs.

Built with **NestJS 11**, **PostgreSQL**, **Prisma 7**, and documented with **Swagger/OpenAPI**.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Running the app](#running-the-app)
- [API](#api)
- [Testing](#testing)
- [Architecture](#architecture)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Scripts](#scripts)

---

## Features

| Area | What it does |
|---|---|
| **Auth** | Register and login with JWT access and refresh tokens. Refresh tokens rotate on every use, and a replayed token is rejected. Logout revokes the session. Email verification uses single-use tokens. Register and login are rate-limited to 5 per minute. |
| **Users** | View and update your profile. Changing your password revokes your other sessions. Account deletion is a soft delete that asks for the password. Admins can look up any user. |
| **Subscriptions** | FREE plan (50 requests / 30 days) and PREMIUM plan (2,000). Upgrade and downgrade are available, with simulated billing. A remaining-requests endpoint is provided. Quota is enforced atomically on the server, and failed AI calls are refunded. |
| **AI providers** | Admin CRUD for OpenAI, Claude and Gemini. API keys are encrypted at rest with **AES-256-GCM** and never returned. Admins choose a global default and can run a health check per provider. |
| **Chat** | Send a prompt and get the reply. Each request can pick a provider. Conversation history is saved, and **SSE streaming** is available. Every provider call is written to a usage log. |
| **Web search** | AI-assisted search: Wikipedia supplies the sources and the AI writes an answer that cites them. Also includes history, recent searches, suggestions, and a 1-hour result cache. |
| **Admin** | Dashboard stats, user management (search, suspend, change role), subscription overrides, usage analytics, request logs, and system health. |

## Tech stack

- **Framework:** NestJS 11 (TypeScript, CommonJS)
- **Database / ORM:** PostgreSQL 14+ with Prisma 7, using the `@prisma/adapter-pg` driver adapter
- **Auth:** Passport JWT, bcrypt, and `@nestjs/throttler` for rate limiting
- **Validation:** class-validator and class-transformer on every request DTO
- **Config:** `@nestjs/config` with Joi validation. The app will not start if a variable is missing or invalid, and the error names the variable.
- **Docs:** `@nestjs/swagger`
- **Tests:** Jest and Supertest

## Quick start

**Prerequisites:** Node.js **20.19+** (22 LTS recommended), npm, and a PostgreSQL 14+ database, either local or hosted (e.g. [Neon](https://neon.tech) or [Supabase](https://supabase.com)).

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
#    then set DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
#    PROVIDER_KEY_ENCRYPTION_SECRET (generation commands are in .env.example)

# 3. Database: generate client, apply migrations, seed roles + provider stubs
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# 4. Run
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger UI: `http://localhost:3000/api/docs` (raw spec at `/api/docs-json`)
- Liveness check: `GET http://localhost:3000/api/health`

### First admin and first AI provider

No admin account is seeded, so an admin can't be created through the API. Register normally, then promote that account in the database:

```sql
UPDATE users
SET role_id = (SELECT id FROM roles WHERE name = 'ADMIN')
WHERE email = 'you@example.com';
```

Roles are re-checked on every request, so the promotion applies straight away, even to your current token. Then, as an admin:

1. `GET /api/providers` returns the three seeded stubs. They are disabled and have no key.
2. `PATCH /api/providers/{id}` with `{"apiKey": "sk-..."}` sets the key, which is stored encrypted.
3. `POST /api/providers/{id}/enable`, then `POST /api/providers/{id}/default`.
4. Optionally, `POST /api/providers/{id}/health-check` checks that the key works.

Once a provider is enabled, users can chat with it (`POST /api/chats/messages`) and search with it (`POST /api/search`).

## Environment variables

All variables are validated at startup (`src/config/env.validation.ts`). [.env.example](./.env.example) is the annotated template.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | | `development` | `development` \| `production` \| `test` |
| `PORT` | | `3000` | HTTP port |
| `API_PREFIX` | | `api` | Global route prefix. Swagger is served at `/<prefix>/docs`. |
| `CORS_ORIGIN` | | `*` | Set this to the extension's origin in production (`chrome-extension://<id>`) |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string. For hosted databases, use `sslmode=verify-full`. |
| `JWT_ACCESS_SECRET` | ✅ | — | At least 32 characters |
| `JWT_REFRESH_SECRET` | ✅ | — | At least 32 characters, and different from the access secret |
| `JWT_ACCESS_EXPIRES_IN` | | `15m` | In `ms` format |
| `JWT_REFRESH_EXPIRES_IN` | | `7d` | In `ms` format |
| `PROVIDER_KEY_ENCRYPTION_SECRET` | ✅ | — | Exactly 64 hex characters (a 32-byte AES-256 key). If you rotate it, provider keys must be re-entered. |

## Database

The schema lives in [prisma/schema.prisma](./prisma/schema.prisma). Tables and columns are snake_case. The ERD and design notes are in [explanation/part-2-database.md](./explanation/part-2-database.md).

| Command | When |
|---|---|
| `npm run prisma:migrate` | **Development.** Applies pending migrations. After a schema edit, it creates a new migration. |
| `npm run prisma:deploy` | **Production / CI.** Applies committed migrations only. It never generates migrations and never resets data. |
| `npm run prisma:seed` | Upserts the `USER`/`ADMIN` roles and three disabled provider stubs. Safe to run more than once. |
| `npm run prisma:generate` | Regenerates the Prisma client after a schema change. `migrate` also runs it. |
| `npm run prisma:studio` | Opens a database browser. |
| `npx prisma migrate status` | Shows whether the database is behind the migrations folder. |
| `npx prisma migrate reset` | ⚠️ **Drops all data**, then re-applies migrations and the seed. Use it only on a disposable database. |

## Running the app

```bash
# Development (watch mode)
npm run start:dev

# Production
npm ci
npm run prisma:generate
npm run prisma:deploy     # apply migrations
npm run build             # compiles to dist/
npm run start:prod        # node dist/main
```

For production, set `NODE_ENV=production`, use strong unique secrets, and restrict `CORS_ORIGIN`. Point your load balancer or uptime monitor at `GET /api/health`. It returns 200 when the API and database are up and 503 otherwise.

## API

Swagger UI at **`/api/docs`** is the full reference. It has request and response examples and documents every error status. To try protected routes there, click **Authorize** and paste the `accessToken` from register or login.

A static copy of the spec is committed at [`docs/openapi.json`](./docs/openapi.json). To browse it without running the server, paste it into [editor.swagger.io](https://editor.swagger.io) or import it into Postman. To regenerate it, run the server and save `http://localhost:3000/api/docs-json`.

### Response format

Every JSON response has the same envelope:

```jsonc
// success
{ "success": true, "statusCode": 200, "message": "Request successful",
  "path": "/api/subscriptions/usage", "timestamp": "2026-09-29T10:15:30.000Z",
  "data": { "requestLimit": 50, "requestsUsed": 12, "remainingRequests": 38, "periodEnd": "..." } }

// error
{ "success": false, "statusCode": 400, "message": "Validation failed",
  "errors": ["email must be an email"], "path": "/api/auth/register",
  "timestamp": "2026-09-29T10:15:30.000Z" }
```

`errors` lists each failed rule when validation fails, and is `null` for all other errors. Unknown body fields are rejected with a 400. `204` responses have no body. The streaming endpoint sends `text/event-stream`, with the events `delta`, then `done` or `error`.

### Endpoints

Every route requires a Bearer access token unless it's marked **public**. Routes marked **admin** require the `ADMIN` role.

| Area | Routes |
|---|---|
| Health | `GET /health` (public) |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/verify-email` (all public) · `POST /auth/logout` · `GET /auth/me` |
| Users | `GET` / `PATCH /users/profile` · `PATCH /users/change-password` · `DELETE /users/account` · `GET /users/{id}` (admin) |
| Subscriptions | `GET /subscriptions/plans` (public) · `GET /subscriptions/me` · `GET /subscriptions/usage` · `POST /subscriptions/upgrade`, `/downgrade` |
| Providers | `GET /providers/available` · admin: `GET` / `POST /providers` · `GET` / `PATCH` / `DELETE /providers/{id}` · `POST /providers/{id}/enable`, `/disable`, `/default`, `/health-check` |
| Chat | `POST /chats/messages` · `POST /chats/messages/stream` (SSE) · `GET /chats` · `GET` / `DELETE /chats/{id}` |
| Search | `POST /search` · `GET` / `DELETE /search/history` · `GET` / `DELETE /search/history/{id}` · `GET /search/recent` · `GET /search/suggestions` |
| Admin | `GET /admin/dashboard` · `GET /admin/users` · `GET /admin/users/{id}` · `PATCH /admin/users/{id}/status`, `/role` · `GET /admin/subscriptions` · `PATCH /admin/subscriptions/{userId}` · `GET /admin/analytics/usage` · `GET /admin/logs` · `GET /admin/health` |

`POST /chats/messages`, `POST /chats/messages/stream` and `POST /search` each use **one request from the plan quota**. When the quota is used up they return `429`. If the subscription isn't active they return `403`.

### Status codes

| Code | Meaning |
|---|---|
| 400 | Validation failed, or the request is invalid in this state |
| 401 | The access token is missing, invalid or expired, the credentials are wrong, or the account is suspended |
| 403 | The route needs the `ADMIN` role, or the subscription isn't active |
| 404 | The resource doesn't exist, or belongs to another user. Other users' resources return 404 rather than 403, so their existence isn't revealed. |
| 409 | Conflict: the email is already registered, you're already on that plan, or the provider is the default |
| 429 | Rate limit hit (100/min in general, 5/min for register and login), or the plan quota is used up |
| 502 / 503 / 504 | The AI provider failed / no default provider is configured / the provider timed out |

## Testing

```bash
npm test            # unit tests (services, interceptors, adapters): fast, no DB
npm run test:cov    # unit tests with coverage report in coverage/
npm run test:e2e    # end-to-end tests: need a reachable DATABASE_URL
```

**Unit tests** (`src/**/*.spec.ts`) mock Prisma and cover the business logic of every service: auth and token rotation, users, subscriptions and quota math, providers and encryption, chat, search, and admin. They also cover the quota interceptor, the provider HTTP adapter (retries, timeouts, error mapping), and the Swagger envelope post-processor.

**E2E tests** (`test/*.e2e-spec.ts`) start the real `AppModule` with the real guards, pipes, filters and interceptors against the database in `DATABASE_URL`. The only fakes are the external HTTP boundaries: the AI vendors (`ProviderAdapterRegistry`) and the Wikipedia search source. So no network access or API keys are needed.

| Suite | Covers |
|---|---|
| `auth` | Register (201, 409, validation envelope), login, refresh rotation and replay rejection, logout revocation, suspended accounts, email verification, 401 and 403 behaviour, promotion to admin, login rate limit (429) |
| `chat` | Send and continue a conversation (history is sent as context), list, get, delete, ownership (404 for other users), validation, unknown provider, provider failure (502, request refunded, failure logged), SSE streaming |
| `subscription-limits` | FREE allowance, the last request succeeds and the next one gets 429, **no over-granting when 6 requests race for 3 remaining slots**, upgrade lifts the limit, 403 when the subscription isn't active |
| `modules-smoke` | Happy paths for users (profile, password change, admin lookup, account deletion), providers (admin lifecycle, key never exposed, health check), search (answer with sources, cache hit, history, recent, suggestions, privacy) and admin (user search, suspension cuts off the user's token, analytics, logs, health) |
| `swagger` | Doc-quality rules for every route: summary, success and error responses, envelopes, bearer auth plus 401, the exact set of public routes, and examples for every body field and query parameter |

The e2e suites create users whose emails match `e2e-*@example.test` and a temporary provider named `E2E Fake Provider *`. They delete these afterwards and never modify other rows. They run serially because they share the database. You can run them against a development database, but a dedicated disposable one is better.

## Architecture

```
src/
├── main.ts                  bootstrap: configureApp() + Swagger + listen
├── app.setup.ts             global prefix, CORS, ValidationPipe, filter, interceptor (shared with e2e)
├── app.module.ts            modules + global guards: Throttler → JwtAuth → Roles
├── config/                  typed config + Joi env validation
├── prisma/                  PrismaService (driver adapter)
├── common/
│   ├── constants/           plan limits, throttle limits, timeouts, crypto params (no magic numbers)
│   ├── decorators/          @Public, @Roles, @CurrentUser, @IsStrictBoolean
│   ├── filters/             AllExceptionsFilter: the only place that formats errors
│   ├── interceptors/        TransformInterceptor: the only place that formats success bodies
│   ├── guards/              JwtAuthGuard (global, fail-secure), RolesGuard, JwtRefreshGuard
│   ├── services/            EncryptionService (AES-256-GCM), EmailService (stub)
│   ├── swagger/             document builder + envelope post-processor
│   └── sse/                 SSE writer
└── modules/
    ├── auth/  users/  subscriptions/  providers/  chat/  search/  admin/  usage-logs/
```

Each domain module has a thin controller, a service that holds the logic, and DTOs for every request and response. The Prisma models themselves are never returned.

**How a request is processed:** `ThrottlerGuard` → `JwtAuthGuard` (skipped for `@Public()`) → `RolesGuard` (`@Roles()`) → `ValidationPipe` → `UsageQuotaInterceptor` (only on `@ConsumesQuota()` routes) → controller → service → `TransformInterceptor`. If anything throws, `AllExceptionsFilter` formats the error.

**Design decisions:**

- **Provider-agnostic AI layer.** Chat and search both go through one `AiCompletionService`. It resolves the provider, decrypts the key, and calls the matching `AiProviderAdapter` (OpenAI, Claude or Gemini). It also logs every attempt, successful or not. Timeouts, retries, SSE parsing and error mapping are implemented once, in `HttpProviderAdapter`.
- **Atomic quota.** The quota is reserved with a single conditional `UPDATE ... WHERE requests_used < request_limit`, and refunded if the call fails. That prevents over-granting under concurrency, and an e2e test checks it.
- **Revocable sessions.** Each refresh token maps to a `Session` row, which stores only a SHA-256 hash of the token. The JWT strategy re-reads the user on every request, so suspensions and role changes apply immediately.
- **Swagger matches the wire.** A post-processor (`src/common/swagger/response-envelope.ts`) wraps every documented body in the real envelope. It also adds the 401 and 429 responses that can happen on every route. An e2e test fails the build if a route is missing its docs.

A write-up for each part, with the decisions made and how each was verified, is in [explanation/](./explanation).

## Security

- **Passwords:** hashed with bcrypt, limited to 72 bytes (bcrypt's input limit), and never returned or logged.
- **Tokens:** access tokens are short-lived. Refresh tokens rotate on every use, only their hashes are stored, and they are revoked on logout, password change, account deletion and suspension.
- **Access control:** authentication is global and fail-secure; a route is public only if it's explicitly marked `@Public()`. Admin routes are gated by `@Roles(ADMIN)`, and ownership is enforced by always scoping queries to the caller's own id.
- **Provider API keys:** encrypted with AES-256-GCM, which is authenticated, so a tampered ciphertext fails to decrypt. Responses only include `hasApiKey`, never the key.
- **Rate limits:** 100 requests/min per client globally and 5/min on register and login, plus the per-plan request quotas.
- **Input:** a whitelisting `ValidationPipe` rejects unknown fields. Booleans are validated strictly, so `"false"` is not accepted as `true`.
- **Errors:** unexpected errors return a generic `Internal server error`, and the stack trace goes to the server log only.

## Known limitations

- **Billing is simulated.** Upgrading takes effect immediately, with no payment provider involved. Dashboard revenue is an estimate calculated from list prices.
- **Email is a stub.** `EmailService` logs the verification token instead of sending an email. To send real mail, replace its body with an SMTP or API call.
- **Web search uses Wikipedia** because it needs no key. The source client is its own class, so it can be swapped for Bing, Brave or SerpAPI.
- **Rate-limit counters are kept in memory,** per instance. If you run more than one instance, use a shared store such as Redis.
- **There is no audit-log table.** Admin actions and security events go to the application log.

## Scripts

| Command | Description |
|---|---|
| `npm run start:dev` | Start in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build (`dist/main.js`) |
| `npm run lint` | Lint and auto-fix |
| `npm run format` | Run Prettier on `src/` and `test/` |
| `npm test` | Unit tests |
| `npm run test:cov` | Unit tests with coverage |
| `npm run test:e2e` | End-to-end tests (needs a database) |
| `npm run prisma:generate` | Regenerate the Prisma client |
| `npm run prisma:migrate` | Create or apply development migrations |
| `npm run prisma:deploy` | Apply migrations in production |
| `npm run prisma:seed` | Seed roles and provider stubs |
| `npm run prisma:studio` | Open Prisma Studio |
