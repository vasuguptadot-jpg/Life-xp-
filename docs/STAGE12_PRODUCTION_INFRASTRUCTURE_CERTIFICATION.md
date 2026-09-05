# Stage 12 — Production Infrastructure Certification

**Exact HEAD:** `c472b3750a59abe535f91a6bc0ad158c4bedaa7a` · **Branch:** `arena/01a05271-life-xp` · **Date:** 2026-08-31

## Purpose

Stage 12 closes the remaining infrastructure blockers using **real infrastructure
where it is genuinely provisionable**. The central change from Stage 11 is that the
**database blocker is now CLOSED** — real PostgreSQL (real binaries, real `pg`
driver, real schema/migrations/seed) is provisioned and validated in-sandbox. The
three remaining blockers (AI, object storage, browser E2E) are each shown to be
**genuinely unprovisionable** with the exact missing infrastructure, the exact
reason, and the exact command/test required to close them.

No application code was changed. This stage is documentation-only plus disposable
test records against real PostgreSQL.

---

## 1. Database — PASS (blocker CLOSED)

### What was provisioned

| Property | Value |
|---|---|
| Engine | PostgreSQL **18.4** (real binaries) |
| Distribution | `embedded-postgres@18.4.0-beta.17`, real binaries downloaded over HTTPS from Maven Central |
| Binary | `/tmp/realpg/node_modules/@embedded-postgres/linux-x64/native/bin/postgres` |
| Driver | `pg@8.22.0` (real PostgreSQL wire protocol — not PGlite) |
| Endpoint | `127.0.0.1:5434`, database `lifexp` |
| Data dir | `/tmp/realpg/data` (persistent, `PG_VERSION` + `postmaster.pid`) |

`apt` is unusable (HTTP:80 egress-blocked), so the only viable real-Postgres path
was `embedded-postgres` over HTTPS from Maven Central — which is reachable.

### Verification performed against real PostgreSQL

1. **Connection** — real `pg` driver connect: `CONNECTED: PostgreSQL 18.4`
   (databases `postgres`, `lifexp`).
2. **Migrations** — `pnpm --filter @workspace/db run migrate` with
   `DATABASE_URL` pointed at real PG applied the Drizzle journal entries
   `0000_tired_excalibur (884a7d1d)` and `0001_puzzling_the_santerians (ddc540f7)`.
   A re-run is idempotent (2 journal rows, no duplicate apply).
3. **Schema contract** — exact match against `docs/DATABASE_CONTRACT.json`:
   23/23 tables, 154/154 columns, 20 primary keys, 25 foreign keys,
   16 unique constraints, 46 indexes. **Zero missing tables, zero missing
   columns, zero extra columns.**
4. **Real type verification** — `posts.hashtags` is a genuine `text[]`
   (`ARRAY/_text`) column with round-trip `['a','b']`; `gen_random_uuid()` is
   built-in. No PGlite-specific assumption leaked into the schema.
5. **Seed** — `pnpm --filter @workspace/scripts run seed-archetypes`: 7 archetypes
   created, re-run 0 created / 7 skipped (idempotent).
6. **Automated test suite** — `40/40 PASS` (7 test files, 7.19s) with
   `TEST_DATABASE_URL` pointed at real PostgreSQL.
7. **Full backend E2E against real PG** (disposable users, cleaned up):
   signup 201 / duplicate-email 409 / weak-password 400 / signin 200 / me 200 /
   wrong-password 401 / invalid-JWT 401 / onboarding profile 200 / onboarding
   goals 200 / progression summary 200 / quest catalogue 200 / post create 201 /
   post list 200 / like 200 / unlike 200 / follow 200 / leaderboard 200 /
   conversation create 201 / message send 201 / message list 200 / conversation
   list 200 / logout 200 / refresh-after-logout 401.
8. **Authorization boundaries (IDOR) against real PG** — Bob deleting Alice's
   post 404; Carol reading Alice–Bob conversation 403; Carol sending into it 403;
   cross-user quest progress 404; cross-user quest complete 404.
9. **Quest flow against real PG** — catalogue → assign 201 → concurrent progress
   (6×) → deterministic final progress `3.00` / `IN_PROGRESS` → complete 200 →
   `COMPLETED`.
10. **Security against real PG** — malformed UUID 400, malformed JSON 400,
    unexpected JSON types 400, NUL byte sanitized (no 500), SQL-injection
    429 (parameterized), oversized 200 kB payload 413, non-string hashtags 201,
    non-string goals 400, non-numeric age 400.
11. **Concurrency against real PG** — triple like `likes_count=3` exact, triple
    unlike `0` exact, atomic refresh rotation (200/401), concurrent message send
    6×201 with count 6, no connection-pool failures, no race-induced 500s.
