# Stage 22 — Production Observability, Diagnostics & Operational Resilience: Audit

Stage 22 makes the system **operable**: every failure is observable, classified,
correlated, and recoverable. This document records the complete observability
inventory, what can fail, what is logged, the incident-reconstruction story for
each subsystem, measured performance, the resource-lifecycle audit, the
failure-injection matrix, and the one production-integrity defect this stage
found and fixed.

---

## 1. Architecture

LifeXP is a Node.js/Express API (`artifacts/api-server`) with:

- **PostgreSQL 18.4** (embedded-postgres, `127.0.0.1:5434`, DB `lifexp`) accessed
  through a single `pg.Pool` in `@workspace/db` (`lib/db`).
- **pino** structured logging (`lib/logger.ts`) + `pino-http` request logging.
- **Drizzle ORM** (`@workspace/db/schema`) with versioned migrations.
- **Optional external service**: Groq (AI coach/task wording/tips/chat), gated on
  `GROQ_API_KEY`; Google Cloud Storage for uploads.
- **SSE** realtime (messaging) via an extracted client registry
  (`lib/sse-registry.ts`).
- A deterministic **Life Engine** (`lib/life-engine/`) for analytics, daily
  tasks, recommendations, tips, and weekly review.

There is **no** background-job queue, **no** cron/scheduler, **no** email/
notification service, and **no** in-process application cache. The only
process-global long-lived in-memory structure is the SSE client registry.

---

## 2. Observability Inventory

For every subsystem: what can fail, whether it is observable, what is logged,
severity, correlation, and secret-leak risk.

| Subsystem | What can fail | Observable? | Logged | Severity | Correlation | Secret risk |
|---|---|---|---|---|---|---|
| HTTP requests | 4xx/5xx, slow | ✅ | pino-http request line (method/url/status/responseTime) | info | `req.id` | none |
| Authentication | missing bearer, invalid/expired token | ✅ | `auth.failed` (reason, path) | info | path (no user id) | none |
| Authorization | cross-user access (IDOR) | ✅ | 404/403 via request log | info | `req.id` | none |
| Database queries | connection loss, query failure, deadlock, FK/unique violation | ✅ | `database.pool.error`, `readiness.failed`, classified error | error | `req.id` + SQLSTATE | none |
| Transactions | rollback, partial write | ✅ | classified error + global handler | error | `req.id` | none |
| Progression / XP | award, replay, rollback, divergence | ✅ | `xp.awarded` (totalXpAfter/levelUp), `xp.award.replayed` | info/warn | userId + idempotencyKey | none |
| Quests | completion, replay, malformed id | ✅ | request log + classified 400 | info | `req.id` | none |
| Daily tasks | generation, completion, replay | ✅ | request log + `xp.awarded`/`xp.award.replayed` | info/warn | userId | none |
| Goals | mutation, save | ✅ | request log | info | `req.id` | none |
| Recommendations | engine failure | ✅ | classified error + global handler | error | `req.id` | none |
| AI (Groq) | provider down/timeout, no key | ✅ | `external.groq.failed` (operation) → generic 503 | warn | operation | none (no key) |
| Chat | provider failure | ✅ | `external.groq.failed` → generic 503 | warn | operation | none |
| Notifications / email | **not present** | n/a | n/a | n/a | n/a | n/a |
| SSE / realtime | connect/disconnect, delivery failure, leak | ✅ | `sse.connection.opened/closed`, `sse.delivery.failed` | info/warn | conversation id | none |
| Rate limiting | mutation/auth flood | ✅ | `rate_limit.rejected` (method, path) | warn | endpoint (anonymized) | none |
| Storage (uploads) | upload failure | ✅ | `external.storage.failed` → "Upload failed" | warn | operation | none |
| External APIs | Groq/Storage failure, latency | ✅ | see AI/Storage rows | warn | operation | none |
| Validation | malformed JSON/UUID/body | ✅ | classified 400 in request log | info | `req.id` | none |
| Errors | unexpected throw | ✅ | global handler logs category/status + context | error | `req.id` | none in body |
| Background work | **not present** (no queue/cron) | n/a | n/a | n/a | n/a | n/a |
| Scheduled work | **not present** | n/a | n/a | n/a | n/a | n/a |
| Caching | **not present** (client react-query only) | n/a | n/a | n/a | n/a | n/a |
| Resource pools | pg.Pool connection loss | ✅ | `database.pool.error` | error | pid | none |

