# Stage 27 — Production Acceptance Gate & Release Certification

**Decision: YELLOW — production-ready CONDITIONAL on deployment prerequisites**

> STAGE 27 decision: YELLOW — the application is production-ready: 447/447 tests
> pass, the complete user lifecycle, cross-user isolation, XP economy (ledger
> SUM == total_xp, no negative/duplicate/client-controlled rewards), data
> integrity (likes_count, orphans, level formula), the AI trust boundary
> (deterministic engines + graceful 503 fallback), security (no auth bypass,
> no IDOR, no SQLi/XSS, no secret leakage, timing-enumeration oracle closed),
> observability (X-Request-Id + structured events), DB failure/recovery
> (readiness 503→200, pool auto-reconnect, no crash), concurrency (exactly-one
> mutation, no duplicate XP), performance (auth never starves unrelated users),
> and backup/restore (23 tables + XP ledger round-trip) are all verified by
> executed evidence. GREEN is withheld because three deployment-dependent
> surfaces remain UNVERIFIED in this environment: real-browser UX (no
> Chromium), live Groq AI provider (no GROQ_API_KEY), and the reverse-proxy
> trust topology (trust proxy=1 vs. production proxy), plus documented
> infrastructure-owned prerequisites (backup/PITR/RPO/RTO, object-storage
> sidecar, TLS/security headers at the proxy).

---

## Part 0 — Environment reset & baseline recovery

The environment was reset between stages. On entry, `git rev-parse HEAD` was
`25cbdf2` (the base `main` commit) and the local clone had lost the stage
history; the full Stage 20–26.1 working tree survived as uncommitted changes
(native bcrypt auth, life-engine, observability, security/data-integrity
suites, migrations, docs).

Recovery: the authoritative Stage 26.1 commit `293cd6f` was fetched from the
remote (it was never actually lost — the fresh clone simply lacked the ref).
The surviving working tree was verified to be byte-for-byte identical to
`293cd6f` (`git diff --stat 293cd6f <reconstruction>` empty), then the baseline
was re-verified from scratch on top of the authentic history.

## Part 1 — Clean environment & baseline (re-provisioned)

| Item | Value |
|---|---|
| Node | v22.22.3 |
| pnpm | 10.34.5 |
| PostgreSQL | 18.4 (embedded, 127.0.0.1:5434) |
| bcrypt | 6.0.0 (native, prebuilt linux-x64) — bcryptjs ABSENT |
| pg | 8.22.0 |
| Commit (baseline) | `293cd6f` (Stage 26.1) |
| Branch | `arena/01a05271-life-xp` |

Provisioning steps executed: `pnpm install` (re-hydrated the
`@embedded-postgres/linux-x64` symlinks that pnpm's build-script gating had
skipped), started PostgreSQL 18.4, created `lifexp` / `lifexp_load` /
`lifexp_src` / `lifexp_dst`, applied **4 migrations** (23 tables) to a clean
`lifexp`, seeded 7 archetypes (idempotent `seed-archetypes`).

Baseline established BEFORE any modification:
- **Test suite: 447/447 passed (44 files)** — matches Stage 26.1 final count.
- **Typecheck: PASS** (`tsc --noEmit` across libs + api-server + web + scripts).
- **Production build: PASS** (api-server esbuild, bcrypt external; web vite).
- **Secret scan: clean** (only placeholder/example values; no real credentials).
- **Migration validation: 4/4 applied, idempotent journal, 23 tables.**

No application code was modified for Stage 27; this is an audit stage.

## Part 2 — Core product functionality (EXECUTED, 41/41 checks)

Real HTTP against the running server + real PostgreSQL. The full lifecycle was
exercised end-to-end and every state transition persisted:

signup(201) → signin(200, tokens) → auth/me → onboarding(state) → archetypes(7)
→ profile(PATCH persists) → onboarding goals → archetype select →
onboarding/complete → users/me → PATCH displayName → daily-plan → daily-tasks
(create + complete, DAILY_TASK +20 XP) → quest assign(201) → quest progress →
quest complete(QUEST_COMPLETION +50 XP) → **XP ledger invariant
SUM(xp_transactions)==total_xp (70==70)** → life-engine goals → recommendations
→ weekly-review → progression/summary → logout(200) → refresh-after-logout(401)
→ re-login(200).

No UI/API path depends on fake data: every read returned persisted DB state.

## Part 3 — Authentication & session acceptance (EXECUTED)

Covered by `stage26_1-auth.test.ts` (14 tests) + `refresh-rotation.test.ts` +
live checks:

| Case | Result |
|---|---|
| valid login | 200 + access/refresh tokens |
| invalid password | 401 "Invalid credentials" |
| nonexistent account | 401 (dummy-hash timing equalized) |
| inactive account | 401 uniform |
| expired access token | 401 (live) |
| malformed token | 401 (live) |
| forged token (bad signature) | 401 (live) |
| no token | 401 (live) |
| refresh rotation + replay | rotation 200, replay 401 |
| logout + post-logout | logout 200, refresh 401 |
| deleted-account rejection | signin + refresh 401 |
| password hashing | native bcrypt `$2b$12$` (cost 12 unchanged) |
| rate limiting | 429 under burst (auth 10/15min, refresh 30/15min) |
| timing-enumeration resistance | dummy hash → delta ~5 ms (closed) |

**Concurrent login measurement (native bcrypt, live):**

| Concurrency | signin p50 | unrelated healthz p50 / p99 / max |
|---|---|---|
| 1 | 262.5 ms | 1.4 / 9 / 9 ms |
| 4 | 566.1 ms | 0.9 / 8.1 / 8.1 ms |
| 8 | 1102 ms | 1.0 / 11.4 / 13.4 ms |
| 16 | 1631.4 ms | 1.2 / 8.8 / 16.1 ms |

Event-loop lag (proxied by healthz during the sign-in storm) stays **flat
~1 ms p50 / ≤16 ms max** at all concurrency levels — the Stage 26.1 native
bcrypt fix holds; authentication load does not starve unrelated requests.

## Part 4 — Authorization / tenant isolation (EXECUTED)

Two independent users A and B. Every cross-user operation was attempted with
B's token against A's resources (normal + ID/UUID substitution):

- B read/mutate/complete A's quest → **404** (all three)
- B complete A's daily task (A's task id) → **404**
- B read A's profile (`/api/users/{A.id}`) → **404** (no PII leak)
- B's goals do not contain A's goal ids → confirmed
- B completes own quest → A's XP **unchanged (70 → 70)**

No silent cross-user access anywhere. Responses are 401/403/404 per endpoint
semantics. (Comprehensive IDOR coverage also in `security-regression.test.ts`
and `stage23-security-audit.test.ts`.)

## Part 5 — XP economy & progression (EXECUTED)

Direct DB reconciliation against the authoritative ledger:

- `SUM(xp_transactions.amount) == SUM(user_levels.total_xp)` → **150 == 150** ✅
- Per-user `ledger == total_xp` → **0 mismatches** ✅
- Negative XP rows → **0** (DB CHECK `amount >= 0` is the final authority) ✅
- `current_level == floor(sqrt(total_xp/100))+1` → correct for all
  application-awarded data (13 rows with non-formula levels are test fixtures
  with `total_xp=0` + deliberately arbitrary `current_level`, not production
  data) ✅
- Replay / duplicate / concurrent / rollback / deletion / restart /
  malformed / direct-DB adversarial: covered by `xp-economy-telemetry`,
  `progression-integrity`, `anti-gaming`, `idempotency-audit` suites (all in
  the 447). No client-controlled reward, no duplicate reward, no reward from
  progress-only or abandoned-quest paths, idempotency keys on ledger + history.

## Part 6 — Data integrity & lifecycle (EXECUTED)

- `posts.likes_count == COUNT(post_likes)` → **0 mismatches** ✅
- Orphan `xp_transactions` (dangling user) → **0** ✅
- FK / unique / check constraints verified in schema + `db-integrity`,
  `db-regression`, `stage24-data-integrity`, `stage25-db-invariants`,
  `time-integrity`, `data-lifecycle` suites.
- Migration ordering (4 entries, monotonic idx) + idempotent journal ✅
- Cascade/soft-delete/orphan-prevention invariants re-verified ✅

## Part 7 — AI trust boundary (EXECUTED; live provider UNVERIFIED)

`GROQ_API_KEY` is **unset** in this environment.

- Daily Tasks → deterministic engine (works, returns persisted tasks) ✅
- Life Tip → deterministic engine (same tip returned twice, static fallback) ✅
- Chat → AI-native surface; without a key returns **503** "AI coach is not
  configured. Add GROQ_API_KEY to enable." (graceful) ✅
- No arbitrary XP through AI (AI award paths are idempotent + bounded) ✅
- No authorization decisions delegated to AI ✅
- No secrets exposed (GROQ key only via env) ✅
- **Live Groq generation: UNVERIFIED** (no credential; not fabricated).

## Part 8 — Security acceptance (EXECUTED)

Consolidated adversarial suites pass (in the 447): `stage23-security-audit`,
`security-regression`, `diagnostic-security`, `input-fuzz`, `uuid-validation`,
`refresh-rotation`, `rate-limiting`, `sse-auth`, `resource-exhaustion`.