12. **SSE against real PG** — member 200 / non-member 403 / garbage-token 401;
    concurrent message fan-out correct.

**Result: database = PASS (real PostgreSQL).**

---

## 2. AI — BLOCKED (genuinely unprovisionable)

- **Missing infrastructure:** a real `GROQ_API_KEY`.
- **Reason:** no live GROQ credential can be supplied in this sandbox, and
  fabricating one would produce a false PASS (prohibited).
- **Degradation verified against real PG:** chat → 503 (graceful no-key),
  daily-tasks → 200 (empty), life-tip → 200 (fallback); server stable; no
  credential leaked. Live generation remains UNVERIFIED.
- **Exact closing command:** set `GROQ_API_KEY=<real key>`, restart the API, then
  `POST /api/ai/chat` with a real prompt asserting 200 + persisted response,
  malformed-input handling, provider failure/timeout handling, and key
  non-leakage.

---

## 3. Object storage — BLOCKED (genuinely unprovisionable)

- **Missing infrastructure:** the Replit object-storage sidecar at
  `127.0.0.1:1106` (external-account `credential`/`token` endpoints) backed by
  Google Cloud Storage.
- **Reason:** `artifacts/api-server/src/lib/objectStorage.ts` constructs
  `@google-cloud/storage` with `credential_source.url=http://127.0.0.1:1106/credential`
  and `token_url=http://127.0.0.1:1106/token`. That sidecar does not exist in this
  sandbox and cannot be provisioned. Static ACL/traversal review and fail-safe
  503 behavior were **not** converted into a live-storage PASS.
- **Exact closing command:** start the Replit object-storage sidecar on
  `127.0.0.1:1106` with a GCS project, then exercise upload / retrieval /
  ACL-policy / traversal-isolation / cleanup / credential non-leakage against the
  real sidecar.

---

## 4. Browser E2E — BLOCKED (genuinely unprovisionable)

- **Attempts made (all real):**
  - `npx playwright install chromium` ×4 → ECONNRESET from `cdn.playwright.dev`.
  - `npx puppeteer browsers install chrome` → DefaultProvider ECONNRESET
    (`storage.googleapis.com`).
  - Direct `curl` to `storage.googleapis.com` → `SSL_ERROR_SYSCALL`.
  - **`@sparticuz/chromium@149.0.0` via npm → SUCCEEDED**: a real 199 MB Chromium
    149 binary is present at `/tmp/chromium`.
- **Exact missing infrastructure:** the Chromium binary launches but aborts with
  `error while loading shared libraries: libnspr4.so, libnss3.so, libnssutil3.so`.
  These Debian `libnss3`/`libnspr4` shared libraries cannot be installed because
  apt uses HTTP:80 (blocked) and all Debian/Ubuntu mirror HTTPS egress is blocked;
  no npm package ships the `.so` files. Static frontend serving was **not** treated
  as a browser E2E PASS.
- **Exact closing command:** in an environment with apt egress,
  `apt-get install -y libnss3 libnspr4` (or `npx playwright install --with-deps chromium`),
  then run a Playwright/Puppeteer journey across mobile + desktop viewports with
  console/network capture against the live backend.

---

## 5. Build, tests, observability

- **Build** — `pnpm --filter @workspace/api-server build` (production bundle),
  full workspace build api+web+libs, typecheck 0 errors, lockfile unmutated.
- **Automated tests** — 40/40 PASS against real PostgreSQL.
- **Observability** — no secrets, no JWTs, no Authorization headers, no SSE
  `?token=` query values in logs; no stack traces to clients. Low findings:
  server-side stack traces for CORS/JSON rejection (logs only), no SIGTERM drain
  handler, in-memory rate limiter resets on restart.

---

## 6. Risk summary

- **HIGH:** none.
- **MEDIUM:** (1) production-runtime `uuid <11.1.1` via
  `@google-cloud/storage → gaxios` (MODERATE, low exploitability, no blind
  upgrade); (2) real-DB validation ran against embedded-postgres (genuine
  PostgreSQL 18.4) rather than a managed service — production still needs a
  managed/persistent instance with backups and monitoring.
- **LOW:** no SIGTERM drain handler; `quests/recommended` uncapped (small public
  catalogue); in-memory rate limiter resets on restart; server-side stack traces
  for CORS/JSON rejection (logs only).

---

## 7. Classification

**YELLOW — CONDITIONAL GO.**

The database blocker is now **CLOSED** (real PostgreSQL, real driver, real
schema/migrations/seed, full E2E/security/concurrency/SSE/quest validation, and
40/40 automated tests all against real PostgreSQL). The three remaining blockers
are purely infrastructure that cannot be provisioned in this sandbox (real
GROQ key, Replit object-storage sidecar, NSS shared libraries for a browser), and
each is documented with its exact missing infrastructure, reason, and closing
command. No application code changed.