---

## 3. Error Taxonomy

`lib/observability.ts` classifies every error into one of:
`validation` / `authentication` / `authorization` / `not_found` / `conflict` /
`rate_limit` / `database` / `transaction` / `external_service` / `timeout` /
`internal`.

- `classifyHttpStatus` maps status codes to categories (client errors → `warn`,
  internal errors → `error`).
- `classifyError` walks the **cause chain** and maps PostgreSQL SQLSTATE codes
  (`23505` unique → `conflict`, `40001` serialization → `transaction`,
  `40P01` deadlock → `transaction`, `23503` FK → `database`).
- Raw DB errors never reach clients; the global handler returns a generic body
  and logs the classified, structured event server-side.

## 4. Severity Model

| Level | Used for |
|---|---|
| info | request completion, `auth.failed`, `xp.awarded`, SSE connect/disconnect |
| warn | `xp.award.replayed`, `rate_limit.rejected`, `external.groq.failed`, `external.storage.failed`, client (4xx) errors |
| error | `readiness.failed`, `database.pool.error`, internal (5xx) errors, unhandled exceptions |

---

## 5. Request Correlation

Every response carries an `X-Request-Id` header (crypto-random UUID). A 50-way
concurrent test proved **distinct** ids per request. The global handler and
pino-http attach request context (`req.id`, `method`, `url`, `statusCode`,
`responseTime`) to every log line, so an operator can trace HTTP → route → DB →
progression → response for a single request. IDs survive error paths (the global
handler logs `req.id` for 5xx).

---

## 6. Health / Readiness / Liveness

| Endpoint | Purpose | DB-down behavior |
|---|---|---|
| `GET /api/healthz` | liveness (process up) | **200** (independent of DB) |
| `GET /api/readyz` | readiness (can serve traffic) | **503** `{status:"unavailable",database:"down"}` |

Readiness depends on PostgreSQL (`SELECT 1`) only — **not** on optional services
(no Groq key required). Verified this session: healthy 200 / DB-down 503 /
recovered 200, with the server surviving the DB stop/start.

---

## 7. Database Failure Diagnostics

Verified failures (executed against a real PostgreSQL cluster):

| Failure | Injection | Behavior | Log |
|---|---|---|---|
| Connection loss | `pg_ctl stop -m fast` | server stays alive; readyz 503; healthz 200 | `database.pool.error` + `readiness.failed` |
| Query failure | int4-overflow reward INSERT | 500, transaction rolls back | global handler (classified `database`) |
| Transaction rollback | int4-overflow mid-award | completion + reward both rolled back | classified error |
| Constraint violation | FK violation on award | 500, no partial state | classified error |
| Timeout | — | not separately injected (see Known Limitations) | — |
| Deadlock | — | not safely reproducible (see Known Limitations) | — |
| Connection exhaustion | — | not separately injected; bounded pool | — |

---

## 8. XP Economy Observability

`xp.awarded` (info) records every legitimate award with `totalXpAfter`,
`levelUp`, and `attributeCount`. `xp.award.replayed` (warn) records every
idempotency-key hit (a duplicate/replay that mints **zero** XP). Diagnostics
**detect and report** — they never silently "repair" XP. Verified invariants:

- sum(`xp_transactions.amount`) == `user_levels.totalXp` (no hidden mint/loss)
- `totalXp` never decreases across a mix of awards + replays
- a failed award leaves no XP mutation behind (rollback integrity)
- a completed quest re-completion mints zero (replay detected)

---

## 9. Reward / Idempotency Telemetry

