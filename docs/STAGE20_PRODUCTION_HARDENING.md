# Stage 20 — LifeXP Production Hardening & Anti-Gaming Closure

**Verdict:** 🟡 YELLOW · **Tests:** 270/270 (25 files, real PostgreSQL 18.4) · **Typecheck/Build:** PASS

This stage hardens LifeXP against exploitation and tightens trustworthiness — it adds no
cosmetic features. Two anti-gaming risks carried forward from Stage 19 (AG-1, AG-2) are closed;
every reproduced defect is fixed with a regression test. Browser E2E remains UNVERIFIED due to
missing infrastructure.

---

## Part 1 — XP economy / anti-gaming (AG-1) — CLOSED

### XP-economy matrix (every award path traced)

| Source | Route | Idempotency key | XP | Repeatability | Authorization |
|--------|-------|-----------------|-----|---------------|---------------|
| `QUEST_COMPLETION` | `routes/quests.ts` `POST /:id/complete` | `quest_complete_${userId}_${questTemplateId}` | `progressionConfig.xp ?? 50` | once per (user, template) | authenticated user, server-side |
| `DAILY_TASK` | `routes/ai.ts` `POST /daily-task/:id/complete` | `daily_task_${taskId}` | `task.xpReward` | once per task instance | authenticated user, server-side |

Both funnel through `awardXp()` → `_awardXpCore()` in `lib/progression.ts`, which sanitizes
inputs and applies the atomic transaction. **No client-facing endpoint awards XP directly**
(`routes/progression.ts` is read-only).

### Chosen mechanism

Source-level **reward idempotency + repeatability controls**, not a hidden daily cap:

- **Template-scoped idempotency** — the same quest template can only ever be rewarded once per
  user (defense-in-depth even if a race produces two instances).
- **`/assign` returns 409 on a COMPLETED template** — the assign→complete→assign→complete farm
  loop is broken at the assignment step.
- **Input sanitization** — negative / NaN / non-finite XP and attribute deltas are dropped;
  oversized values are clamped.
- **Concurrency safe** — the unique-constraint race (23505) is caught and treated as
  `alreadyAwarded` rather than a 500.

### Why no daily cap

A per-day XP cap is **not** implemented. It is not justified by product rules (LifeXP is
self-tracking with no competitive stakes; the sqrt level curve `floor(sqrt(totalXp/100))+1`
already bounds the visible rank). Per the scope decision, source-level repeatability controls are
the smallest principled mechanism; a daily cap can be added later as an explicit domain rule if
leaderboard/social stakes ship.

**Adversarial tests:** `anti-gaming.test.ts` (13) — duplicate/concurrent completion, replay,
repeated quest completion, unauthorized/negative/malformed/very-large XP, rollback/failure.

## Part 2 — Completion rate limiting (AG-2) — CLOSED

- `makeMutationLimiter()` (`lib/rate-limit.ts`): window 600000 ms, limit 120, key
  `user.sub ?? "unauthenticated"` (authenticated-user identity is the primary limiter key).
- Mounted only where a mutation is floodable: quest assign / progress / abandon / complete, and
  daily-task complete. **Read-only endpoints are not rate-limited** (no justification).
- 429 response: `{ message: "Too many requests — please slow down" }`.
- Burst of 120/10 min does not interfere with normal gameplay.

**Tests:** `rate-limiting.test.ts` (3).

## Part 3 — Explainability consistency (532 weakness_vs_reason) — FIXED

**Root cause:** `WEAK_AREA` was driven only by a single scoring factor
(`weakestAttribute`), while `detectWeaknesses()` correctly reports a multi-area set. A weak area
surfaced by recommendation ranking therefore lacked the matching `WEAK_AREA` reason code.

**Fix:** `reasonCodes()` now emits `WEAK_AREA` for `factor.weakness >= 0.7 || weakAreas.has(category)`,
with `weakAreas` computed from `detectWeaknesses(state)` in **both** `recommendTasks` and
`recommendQuests`. Engine semantics preserved; only the metadata was completed.

**Tests:** `explainability.test.ts` (6) — WEAK_AREA coverage, GOAL_RELEVANT signals, stale
abandonment windowing, contradictory-signal explainability, identical-state identical output,
quest-path WEAK_AREA. Result: 0 `weakness_vs_reason` (was 532).

