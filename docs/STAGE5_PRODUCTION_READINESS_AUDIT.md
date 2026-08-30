# Stage 5 Production Readiness Audit

> **Audit mode:** read-only forensic audit. No application code was modified.
> **Date:** 2026-08-30 (environment local time Asia/Calcutta).

## Executive Verdict

**LifeXP is NOT production-ready. Classification: RED.**

Two core features are broken by real, reproducible SQL defects (not harness
artifacts): creating a social post and creating a messaging conversation both
fail with PostgreSQL errors that would occur identically on a real production
database. In addition, the audit environment was reset between Stage 4 and
Stage 5, so the Stage 3/4 commits are absent from git history and the working
tree is not clean. These are blockers, not merely "unverified" items.

Everything that *could* be verified without live credentials passes: the full
migration chain applies to an empty database (23 tables), auth/refresh/rate
limiting are correct, the build/typecheck pipeline is green, and no secrets leak
in client-facing error responses.

---

## Environment Availability

| Variable | Status | Classification |
|---|---|---|
| `DATABASE_URL` | MISSING | REQUIRED_FOR_DEPLOYMENT |
| `SESSION_SECRET` | MISSING | REQUIRED_FOR_DEPLOYMENT |
| `GROQ_API_KEY` | MISSING | REQUIRED_FOR_FEATURE (AI) |
| `PORT` | MISSING | REQUIRED_FOR_DEPLOYMENT |
| `BASE_PATH` | MISSING | REQUIRED_FOR_DEPLOYMENT (web) |
| `NODE_ENV` | MISSING | OPTIONAL (defaults to non-production) |
| `CORS_ORIGINS` | MISSING | REQUIRED_FOR_DEPLOYMENT (production) |
| `PUBLIC_OBJECT_SEARCH_PATHS` | MISSING | REQUIRED_FOR_FEATURE (storage) |
| `PRIVATE_OBJECT_DIR` | MISSING | REQUIRED_FOR_FEATURE (storage) |
| `REPL_ID` | MISSING | OPTIONAL (Replit-injected) |
| `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` | MISSING | OPTIONAL (Replit-injected) |

No secret values were read or recorded. Names only.

---

## Baseline Integrity (Part 1) — FAIL

| Check | Expected | Actual |
|---|---|---|
| `git status --short` | clean | **2322 changed paths (2305 D, 12 M, 5 ??) ** |
| `git log -1` | Stage 4 commit | `25cbdf2 Refactor web UI components and pages` |
| `git rev-parse HEAD` | `bc24ce9` | `25cbdf2d7f267ebae83606e86336d7712622d70a` |
| `git ls-files \| wc -l` | ~126 | **2422** |

**Root cause (environment, not code):** the sandbox was re-cloned from GitHub
between Stage 4 and Stage 5. The reflog shows only `clone` + `checkout`. The
Stage 3 commit (`e2b7ffa`) and Stage 4 commit (`bc24ce9`) no longer exist in any
ref. The on-disk working tree still carries all Stage 3/4 changes as
uncommitted deletions/modifications/untracked files (the 2305 deletions are the
removed `attached_assets/`, `artifacts/mobile/`, `artifacts/mockup-sandbox/`,
unused UI primitives, and test files; the 5 untracked files are the Stage 4
schema/migration/docs additions).

This means the minimized 126-file state exists **only as working-tree state**,
not as committed history. It is a deployment/audit blocker, not a code defect.

---

## Database Compatibility (Part 3)

**DATABASE_URL is MISSING → live schema inspection NOT performed (no guessing).**
Classification: **CONFIGURATION BLOCKED** for live-DB comparison.

A full isolated-DB compatibility check was instead performed against an
embedded PostgreSQL 16 (PGlite), which reproduces the real production contract
(see Migration Safety). The committed `0001` migration applies cleanly and the
schema matches `DATABASE_CONTRACT.json`.

## Migration Safety (Part 4)

**No staging database is available → STAGING_DATABASE_UNAVAILABLE.**

Instead (read-only, isolated, NOT production):