For protected mutations (`quest completion`, `daily-task completion`, `XP
awards`, `daily generation`, `goal mutation`) the system distinguishes:

- **first execution** → `xp.awarded` (info)
- **duplicate / replay** → `xp.award.replayed` (warn), `alreadyAwarded: true`

The browser-chaos double-click runs produced the definitive sequence: one
`xp.awarded` followed by three `xp.award.replayed` events — exactly one award,
three replays, no double XP. An operator can therefore answer "did the user do
it twice, or did the system process one request twice?" from logs alone.

---

## 10. Rate-Limit Observability

`makeMutationLimiter` and the auth/refresh limiters emit `rate_limit.rejected`
(method + path only — **no user id / request id**, so it cannot enumerate
accounts). Keyed on authenticated user identity for mutations; auth uses a
per-IP 15-minute window. No arbitrary aggressive limits were introduced.

---

## 11. SSE / Realtime Lifecycle

The SSE client registry (`lib/sse-registry.ts`) is the **only** process-global
long-lived structure. Lifecycle:

- `registerClient` on connection open → `sse.connection.opened`
- `unregisterClient` on close/error → `sse.connection.closed`
- `broadcast` failure → `sse.delivery.failed`

Verified: 100-loop connect → disconnect → reconnect leaves the registry at 0
clients (no leak). Disconnected clients are removed on `close`/`error`/`finish`.

---

## 12. External Services

| Service | Success | Failure | Timeout | Fallback | Log |
|---|---|---|---|---|---|
| Groq (AI) | enhance/generate | generic 503 / return original text | 8s (`withTimeout`) | deterministic engine output | `external.groq.failed` |
| Storage (GCS) | upload | generic "Upload failed" | SDK default | none (explicit failure) | `external.storage.failed` |

Verified: AI failure **cannot corrupt deterministic progression** — the
deterministic task/tip text is returned unchanged on any Groq failure, and no
API key, endpoint, or stack is logged.

---

## 13. Performance (measured)

Measured this session against the real server + real PostgreSQL (60 samples per
endpoint, warm cache, single user with goals/tasks/quest/history):

| Endpoint | p50 | p95 | p99 |
|---|---:|---:|---:|
| `/api/healthz` (liveness) | 0.9ms | 1.7ms | 1.8ms |
| `/api/readyz` (readiness + `SELECT 1`) | 1.5ms | 2.2ms | 3.6ms |
| `/api/users/me` | 1.5ms | 2.1ms | 2.8ms |
| `/api/ai/goals` | 1.6ms | 2.7ms | 6.4ms |
| `/api/progression/attribute-history` | 1.7ms | 3.3ms | 27.5ms |
| `/api/ai/life-tip` | 2.6ms | 3.7ms | 6.2ms |
| `/api/progression/summary` | 2.7ms | 4.3ms | 6.7ms |
| `/api/ai/daily-tasks` (generate + wording) | 2.9ms | 5.7ms | 6.5ms |
| `/api/quests` (my) | 3.0ms | 5.3ms | 9.2ms |
| `/api/quests/catalogue` | 3.0ms | 4.5ms | 5.9ms |
| `/api/quests/recommended` | 3.1ms | 4.9ms | 5.3ms |
| `/api/life-engine/streak` | 3.9ms | 12.9ms | 26.3ms |
| `/api/life-engine/daily-plan` | 5.3ms | 9.6ms | 13.6ms |
| `POST /api/ai/goals` (mutation) | 3.5ms | 4.6ms | 4.6ms |

**Slow-query / N+1 / index findings:**

- **No slow queries** — endpoint latency bounds DB latency; heaviest endpoint is
  ~5ms p50.
- **No N+1** — `buildAnalyticsState` fans out its ~9 queries in a single
  `Promise.all`, each bounded (`limit(1)` / `limit(400)`).
- **No unbounded queries** — XP history is capped at `limit(400)`; all hot-path
  lookups are indexed.