Verified live: malformed/forged/expired tokens → 401; malformed UUIDs →
400/404 (not 500); oversized input → 413; malformed JSON → 400; NUL-byte
stripping; generic error handler (no stack/DB leak); CORS production
restriction to `CORS_ORIGINS`.

**Proxy topology (trust proxy)**: `app.set("trust proxy", 1)` trusts one
`X-Forwarded-For` hop. This is correct **only** when the app sits behind a
reverse proxy that overwrites XFF (Replit). When directly reachable, XFF can be
spoofed to defeat the IP-keyed auth limiter. This is **deployment-dependent**,
not application-safe by default — see Finding F-27-01.

## Part 9 — Observability acceptance (EXECUTED)

- `X-Request-Id` response header present (correlates with `req.id` log field) ✅
- Structured JSON logging: `request completed`, `xp.awarded`,
  `auth.failed` (reason), `rate_limit.rejected` (anonymized),
  `database.pool.error`, `readiness.failed`, `request.error` ✅
- Logs do NOT expose passwords, tokens, secrets, private content, or
  unnecessary PII (verified: auth failures log reason + path only; rate-limit
  logs method+path only) ✅
- Incident reconstruction: request id → structured events → server log ✅

## Part 10 — Failure & recovery acceptance (EXECUTED)

- **Database outage**: stopped PostgreSQL (`pg_ctl stop -m fast`) while API ran.
  - API remained ALIVE (`/api/healthz` 200) ✅
  - `/api/readyz` → **503** `{status:"unavailable",database:"down"}` ✅
  - `database.pool.error` + `readiness.failed` logged; **no crash** ✅
- **Recovery**: restarted PostgreSQL → `/api/readyz` → **200**; a subsequent
  DB-backed request succeeded (pool auto-reconnected) ✅
- **AI failure**: no key → chat 503, deterministic endpoints still serve ✅
- **SSE lifecycle**: connect/disconnect/registry cleanup/reconnect covered by
  `sse-lifecycle.test.ts` + `sse-auth.test.ts` ✅
- No leaked resources (RSS returned to idle; pool drained dead clients).

## Part 11 — Concurrency acceptance (EXECUTED)

Re-verified via `daily-task-concurrency`, `multi-device-concurrency`,
`idempotency-audit` suites + live concurrent-login storm. Exactly-one
authoritative mutation where idempotency requires it; no duplicate XP; no
inconsistent state; no orphan records. (Stage 21 concurrency soak, Stage 25 DB
invariants, Stage 26 critical-load all green in the 447.)

## Part 12 — Performance acceptance (EXECUTED)

Real HTTP + real PostgreSQL. Mixed workload + concurrent sign-ins (see Part 3
table). Server idle RSS **~133 MB**, 11 threads. Auth p50 262 ms @ C1 → 1631 ms
@ C16 (threadpool queueing), while unrelated endpoints stay ≤16 ms — the
Stage 26.1 bcrypt fix preserves overall application responsiveness, not just
the auth endpoint. `performance.test.ts` (p50/p95/p99 bounds) passes in the
suite.

## Part 13 — Real browser acceptance: **UNVERIFIED**

No Chromium / puppeteer in the sandbox. Real-browser UX (390×844 mobile,
1440×900 desktop; signup/login/onboarding/dashboard/plan/quests/goals/
recommendations/profile/logout; refresh/back/forward/repeated-submit/
double-click/slow-network/offline-reconnect) was **not executed** and is not
fabricated.

## Part 14 — Deployment & operations acceptance (EXECUTED, application scope)

| Concern | Application responsibility (verified) | Infra/deployment responsibility |
|---|---|---|
| env vars | fail-fast on missing `DATABASE_URL`/`SESSION_SECRET`/`PORT` | actual secret values |
| DB URL / JWT secret | required, validated at startup | provisioning |
| Groq | feature-specific; graceful 503 when unset | live key |
| object storage | `objectStorage.ts` (Replit GCS sidecar); uploads feature-specific | sidecar availability |
| CORS | production restricted to `CORS_ORIGINS` | allowed-origin list |
| proxy | `trust proxy=1` (one XFF hop) | reverse proxy that overwrites XFF |
| HTTPS | — | TLS termination at proxy |
| migrations | drizzle-kit versioned, idempotent | run on deploy |
| health/readiness | `/healthz` (liveness), `/readyz` (DB) | orchestrator wiring |
| logging | structured JSON, request id | aggregation |
| startup | DB connectivity verified before listen | process manager |
| graceful shutdown | clean exit on SIGTERM (no drain handler — documented LOW) | drain/draining LB |
| resource cleanup | bounded pg pool + error handler | container lifecycle |

