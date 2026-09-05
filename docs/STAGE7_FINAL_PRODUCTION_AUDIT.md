# Stage 7 — Final Production Readiness & Release Candidate Audit

**Branch:** `arena/01a05271-life-xp`
**HEAD:** `d38b3ea` (clean working tree)
**Recorded:** 2026-08-30
**Classification:** 🟡 **YELLOW** — release candidate with documented verification gaps (no blocking, exploitable defects found)

> Optimized for truth, not for GREEN. Items that cannot be verified in this
> sandbox are marked **UNVERIFIED** or **BLOCKED** with the exact production
> test that would close them, never fabricated as PASS.

---

## Executive Summary

Stage 7 is the independent release-candidate audit. Every Stage 6 fix
(BUG-1..5) was re-verified from scratch on a fresh database rather than
assumed correct. The audit **found and fixed one new real defect** that Stage 6
missed — real-time messaging (SSE) was completely broken, returning 401 on
every connection — plus one minor correctness fix (malformed JSON now returns
400 instead of 500).

The remaining open items are all environmental or non-blocking:

- **BLOCKED (configuration):** AI with a real `GROQ_API_KEY`, object storage
  against a live sidecar, and a live production database. None exist in this
  sandbox.
- **UNVERIFIED:** browser end-to-end flows, and the `/api/progression/summary`
  runtime under the single-connection test harness.
- **LOW / INFORMATIONAL:** four non-blocking findings documented in
  `docs/STAGE7_RESULTS.json`.

No critical or high severity exploitable vulnerabilities remain.

---

## The 10 Questions (verbatim answers)

### 1. Is the repo minimized?
**YES.** 136 tracked files, clean working tree, no deleted-then-restored
directories. `attached_assets/`, `artifacts/mockup-sandbox/`, `artifacts/mobile/`,
`use-mobile.tsx`, and 43 unused UI primitives remain absent. Stage 6's commits
are all present in history. No reference to a removed workspace survives in the
lockfile or manifests.

### 2. Is the database reproducible?
**YES.** `pnpm install --frozen-lockfile` → apply migrations → 23 tables
(62 SQL statements). Every table, column, PK, FK, index, check/default,
array column (`text[]`), UUID column (46), and nullability was compared across
Drizzle schema ↔ migrations ↔ raw SQL ↔ live routes. Consistent.

### 3. Does CRUD work end-to-end with real DB state?
**YES** for auth, onboarding/profile, goals, progression, quests, social
(posts/hashtags/likes/follows/delete), messaging, and AI persistence — each
verified with post-mutation database-state checks, not just HTTP status codes.
Two harness-only caveats: `GET /api/progression/summary` (and AI `daily-tasks` /
`life-tip`) use `Promise.all` over concurrent queries, which the single-connection
PGlite test harness cannot execute — production `pg.Pool` handles this correctly.

### 4. Are BUG-1..5 fixed?
**YES — independently re-verified, not assumed.**
| Bug | Description | Status |
|-----|-------------|--------|
| BUG-1 | Post delete: owner 200 / cross-user 404 / nonexistent 404 | ✅ FIXED + VERIFIED |
| BUG-2 | Like/unlike idempotent (never double-counts) | ✅ FIXED + VERIFIED |
| BUG-3 | Server boots without `GROQ_API_KEY` (lazy init) | ✅ FIXED + VERIFIED |
| BUG-4 | Conversation UUID validated (valid→201, invalid→400) | ✅ FIXED + VERIFIED |
| BUG-5 | Hashtags `[]`/`[1]`/`[N]` normalized + persisted correctly | ✅ FIXED + VERIFIED |

### 5. Are authorization boundaries enforced?
**YES.** Every user-scoped operation was tested cross-user: profile-extra
read/write, like on another's post (allowed by design), delete another's post
(404), read/send messages in another's conversation (403), complete/update
another's quest (404), AI goals per-user, delete own account. No IDOR found.

### 6. Are there secrets in the repo or error responses?
**NO.** Full history scan (6 commits) + working-tree scan found only placeholders
and test fixtures. Error responses were fuzzed (wrong password, malformed JSON,
invalid token, SQL-injection attempts, path traversal, AI failure modes) — no
stack trace, SQL, DB URL, or secret leaks. `SESSION_SECRET` is read from env and
fails fast when missing.

### 7. Does it start in production?
**YES, with correct fail-fast vs. degrade semantics:**
- Missing `DATABASE_URL` → clear "DATABASE_URL must be set" (fail fast) ✅
- Missing `SESSION_SECRET` → clear "SESSION_SECRET env var is required" (fail fast) ✅
- Missing `GROQ_API_KEY` → boots, AI returns 503/`[]`/fallback tip ✅
- Missing/invalid object storage → boots, uploads degrade ✅

