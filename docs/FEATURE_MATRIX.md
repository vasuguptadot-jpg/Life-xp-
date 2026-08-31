# LifeXP Feature Matrix

> Generated as part of Stage 6 remediation. Status reflects verification on an
> isolated PostgreSQL 16 (PGlite) database with **no GROQ_API_KEY** set, unless
> a row says otherwise. See `STAGE6_REMEDIATION_REPORT.md` for the full audit.

Legend: **VERIFIED** = exercised end-to-end against the running API; **PARTIAL**
= core path works but a sub-feature is gated on external config; **BLOCKED** =
requires external credentials/services not available in this environment;
**UNVERIFIED** = could not be exercised (see note).

## Backend API (67 endpoints, 10 route modules)

| Area | Route module | Endpoints | Stage 6 status | Notes |
|---|---|---|---|---|
| Health | `health` | `GET /api/healthz` | VERIFIED | 200 `{"status":"ok"}`. (`/api/health` is intentionally absent.) |
| Auth | `auth` | 5 (signup, signin, refresh, logout, me) | VERIFIED | JWT + refresh-token rotation + revocation verified; wrong-password 401; invalid token 401; refresh-after-logout 401; rate limit 429 >10/15min. |
| Users | `users` | 6 | PARTIAL | Public + authed profile paths present; not exhaustively smoke-tested in Stage 6. |
| Onboarding | `onboarding` | 7 | PARTIAL | Wizard/state endpoints present; not exhaustively smoke-tested in Stage 6. |
| Progression | `progression` | 3 (`/summary`, `/attribute-history`, `/daily-plan`) | PARTIAL | Routes correct; not exhaustively smoke-tested in Stage 6. `/daily-plan` added in Stage 16 (deterministic Life Engine). |
| Quests | `quests` | 8 | PARTIAL | Quest list/accept/complete present; not exhaustively smoke-tested in Stage 6. |
| AI coach | `ai` | 7 (goals, daily-tasks, tasks/:id/complete, life-tip, chat/history, chat) | VERIFIED (graceful) | **Stage 16:** daily-tasks & life-tip are now fully deterministic (no Groq) — they return real results without a key. Only `chat` open-ended remains AI-dependent: deterministic data intents answer without a key, open-ended → 503 without key / real Groq with key (BLOCKED — no key in env). |
| Life Engine | `life-engine` | 12 (streak, momentum, weaknesses, recovery, difficulty, recommendations, quests/rotation, goals, daily-plan, weekly-review, forecast, behavior) | VERIFIED | **Stage 16:** fully deterministic, offline-capable, no Groq. Every endpoint returns real data derived from existing tables without a key. |
| Social | `social` | 13 (posts CRUD, like/unlike, follow/unfollow, feed, leaderboard, uploads) | VERIFIED | Post create (all hashtag shapes), like/unlike (idempotent), follow/unfollow, feed, leaderboard, ownership delete all verified. Object-storage upload/URL routes BLOCKED (no sidecar). |
| Messaging | `messages` | 5 (conversations CRUD, messages send/list, SSE events) | VERIFIED | Conversation create (valid UUID), invalid-UUID 400, list, send, member-read, unauthenticated 401. SSE auth 401 without token. |

## Web (12 routes + `*`)

| Route | Purpose | Status |
|---|---|---|
| `/` (layout) | App shell | VERIFIED (build) |
| `/auth/login`, `/auth/register` | Auth pages | VERIFIED (build) |
| `/onboarding` | Onboarding wizard | VERIFIED (build) |
| `/dashboard` | Main dashboard | VERIFIED (build) |
| `/quests` | Quest list | VERIFIED (build) |
| `/profile` | Own profile | VERIFIED (build) |
| `/user-profile/:id` | Other user profile | VERIFIED (build) |
| `/leaderboard` | Leaderboard | VERIFIED (build) |
| `/feed` | Social feed | VERIFIED (build) |
| `/messages` | Conversation list | VERIFIED (build) |
| `/conversation/:id` | Single conversation | VERIFIED (build) |
| `*` | Not found | VERIFIED (build) |

Web verification is build-level (`vite build` succeeds, no dangling imports); no
browser E2E is available in this environment.

## Data layer

| Item | Status | Notes |
|---|---|---|
| Migration chain (0000 + 0001) on fresh PG | VERIFIED | 62 statements apply cleanly → 23 public tables. |
| Public tables | VERIFIED | 23 (matches `DATABASE_CONTRACT.json`). |
| Generated API clients (`@workspace/api-client-react`) | VERIFIED | Typecheck/build pass. |
| OpenAPI spec (`@workspace/api-spec`) | VERIFIED | Present; generated from zod schemas. |

## Feature-specific dependencies

| Feature | Required config | Without config |
|---|---|---|
| AI coach (open-ended chat) | `GROQ_API_KEY` | Server boots; open-ended chat 503, data-intent chat answered deterministically. |
| Daily tasks / life tips / Life Engine | none | Fully deterministic — no external dependency; works fully offline. |
| Object storage uploads | Replit sidecar (`@replic/connectors-sdk`) | Upload URL request fails safe; object serve 404. |
| Production CORS allow-list | `CORS_ORIGINS` | Dev allows all origins (default when `NODE_ENV != production`). |

## Cross-cutting

| Concern | Status |
|---|---|
| Password hashing (bcrypt) | VERIFIED |
| JWT signing/verification | VERIFIED |
| Refresh-token rotation + revocation | VERIFIED |
| Rate limiting | VERIFIED |
| Resource ownership checks (posts, conversations) | VERIFIED |
| SQL parameterization (no string interpolation) | VERIFIED |
| Malformed input handling (invalid UUID, bad body) | VERIFIED |
| No secret leakage in error responses | VERIFIED |
| CORS | PARTIAL — dev allow-all; production allow-list rejects disallowed origins (returns 500 via generic error handler — cosmetic, browser still blocks; see report) |
| SSE auth | VERIFIED — 401 without valid token |
