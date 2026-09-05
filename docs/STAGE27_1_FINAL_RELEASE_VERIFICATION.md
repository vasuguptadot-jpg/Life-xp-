# STAGE 27.1 — Final Release Verification

Stage 27 concluded **YELLOW** (production-ready CONDITIONAL) with two
surfaces left **UNVERIFIED** due to environment limits: real-browser UX (no
Chromium) and live Groq AI (no `GROQ_API_KEY`). Stage 27.1 re-provisions the
environment, closes the gaps that *can* be closed here, and re-verifies every
remaining acceptance gate against the authoritative release candidate.

## Authoritative target

- **Commit:** `23a198bf41b28373004ae08d1451dbcbeaab6ed7` (`23a198b`)
- **Branch:** `arena/01a05271-life-xp`
- **Ancestor:** `293cd6f` (Stage 26.1)

The environment was reset a third time. The release candidate was recovered
from the remote (`git fetch` + `git reset --hard 23a198b`) — never
reconstructed — and re-verified from scratch before any testing.

## Part 1 — Environment recovery & baseline (EXECUTED, PASS)

- `corepack enable` + `pnpm install`; rehydrated `@embedded-postgres/linux-x64`
  and verified native `bcrypt` loads (cost-12 compare ≈ 242 ms).
- Recreated embedded **PostgreSQL 18.4** (`/home/user/pgdata`, 127.0.0.1:5434);
  applied all 4 migrations to `lifexp`, `lifexp_load`, `lifexp_src`, `lifexp_dst`;
  seeded 7 archetypes.
- Baseline before any modification: **447/447 tests (44 files)**, typecheck PASS,
  api-server build PASS, web build PASS, secret scan clean, `/api/healthz` 200.

## Part 2 — Real browser acceptance (EXECUTED — the primary Stage 27 gap)

**Chromium 149** was provisioned in this environment by inflating the AL2023
shared-library bundle that ships inside `@sparticuz/chromium`
(`bin/al2023.tar.br` → `/tmp/al2023/lib`, incl. NSS/nspr), then launching
headless-shell Chromium with `LD_LIBRARY_PATH=/tmp/al2023/lib` via
`puppeteer-core@25.9.0`. This is a **real Chromium binary against the real
running app + PostgreSQL** — not a mocked DOM.

Both viewports executed the full matrix (18/19 checks each):

| Check | Mobile 390×844 | Desktop 1440×900 |
|---|---|---|
| Signup → onboarding | ✅ | ✅ |
| Onboarding steps 1–4 (baseline/activity → focus → class → confirm) | ✅ | ✅ |
| Onboarding → dashboard | ✅ | ✅ |
| Dashboard level/XP rendered | ✅ | ✅ |
| Daily-task completion awards XP **once** | ✅ +25 | ✅ +25 |
| **Double-click idempotency** (2 synchronous clicks → single award) | ✅ +20 | ✅ +20 |
| Quest assign → complete awards XP | ✅ +40 | ✅ +40 |
| Quest XP == advertised card value | ✅ | ✅ |
| Quests / Profile (Sign Out) / Logout / Re-login | ✅ | ✅ |
| Refresh dashboard ×5 (no crash/dup/phantom XP) | ✅ | ✅ |
| Leaderboard / Feed navigation | ✅ | ✅ |
| **Error audit** | ⚠️ 1 finding | ⚠️ 1 finding |

The double-click result is corroborated at the API layer: the harness fired two
`POST /api/ai/daily-tasks/:id/complete` requests on the *same* task id, and the
server emitted exactly one `xp.awarded` event (idempotency key
`daily_task_<id>`), leaving `total_xp` at 45 rather than 65.

## Part 3 — Browser error audit (P5)

Captured pageerror / console.error / requestfailed / http≥400 across the full
lifecycle in both viewports:

- **0 uncaught exceptions (pageerror), 0 HTTP 5xx, 0 non-navigation
  requestfailed.**
- `ERR_CONNECTION_CLOSED` events are harness navigation aborts (the browser
  cancelling in-flight fetches on `page.goto`/`reload`), not server errors — the
  API server log shows every request completing with a 2xx/3xx/4xx and zero 5xx.
- **One real finding (B-class, F-27.1-01):** `GET /api/social/objects/*`
  returns **401** when referenced by `<img>`/`<video>` tags. Root cause and
  disposition below.

## Part 4 — Groq AI (P6/P7)

- **Live provider: UNVERIFIED** — `GROQ_API_KEY` is unset; no live call can be
  executed or fabricated.
- **No-key path: VERIFIED** — `POST /api/ai/chat` → `503 {"message":"AI coach is
  not configured. Add GROQ_API_KEY to enable."}` (graceful, no key leak, no
  crash). Deterministic features stay deterministic: `GET /api/ai/daily-tasks`
  → 200 (5 tasks), `GET /api/ai/life-tip` → 200, `GET /api/ai/goals` → 200.

## Part 5 — Production configuration (P8, application scope re-verified)

