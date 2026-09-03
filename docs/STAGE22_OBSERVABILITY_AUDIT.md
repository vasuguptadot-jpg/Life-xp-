# Stage 22 — Production Observability, Diagnostics & Operational Resilience: Audit

Stage 22 makes the system **operable**: every failure is observable, classified,
correlated, and recoverable. This document records the observability inventory,
what can fail, what is logged, and the incident-reconstruction story for each
subsystem — plus the one production-integrity defect this stage found and fixed.

## 1. Observability Inventory

| Subsystem | What can fail | What is logged | Severity | Context / correlation | Secret-leak risk |
|---|---|---|---|---|---|
| **Auth** | missing bearer header, invalid/expired token | `auth.failed` (reason, path) | info | path + reason (no user id) | none |
| **Auth rate-limit** | signup/signin/refresh flood | `rate_limit.rejected` (method, path) | warn | endpoint only, anonymized | none |
| **Authorization** | cross-user access (IDOR) | 404/403 via request log | info | request id | none |
| **Database** | connection loss, pool client error, query failure, deadlock, FK violation | `database.pool.error`, `readiness.failed` (category `database`), classified error in global handler | error | request id + SQLSTATE | none (no raw body) |
| **Progression / XP** | award, replay, rollback | `xp.awarded` (totalXpAfter, levelUp), `xp.award.replayed` (idempotency) | info / warn | userId + idempotencyKey | none |
| **Quests** | completion, replay, malformed id | request log + classified error | info | request id | none |
| **AI (Groq)** | provider down/timeout, no key | `external.groq.failed` (operation) → generic 503 | warn | operation | none (no key value) |
| **Chat** | provider failure | `external.groq.failed` → generic 503 body | warn | operation | none |
| **Realtime / SSE** | connect/disconnect, delivery failure | `sse.connection.opened/closed`, `sse.delivery.failed` | info / warn | conversation id | none |
| **Storage (uploads)** | upload failure | `external.storage.failed` → generic "Upload failed" | warn | operation | none |
| **Rate limiting (mutations)** | mutation flood | `rate_limit.rejected` (method, path) | warn | endpoint, anonymized (no user id) | none |
| **Validation** | malformed JSON/UUID/body | classified 400 in request log | info | request id | none |
| **Unknown errors** | unexpected throw | global error handler logs category/status + requestContext | error | request id + stack (server-side only) | none in response |

## 2. Error Taxonomy

`lib/observability.ts` classifies every error into one of:
`validation` / `authentication` / `authorization` / `not_found` / `conflict` /
`rate_limit` / `database` / `transaction` / `external_service` / `timeout` / `internal`.

- `classifyHttpStatus` maps 4xx/5xx status codes to categories (client errors are
  `warn`, internal errors are `error`).
- `classifyError` walks the **cause chain** and maps PostgreSQL SQLSTATE codes
  (e.g. `23505` unique violation → `conflict`, `40001` serialization → `transaction`,
  `40P01` deadlock → `transaction`, `23503` FK violation → `database`).
- Raw DB errors never reach clients; the global error handler returns a generic
  body and logs the classified, structured event server-side.

## 3. Request Correlation

Every response carries an `X-Request-Id` header (crypto-random UUID). A 50-way
concurrent test proved **distinct** ids per request. The global handler and
pino-http attach the request context (`method`, `url`, `statusCode`, `responseTime`,
`req.id`) to every log line, so an operator can trace HTTP → route → DB →
progression → response for a single request.

## 4. Health / Readiness / Liveness

| Endpoint | Purpose | DB-down behavior |
|---|---|---|
| `GET /api/healthz` | liveness (process up) | **200** (independent of DB) |
| `GET /api/readyz` | readiness (can serve traffic) | **503** `{status:"unavailable",database:"down"}` |

Readiness depends on PostgreSQL (`SELECT 1`) only — **not** on optional services
(Groq key is not required). Verified healthy / unavailable / recovered.

## 5. Adversarial Log Audit (executed)

Captured production logs across the browser-chaos and recovery runs and audited:

- **Structured** — JSON with `level`, `time`, `pid`, `hostname`, plus event/category.
- **Correct severity** — `readiness.failed` (level 50), `xp.award.replayed` (level 40),
  request completion (level 30).
- **Correlated** — `req.id` and `X-Request-Id` present on request lines.
- **No secrets** — a grep across all emitted logs for `gsk_`, `password`,
  `authorization`, `bearer`, `api_key`, `session_secret` returned **zero** matches.
- **Operator-actionable** — e.g. `readiness.failed` names the exact failure
  (`connect ECONNREFUSED 127.0.0.1:5434`), and `xp.award.replayed` shows the
  idempotency key so an operator can distinguish a legitimate re-award from a
  replay without reconstructing the DB.

## 6. Findings

| ID | Class | Description | Disposition |
|---|---|---|---|
| D-1 | **D** | **PostgreSQL restart crashed the whole API server.** `new Pool(...)` had no `'error'` listener; when PostgreSQL terminated an in-flight/idle connection, node-postgres re-emitted the client error on the Pool with zero listeners, so Node raised an unhandled `'error'` event and the process exited. A single DB restart took the server down. | **FIXED** — `pool.on('error', …)` handler in `lib/db/src/index.ts` (logs structured, keeps the pool reconnecting). Regression test `db-pool-resilience.test.ts`. |
| C-1 | C | auth/refresh limiters (raw `rateLimit`) did not emit the dedicated `rate_limit.rejected` event (only a 429 in the request log). | **FIXED** — added the anonymized handler, mirroring `makeMutationLimiter`. |
| C-2 | C | `database.pool.error` was emitted via `console.error` without `level`/`time`/`pid` (the shared `@workspace/db` package has no pino dependency). | **FIXED** — emit a pino-shaped JSON line (level 50, time, pid, hostname, event, category, message). |

No unresolved D-class defects remain.

## 7. Diagnostic Endpoint Security

No public endpoint exposes environment variables, credentials, stack traces, or
topology. Verified: `healthz`/`readyz` bodies contain no env material; AI chat
failure returns a generic 503 with no `error` field, no endpoint, no key; the
global error handler is the only 5xx surface and returns a generic body.
