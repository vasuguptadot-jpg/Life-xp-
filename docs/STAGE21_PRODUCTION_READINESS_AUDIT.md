# Stage 21 — LifeXP Production Readiness, Failure Injection & Final Integrity Audit

**Verdict:** 🟡 **YELLOW**

**Date:** 2026-09-01 · **Branch:** `arena/01a05271-life-xp` · **Baseline:** `d0a96672ebd3b0ae696d0f948e9936712b1761a7`

---

## 1. Objective

Stress LifeXP as if real users, unreliable networks, duplicate requests, crashes,
concurrent devices, malicious clients, and partial infrastructure failures will occur —
and find the **silent failures** ordinary happy-path testing misses. The primary target is
silent data-integrity, concurrency, replay, transaction, lifecycle, and failure-mode bugs.

No cosmetic features were added. No speculative architecture was introduced. Every fix below
is backed by a reproduced defect and a regression test.

---

## 2. Baseline recovery

| Item | Result |
|------|--------|
| Remote `arena/01a05271-life-xp` HEAD | `d0a96672ebd3b0ae696d0f948e9936712b1761a7` (Stage 20 closure) |
| Local HEAD after recovery | identical commit (exact recovery, no divergence) |
| PostgreSQL | 18.4 @ `127.0.0.1:5434` (embedded-postgres cluster `/tmp/realpg/data`, DB `lifexp`) |
| Migrations applied + archetypes seeded | 7/7 archetypes |
| Baseline tests (before edits) | **270/270** (25 files) |
| Typecheck / build (before edits) | PASS / PASS |

---

## 3. Part-by-part outcome

### Part 1 — Stage 20 follow-ups (daily XP cap + unique index on `ai_daily_tasks(user_id,date)`)

**Decision: neither was implemented.** Both were re-evaluated against current product
semantics:

- **Daily XP cap — NOT added.** The reward model is already bounded by *repeatability
  controls* (source-level idempotency keys, template-scoped once-only quest completion,
  once-per-task-instance daily-task rewards), not by a daily aggregate. Adding a hidden
  daily cap would be an *arbitrary economic limit* (prohibited by the task) and would
  contradict the deterministic "XP = sum of awarded events" invariant that the longitudinal
  suite enforces. Proof the model stays safe without a cap: `anti-gaming.test.ts` (13) and
  `longitudinal-adversarial.test.ts` ("no XP inflation: totalXp equals sum of awarded
  events").

- **Unique index on `ai_daily_tasks(user_id,date)` — NOT added (would be WRONG).** A daily
  task set legitimately contains **5 rows sharing the same date**, so a plain
  `UNIQUE (user_id, date)` index would reject valid data. The *real* hazard flagged in Stage
  20 — concurrent first-of-day generation minting duplicate 5-task sets (→ double daily XP)
  — **was real and is now closed** with a per-(user,date) `pg_advisory_xact_lock` inside a
  transaction (see Part 2, D-3). Regression: `daily-task-concurrency.test.ts` (3 tests:
  concurrent generation yields exactly one 5-task set; concurrent tip generation yields one
  row; cached set is deterministic).

### Part 2 — Failure injection / transaction integrity (HIGH PRIORITY)

Two silent atomicity defects were **reproduced, root-caused, and fixed**:

| ID | Defect | Root cause | Fix | Regression |
|----|--------|-----------|-----|-----------|
| **D-1** | Quest completion could leave "XP awarded but quest not COMPLETED" (or vice versa) on a mid-transaction failure | status `UPDATE` and XP award ran in **separate** implicit transactions | Single `db.transaction` wrapping status update + `awardXpInTransaction`; `QuestConcurrentError` → 409 on concurrent completion | `failure-injection.test.ts` |
| **D-2** | Daily-task completion could leave "task marked complete but XP missing" | mark-completed and XP award were separate statements | One transaction around mark + award | `failure-injection.test.ts` |
| **D-3** | Concurrent first-of-day task generation could mint duplicate 5-task sets (double daily XP) | check-then-insert race (no unique constraint, no lock) | `pg_advisory_xact_lock(hashtext(user||date))` serializes check-then-insert per (user,date) | `daily-task-concurrency.test.ts` |
| **D-4** | Concurrent daily-tip generation could mint duplicate tip rows | same check-then-insert race | same advisory-lock fix | `daily-task-concurrency.test.ts` |

Real PostgreSQL transactions were used (no mocks). Injected failures include int4-overflow
attribute seeds and near-max STRENGTH values that force the *award step* to fail after the
*status step* — proving the now-atomic path rolls back both together. See
`failure-injection.test.ts` (5 tests): quest atomicity under injected overflow, task atomicity
under injected attribute overflow, retry idempotency, manual tx partial-attribute rollback,
concurrent completion awards once.

### Part 3 — Idempotency audit

Every state-mutating endpoint was traced and classified. **No global idempotency framework was
introduced** — keys exist only where the application genuinely requires them.

| Endpoint | Mutation | Idempotent? | Replay-safe? | Concurrent-safe? | Cross-user safe? |
|----------|----------|-------------|--------------|------------------|------------------|
| `POST /api/quests/:id/complete` | status→COMPLETED + XP | ✅ (alreadyAwarded) | ✅ | ✅ (409 on race) | ✅ (ownership check) |
| `POST /api/quests/:id/abandon` | status→ABANDONED | ✅ (no-op if already) | ✅ | ✅ | ✅ |
| `PATCH /api/quests/:id/progress` | progress field | ✅ (clamped update) | ✅ | ✅ | ✅ |
| `POST /api/quests/assign/:tpl` | insert user_quest | ⚠️ idempotent by key, but **duplicate rows possible** (C-3) | ✅ | ⚠️ (see C-3) | ✅ |
| `POST /api/ai/daily-tasks/:id/complete` | mark + XP | ✅ (alreadyCompleted) | ✅ | ✅ | ✅ |
| `POST /api/ai/goals` | upsert one row | ✅ (latest-wins) | ✅ | ✅ | ✅ |
| `POST /api/ai/chat` | insert messages | ❌ (new row each retry — acceptable, chat) | ✅ (no XP) | ✅ | ✅ |
| `POST /api/social/posts/:id/like` | insert like + counter | ✅ (ON CONFLICT DO NOTHING) | ✅ | ✅ | ✅ |
| `DELETE /api/social/posts/:id/like` | delete like + counter | ✅ (GREATEST(count-1,0)) | ✅ | ✅ | ✅ |
| `POST /api/social/users/:id/follow` | insert follow | ✅ (unique) | ✅ | ✅ | ✅ |
| `POST /api/messages/conversations` | insert conversation | ⚠️ **duplicate threads possible** (C-9) | ✅ | ⚠️ (race) | ✅ |
| `POST /api/auth/signup` | insert user | ❌ (unique email/username → 409 on retry) | ✅ | ✅ | n/a |
| `DELETE /api/users/me` | cascade delete | ⚠️ second call 401 (already gone) | ✅ | ✅ | ✅ |

Regression: `idempotency-audit.test.ts` (6 tests).

### Part 4 — Multi-device concurrency

Same user on multiple devices was simulated with independent authenticated request streams.
Invariants verified: no lost updates, no duplicate rewards, no impossible levels, no negative
attributes, deterministic final state.

- Three devices completing the **same** quest concurrently → exactly one XP award (409 path).
- Three devices completing **different** quests concurrently → totals sum exactly (no lost update).
- Concurrent goal upserts converge to one row (never duplicates).
- Concurrent like/unlike never yields a negative denormalized count and never exceeds the real like-row count.
- Attributes never negative, level never decreases.

Regression: `multi-device-concurrency.test.ts` (5 tests).

### Part 5 — API contract & input-fuzz audit

Every mutating endpoint was attacked with malformed inputs. **No input-fuzz crash (500) was
found on any client error.** Findings:

- Malformed quest progress (negative / non-numeric / object / array) → 4xx, no XP, no crash.
- Malformed goals / chat messages → 4xx.
- Malformed UUIDs → 4xx (never 500) across all mutation endpoints.
- Unexpected enum / extra fields → ignored or coerced safely.

**Finding C-1:** `POST /api/auth/signup` does not validate the *type/format* of `email` — a
non-string value is coerced to text and stored verbatim. Not fixed (no product email spec
exists to validate against; it does not bypass auth or award XP). Regression documents the
behavior: `input-fuzz.test.ts` (8 tests).

### Part 6 — Authentication & session security

Existing coverage (Stage 20) was re-verified: `security-regression.test.ts`,
`rate-limiting.test.ts` (user-keyed, 120/10min), `refresh-rotation.test.ts` (rotated refresh
tokens cannot be replayed — concurrent replay yields at most one success). Added:
account-enumeration checks confirm signup-with-existing-email returns a 4xx and login does
NOT distinguish unknown-email from wrong-password in status code (both generic, non-200).
No speculative auth changes. Regression: `resource-exhaustion.test.ts` (account-enumeration
cases).

### Part 7 — Data lifecycle & deletion integrity

- Account deletion cascades all child data (XP, level, attributes, quests, goals, tasks) — no orphans.
- Abandoned quests award no XP and can be re-assigned (legitimate retry path).

**Finding C-2:** deleting a user leaves an **orphaned one-sided conversation** — the deleted
user's `conversation_members` row is cascade-deleted but the `conversations` row (and the
surviving user's membership) persist, leaving a thread with a single member. No XP/data-loss
impact, but a documented account-deletion gap. Regression: `data-lifecycle.test.ts` (3 tests).

### Part 8 — Time & clock integrity

All legitimate time dependence flows through the single `dayKey()` helper (UTC). Verified:
midnight UTC rollover, leap-day, past/future timestamps, determinism.

**Finding C-7:** all day-boundary features (daily tasks, streaks, momentum) use **UTC** with no
user-timezone concept — a user in Asia/Kolkata (+05:30) experiences the "daily" reset at
05:30 local time. A documented product-policy choice, not a corruption bug. Regression:
`time-integrity.test.ts` (5 tests).

### Part 9 — Engine consistency

Covered by existing suites (re-verified): `determinism.test.ts`, `explainability.test.ts`,
`life-engine*.test.ts`. Every engine is deterministic, bounded, explainable, free of
mutation/side effects/hidden randomness/AI dependency. Cross-engine invariants
(weakness↔reason, momentum↔recovery, difficulty↔completion, plan↔recovery,
recommendations↔goals, forecast↔actual, rotation↔history) hold.

### Part 10 — AI isolation / prompt-safety

Covered by `ai-boundary.test.ts` (re-verified): no deterministic engine imports the Groq SDK;
deterministic intents work with no key; open-ended chat returns 503 gracefully when
unconfigured; deterministic engines never mutate XP/progression; chat never awards XP; user
text is never treated as system instructions (deterministic intent routing only).

### Part 11 — Resource exhaustion

- Oversized JSON body (1.5 MB) → 413, server stays healthy (healthz 200).
- Huge-but-under-limit goals string → bounded by handler (no 500).
- 50 concurrent reads do not corrupt state.

**Finding C-6:** `posts.caption` / `messages.content` are unbounded `TEXT` columns; the
effective per-request cap is the **100 KB `express.json()` default** (no domain-level length
validation). A single user can fill TEXT columns up to 100 KB/request but cannot affect other
users' rows (no shared mutable state). Regression: `resource-exhaustion.test.ts` (5 tests).

### Part 12 — SSE / real-time reliability

Covered: `sse-auth.test.ts` (re-verified) — `?token=` bypass reaches membership (403 not 401),
no-token → 401, invalid token → 401, non-events routes still require Bearer auth.

**Finding C-8:** the SSE client registry is an **in-memory `Map`** (`messages.ts`
`conversationId → Set`). This means: single-node only (no cross-instance delivery), no
message replay after disconnect, and in-flight/undelivered messages are **lost on process
restart**. Duplicate-delivery is prevented within a single node (one registration per
connection), but cross-node and at-least-once semantics are unguaranteed. Documented as a
deployment-architecture risk (no broker). No cross-user leakage was observed.

### Part 13 — 365-day economy simulation

Covered by `longitudinal-adversarial.test.ts` and `longitudinal-simulation.test.ts`
(re-verified). Personas (normal / highly-active / compulsive / quest-farmer / comeback /
inactive / rapid-goal-switcher) all satisfy: monotonic XP/level, `totalXp == Σ awarded events`
(no minting), sqrt-bounded level curve (no runaway), stale weaknesses clear, goal switches
propagate. **No arbitrary economic limits were invented** to make the simulation pass.

### Part 14 — Database integrity

Inspected the **live schema** via `pg_catalog`/`information_schema`. Constraints the app relies
on exist (unique user_levels.user_id, user_attributes(user_id,attribute), post_likes
(user_id,post_id), follows(follower_id,following_id), conversation_members
(conversation_id,user_id), xp_transactions.idempotency_key, users.email/username). Findings:

- **C-3:** `user_quests` unique key is `(user_id, quest_template_id, assigned_at)` — because
  `assigned_at` differs per insert, it **cannot** prevent duplicate active quest *rows* (XP
  is still deduplicated via the template-scoped key).
- **C-4:** `ai_daily_tasks`/`ai_daily_tips` have only a non-unique `(user_id, date)` index —
  correct for tasks (5/date), harmless for tips; concurrency handled at the engine layer.
- **C-5:** `attribute_history` dedup key is `(source_id, attribute)` — `NULL` source_id is
  exempt (`NULL != NULL`); the two real award paths always supply a source_id + the
  `idempotency_key` unique is the primary guard, but a future caller omitting source_id could
  double-award attributes.

Regression: `db-integrity.test.ts` (5 tests).

### Part 15 — Performance

Covered by `performance.test.ts` (re-verified): scales 1/10/100/1000/10,000 users without
per-user degradation; 10k/100k events and 1000 quests within sane bounds; no N+1 / quadratic
degradation.

### Part 16 — Browser chaos testing

**UNVERIFIED.** The Stage 20 Chromium infrastructure (`/tmp/e2e`, `/tmp/al2023` shared-lib
bundle, `@sparticuz/chromium@149`) was **not present** in this session's workspace (the
`/tmp` contents did not survive). Refresh-during-onboarding, double-click, back/forward, and
slow/offline chaos journeys could not be executed. Marked UNVERIFIED with this exact reason —
not fabricated as PASS.