## Part 15 — Backup / restore acceptance (EXECUTED)

`pg_dump`/`psql` are **not bundled** in the runtime (only initdb/pg_ctl/postgres),
so the documented logical backup uses the PostgreSQL `COPY` protocol
(`pg-copy-streams`), identical to Stage 24.

- Backed up **23 tables** (CSV via `COPY TO STDOUT`).
- Controlled mutation (deleted XP rows, posts, zeroed `total_xp`).
- Restored into clean `lifexp_dst` (FKs deferred via
  `session_replication_role=replica`).
- **RESTORE INTEGRITY VERIFIED**: all 23 tables + XP ledger + totals identical;
  XP ledger `SUM == 150` before and after; ownership/relationships intact.
- Production backup/PITR/RPO/RTO/encryption are **infrastructure-owned** (not
  demonstrated; not fabricated).

## Part 16 — Known limitations & technical debt (see Findings)

All items are C-class or UNVERIFIED (deployment-dependent). **No A, B, or D.**

## Part 17 — Final release gate matrix

| Domain | Result | Evidence |
|---|---|---|
| Core functionality | ✅ PASS | 41/41 lifecycle checks, real HTTP+PG |
| Authentication | ✅ PASS | Part 3 table + 14-test suite |
| Authorization | ✅ PASS | cross-user 404s, IDOR suites |
| XP economy | ✅ PASS | SUM==total_xp 150==150, 0 negative/duplicate |
| Data integrity | ✅ PASS | likes_count/orphans/level formula 0 mismatch |
| AI boundary | ✅ PASS (live provider UNVERIFIED) | deterministic + 503 fallback |
| Security | ✅ PASS | adversarial suites, no bypass/leakage |
| Observability | ✅ PASS | X-Request-Id + structured events |
| Failure recovery | ✅ PASS | DB stop/restart 503→200, no crash |
| Concurrency | ✅ PASS | exactly-one mutation, no dup XP |
| Performance | ✅ PASS | auth never starves unrelated (≤16 ms) |
| Browser UX | ⚠️ UNVERIFIED | no Chromium in sandbox |
| Deployment | ✅ PASS (application scope) | env/CORS/proxy/health audited |
| Backup/restore | ✅ PASS (logical) | 23 tables + XP ledger round-trip |

## Part 18 — Findings

See `STAGE27_RESULTS.json` `findings` for machine-readable entries. Summary:

- **F-27-01 (C)** — XFF `trust proxy=1` rate-limit bypass when directly reachable (deployment topology).
- **F-27-02 (UNVERIFIED)** — Real-browser UX not executed (no Chromium).
- **F-27-03 (UNVERIFIED)** — Live Groq AI provider not executed (no key).
- **F-27-04 (C)** — No `pg_dump`/`psql` bundled; PITR/RPO/RTO infra-owned.
- **F-27-05 (C)** — No SIGTERM drain handler (clean exit, no request drain).
- **F-27-06 (C)** — No security-header middleware; relies on reverse proxy.
- **F-27-07 (C)** — Quest templates have no committed seed (provisioned out-of-band).
- **F-27-08 (C)** — No automated backup/PITR in repo.
- **F-27-09 (C)** — Object storage requires Replit sidecar (unverified in sandbox).

**No A-class, no B-class, no D-class findings.**

## Why YELLOW, not GREEN

Every application-level GREEN gate passes with executed evidence. GREEN is
withheld only because (a) three surfaces remain **UNVERIFIED** due to
environment limits — real-browser UX, live Groq AI, and the production
reverse-proxy topology — and (b) several production prerequisites are
infrastructure-owned and not demonstrated here (backup/PITR/RPO/RTO, object
storage sidecar, TLS/security headers at the proxy). Declaring unconditional
GREEN would overclaim what this sandbox can prove.

## Production prerequisites (must be satisfied by deployment before launch)

1. Deploy behind a reverse proxy that terminates TLS and **overwrites
   `X-Forwarded-For`** (or set `trust proxy` off) — resolves F-27-01.
2. Provision a real **`GROQ_API_KEY`** and validate live AI generation.
3. Run the **real-browser acceptance** matrix (Part 13) on a staging deploy.
4. Establish **managed backups + PITR + RPO/RTO** with a tested restore drill.
5. Provision the **object-storage sidecar** and set `PUBLIC_OBJECT_SEARCH_PATHS`.
6. Set `CORS_ORIGINS` to the production origin allow-list.
7. Seed **quest templates** out-of-band (no committed seed script).
8. Decide on security headers / HSTS at the proxy (or add header middleware).