### 8. Does the frontend build and route correctly?
**YES.** `pnpm build` succeeds (web + api). All 12 routes + catch-all mount and
resolve. Generated API client paths match backend routes; handwritten `fetch`
calls match their endpoints. One LOW cosmetic note: `posts/personalized`
ignores `?type=`, so clips can appear in the posts tab.

### 9. What is UNVERIFIED (and how would you verify it)?
1. **Browser E2E** — no browser runtime here. Production test: run Playwright
   against the deployed app covering onboarding → quest → social → messaging.
2. **`/api/progression/summary` runtime** — harness single-connection limitation.
   Production test: hit the endpoint against `pg.Pool` and assert a 200 JSON.
3. **Live object storage** — no sidecar. Production test: authenticated upload,
   then unauthenticated fetch (expect 403/404) and cross-user fetch (expect 404).
4. **Live production DB schema** — no `DATABASE_URL`. Production test: run the
   `db-audit` against the real cluster.

### 10. GREEN, YELLOW, or RED?
**🟡 YELLOW.** No blocking/exploitable defects; install/typecheck/test/build/
migrations/CRUD/BUGs/auth/secrets/startup all pass. Held to YELLOW (not GREEN)
solely because several items are honestly UNVERIFIED/BLOCKED in this sandbox,
and four LOW/INFORMATIONAL findings remain open.

---

## New Defects Found & Fixed This Stage

### BUG-S7-1 — SSE real-time messaging authentication (HIGH → FIXED)
The messages router applied `requireAuth` to **all** routes, so
`GET /api/messages/conversations/:id/events` returned 401 *before* the
handler's `?token=` fallback could run. The frontend connects via
`EventSource` with `?token=` (EventSource cannot set an Authorization header),
so real-time messaging **never worked** — every connection 401'd. The handler
also used CommonJS `require("../lib/auth")` inside an ESM module.

**Fix:** scope `requireAuth` to skip GET routes ending in `/events` (the handler
authenticates via `?token=` and enforces membership itself), and import
`verifyToken` via ESM.

**Proof:** member `?token=` → 200 `text/event-stream`; non-member → 403; no
token → 401; invalid token → 401; all other routes still require Bearer auth.
Regression test: `src/tests/sse-auth.test.ts` (4 tests).

### BUG-S7-2 — Malformed JSON returned 500 (LOW → FIXED)
The global error handler ignored `err.status` (body-parser sets `status: 400`
for malformed JSON), so malformed bodies returned 500. Now respects 4xx status
codes and returns 400 "Invalid request". Regression test added.

---

## Verification Matrix (summary)

| Area | Result |
|------|--------|
| Git clean / 136 files / no restored dirs | ✅ |
| `pnpm install --frozen-lockfile` | ✅ |
| Typecheck (libs, web, api) | ✅ |
| Tests: no DB 7 pass / with DB 14 pass | ✅ |
| Build (web, api, root) | ✅ |
| DB: 23 tables, schema↔migration↔SQL consistent | ✅ |
| CRUD + DB-state (all domains) | ✅ |
| BUG-1..5 re-verified | ✅ |
| Cross-user access control | ✅ |
| Auth (bcrypt, JWT, rotation, replay, revocation, rate limit) | ✅ |
| Input validation + SQL-injection (all parameterized) | ✅ |
| Secrets (source + history) | ✅ |
| Startup fail-fast / degrade matrix | ✅ |
| Clean checkout reproduction | ✅ |
| SSE (post-fix) | ✅ |
| CORS allow-list enforced | ✅ |

### Remaining LOW / INFORMATIONAL findings
See `docs/STAGE7_RESULTS.json` (`remaining_findings`) for:
- **LOW-1:** `posts/personalized` ignores `?type=` (cosmetic filtering).
- **LOW-2:** unused `cookie-parser`; `google-auth-library` only used transitively.
- **INFO-1:** rate limiter is in-memory (fine for single instance).
- **INFO-2:** disallowed CORS origin surfaces as 500 (no ACAO header emitted, so
  browsers still block — cosmetic, not a bypass).

None are exploitable or production-critical; left per the smallest-change policy.

---

## Commits This Stage

```
ec72468 fix: return 400 for client errors (malformed JSON) instead of 500
7bdbb6a fix: SSE real-time messaging authentication (?token= was unreachable)
```

Each fix follows the policy: reproduce → root cause → minimal fix → regression
test → full suite re-run → commit separately.
