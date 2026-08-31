# Stage 16 — Life Engine Foundation: Implementation Report

**Stage:** 16
**Theme:** LIFE ENGINE FOUNDATION
**Scope:** Implement the first five scoped components of the Life Engine — (1) Deterministic Daily Task Engine, (2) Deterministic Life Tip Engine, (3) AI-independent fallback architecture, (4) AI as an optional enhancement, (5) deterministic validation of all AI-generated state changes. Do NOT attempt all 16 proposed engines.

**Architectural principle (enforced):**
> The Life Engine is **AUTHORITATIVE**. AI (Groq) is **NON-AUTHORITATIVE** — it may only explain, converse, generate wording, or interpret natural language. AI never determines XP, levels, quest completion, rewards, streak state, authoritative progress, permissions, security decisions, or database truth.

---

## 1. Summary of Changes

### New module: `artifacts/api-server/src/lib/life-engine/`

| File | Responsibility |
|------|----------------|
| `types.ts` | Engine contracts: `EngineUserState`, `TaskCandidate`, `ScoredCandidate`, `TipRuleKey`, `IntentKey`, re-export of `Attribute`. |
| `templates.ts` | Static content libraries: 28 task templates across 7 attributes (tiered intro/standard/advanced, XP 15–40), a 6-rule tip library, `GOAL_KEY_ATTRIBUTES`, `TIER_LEVEL`, and constants `DAILY_TASK_COUNT=5`, `MIN_TASK_XP=10`, `MAX_TASK_XP=50`. |
| `scoring.ts` | Pure deterministic scoring/ranking/selection + tip-rule detection + date-hash daily rotation. No DB, no I/O, no randomness. |
| `state.ts` | Authoritative state loader (`buildEngineState`) built exclusively from real DB rows. |
| `daily-task-engine.ts` | `generateDailyTasks(userId)` — the Daily Task Engine. |
| `life-tip-engine.ts` | `generateDailyTip(userId)` — the Life Tip Engine. |
| `intents.ts` | `detectIntent` / `buildIntentResponse` — conservative keyword matching for safe chat intents. |
| `index.ts` | Barrel re-exports. |

### Refactored: `artifacts/api-server/src/routes/ai.ts`

- `GET /api/ai/daily-tasks` → deterministic engine first; optional Groq rewording only (non-authoritative presentation).
- `GET /api/ai/life-tip` → deterministic engine first; optional Groq rewording only.
- `POST /api/ai/chat` → deterministic intent pre-processing for safe intents (level, XP, quests, streak, completed-today) answered **without** Groq; open-ended messages fall through to Groq unchanged (chat remains AI-native).
- All existing endpoints (`/goals` GET/POST, `/daily-tasks/:id/complete`, `/chat/history`) preserved with identical contracts.

### New tests: `artifacts/api-server/src/tests/life-engine.test.ts`

31 new tests (16+ required scenarios covered) across pure-function determinism and DB integration.

---

## 2. Part 1 — Deterministic Daily Task Engine ✅

`GET /api/ai/daily-tasks` no longer calls Groq to *generate* tasks. `generateDailyTasks`:

1. Returns the cached rows if the user already has tasks for today (`ai_daily_tasks.date == today`).
2. Otherwise builds `EngineUserState` from real state (goals, XP, level, attributes, recent activity, completion history, archetype, timestamps, streak) and runs `selectTasks`.

**Scoring** (normalized weights, sum = 1.0):

| Factor | Weight | Signal |
|--------|--------|--------|
| Goal relevance | 0.25 | structured `goalKeys` → attributes; free-text goal keyword match |
| Difficulty fit | 0.20 | `level` vs tier representative level (intro 2 / standard 8 / advanced 20) |
| Weakness | 0.20 | task category vs `weakestAttribute` |
| Freshness | 0.15 | not-recently-completed task text + not-recent category |
| Streak value | 0.10 | DISCIPLINE tasks boosted when a streak is live |
| Archetype | 0.10 | task category vs archetype focus areas |