- Both migrations applied to an **empty** embedded PostgreSQL 16 in order:
  `0000_tired_excalibur.sql` (30 statements) + `0001_puzzling_the_santerians.sql`
  (32 statements) = **62 statements, 23 public tables, 0 missing**.
- Migration `0001` is **forward-only and non-destructive**: `CREATE TABLE` +
  `ALTER TABLE ADD COLUMN` + `ADD CONSTRAINT` + `CREATE INDEX`. No drops, no
  renames, no data changes. Safe to apply to a real database.
- `seed-archetypes` runs idempotently against the migrated DB (Created 7,
  re-run skips duplicates).

**Migration safety verdict: PASS (isolated), staging test UNVERIFIED.**

Exact safe staging procedure (for a later run):

```bash
# 1. Create an isolated staging DB (NEVER production).
# 2. Snapshot/back up staging data first.
DATABASE_URL=postgresql://.../staging pnpm --filter @workspace/db run migrate
DATABASE_URL=postgresql://.../staging pnpm --filter @workspace/scripts run seed-archetypes
# 3. Verify: 23 tables, 62 statements, then run the smoke suite below.
```

---

## Backend Startup (Part 5)

Started the production build (`dist/index.mjs`) against the isolated DB.

| Check | Result |
|---|---|
| Process starts | PASS (when all env set) |
| Database connectivity | PASS ("Database connectivity verified") |
| Routes register | PASS |
| Health endpoint | PASS — `GET /api/healthz` → `{"status":"ok"}` 200 |
| Port | 4311 (bind 0.0.0.0) |
| Startup time | ~1s |

**Finding (blocker for "graceful degradation"):** the server **crashes at
startup when `GROQ_API_KEY` is unset.** `routes/social.ts:15` instantiates
`new Groq({ apiKey: process.env.GROQ_API_KEY })` at module-load time, and the
Groq SDK throws on an empty key. This contradicts the `.env.example` claim that
AI "degrades gracefully" and makes `GROQ_API_KEY` effectively
`REQUIRED_FOR_DEPLOYMENT` (the whole API server fails to boot without it).
A dummy key was used for the rest of this audit.

## Frontend Startup (Part 5/17)

Production web build (`vite build`) succeeds. Runtime browser smoke test was
**UNVERIFIED** (no browser + no live API/origin in this sandbox). All 12 routes
are registered in `App.tsx` (verified by inspection): `/`, `/auth/login`,
`/auth/register`, `/onboarding`, `/dashboard`, `/quests`, `/profile`,
`/leaderboard`, `/feed`, `/users/:id`, `/messages`, `/messages/:id` + `*`.

## Authentication (Part 6) — PASS

| Test | Result |
|---|---|
| Signup | PASS (201; no password in response) |
| Signin | PASS (200; tokens + user, no password) |
| Authenticated request | PASS (`/api/auth/me` → sub/email only) |
| Refresh flow | PASS (rotation: new access + new refresh token) |
| Invalid token | PASS (401) |
| Wrong password | PASS (401) |
| Invalid refresh token | PASS (401) |
| Logout | PASS (revokes refresh token) |
| Refresh after logout | PASS (401) |
| Unauthenticated protected route | PASS (401) |
| Rate limiting (signin/signup) | PASS (429 after 10/15min) |

## Onboarding (Part 7) — PARTIAL

Single-query endpoints **PASS** against the isolated DB:
step (200), profile (200), goals (200), archetypes (200), archetype (200),
complete (200). Database state verified (profile/goals/character/state written).

`GET /api/onboarding` (aggregate) returns 500 on the isolated harness because it
fires 4 concurrent queries (`Promise.all`). This is a **PGlite single-connection
limitation, not a real bug** — see "Harness limitations" below. **UNVERIFIED**
against real PostgreSQL.

## Progression / XP (Part 8) — UNVERIFIED

`GET /api/progression/attribute-history` PASS (200).
`GET /api/progression/summary` returns 500 on the harness (concurrent
`Promise.all` — harness limitation). XP-award / duplicate-completion semantics
were **not** runtime-tested (no quest templates seeded). **UNVERIFIED** for the
XP transaction flow.

## Quests (Part 9) — PARTIAL