- **Index coverage complete** — `userId`-keyed indexes exist on `xp_transactions`,
  `user_quests`, `ai_daily_tasks` (userId+date), `ai_daily_tips` (userId+date),
  `attribute_history`, `messages.conversationId`, `posts`, `user_goals`,
  `refresh_tokens`; `user_levels.userId` and `user_attributes(userId,attribute)`
  are unique.
- **Deterministic engine** is sub-linear per user (existing `performance.test.ts`
  envelope: 10–50× observed bound).

---

## 14. Resource Lifecycle Audit

For every long-lived resource, the event that releases it:

| Resource | Type | Released by |
|---|---|---|
| `pg.Pool` connections | bounded pool | returned on query completion; `'error'` handler drains dead clients; pool reconnect on PG return |
| `sse-registry` `clientsByConversation` Map | **process-global** | `unregisterClient` on `close`/`error`/`finish`; verified returns to 0 after churn |
| `life-engine` `Set`/`Map` instances | request-local | garbage-collected when the request-scoped function returns |
| `objectStorage` client | SDK wrapper | request-local; no retained buffers |
| express `req`/`res` objects | request-scoped | released when the HTTP response completes |
| rate-limiter stores (express-rate-limit) | in-memory, keyed | entries expire per window (15min auth / 10min mutation) |

The known Stage 19/21 architectural concern (in-memory realtime state) is
resolved: the SSE registry is the single global structure, and it is
register/unregister-symmetric with verified zero-accumulation.

---

## 15. Diagnostic Endpoint Security

No public endpoint exposes environment variables, credentials, stack traces,
filesystem paths, or topology. Verified: `healthz`/`readyz` bodies contain no
env material; AI chat failure returns a generic 503 with no `error` field, no
endpoint, no key; the global error handler is the only 5xx surface and returns
a generic body. Protected diagnostics (none currently beyond authenticated
routes) enforce authorization server-side via `requireAuth`.

---

## 16. Incident Reconstruction (executed evidence)

### Incident 1 — Quest completion fails
Determinable from logs: request (`req.id`), user (`xp`/quest rows by userId),
quest (`sourceId`), transaction (SQLSTATE in classified error), failure (500 +
classified `database`), final state (`status != COMPLETED`, no XP txn), XP
impact (zero). Evidence: `failure-injection.test.ts` int4-overflow case.

### Incident 2 — Duplicate quest completion
Determinable: original request (`xp.awarded`), duplicate request
(`xp.award.replayed` ×3), idempotency decision (`idempotencyKey` match,
`alreadyAwarded`), final XP (unchanged after first award). Evidence: browser
chaos S4 + `failure-injection.test.ts` retry case.

### Incident 3 — Daily-task completion transaction fails
Determinable: request, rollback (task `isCompleted` stays false), final task
state, XP state (zero minted). Evidence: `failure-injection.test.ts`
daily-task-overflow case.

### Incident 4 — Database becomes unavailable
Determinable: when failure started (`database.pool.error` timestamp), affected
requests (`readiness.failed` + 503 request lines), recovery (`readyz` → 200),
successful post-recovery request. Evidence: this session's recovery run
(ECONNREFUSED 127.0.0.1:5434 → 200 after restart).

### Incident 5 — AI becomes unavailable
Determinable: AI failure (`external.groq.failed`), deterministic fallback
(returned engine text), recovery (resumes when key/network restored), progression
unaffected (no `xp` mutation). Evidence: `diagnostic-security.test.ts` + code
path in `routes/ai.ts`.

### Incident 6 — SSE client disconnects
Determinable: connection lifecycle (`sse.connection.opened` → `closed`),
cleanup (registry count → 0), reconnect (new `opened`). Evidence:
`sse-lifecycle.test.ts` 100-loop churn.

---

## 17. Alertable Conditions (machine-detectable)

