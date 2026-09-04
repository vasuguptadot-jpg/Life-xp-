# Stage 26.1 — Authentication CPU Isolation & Password-Hashing Hardening

**Decision: GREEN**

> STAGE 26.1 decision: GREEN — password hashing moved from `bcryptjs` (pure JS, blocks
> the main event loop up to ~1617 ms at 16 concurrent sign-ins) to native `bcrypt`
> (libuv threadpool), with cost 12 and the bcrypt algorithm unchanged, so no password
> security was weakened and no existing account was invalidated (legacy `$2a$` hashes
> still verify; new hashes emit `$2b$12$`). Event-loop lag is now flat at 4–14 ms
> regardless of concurrency (vs 105–1617 ms before), and cross-user latency under
> concurrent sign-in load is ~1 ms — authentication no longer starves unrelated users.
> A pre-existing account-enumeration timing oracle (nonexistent 401 in ~2 ms vs ~250 ms
> for wrong password) was also closed with a dummy-hash compare. Rate limits, uniform
> failure behavior, JWT/refresh rotation, and logout semantics are unchanged. Full
> regression 447/447; typecheck/build/secret-scan clean.

## Scope

Narrow, single concern: move password hashing off the main event loop (or replace the
KDF) **without** weakening password security, increasing enumeration risk, or breaking
existing accounts. No unrelated features were touched.

## Decision: native `bcrypt` (Option A)

Evaluated against bcryptjs (keep), Argon2id (B), and worker-thread isolation (C):

| Option | Event-loop lag @ C8 | Memory overhead | Migration | Deploy risk | Verdict |
|---|---|---|---|---|---|
| D — keep bcryptjs | **809 ms** | 0 | n/a | none | rejected: starves event loop |
| A — native bcrypt | **11 ms** | 0 | none (same algo/cost) | prebuilt `.node` binaries ship in the npm package | **SELECTED** |
| C — worker threads | 10 ms | **+40 MB RSS** | none | worker lifecycle/queue complexity | rejected: memory + slower wall |
| B — Argon2id | n/a | n/a | required (rehash all) | stronger KDF, but no security need + breaks gradual migration | rejected |

Rationale per the standing constraint "do not switch merely because it is faster":
- **Security is unchanged**, not weakened: same algorithm (bcrypt), same work factor
  (12), same per-hash random salt, same 72-byte truncation semantics. Cost was **not**
  lowered.
- **No account invalidation**: native bcrypt and bcryptjs are cross-compatible both
  directions (`$2a$` ↔ `$2b$`), verified empirically. Legacy hashes verify indefinitely;
  no forced rehash, no reset. (Prefer-gradual-migration honored — in fact no migration
  is even required.)
- **Measured isolation, not assumed**: the API returning a Promise is *not* evidence of
  non-blocking; the event-loop lag curve (Part 2) is the proof. Native bcrypt's async
  API dispatches to the libuv threadpool, which is confirmed by the flat lag curve and
  by the timer-fires-during-hash test.
- **Deployment compatibility**: bcrypt@6.0.0 ships prebuilt binaries for linux-x64
  (glibc) inside the npm package — no compile, no install-time download, no build
  scripts required. `require("bcrypt")` loads and hashes in this environment. esbuild
  already listed `bcrypt` (and `*.node`) in its `external` list, so the bundle remains
  an external `from "bcrypt"` import.

## Part-by-part results

### Part 1 — current implementation (BEFORE)
`bcryptjs@2.4.3`, cost 12, `$2a$12$...` (60 chars), random 16-byte salt, 72-byte
truncation, malformed/bad-salt → `false` (fail-closed), single hash ≈ 315 ms on the
main thread. Signup enforces `length >= 8`.

### Part 2 — auth CPU baseline & contention curve
Event-loop lag (in-process, 3 hashes per worker):

| Concurrency | bcryptjs lag | native bcrypt lag |
|---|---|---|
| 1 | 105 ms | 4 ms |
| 2 | 211 ms | 10 ms |
| 4 | 409 ms | 12 ms |
| 8 | 809 ms | 11 ms |
| 16 | **1617 ms** | **14 ms** |

Native bcrypt lag is **flat (4–14 ms) independent of concurrency** — 73.5× better at
C8, 115.5× better at C16.

### Part 4 — hash migration
No migration needed. Native verifies bcryptjs `$2a$` = true; bcryptjs verifies native
`$2b$` = true. Fresh signups store `$2b$12$`. Legacy-account e2e signin returns 200.
Fixture: `$2a$12$kCaqUF5cEshszfHRWfE3YO5LfhNZEZdJyyskErM0hTvGdylsmldju` (LegacyPass123!).

### Part 5 — event-loop isolation
Native bcrypt async API dispatches to the libuv threadpool; proven by (a) the flat lag
curve above and (b) a regression test asserting a 20 ms timer fires during a cost-12
hash. No worker threads used, so no worker-count/queue/cleanup/shutdown concerns.