`GET /api/quests` and `GET /api/quests/catalogue` PASS (200). Assign / progress
/ complete / abandon were **not** exercised (empty quest catalogue in the
isolated DB; XP integration depends on seeded templates). **UNVERIFIED.**

## AI (Part 10) — CONFIGURATION BLOCKED

No real `GROQ_API_KEY`. Classified **AI_EXTERNAL_SERVICE_UNVERIFIED**.

Code-level behavior (by inspection): `POST /api/ai/chat` returns a controlled
`503` when the key is unset, and `life-tip`/`chat` wrap Groq calls in try/catch
with a fallback. However, with an **invalid** key the endpoints return 500
(unhandled Groq error) rather than a controlled 503. And with **no** key the
server won't boot at all (see Backend Startup). No AI response is hardcoded or
mocked in source.

## Social (Part 11) — FAIL

| Test | Result |
|---|---|
| Leaderboard | PASS (200, ranked rows) |
| Follow / self-follow rejected | PASS (200 / 400) |
| **Create post** | **FAIL — 500, `malformed array literal`** |
| Get posts / personalized / mine | UNVERIFIED (depends on create) |
| Like/unlike, delete, ownership | UNVERIFIED (no post can be created) |

**Critical bug #1 — `POST /api/social/posts`.** The raw SQL inserts hashtags as
`${JSON.stringify(tags)}::text[]`. `JSON.stringify(["fitness"])` produces
`["fitness"]`, which PostgreSQL rejects (`malformed array literal`; PostgreSQL
arrays use `{}`, not `[]`). Even an empty tag list fails: `[]` is malformed.
**Post creation fails 100% of the time** on any PostgreSQL. Reproduced directly
against a fresh embedded PostgreSQL (no socket harness).

## Messaging (Part 12) — FAIL

| Test | Result |
|---|---|
| **Create conversation** | **FAIL — 500, `uuid` vs `text` type mismatch** |
| Send / read messages | UNVERIFIED (no conversation can be created) |
| Unauthorized conversation access | UNVERIFIED runtime; code-guarded |
| SSE auth (no token) | PASS (401) |
| SSE membership/IDOR | UNVERIFIED runtime |

**Critical bug #2 — `POST /api/messages/conversations`.** The CTE inserts
members via `unnest(ARRAY[$1, $2])`, which yields a `text[]`; the target
`conversation_members.user_id` is `uuid`, so PostgreSQL raises
`column "user_id" is of type uuid but expression is of type text`.
**Conversation creation fails 100% of the time.** Reproduced directly against a
fresh embedded PostgreSQL.

## Object Storage (Part 13) — CONFIGURATION BLOCKED

No storage infrastructure/credentials. Classified
**OBJECT_STORAGE_AUTHORIZATION_UNVERIFIED**.

Observed without credentials: `GET /api/social/objects/*` returns 404 (fails
closed); `POST /api/social/uploads/request-url` returns 500 and leaks the
internal env-var name `PRIVATE_OBJECT_DIR` in its message (minor info leak, not
a secret). Path-traversal / IDOR behavior cannot be established without the
Replit object-storage sidecar.

## Security (Part 14) — PARTIAL

| Area | Result |
|---|---|
| Broken auth | PASS (invalid/wrong tokens rejected) |
| Refresh reuse | PASS (rotation + revocation) |
| Authorization bypass | PASS where tested (unauthenticated → 401) |
| Post ownership / IDOR | UNVERIFIED (create is broken) |
| Conversation IDOR | UNVERIFIED runtime (create is broken); membership check exists in code |
| SSE authorization | PASS (401 without token); membership re-check present in code |
| Object IDOR / traversal | UNVERIFIED |
| SQL injection | PASS (parameterized; `' OR 1=1--` → 401) |
| Malformed JSON | **Minor: returns 500 instead of 400** |
| Oversized payload | NOT APPLICABLE (no test) |
| Rate limiting | PASS (signin/signup 429; refresh limiter present) |

## CORS (Part 15) — PASS (with cosmetic defect)

