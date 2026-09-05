# Stage 26 — Production Performance, Scalability & Load-Integrity Audit

**Classification: YELLOW** · **Commit: (this change)** · **Date: 2026-09-04**

## Objective & Method

Determine whether the application is **FAST / STABLE / CORRECT / ISOLATED / RESOURCE-SAFE**
under realistic concurrent load and increasing dataset size.

Method (per standing constraints): **measure first, never optimize from speculation**,
and **never replace real load testing with source inspection**. Every latency, integrity,
and scaling figure below was produced by driving the real HTTP API (built `dist/index.mjs`)
against a disposable PostgreSQL 18.4 database (`lifexp_load`), seeded at 10 → 10,000 users.

Each result is labelled with its evidence class:

- **MEASURED** — produced by an executed command in this environment.
- **ESTIMATED** — inferred from measurements but not directly executed at that exact point.
- **UNTESTED** — could not be executed here (see reason).
- **INFRASTRUCTURE-DEPENDENT** — behaviour is a property of the deployment environment, not the application code.

---

## Part 0 — Baseline recovery (mandatory)

| Check | Result |
|---|---|
| HEAD | `4420db45eb24cbc9cdf77090adc94b9616a9023e` (clean tree) |
| PostgreSQL | 18.4 on `127.0.0.1:5434`, migrations journal ids 1,2,3 |
| Node / pnpm | v22.22.3 / 10.34.5 |
| Full test suite | **426/426 (43 files)** |
| Workspace typecheck | PASS |
| api-server + web build | PASS |
| Secret scan | clean |

---

## Part 1 — Dataset scaling (MEASURED)

Disposable DB `lifexp_load` seeded at 10, 100, 1,000, 10,000 users with representative rows.
Final 10,000-user dataset:

| Table | Rows |
|---|---|
| users | 10,000 |
| xp_transactions | 20,000 |
| user_levels | 10,000 |
| user_goals / ai_user_goals | 10,000 / 10,000 |
| ai_daily_tasks | 30,000 |
| posts / follows | 20,000 / 20,000 |
| post_likes | 10,000 |
| conversations / conversation_members / messages | 10,000 / 20,000 / 20,000 |

DB size ≈ 40 MB; seed time 13.1 s.

**Latency vs. dataset size** (p50, ms) — identifies complexity class:

| Endpoint | 10 | 100 | 1,000 | 10,000 | Class |
|---|---|---|---|---|---|
| profile | 1.81 | 1.79 | 1.76 | 2.37 | O(1) |
| quests | 1.95 | 1.94 | 2.05 | 2.02 | O(1) |
| conversations | 2.35 | 2.37 | 2.96 | 4.09 | O(n) mild |
| leaderboard | 1.79 | 1.93 | 2.57 | 11.44 | O(n log n) |
| feed | 2.18 | 2.30 | 3.68 | 23.41 | O(n log n) → fixed |

The two superlinear endpoints (feed, leaderboard) are both `ORDER BY … LIMIT` over a
full-table seq-scan + sort. Feed was fixed in Part 7/23; leaderboard documented below.

---

## Part 2 — Read performance (MEASURED)

60 iterations/endpoint against the 10k dataset, p50/p95/p99 (ms):

| Endpoint | p50 | p95 | p99 |
|---|---|---|---|
| healthz / readyz | 1.03 / 1.36 | 3.15 / 2.29 | 5.61 / 3.09 |
| dashboard (leaderboard-backed) | 10.97 | 16.29 | 18.57 |
| profile (me) | 2.54 | 8.85 | 9.27 |
| level | 2.31 | 5.19 | 8.20 |
| quests list | 2.69 | 5.03 | 5.66 |
| recommendations | 6.98 | 10.12 | 14.48 |
| daily-plan | 5.76 | 8.10 | 18.76 |
| feed | 19.59 | 29.60 | 31.90 |
| feed personalized | 19.21 | 22.30 | 23.61 |
| conversations | 3.75 | 5.65 | 5.83 |

No endpoint returned 5xx during read measurement.

---

## Part 3 — Write performance (MEASURED)

Isolated writes, p50 (ms): post create 2.85 · quest assign 2.46 · goal update 3.57 ·
follow 1.99 · message send 5.33. Quest completion is transaction-wrapped (mark COMPLETED +
award XP atomically) and measured under concurrency in Part 4.

---

## Part 4 — Concurrent XP integrity (MEASURED — GREEN-critical)

Verified `SUM(xp_transactions.amount) == user_levels.total_xp` (globally and per-user),
`COUNT(negative) == 0`, and `COUNT(completed_quest_without_xp) == 0` after each scenario.

| Scenario | Concurrency | New awards | Integrity |
|---|---|---|---|
| same quest, same user, 50× | 50 | **1** (49 idempotent replays) | +50 XP exactly; clean |
| 20 distinct quests, same user | 20 | 20 | +1,000 XP; clean |
| 500 users, 1 quest each | 500 | 500/500 | +25,000 XP; `sum == level_sum == 775,000`; clean |

