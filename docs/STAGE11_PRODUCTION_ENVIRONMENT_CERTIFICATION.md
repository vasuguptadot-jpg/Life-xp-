# Stage 11 — Production Environment Certification & Deployment Readiness

**Branch:** `arena/01a05271-life-xp`
**Baseline (Stage 10 final):** `c0ea8f3`
**Final HEAD:** `60b956a`
**Recorded:** 2026-08-31
**Classification:** **CONDITIONAL GO**

> Stage 11 exists to close the Stage 10 CONDITIONAL-GO items using **real
> infrastructure where available**. No credentials or services were
> fabricated; every unavailable external service is reported as BLOCKED, and
> every locally-reproducible result is reported as VERIFIED LOCALLY (never
> mislabelled as real production).

---

## 1. Exact Baseline

The environment was **reset** between Stage 10 and Stage 11 (local HEAD had
reverted to `25cbdf2`, the branch point, with the Stage 10 files stranded
uncommitted). Per the recovery procedure, the remote was checked first and the
exact expected commit was confirmed:

- Remote `origin/arena/01a05271-life-xp` → `c0ea8f3` (Stage 10 final, with the
  exact expected chain `c0ea8f3 → 639f943 → 6f4b4e8 → 7366c87 → 7533e65 →
  c18576a`).
- The local clone's fetch refspec only tracked `main` (the known stale-refspec
  issue); it was corrected to `+refs/heads/*:refs/remotes/origin/*`.
- `git reset --hard c0ea8f3` recovered the branch with **no work lost**.

Baseline re-verified clean: HEAD `c0ea8f3`, branch `arena/01a05271-life-xp`,
clean tree, Stage 10 deliverables present, 153 tracked files.

---

## 2. Real Environment Inventory (names only — no secret values)

| Service | Availability | Result |
|---------|--------------|--------|
| Real PostgreSQL `DATABASE_URL` | **NOT SET** | BLOCKED — INFRASTRUCTURE |
| Real Groq `GROQ_API_KEY` | **NOT SET** | BLOCKED — INFRASTRUCTURE |
| Object-storage sidecar | **NOT AVAILABLE** | BLOCKED — INFRASTRUCTURE |
| Browser automation (Playwright/Chromium) | **NOT AVAILABLE** | BLOCKED — INFRASTRUCTURE |
| Isolated PGlite (WASM Postgres, pgwire `127.0.0.1:5433`) | RECREATED | local-only reproduction |

No `.env` file was present; no secrets were invented. `node_modules` was
recreated via `pnpm install --frozen-lockfile` (pnpm pinned `10.34.5`; the
lockfile was not mutated and `pnpm-workspace.yaml` was not changed).

---

## 3. Configuration Matrix

| Variable | Required? | Present? | Runtime behavior | Status |
|----------|-----------|----------|------------------|--------|
| `DATABASE_URL` | YES | **NO** | server throws at import | BLOCKED (isolated substitute used) |
| `SESSION_SECRET` | YES | NO (audit value set locally) | server throws if unset | VERIFIED |
| `PORT` | YES | NO (4325 set locally) | server throws if unset | VERIFIED |
| `BASE_PATH` | YES/DEPLOYMENT | NO (`/` used locally) | vite requires it | VERIFIED |
| `GROQ_API_KEY` | feature-specific | **NO** | AI degrades (503/`[]`/fallback) | VERIFIED |
| `CORS_ORIGINS` | deployment-specific | NO (audit value set) | production allowlist | VERIFIED |
| `PUBLIC_OBJECT_SEARCH_PATHS` | storage-specific | **NO** | object storage unavailable | BLOCKED |
| `PRIVATE_OBJECT_DIR` | storage-specific | **NO** | object storage unavailable | BLOCKED |
| `NODE_ENV` | deployment-specific | `production` (set locally) | CORS enforcement | VERIFIED |
| `LOG_LEVEL` | optional | unset | pino default `info` | VERIFIED |
| `REPL_ID` | platform-specific | NO | Vite dev plugins only | N/A locally |

`.env.example` matches actual runtime behavior (verified line-by-line in Stage
9/10; re-confirmed unchanged this stage).

---

## 4. Real DB Validation

**BLOCKED — INFRASTRUCTURE.** No `DATABASE_URL` is available and the sandbox
cannot reach a real PostgreSQL cluster. Isolated PGlite is **not** presented as
live-DB validation.

Local isolated reproduction (PGlite pgwire server, real Postgres wire
protocol, migrations applied from zero):
- **23 app tables** created from the two committed migrations (plus a
  harness-internal `_migrations` marker table).
- **Schema contract: PASS** — all 154 columns across 23 tables match
  `docs/DATABASE_CONTRACT.json` exactly (0 missing, 0 extra).