`NODE_ENV=production` with no `CORS_ORIGINS`: a request with a foreign `Origin`
is **rejected** (blocked). Verified `Origin https://evil.example.com not allowed
by CORS policy`. Same-origin (no `Origin`) is allowed. **Cosmetic defect:** the
rejection surfaces as HTTP 500 (the `cors` middleware error propagates to the
global handler) instead of a clean 403/empty response. Blocking itself is
correct; no development-open CORS is left enabled.

## Error Handling / Logging (Part 16) — PASS (client-facing)

Client-facing 500s return only `{"message":"Internal server error"}` — no stack
traces, no SQL, no `DATABASE_URL`/`SESSION_SECRET`/`GROQ_API_KEY`. The pino
request serializer redacts the query string (`req.url.split("?")[0]`), so an SSE
`?token=` would not be logged. **Minor note:** server-side error logs include
drizzle query text and parameter values (user IDs, emails) — no passwords or
secrets, but some PII in logs.

## Performance Sanity (Part 20) — PASS (basic)

Startup ~1s; health/simple auth requests ~2–5ms; no runaway processes or
connection leaks observed in the short window. Not benchmarked.

## Build Verification (Part 18) — PASS

| Step | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS (lockfile unchanged) |
| `pnpm run typecheck:libs` | PASS (0 errors) |
| `pnpm typecheck` | PASS (0 errors) |
| `pnpm build` | PASS |
| `pnpm --filter @workspace/web build` | PASS (chunk-size warning only) |
| `pnpm --filter @workspace/api-server build` | PASS |

## Automated Tests (Part 19) — AUTOMATED_TEST_SUITE_ABSENT

`pnpm test` → no root `test` script. `pnpm --filter @workspace/api-server test`
→ `vitest run` reports **"No test files found, exiting with code 1"**. This is
**not** a pass. The Stage 3 test removal left `vitest` + `@vitest/coverage-v8`
devDeps and the `test` script behind. Recommend a focused Stage 6/7 regression
suite (auth, onboarding, progression, quests, social, messaging, storage).

---

## Harness limitations (not application bugs)

The isolated database was an **embedded PostgreSQL 16 (PGlite) exposed over TCP**,
which is single-connection. Endpoints that issue **concurrent** queries via
`Promise.all` fail with `read ECONNRESET` / "Connection terminated unexpectedly"
on this harness, but work on a real multi-connection PostgreSQL:

- `GET /api/onboarding`
- `GET /api/social/users/:id`
- `GET /api/progression/summary`
- `GET /api/ai/life-tip`, `POST /api/ai/chat` (via `getUserContext`)

These are **UNVERIFIED** against real PostgreSQL, not failures. (Confirmed by a
direct concurrent-query test against the socket.)

By contrast, bugs #1 and #2 above were reproduced with **single** statements on
a **fresh** embedded PostgreSQL, so they are real and production-applicable.

---

## Remaining Risks

1. **Post creation broken** (malformed hashtags array literal).
2. **Conversation creation broken** (uuid/text type mismatch).
3. **GROQ_API_KEY is required to boot the server** (no graceful degradation).
4. **Stage 3/4 work exists only as uncommitted working-tree state** (env reset;
   commits `e2b7ffa`/`bc24ce9` missing from history).
5. Object-storage authorization unverified (no infrastructure).
6. Live PostgreSQL schema comparison unverified (no `DATABASE_URL`).
7. Concurrent-query endpoints unverified against real PostgreSQL.
8. Minor: malformed JSON → 500; CORS rejection → 500; `PRIVATE_OBJECT_DIR` name
   leaked in one error message.

## Deployment Blockers

1. Social post creation fails (bug #1).
2. Messaging conversation creation fails (bug #2).
3. Missing git history for Stage 3/4 (tree not clean; cannot reproduce the
   minimized baseline from `main`).

## Final Classification

# RED

Rationale: core features (social posting, messaging) fail with real,
reproducible SQL defects; the minimized repository exists only as uncommitted
working-tree state; and the AI layer requires a hard startup dependency that is
not gracefully degraded. These are blockers, not environment-only gaps. The
items that were environment-blocked (live DB, real Groq, object storage) are
reported separately as CONFIGURATION BLOCKED / UNVERIFIED and are **not** the
basis for the RED classification.