| Severity | Condition | Detectable via |
|---|---|---|
| CRITICAL | database unavailable | `readiness.failed` (category `database`) |
| CRITICAL | repeated transaction failures | classified `transaction` errors, rate of 5xx |
| CRITICAL | XP invariant violation | `xp.economy.*` divergence (ledger vs totalXp) |
| CRITICAL | auth subsystem outage | spike in `auth.failed` with internal cause |
| HIGH | sustained 5xx spike | request-log 5xx rate |
| HIGH | SSE connection leak | `getClientCount` trending up (no closed events) |
| HIGH | external AI failure spike | `external.groq.failed` rate |
| HIGH | abnormal mutation conflict rate | `rate_limit.rejected` rate |
| MEDIUM | elevated latency | pino-http `responseTime` p95 |
| MEDIUM | rate-limit spike | `rate_limit.rejected` count per window |
| MEDIUM | repeated validation failures | classified `validation` 400 rate |

---

## 18. Failure-Injection Matrix (executed evidence)

| Failure | Expected | Observed | Logged | Correlated | Recovered |
|---|---|---|---|---|---|
| DB unavailable | safe failure | readyz 503, healthz 200, **server survives** | ✅ `readiness.failed` + `database.pool.error` | ✅ | ✅ auto on restart |
| DB timeout | rollback | not separately injected (no statement_timeout) | — | — | n/a |
| transaction failure | no partial state | int4-overflow rolls back completion+reward | ✅ classified error | ✅ | ✅ |
| XP reward failure | no divergence | reward INSERT failure → zero XP txn | ✅ classified error | ✅ | ✅ |
| duplicate reward | idempotent | `xp.award.replayed`, zero minted | ✅ | ✅ | ✅ |
| AI unavailable | deterministic fallback | generic 503 / original text returned | ✅ `external.groq.failed` | ✅ | ✅ on key restore |
| SSE disconnect | cleanup/reconnect | registry → 0 after churn | ✅ `sse.connection.closed` | ✅ | ✅ |
| rate limit | safe 429 | 429 + anonymized warn | ✅ `rate_limit.rejected` | ✅ | ✅ window expiry |
| invalid auth | safe rejection | 401 `auth.failed` | ✅ | ✅ | ✅ |
| unexpected exception | safe 500 | generic body, no stack to client | ✅ global handler | ✅ | ✅ |

---

## 19. Findings

| ID | Class | Description | Disposition |
|---|---|---|---|
| D-1 | **D** | PostgreSQL restart crashed the whole API server (unhandled pool `'error'` event). | **FIXED** (`pool.on('error')` in `lib/db/src/index.ts`) + regression test `db-pool-resilience.test.ts` |
| C-1 | C | auth/refresh limiters did not emit `rate_limit.rejected`. | **FIXED** |
| C-2 | C | `database.pool.error` lacked pino-shaped fields. | **FIXED** (now `level/time/pid/hostname`) |
| A-1 | A | `database.pool.error` used `process.env.HOSTNAME` (empty in some containers) instead of `os.hostname()`. | **FIXED** |

---

## 20. Known Limitations

- **DB query timeout** is not separately injected: no `statement_timeout` is set
  on the pool. All measured queries are sub-15ms, so this is low severity, but a
  genuinely hung query would hold a pool connection indefinitely. (Candidate for
  a future `statement_timeout`/`query_timeout` config.)
- **Deadlock** and **connection exhaustion** are not safely reproducible in a
  single-node test and are therefore not separately injected; they are bounded
  by the advisory-lock serialization (`daily-task-concurrency.test.ts`) and the
  bounded pg pool respectively.
- **p95/p99** latency is measured on a single warm node without external Groq
  network latency (no key in sandbox); AI-path latency is therefore not
  representative of production Groq round-trips.

---

## 21. Regression Protection

After the D-1 fix (and the A-1 hostname polish):

- Affected tests (`db-pool-resilience.test.ts`): **3/3**
- Stage 21 concurrency soak: **36/36 × 3, no flake**
- Stage 22 suite: **25/25**
- Full suite: **344/344 (40 files)**
- Typecheck / build / secret scan: **PASS / PASS / clean**