### Part 6 — auth correctness & enumeration
Valid login / wrong password / nonexistent / disabled / deleted accounts: all behave
correctly; refresh rotation, logout, and session replay remain intact (44/44 security
suite + 14-test stage suite). **Finding & fix**: a pre-existing timing oracle made
nonexistent accounts return 401 in ~2 ms vs ~250 ms for a wrong password. Fixed with a
dummy cost-12 hash burned on the not-found/inactive path (guarded by
`typeof password === "string"`); delta now ~5 ms (246 ms vs 251 ms) — oracle closed.

### Part 7 — password input safety
Empty/short/long/unicode/whitespace/null/number/object/array/huge (1 MB) all rejected
deterministically (< 500), no crash, no accidental coercion. Password contract: string,
min 8 chars, body-parser 100 KB limit caps effective length.

### Part 8 — rate limiting under concurrent attack
Auth limiter (10/15 min, IP-keyed) still returns 429s under concurrency and runs before
the expensive hash. **Finding (pre-existing, infra-dependent)**: with `trust proxy: 1`
and the server directly reachable, spoofing `X-Forwarded-For` per attempt bypasses the
IP key (25/25 unique-XFF signins → 401, zero 429s). Not introduced by the bcrypt swap.
Remediation is deployment-side (front the app with a proxy that overwrites XFF, or
disable trust proxy when directly exposed). See classification.

### Part 9 — cross-user latency (key regression)
Attacker N concurrent sign-ins while an unrelated user polls `/healthz`:

| Concurrent sign-ins | attacker p50 | unrelated healthz p50 / p99 / max |
|---|---|---|
| 16 | 2508.6 ms | 0.7 / 8.3 / 53.5 ms |
| 32 | 4061.9 ms | 0.6 / 6.2 / 76.0 ms |

Authentication load no longer starves unrelated users (was ~800 ms cross-user under 8
concurrent under bcryptjs).

### Part 10 — CPU/memory before/after
Server RSS idle 138 MB → 179 MB under 16 concurrent sign-ins (transient libuv buffers,
returns to idle); 11 threads; native bcrypt memory overhead 0. CPU: native bcrypt uses
up to 4 libuv threads (101–159% CPU) — parallelizes instead of serializing on one core.

### Part 11 — failure injection
Malformed/short/bad-salt/unknown-variant (`$2y$`) hashes → `compare` returns `false`
(no throw). **Improvement**: a planted cost-99 hash now fails fast (native bcrypt
validates cost) whereas bcryptjs would hang on 2^99 rounds — better DoS resistance.

### Part 12 — security regression
5 suites (`stage23-security-audit`, `security-regression`, `refresh-rotation`,
`rate-limiting`, `sse-auth`) → **44/44 passed**. Hashes never appear in responses/logs;
JWT/refresh rotation/logout/deleted-token behavior unchanged.

### Part 13 — performance regression (10k users)
`lifexp_load` seeded at 10,000 users / 20,000 posts. 20 s mixed-workload soak (8-way
concurrent: reads + writes + signin bcrypt-compare): **5929 requests, 0 failures,
296.4 rps, p50 23.2 ms, p95 46.6 ms, p99 80.1 ms, 0 negative XP transactions**. The
signin tail (max 1451 ms) is threadpool queueing, not event-loop blocking (healthz
stays ~1 ms). No throughput/memory/DB/XP regression.

### Part 14 — full regression
- Vitest: **447/447 passed** (44 files)
- Typecheck (`tsc --noEmit`): PASS
- Build (esbuild): PASS (bcrypt external)
- Secret scan: clean
- Note: 2 unhandled errors originate in `db-pool-resilience.test.ts` (deliberate
  backend-kill test), pre-existing, unrelated to the bcrypt swap.

## Files changed

- `artifacts/api-server/src/routes/auth.ts` — `bcryptjs` → `bcrypt`; added
  `DUMMY_PASSWORD_HASH` and a dummy compare on the not-found/inactive signin path.
- `artifacts/api-server/package.json` — `bcryptjs@^2.4.3` → `bcrypt@^6.0.0`;
  `@types/bcryptjs` → `@types/bcrypt@^6.0.0`.
- `artifacts/api-server/src/tests/regression.test.ts` — import updated.
- `artifacts/api-server/src/tests/stage26_1-auth.test.ts` — new 14-test suite.
- `pnpm-lock.yaml` — regenerated (bcryptjs fully removed).

## Classification matrix

| Class | Count | Items |
|---|---|---|
| A | 0 | — |
| B | 0 | (XFF rate-limit bypass is PRE-EXISTING + INFRASTRUCTURE-DEPENDENT; documented, not introduced here) |
| C | 0 | (signin tail threadpool queueing under 32-way load is acceptable; unrelated latency ~1 ms) |
| D | 0 | — |

## Evidence boundary

All numbers above are **MEASURED** on the running app (real HTTP load) or in-process
harnesses against the real library, not estimated from source inspection. The only
INFRASTRUCTURE-DEPENDENT item is the XFF rate-limit bypass (deployment configuration),
explicitly labeled. Browser-based interaction was not exercised this stage (no Chromium
in sandbox), consistent with prior stages.

## Smallest actions to reach full GREEN-on-infra

Already GREEN. The one deployment-dependent item (XFF trust) requires a reverse proxy
decision that is outside application scope: front the app with a proxy that overwrites
`X-Forwarded-For`, or set `trust proxy` off when directly exposed.