### Part 17 — Production configuration

- **No secrets committed:** secret scan across all tracked files found no real API
  keys/passwords/tokens. Only `.env.example` (placeholder values) is tracked.
- `.env.example` documents every variable with REQUIRED / FEATURE-SPECIFIC / OPTIONAL tiers;
  the server refuses to start without `DATABASE_URL`, `SESSION_SECRET`, `PORT`.
- **CORS:** development allows all origins; production restricts to the `CORS_ORIGINS`
  comma-separated allow-list (`app.ts`), credentials enabled.
- Error handler never leaks stack traces / raw DB details (structured 4xx/500 JSON).
- **No production infrastructure is claimed to exist** — this project has not been deployed;
  the audit is of the application's readiness, not of a live deployment.

### Part 18 — Final adversarial regression

| Gate | Result |
|------|--------|
| Full test suite (real PostgreSQL 18.4) | ✅ **315 / 315** (34 files) |
| Typecheck | ✅ PASS |
| Build | ✅ PASS |
| Failure-injection suite | ✅ 5/5 |
| Concurrency (multi-device + daily-task) | ✅ 8/8 |
| Idempotency audit | ✅ 6/6 |
| Input fuzz | ✅ 8/8 |
| Secret scan | ✅ clean |
| Browser E2E / chaos | ⚠️ UNVERIFIED (no Chromium infra this session) |

