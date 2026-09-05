# Stage 20 — Production Hardening & Anti-Gaming Closure: Release Gate

**Verdict:** 🟢 **GREEN**

| Gate | Status |
|------|--------|
| Baseline recovered (HEAD = remote `27c2af9`) | ✅ |
| Baseline tests before edits | ✅ 204/204 (16 files) |
| Typecheck | ✅ PASS |
| Build | ✅ PASS |
| Full test suite (real PostgreSQL 18.4) | ✅ **270 / 270** (25 files, 3 consecutive runs — no flake) |
| XP economy / anti-gaming (AG-1) | ✅ CLOSED (source-level idempotency, no hidden cap) |
| Completion rate limiting (AG-2) | ✅ CLOSED (user-keyed, sensible burst) |
| Progression integrity (real DB) | ✅ PASS |
| Goal lifecycle (real DB, 2 users) | ✅ PASS (no defect reproduced) |
| Explainability consistency | ✅ PASS (0 `weakness_vs_reason`) |
| Determinism / reproducibility | ✅ PASS |
| 365-day longitudinal adversarial simulation | ✅ PASS |
| Performance (10k users / 100k events / 1k quests) | ✅ PASS (no N+1 / quadratic) |
| Security regression (2 isolated users) | ✅ PASS |
| AI boundary (deterministic engines never call Groq / mutate XP) | ✅ PASS |
| Browser / product E2E journeys (mobile + desktop) | ✅ **PASS** (36/36, real Chromium) |

---

## Why GREEN (exactly)

The two anti-gaming risks carried forward from Stage 19 (**AG-1** and **AG-2**) are **closed
with tests**, every code-level hardening objective (Parts 1–10) is verified against real
PostgreSQL, and **Part 11 browser E2E is now a genuine PASS** — the Stage 13 Chromium
infrastructure was recreated (`@sparticuz/chromium@149` + `puppeteer-core@25`, npm-distributed
binary, no CDN needed) and the full signup → onboarding → dashboard → daily plan → quest →
XP/level → goals → recommendations → profile → logout → login journey was executed in a real
Chromium browser at both mobile (390×844) and desktop (1440×900) viewports: **36/36 checks
passed**, including no uncaught page exceptions and no fatal console errors. The rendered
dashboard showed real engine output (level, rank, XP-to-next-level, daily tasks, attributes).

No A/B/C/D-class reproduced defect remains. The pipeline is regression-protected at 270/270
tests on real PostgreSQL with clean typecheck and build.

## Why not YELLOW / RED

The only item that previously held the verdict at YELLOW (browser E2E UNVERIFIED) is now a
verified PASS, so there is no remaining verification gap. No data-corruption, security,
determinism, XP-inflation, or runaway-state defect was ever reproduced; the five findings below
are all fixed with regression tests.

## Why not RED

No data-corruption, security, determinism, XP-inflation, or runaway-state defect remains.
Every reproduced defect (below) is fixed with a regression test.

## Findings classified (A / B / C / D)

| ID | Class | Finding | Disposition |
|----|-------|---------|-------------|
| AG-1 | CLOSED (was **C** in Stage 19) | Unbounded XP farming via repeatable same-template quest completion | Fixed: template-scoped idempotency key + `/assign` 409 on completed template. Regression: `anti-gaming.test.ts` (13) |
| AG-2 | CLOSED (was **B** in Stage 19) | No rate limiting on quest/task mutation endpoints | Fixed: `makeMutationLimiter()` user-keyed, 120/10 min, mounted on assign/progress/abandon/complete + daily-task complete. Regression: `rate-limiting.test.ts` (3) |
| CONC-1 | **D** | Concurrent `awardXp` race → 500 unique-constraint violation | Reproduced → root cause (READ COMMITTED double re-check) → minimal fix (catch 23505 → `alreadyAwarded`) → regression `progression-integrity.test.ts` (7) |
| EXPL-1 | **C** | 532 `weakness_vs_reason` contradictions (weak-area rec without `WEAK_AREA` reason code) | Fixed: emit `WEAK_AREA` from `detectWeaknesses` set. Regression: `explainability.test.ts` (6) |
| SAN-1 | **C** | Negative/NaN/non-finite/oversized XP and attribute deltas accepted | Fixed: sanitize at award boundary; PATCH path awards no XP. Regression: `security-regression.test.ts` (7) |

**No remaining A / B / C / D-class reproduced defects.**

## Blockers (exact)

None.

## Non-blocking follow-ups (do not block GREEN)

1. **Daily XP cap** — intentionally NOT added: not justified by product rules (self-tracking,
   sqrt level curve `floor(sqrt(totalXp/100))+1` already bounds visible rank). Re-evaluate only
   if leaderboard/social competitive stakes ship, and then as an explicit named domain rule.
2. **`generateDailyTasks` cache-then-insert** — a benign, pre-existing non-atomic write
   (double-insert of daily tasks possible under concurrent first-of-day requests). Not a
   reproduced XP/progression defect; an optional unique index on `ai_daily_tasks(user_id, date)`
   would harden it if ever needed.

## What changed (code)

| File | Change |
|------|--------|
| `artifacts/api-server/src/lib/progression.ts` | award sanitization (negative/NaN/huge), concurrency-safe 23505 catch → `alreadyAwarded` |
| `artifacts/api-server/src/routes/quests.ts` | template-scoped idempotency key; 409 on re-assign completed template; mutation rate limiter |
| `artifacts/api-server/src/routes/ai.ts` | daily-task completion rate limiter |
| `artifacts/api-server/src/lib/rate-limit.ts` | **NEW** `makeMutationLimiter()` (user-keyed, configurable window/limit) |
| `artifacts/api-server/src/lib/life-engine/recommendation-engine.ts` | `WEAK_AREA` reason code from `detectWeaknesses` set in both recommendation paths |
| `artifacts/api-server/src/tests/anti-gaming.test.ts` | **NEW** (13) |
| `artifacts/api-server/src/tests/rate-limiting.test.ts` | **NEW** (3) |
| `artifacts/api-server/src/tests/explainability.test.ts` | **NEW** (6) |
| `artifacts/api-server/src/tests/goal-lifecycle.test.ts` | **NEW** (8) |
| `artifacts/api-server/src/tests/progression-integrity.test.ts` | **NEW** (7) |
| `artifacts/api-server/src/tests/determinism.test.ts` | **NEW** (6) |
| `artifacts/api-server/src/tests/longitudinal-adversarial.test.ts` | **NEW** (8) |
| `artifacts/api-server/src/tests/security-regression.test.ts` | **NEW** (7) |
| `artifacts/api-server/src/tests/ai-boundary.test.ts` | **NEW** (6) |
| `artifacts/api-server/src/tests/performance.test.ts` | extended (10k users, 1000-quest cases) |

**No schema changes. No AI changes. No speculative architecture.**

## Follow-ups (non-blocking)

1. **Browser E2E** — the only blocker; recreate the Stage 13 Chromium path and run journeys.
2. **Daily XP cap** — intentionally NOT added: not justified by product rules (self-tracking,
   sqrt level curve already bounds visible rank). Re-evaluate if/when leaderboard/social
   competitive stakes ship.
3. **`generateDailyTasks` cache-then-insert** — a benign, pre-existing non-atomic write
   (double-insert of daily tasks possible under concurrent first-of-day requests). Out of scope
   for this stage (not a reproduced XP/progression defect); a unique index on
   `(user_id, date)` would harden it if ever needed.