Selection guarantees category diversity (first pass picks the top task of each distinct category, second pass fills remaining slots by score). Tie-breaks are by stable template `id`, making output fully reproducible for identical state.

**No fabricated data** — every score is derived from DB rows or fixed template metadata.

---

## 3. Part 2 — Deterministic Life Tip Engine ✅

`GET /api/ai/life-tip` now uses rule matching (`detectTipRule`) over real state, in precedence order:

1. `inactivity` — `inactiveDays >= 3`
2. `streak_protection` — `inactiveDays == 1 && streak >= 2`
3. `consistency` — completion trend `<= -2`
4. `progression` — completion trend `>= 2`
5. `weakness` — a trained `weakestAttribute` exists
6. `general` — no strong signal

A concrete tip is chosen from the matching rule's curated library via `pickByHash(userId, date)` — deterministic (no randomness), yet varied day-to-day. Always returns a valid tip with no Groq dependency.

---

## 4. Part 3 — AI-independent fallback architecture ✅

The pipeline is: **Deterministic Engine → Authoritative Result → Optional AI Enhancement → Natural-language presentation.**

- No Groq key, Groq failure, or Groq timeout → the deterministic result is returned unchanged.
- `enhanceTaskWording` / `enhanceTipWording` are wrapped in try/catch + an 8s hard timeout (`withTimeout`); any failure falls back to the original engine text.
- `GET /api/ai/daily-tasks` and `GET /api/ai/life-tip` both return valid payloads with `GROQ_API_KEY` unset (verified in smoke tests).

---

## 5. Part 4 — Chat: deterministic pre-processing only ✅

`POST /api/ai/chat` is still AI-native for open-ended coaching. A **conservative keyword layer** (`detectIntent`) handles only five safe intents with zero NLP:

- `level`, `xp`, `quests`, `streak`, `completed_today`

These are answered directly from the Life Engine without Groq. Everything else (open-ended) falls through to Groq exactly as before. Input is bounded (intent layer rejects empty/>200 chars; message truncated to 2000 chars). Missing Groq on open-ended returns the same `503` as before.

---

## 6. Part 5 — Authoritative state protection ✅

Audit result: the only XP/state-mutating path reachable via AI routes is `POST /api/ai/daily-tasks/:id/complete`, which:

- Validates the UUID (`isValidUuid`).
- Enforces ownership (`WHERE id = :id AND user_id = :userId`) — cross-user completion returns 404 (IDOR-verified).
- Reads `xpReward` **from the DB row**, never from client input.
- Uses the existing authoritative `awardXp()` with `idempotencyKey = daily_task_<id>` (idempotent — verified no double-award).

Task **generation** writes only to `ai_daily_tasks` / `ai_daily_tips`; it never touches `xp_transactions`, `user_levels`, `user_attributes`, or `user_quests` (verified by test). Chat and tips are read-only w.r.t. progression.

**No arbitrary-XP, quest-completion, reward, streak, progression, permission, or authorization path was added or weakened.**

---

## 7. Part 6 — Database schema ✅ (ZERO changes)

No schema changes were required. The engine reuses existing tables:

- `ai_daily_tasks` (task cache), `ai_daily_tips` (tip cache), `ai_user_goals` (free-text goals)
- `user_goals` (structured goal keys), `user_levels`, `user_attributes`, `attribute_history`, `xp_transactions`
- `user_characters` + `archetypes` (focus areas), `user_quests` (active quest count)

`SCHEMA CHANGES = NO`.

---

## 8. Part 7 — Tests (minimum 16) ✅ — 31 added, 71/71 total passing