- 20 primary keys, 25 foreign keys, unique constraints and indexes present.
- CRUD smoke (AUTH → USER → PROFILE → ONBOARDING → GOALS → PROGRESSION →
  QUEST → POST → LIKE → FOLLOW → CONVERSATION → MESSAGE) exercised through the
  HTTP surface with disposable records; DB state verified after each mutation;
  cleanup verified.

---

## 5. Real AI / Groq Validation

**BLOCKED — INFRASTRUCTURE** (no `GROQ_API_KEY`). No-key degradation verified
against the production build:

| Check | Result |
|-------|--------|
| server boots without key | ✅ |
| `POST /api/ai/chat` → 503 `"AI coach is not configured. Add GROQ_API_KEY to enable."` | ✅ |
| `GET /api/ai/daily-tasks` → `[]` | ✅ |
| `GET /api/ai/life-tip` → static fallback (200) | ✅ |
| process remains healthy after AI calls | ✅ |

No fabricated success, no key leakage, no internal error leakage. Live
generation, provider errors, and real timeouts remain **UNVERIFIED** (no key).

---

## 6. Real Object Storage Validation

**BLOCKED — INFRASTRUCTURE.** No object-storage sidecar exists in the sandbox.
Upload/ACL/retrieval/traversal behavior is **not** inferred as PASS from
static review of `objectAcl.ts` / `objectStorage.ts`.

---

## 7. Backend Deployment Validation (real production build)

The actual `dist/index.mjs` production build (not a test harness) was started
with `NODE_ENV=production` against the isolated Postgres pgwire server:

| Check | Result |
|-------|--------|
| startup / DB connectivity | ✅ "Database connectivity verified" |
| health endpoint `/api/healthz` | ✅ 200 `{"status":"ok"}` |
| auth routing | ✅ (see §10) |
| API routing (all routers mounted) | ✅ |
| CORS enforcement | ✅ (see §9) |
| environment validation | ✅ (fail-fast on missing REQUIRED vars, per Stage 9) |
| graceful shutdown | ✅ (SIGTERM handled; process exits cleanly) |

---

## 8. Frontend Deployment Validation (real static build)

The `vite build` output was served and exercised over HTTP:

| Check | Result |
|-------|--------|
| `index.html` | ✅ 200 |
| JS bundle | ✅ 200 (605 KB) |
| CSS bundle | ✅ 200 |
| favicon | ✅ 200 |
| SPA fallback (unknown route) | ✅ 200 → index.html |
| API base URL | ✅ relative `/api/...` (same-origin; no hardcoded localhost) |

Full browser interaction (auth/navigation/console/network) is **BLOCKED** — no
browser automation.

---

## 9. CORS Certification (production build, `CORS_ORIGINS=https://allowed.example.com`)

| Case | Result |
|------|--------|
| allowed origin | ✅ 200 + `Access-Control-Allow-Origin: https://allowed.example.com` + `Allow-Credentials: true` |
| preflight OPTIONS (allowed) | ✅ 204 + ACAO + methods + requested headers |
| missing origin (same-origin) | ✅ 200 (no ACAO needed) |
| disallowed origin | ⚠️ **500** — cosmetic (see below) |
| credentialed request | ✅ `Allow-Credentials: true`, no wildcard |

The disallowed-origin 500 is the known **cosmetic** behavior: the CORS
middleware rejects via `callback(new Error(...))`, which surfaces as a 500, but
**no `Access-Control-Allow-Origin` header is emitted**, so the browser blocks
the response regardless. No security impact; documented, not redesigned (per
Stage 10/11 guidance not to rework cosmetic-only behavior).

---

## 10. Authentication Certification (real configured build)

| Check | Result |
|-------|--------|
| registration | ✅ 201 |
| duplicate email | ✅ 409 |
| duplicate username | ✅ 409 |
| weak password | ✅ 400 |
| login | ✅ 200 |
| wrong password | ✅ 401 |
| access token (`/api/auth/me`) | ✅ 200 |
| refresh (rotation) | ✅ 200 |
| refresh reuse (rotated token) | ✅ 401 |
| revoked/expired/invalid JWT | ✅ 401 |
| logout | ✅ (revokes refresh token) |

DB state verified; no password/token leakage in responses.

**Defect found & fixed this stage (HIGH):** refresh-token rotation was not
atomic — a `SELECT`-then-`UPDATE` allowed concurrent replays of the same
refresh token to each observe it as "unrevoked" and mint multiple token pairs
(reproduced: 4/5 concurrent refreshes succeeded). Fixed with an atomic
`UPDATE … SET revoked_at = now() WHERE token_hash = … AND revoked_at IS NULL
AND expires_at > now() RETURNING …` claim. Re-verified: **5/5 concurrent bursts
now yield exactly one 200 and the rest 401.** Regression test added
(`refresh-rotation.test.ts`). See `STAGE11_RELEASE_CERTIFICATION.md` §Findings.