**No duplicate rewards, no lost rewards, no negative XP, no partial transactions.**
The idempotency key (`quest_complete_{userId}_{templateId}`) plus the conditional
`UPDATE … WHERE status IN ('ASSIGNED','IN_PROGRESS')` inside a single transaction
correctly serialise replay attempts (observed as `xp.award.replayed` log events).

---

## Part 5 — Hot-row contention (MEASURED)

50 concurrent completions of the *same* quest all contend on the same `user_levels`
row. Result: 179 ms p50 / 192 ms max, exactly **1** award. Serialisation is
**EXPECTED** (a user's XP total is a single authoritative row) — locks were **not**
relaxed to inflate throughput; correctness wins.

---

## Part 6 — Connection pool (MEASURED / INFRASTRUCTURE-DEPENDENT)

The pool is `new pg.Pool({ connectionString })` with **no explicit `max`**, so it uses
the `pg` default of **10 connections**. Under 500 concurrent completions this queues:
p50 1.37 s, total elapsed 1.9 s (~260 completions/s). No exhaustion/leak observed —
requests queue deterministically rather than failing.

**INFRASTRUCTURE-DEPENDENT**: pool size is not application-configurable today (no
`PGPOOLMAX`/`DATABASE_POOL_MAX` env is read). This is a deployment-tuning lever, not an
application defect.

---

## Part 7 — Query plan / index audit (MEASURED)

`EXPLAIN (ANALYZE, BUFFERS)` on the hot queries:

| Query | Before | Note |
|---|---|---|
| feed | Seq Scan posts (20k) + Hash Join + Sort → **20.2 ms** | **fixed** (Part 23) |
| leaderboard | Seq Scan user_levels (10k) + Hash Join + Sort → 11.1 ms | not fixed (below) |
| xp by user | Bitmap Heap Scan (indexed) | fine |
| quests by user | Index Scan (indexed) | fine |
| following-feed | Index Only Scan (follows) + Bitmap (posts) | fine |

**Leaderboard** orders by `COALESCE(ul.total_xp, 0)` over a `LEFT JOIN` from `users`,
which prevents an index-only ordered scan. A `user_levels(total_xp)` index was tested
and yielded only 11.1 → 7.0 ms (**still sorts**) — it was **not added** because the
marginal read gain does not justify maintaining an extra index on a column updated by
**every** XP award. Documented as a future query-rewrite candidate (e.g. `JOIN` +
`ORDER BY total_xp DESC NULLS LAST` if the invariant "every user has a level row" is
guaranteed).

---

## Part 8 — N+1 detection (MEASURED)

Feed, conversations, and personalized-feed each issue **one** query (single SQL with
joins); no parent + N-children loops were found.

---

## Part 9 — Pagination / result limits (MEASURED + **D fix**)

- Max limit **100** enforced (capped `999999999` → 100; `101` → 100).
- `limit=0` → 200 empty; deep `offset=10000` → 200 (~28 ms, offset-pagination O(offset)).

**D-class defect (reproduced → root cause → fix → regression):**
`limit=-1` and `limit=abc` returned **HTTP 500** — `Number()`-parsed values were passed
unclamped to SQL `LIMIT`/`OFFSET`, so PostgreSQL raised `LIMIT must not be negative` /
`invalid input syntax for type bigint`. Fixed by a shared `parseLimit`/`parseOffset`
helper (`src/lib/pagination.ts`) applied to every list endpoint (leaderboard, posts,
personalized feed, messages, progression, quests, ai chat history); non-finite → default,
negative → 0. Now returns 200 with sanitised values. Regression tests added.

---

## Part 10 — Request body / payload limits (MEASURED + **D fix**)

- `express.json` default 100 KB limit: 1 MB caption → **413**; 100k hashtags → **413**.
- Repeated JSON fields: standard `JSON.parse` last-wins (no special handling).

**D-class defect (reproduced → root cause → fix → regression):**
A ~5,000-deep nested JSON body returned **HTTP 500** — the recursive `stripNullBytes`
middleware overflowed the call stack (`RangeError: Maximum call stack size exceeded`).
Fixed by rewriting the traversal **iteratively** (explicit stack). Now returns 400
(validation) deterministically. Regression test added.

---

## Part 11 / 12 — SSE load & fanout (MEASURED)

100 concurrent SSE connections opened cleanly (+~110 server fds), broadcast to a
conversation succeeded, and **fd count returned to baseline (~25) within seconds of
client abort** — no connection leak. Isolation is enforced per-connection via the
conversation-membership check; the existing `sse-auth` / `sse-lifecycle` tests pass.

---

## Part 13 — Rate limit under load (MEASURED / INFRASTRUCTURE-DEPENDENT)

- 150 concurrent `POST /quests/assign`: **50×201 + 70×409 + 30×429** — exactly the
  `max=120` mutation cap (409 "already assigned" still counts as an attempt).
- 40 concurrent `POST /auth/signin` (wrong creds): **8×401 + 32×429** — the `max=10`/15 min
  auth cap engaged.

**INFRASTRUCTURE-DEPENDENT**: `express-rate-limit` uses the in-memory `MemoryStore`,
which is **per-process** — in a horizontally-scaled deployment the effective limit is
`max × instances`. Not a correctness issue today; a shared store is a deployment choice.

---

## Part 14 — Auth performance (MEASURED — **C-class finding**)

The app uses **bcryptjs** (pure JS) at 12 rounds: ~**330 ms of synchronous CPU** per
hash/compare on the main thread. Measured cross-user event-loop lag while hashing:

| Concurrent hashes | Total | Max event-loop lag |
|---|---|---|
| 1 | 324 ms | 103 ms |
| 4 | 1,277 ms | 404 ms |
| 8 | 2,468 ms | **808 ms** |

**C-class finding**: auth hashing runs on the main event loop, so concurrent sign-ins
degrade *unrelated* requests (healthz/dashboard/feed) by ~100 ms per in-flight hash.
Bounded per-IP by the auth limiter (10/15 min) but not bounded across many source IPs.
**Recommendation** (not applied — dependency change): migrate to native `bcrypt`
(libuv threadpool) or `argon2`, or hash in a worker thread.

---

## Part 15 — AI / external service resilience (UNTESTED)

`GROQ_API_KEY` is not set in this environment, so live Groq timeout/slow/failure/concurrent
behaviour is **UNTESTED**. The fallback path is source-verified (`if (!GROQ_API_KEY) return
deterministic output`) and the deterministic endpoints remained deterministic through every
load run (determinism tests pass).

---

## Part 16 — Cache / hot-path (MEASURED, limited)

No explicit cache layer exists; repeated requests re-read PostgreSQL. No stale data,
deleted-data, cross-user, or stale-auth/XP behaviour was observed across load runs and
the determinism / integrity suites pass.

---

## Part 17 — Memory / resource leak (MEASURED)

Server RSS sampled across LOAD → IDLE cycles and an SSE open/close cycle:

- RSS stabilises ~220–240 MB with **no monotonic growth**.
- SSE open (100) → close: RSS unchanged, fd count returns to baseline.

**No leak detected.**

---

## Part 18 — CPU / event loop (MEASURED)

Non-auth endpoints are async DB I/O and do not block the loop; large feeds (20k posts)
serialise in a few ms. The sole event-loop contention is bcryptjs (Part 14) — one auth
burst can add up to ~800 ms latency to unrelated users.

---

## Part 19 — Failure under load (COVERED by code + existing tests)

`@workspace/db` attaches `pool.on('error')` so a PostgreSQL restart does **not** crash
the process; `failure-injection.test.ts` and `db-pool-resilience.test.ts` pass. A live
embedded-PG restart was **not** run (it would disrupt the shared cluster); this is
documented rather than claimed.

---

## Part 20 — Browser performance (NOT EXECUTED / INFRASTRUCTURE-DEPENDENT)

No Chromium is installed in this sandbox, and the Vite web app resolves `/api/*` on the
same origin (deployment proxy), which is not replicated here. Real-Chromium mobile/desktop
navigation + mutation testing is therefore **not executed**; reported honestly rather than
fabricated.

---

## Part 21 / 22 — Load + security / data-integrity regression (MEASURED)

- XP integrity re-verified under 500-way concurrency and 30 s soak (Part 4/24).
- No cross-user leakage observed in any load test; SSE isolation + IDOR + XP-manipulation
  coverage lives in the existing Stage 23 security suite (all passing).

## Part 23 — Optimisation (only after measurements — MEASURED before/after)

| Change | Before | After |
|---|---|---|
| `posts(created_at DESC)` index (feed) | query 20.2 ms; HTTP p50 23.4 ms | query **0.34 ms**; HTTP p50 **2.9 ms** |

One index added, justified by a measured 60× query win; `user_levels(total_xp)` index
**rejected** (1.6×, high write overhead). Migration `0003_mighty_bastion`.

## Part 24 — Final soak (MEASURED)

30 s sustained mixed read/write workload (feed, profile, recommendations, leaderboard,
goals create, quest assign, post create):

| Metric | Value |
|---|---|
| Requests | 14,808 |
| Failures | **0** |
| Throughput | 493.6 req/s |
| p50 / p95 / p99 / max | 9.88 / 18.33 / 24.95 / 101.04 ms |
| Negative XP / orphan XP | **0 / 0** |

---

## Classification & decision

- **2 D-class defects** found and fixed (pagination 500; deep-nesting 500), each with
  root cause, minimal fix, regression tests, and a full re-run: **433/433 (43 files)**.
- **1 C-class finding** remains: bcryptjs main-thread hashing (Part 14).
- No load-induced corruption; XP ledger exactly correct; no duplicate/lost rewards; no
  cross-user leakage; no resource leak; no unbounded list behaviour.

**Final decision: YELLOW** — no unresolved D-class defects and all GREEN gates pass
except the single measured C-class finding (bcryptjs event-loop blocking), which is
documented with a concrete, smallest-action recommendation (native bcrypt/argon2) and
is not a correctness blocker.