| Area | Scenarios covered |
|------|-------------------|
| Daily task determinism | same-state reproducibility, category diversity, bounded scores, difficulty fit |
| Different goals | goal-key steering changes selection |
| No immediate repeat | recent-task-text exclusion |
| Invalid state fallback | fresh/empty state still yields 5 valid tasks |
| Tip rules | inactivity, streak-protection, consistency, progression, weakness, general + fallback |
| Chat intent | level/xp/quests/streak/completed-today routing; open-ended → null; empty/oversized → null |
| DB integration | 5 tasks for fresh user; cache determinism; no XP side-effect; deterministic tip; well-formed state; `awardXp` idempotency; `countActiveQuests` ownership |

Baseline regression suites (40 tests) all still pass: **71/71 total**.

---

## 9. Part 8 — Offline / deployment potential

| Capability | Local (no network) | Server (DB only) | Server + Groq |
|------------|--------------------|------------------|---------------|
| Daily task generation | ✅ deterministic | ✅ | ✅ + optional reword |
| Life tip generation | ✅ deterministic | ✅ | ✅ + optional reword |
| Chat — data intents | ✅ | ✅ | ✅ |
| Chat — open-ended | ❌ (needs Groq) | ❌ | ✅ |

Everything except open-ended chat is fully deterministic and offline-capable. Full offline sync is **not** implemented (out of scope), only documented.

---

## 10. Part 9 — Performance

Measured against the real PostgreSQL instance (127.0.0.1:5434):

| Metric | Result |
|--------|--------|
| `rankCandidates` (28 templates) | ~0.0076 ms/op |
| `selectTasks(5)` | ~0.0071 ms/op |
| `buildEngineState` (DB, 9 queries) | ~3.5 ms/op |
| `GET /api/ai/daily-tasks` (cached) | ~2–9 ms |
| `GET /api/ai/life-tip` (cached) | ~1.5–2 ms |
| `POST /api/ai/chat` (deterministic intent) | ~8–25 ms |

---

## 11. Part 10 — Security regression checks

| Check | Result |
|-------|--------|
| IDOR (user B completes user A's task) | 404 "Task not found" ✅ |
| Invalid UUID on complete | 400 ✅ |
| Invalid/expired token | 401 ✅ |
| SQLi in chat message | treated as text, never executed ✅ |
| Oversized input (100 KB chat) | bounded to 2000 chars, no crash ✅ |
| Secret leakage (Groq key in responses) | none ✅ |
| Malformed JSON | 400 (existing regression suite) ✅ |

Existing `uuid-validation` (15), `input-validation` (6), and `nonexistent-target` (3) suites all pass.

---

## 12. Part 11 — Regression summary

- **Typecheck** (`tsc --noEmit`): PASS
- **Tests vs real PostgreSQL**: 71/71 PASS (40 baseline + 31 new)
- **Build** (`build.mjs`, esbuild): PASS
- **API smoke** (signup/signin/daily-tasks/life-tip/chat/complete): PASS
- **SSE smoke** (auth 401 / member 403): PASS (+ `sse-auth` 4 tests)
- **Browser smoke** (web `typecheck` + `vite build`): PASS

---

## 13. Final Report

| Field | Value |
|-------|-------|
| DAILY TASK ENGINE | **PASS** |
| LIFE TIP ENGINE | **PASS** |
| AI OPTIONAL | **PASS** |
| CHAT PRESERVED | **PASS** |
| AUTHORITATIVE STATE PROTECTED | **PASS** |
| SCHEMA CHANGES | **NO** |
| TESTS | **71/71** |
| TYPECHECK | **PASS** |
| BUILD | **PASS** |
| SECURITY | **PASS** |
| REGRESSIONS | **0** |

### Constraint compliance

- ✅ Groq NOT removed; chat NOT made deterministic.
- ✅ No unnecessary dependencies (zero new packages).
- ✅ No schema changes.
- ✅ AI never determines authoritative state.
- ✅ Deterministic reproducibility where deterministic is expected.
- ✅ No fabricated data.
- ✅ No security weakening; no unrelated architecture rewrites.
- ✅ Existing API contracts preserved (verified against `use-ai.ts`).