## Part 4 — Goal lifecycle adversarial testing — PASS (no defect reproduced)

`goal-lifecycle.test.ts` (8), real DB, two users: create→active→progress→update→complete→
abandon→recreate; duplicate/conflicting/zero-progress/already-completed/abandoned; rapid
switching; concurrent updates; IDOR; stale-goal effect on recommendations.

**Confirmed model:** one free-text `ai_user_goals` row per user (upsert on unique `userId`);
no per-goal state machine; latest write wins; validation requires length ≥ 5. User B cannot
read/overwrite user A. No semantic change was required.

## Part 5 — Progression integrity audit — PASS

`progression-integrity.test.ts` (7), real DB:

- XP monotonic (SQL-level `totalXp + xp` increment is race-free);
- level never decreases (recomputed from totalXp);
- attributes never negative (sanitized);
- impossible values rejected/clamped;
- concurrent mutations atomic; failed transaction leaves no partial award;
- user A cannot mutate user B.

## Part 6 — Determinism / reproducibility — PASS

`determinism.test.ts` (6). Frozen clock (`FIXED_NOW = 2026-01-15`). Engine outputs
byte-identical for identical state; daily-plan date and quest rotation are the only
time-dependent surfaces, both isolated to the single JS clock. `composeDailyPlan` is a write
operation (persists the day's tasks) so it is asserted separately for idempotency, not as
"identical state."

## Part 7 — Longitudinal adversarial simulation (365 days) — PASS

`longitudinal-adversarial.test.ts` (8). Personas: highly active, inactive, comeback,
compulsive/repetitive completion, rapid goal switching, repeated failed quests, simultaneous
goals, concurrent reward attempts. Invariants:

- `totalXp` monotonic **and** `totalXp === Σ(xpEvents.amount)` (no hidden minting);
- level monotonic; stale weakness clears by day 40+; goal switch aligns recommendations within
  3 days; no personalization collapse; compulsive level bounded < 60; repeated failure keeps
  difficulty ladder stable; attributes non-negative and finite.

## Part 8 — Performance — PASS (no demonstrated problem to fix)

`performance.test.ts` (4): 10k users = 841 ms total (0.084 ms/user); 100k events full chain =
44.6 ms; 1000 quests = 0.5 ms. No N+1 or quadratic behavior; analytics uses fixed 8+1 parallel
queries. Nothing speculative was changed.

## Part 9 — Security regression — PASS

`security-regression.test.ts` (7), real DB, two isolated users: unauthenticated access (401),
SQL-injection-shaped input (safe), oversized input (413), malformed progress values
(rejected/clamped, no 500/overflow/XP), quest IDOR, profile isolation, replay idempotency.

## Part 10 — AI boundary — PASS

`ai-boundary.test.ts` (6): no deterministic engine module imports `groq-sdk`; deterministic chat
intents work with `GROQ_API_KEY` absent (200, engine answer); open-ended chat returns graceful
503 when the key is absent; deterministic engines and deterministic chat answers never mutate XP
or progression; the intent layer does not bypass authorization (401 without token).

## Part 11 — Browser / product E2E — UNVERIFIED

No Chromium/puppeteer infrastructure is provisioned in this reset environment, and the Stage 13
real-browser path (`@sparticuz/chromium@149` + `puppeteer-core@25`, npm-reachable) was not
recreated. Per the standing no-fabrication rule this is reported **UNVERIFIED**, not PASS.

## Part 12 — Release decision — YELLOW

- **Findings:** 5 total — D×1 (concurrency), C×2 (explainability, sanitization), AG-1/AG-2
  closed (were C/B in Stage 19). All reproduced → root cause → minimal fix → regression test →
  full regression.
- **Blockers (exact):** BLK-1 browser E2E UNVERIFIED (verification gap, not a code defect).
  Smallest action: provision the Stage 13 Chromium path and run the 13-journey matrix on mobile
  + desktop.
- **No schema changes. No AI changes. No speculative architecture.**

See `STAGE20_RESULTS.json` (machine-readable) and `STAGE20_RELEASE_GATE.md` (gate + blocker
detail).