JWT secret + DB URL fail-fast at startup; `/healthz` liveness 200; `/readyz`
DB-readiness 200/503 (exercised below); rate limiting (auth 10/15min,
mutation 120/10min, refresh 30/15min) verified live; structured JSON logging
with request id + `auth.failed` / `rate_limit.rejected` / `readiness.failed` /
`xp.awarded` events; graceful SIGTERM shutdown (no request-drain handler —
documented LOW). CORS origin list, TLS, and reverse-proxy XFF trust remain
**deployment prerequisites**.

## Part 6 — Security regression (P9)

No bypass, no IDOR, no cross-user access, no SQLi/XSS/error leakage, no secret
leakage. The full adversarial suite passes (447 tests). The Stage 26.1
timing-enumeration dummy-hash remains intact. Rate limiting was confirmed live
(429 after threshold under flood). Malformed-UUID handling intact.

## Part 7 — Performance regression (P10)

8 concurrent cost-12 bcrypt signins interleaved with healthz:

| Metric | Value |
|---|---|
| signin p50 / max | 982 ms / 1058 ms |
| healthz p50 / max | 18 ms / 25 ms |

Native bcrypt runs in the libuv threadpool, so the event loop is not blocked:
healthz stays ≤ 25 ms while 8 bcrypt compares run concurrently (consistent with
the Stage 27 native-bcrypt baseline: C8 signin ≈ 1102 ms, healthz ≤ 28 ms).
**Auth does not starve unrelated users.**

## Part 8 — Data/XP integrity (P11)

- `SUM(xp_transactions.amount) == user_levels.total_xp` for every user: **0 mismatches**.
- Negative XP rows: **0**. Duplicate idempotency keys: **0**. Orphan XP rows: **0**.
- Negative `total_xp`: **0**. `posts.likes_count == COUNT(post_likes)`: **0 mismatches**.

## Part 9 — Failure / recovery (P12)

- Stop PostgreSQL → API stays alive; `/readyz` → `503 {"status":"unavailable","database":"down"}`; `/healthz` → 200.
- Restart PostgreSQL (WAL crash-recovery) → `/readyz` → `200 {"status":"ok","database":"up"}`.
- Data intact (all 67 users survived the crash). No process crash, pool recovers.

## Part 10 — Full regression (P13)

**447/447 tests (44 files)** · typecheck PASS · api-server build PASS · web
build PASS (3.95 s) · secret scan clean. No application code was modified in
this pass (working tree clean).

## Findings

### F-27.1-01 (B) — object-storage media serving gated behind `requireAuth`

- **Description:** `GET /api/social/objects/*` is registered after
  `router.use(requireAuth)` in `social.ts`, so media referenced by `<img>` /
  `<video>` tags (which cannot attach an `Authorization` header) always returns
  401 — even for `visibility: public` objects, which `objectAcl.ts`
  (`canAccessObject` returning `true` with `userId: undefined`) explicitly
  intends to serve unauthenticated. The frontend renders media URLs with no
  token, confirming the auth gating is an oversight, not intent.
- **Evidence:** real-browser run → `GET /api/social/objectsav` → 401
  `missing_bearer_header` (on leaderboard + feed pages, both viewports); API log
  `auth.failed reason=missing_bearer_header`. A Stage-24 test-residue user
  (`s24-…@x.com`, `avatar_url='av'`) surfaced the broken `<img>` request; any
  real uploaded avatar 401s identically.
- **Secondary defect:** path-contract mismatch — `getObjectEntityFile` requires
  `objectPath.startsWith('/objects/')`, but the frontend `mediaUrl()` strips
  that prefix, so the handler would 404 even if auth passed.
- **Root cause:** `router.use(requireAuth)` (social.ts:13) precedes
  `router.use("/objects", …)` (social.ts:311); media tags cannot authenticate.
- **Disposition:** **not fixed in this pass.** The safe fix requires (a) moving
  `/objects` ahead of `requireAuth` *and* (b) enforcing the object ACL in the
  handler (public = anonymous read; private = owner/group only). That is a
  security-sensitive change that cannot be end-to-end verified without the
  object-storage sidecar (F-27-09), and doing it unverified risks weakening
  access control. It is recorded as a release-blocker prerequisite.
- **Regression test (required after fix):** upload an avatar, assert
  `<img src="/api/social/objects/...">` → 200 for public objects and 403/404 for
  private objects without a token; add an integration test for object ACL
  enforcement.

### Carried forward (C-class / UNVERIFIED, unchanged from Stage 27)

F-27-01 XFF `trust proxy=1` (deployment topology) · F-27-04 no `pg_dump`/`psql`
bundled · F-27-05 no SIGTERM drain handler · F-27-06 security headers at proxy ·
F-27-07 quest-template seed out-of-band · F-27-08 backup/PITR infra-owned ·
F-27-09 object-storage sidecar.

## Decision

**STAGE 27.1 FINAL DECISION: YELLOW** — production-ready **CONDITIONAL**.

Real-browser acceptance is now VERIFIED, and every application-level gate
(security, XP integrity, data integrity, performance, failure recovery, full
regression) passes with executed evidence. GREEN is withheld because B ≠ 0
(the newly-surfaced F-27.1-01 media-serving defect) and because live Groq plus
the reverse-proxy topology remain UNVERIFIED in this environment.