---

## 11. Security Smoke (bounded, against deployed build)

| Input | Result |
|-------|--------|
| malformed UUID | ✅ 400 |
| SQL injection (`' OR 1=1 --`) | ✅ 401 (parameterized; no effect) |
| malformed JSON | ✅ 400 |
| NUL byte in text | ✅ sanitized (201, no 500) |
| unexpected JSON types | ✅ 400 (Stage 10 fixes) |
| IDOR — cross-user post delete | ✅ 404 |
| IDOR — cross-user conversation read | ✅ 403 |
| IDOR — cross-user conversation send | ✅ 403 |
| IDOR — cross-user quest mutation | ✅ 404 |
| SSE authorization (member / non-member / garbage) | ✅ 200 / 403 / 401 |
| object authorization | BLOCKED (no storage) |

No destructive testing performed.

---

## 12. Concurrency (real connection pool, isolated Postgres)

| Scenario | Result |
|----------|--------|
| 3-way concurrent duplicate likes | ✅ `likes_count` = 3 (exact, no drift) |
| 3-way concurrent unlikes | ✅ `likes_count` = 0 (exact) |
| duplicate follows | ✅ idempotent (still 1 row) |
| refresh rotation race | ✅ FIXED — exactly one success per token (was multiple) |
| quest completion / message creation | ✅ ownership-guarded |

Counters cannot drift; the refresh-token replay defect (§10) was the one real
counter/replay anomaly and is now fixed.

---

## 13. Observability

Production logs (pino-http) inspected during tests:

- ✅ **No secrets, JWTs, passwords, or DB credentials** in logs (request
  serializer logs only `id/method/url`, and strips the query string so SSE
  `?token=` values are not logged).
- ✅ Request failures identifiable via logged status codes.
- ⚠️ Server-side **stack traces** are logged for two rejection paths — CORS
  disallowed-origin and malformed-JSON body — but these are **server logs
  only**; clients receive generic responses (500 / 400 "Invalid request") with
  no stack, SQL, path, or secret content. This is normal server-side error
  logging; noted as LOW (log-noise, not a disclosure).

No sensitive log values are reproduced in this report.

---

## 14. Deployment / Migration Safety

- Migrations are **forward-only** drizzle-kit versioned migrations
  (`0000_tired_excalibur`, `0001_puzzling_the_santerians`).
- Applied via `pnpm --filter @workspace/db run migrate` (drizzle-kit) — a
  deploy/CI step, **not** at server startup (the server only verifies
  connectivity; it does not auto-migrate).
- drizzle-kit `migrate` uses a journal table → **idempotent** (skips applied
  migrations). Re-verified: re-running against the harness applied 0 new
  migrations.
- `post-merge.sh` runs `pnpm --filter db push` (forward-only add; no
  destructive rollback).
- Seed (`seed-archetypes.ts`) is **idempotent** (checks name before insert).
- Multi-instance migration race: drizzle-kit `migrate` does not take an
  advisory lock, so **concurrent deployment instances could race migrations**;
  this is a deploy-orchestration concern (documented, not exercised — no
  staging DB). No destructive rollback tests run.

---

## 15. Performance Sanity (bounded only)

- Feed/posts pagination capped (≤100 / ≤50). ✅
- Message pagination capped (≤100). ✅
- Quest list capped; recommended quests use `Number(limit)||5` (small public
  catalogue — Stage 10 FIND-10-2, LOW, unchanged). 
- Chat history capped (≤50). ✅
- SSE cleanup on disconnect. ✅
- Single shared `pg` Pool; no connection leaks observed across the smoke runs.
- No unbounded result sets, no N+1 observed in exercised paths. No load testing.

---

## 16. Blocked Validations (summary)

| Area | Reason |
|------|--------|
| Real production PostgreSQL | no `DATABASE_URL` |
| Real AI generation / provider errors / timeouts | no `GROQ_API_KEY` |
| Real object storage (upload/ACL/traversal) | no sidecar |
| Browser E2E | no browser automation |

---

## 17. Final Release Gate

**CONDITIONAL GO.**

Application code is clean and no critical/high defects remain (the one HIGH
defect found this stage — refresh-token replay — was reproduced, minimally
fixed, regression-tested, and re-verified). GO is withheld solely because real
production DB, real AI, real object storage, and browser E2E remain blocked by
missing infrastructure.

See `STAGE11_RELEASE_CERTIFICATION.md` for the full classification matrix,
findings register, and the exact infrastructure required to reach GO.