---

## 4. Findings summary

| ID | Class | Finding | Disposition |
|----|-------|---------|-------------|
| D-1 | **D** | Quest completion non-atomic (XP vs status divergence on failure) | FIXED — single transaction + 409 race guard |
| D-2 | **D** | Daily-task completion non-atomic | FIXED — single transaction |
| D-3 | **D** | Concurrent daily-task generation minted duplicate 5-task sets (double XP) | FIXED — advisory lock |
| D-4 | **D** | Concurrent daily-tip generation minted duplicate rows | FIXED — advisory lock |
| C-1 | C | signup does not validate email type/format | Documented (no product spec) |
| C-2 | C | account deletion orphans conversations | Documented (deletion gap) |
| C-3 | C | `user_quests` unique key can't prevent duplicate active rows | Documented |
| C-4 | C | `ai_daily_tasks/tips` non-unique (user_id,date) index | Documented (correct for tasks) |
| C-5 | C | `attribute_history` dedup bypassable via NULL source_id | Documented (latent) |
| C-6 | C | unbounded caption/message TEXT (100 KB json cap only) | Documented |
| C-7 | C | UTC day boundary, no user timezone | Documented (product policy) |
| C-8 | C | SSE in-memory Map (single-node, no replay) | Documented (arch) |
| C-9 | C | concurrent conversation creation can mint duplicate threads | Documented (race) |

**No A- or B-class findings.** No silent cross-user data leakage, no XP inflation, no
runaway-state, and no unhandled-crash path was reproduced. The four D-class defects were all
reproduced before being fixed, and each fix has a regression test.

---

## 5. Why YELLOW (not GREEN)

Two verification gaps remain, both honestly reported rather than fabricated:

1. **Part 16 browser chaos testing is UNVERIFIED** — the Chromium infrastructure was not
   present in this session, so refresh/double-click/back-forward/slow/offline journeys were
   not exercised against the real rendered app.
2. **The four D-class atomicity fixes are newly landed in this stage** and, while covered by
   8 new concurrency/failure tests and a full 315/315 regression run, have not been through a
   separate soak/multi-run flake campaign in this session.

Both are verification gaps, not known defects — hence YELLOW rather than RED.

## 6. Smallest concrete actions to reach GREEN

1. Recreate the Chromium chaos harness (as done in Stage 20) and run the minimum chaos
   journey (refresh during onboarding + after completion, double-click submit, back/forward)
   on mobile + desktop; mark Part 16 PASS/FAIL.
2. Run the concurrency + failure-injection suites (12 tests) across 3 consecutive full-suite
   runs to demonstrate no flake.
