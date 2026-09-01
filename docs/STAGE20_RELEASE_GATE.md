# Stage 20 — Production Hardening & Anti-Gaming Closure: Release Gate

**Verdict:** 🟡 **YELLOW**

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
| Browser / product E2E journeys | ⛔ **UNVERIFIED** (no Chromium provisioned this reset) |

---

## Why YELLOW (exactly)

The two anti-gaming risks carried forward from Stage 19 (**AG-1** and **AG-2**) are now
**closed with tests**, and every code-level hardening objective (Parts 1–10) is verified
against real PostgreSQL. The full pipeline is regression-protected at **270/270** with clean
typecheck and build.

The single remaining gap is **Part 11 — browser E2E**, which is **UNVERIFIED**: this reset
environment has no Chromium/puppeteer infrastructure, and per the standing no-fabrication rule
it is reported as UNVERIFIED rather than a fabricated PASS. That verification gap (not a code
defect) is what keeps the verdict at YELLOW instead of GREEN.

## Why not GREEN

One verification gate is incomplete: the real-browser product journeys
(signup → onboarding → dashboard → daily plan → quest → XP/level → goals → recommendations →
profile → logout → login, mobile + desktop) have not been executed in a real Chromium browser.
Stage 13 previously closed this via `@sparticuz/chromium` + `puppeteer-core` (npm-reachable),
which could be recreated but was not provisioned in this reset.

## Why not RED

No data-corruption, security, determinism, XP-inflation, or runaway-state defect remains.
Every reproduced defect (below) is fixed with a regression test. The only non-green item is a
verification gap, not a reproduced failure.

## Findings classified (A / B / C / D)

| ID | Class | Finding | Disposition |
|----|-------|---------|-------------|
| AG-1 | CLOSED (was **C** in Stage 19) | Unbounded XP farming via repeatable same-template quest completion | Fixed: template-scoped idempotency key + `/assign` 409 on completed template. Regression: `anti-gaming.test.ts` (13) |
| AG-2 | CLOSED (was **B** in Stage 19) | No rate limiting on quest/task mutation endpoints | Fixed: `makeMutationLimiter()` user-keyed, 120/10 min, mounted on assign/progress/abandon/complete + daily-task complete. Regression: `rate-limiting.test.ts` (3) |
| CONC-1 | **D** | Concurrent `awardXp` race → 500 unique-constraint violation | Reproduced → root cause (READ COMMITTED double re-check) → minimal fix (catch 23505 → `alreadyAwarded`) → regression `progression-integrity.test.ts` (7) |
| EXPL-1 | **C** | 532 `weakness_vs_reason` contradictions (weak-area rec without `WEAK_AREA` reason code) | Fixed: emit `WEAK_AREA` from `detectWeaknesses` set. Regression: `explainability.test.ts` (6) |
| SAN-1 | **C** | Negative/NaN/non-finite/oversized XP and attribute deltas accepted | Fixed: sanitize at award boundary; PATCH path awards no XP. Regression: `security-regression.test.ts` (7) |

**No remaining A / B / C / D-class reproduced defects.** The only open item is the
UNVERIFIED browser E2E (verification gap, not a defect class).

## Blockers (exact)

| Blocker | Class | Smallest concrete action |
|---------|-------|--------------------------|
| BLK-1: browser E2E UNVERIFIED | Verification gap | Provision `@sparticuz/chromium@149` + `puppeteer-core@25` (npm-reachable, per Stage 13), then run the 13-journey matrix on mobile (390×844) + desktop (1440×900). |

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
