# Stage 16 — Deterministic Life Engine: Architecture

**Status:** IMPLEMENTED and verified.
**Principle:** The Life Engine is **AUTHORITATIVE**. AI (Groq) is **NON-AUTHORITATIVE** — it may only converse and reword presentation. It never determines XP, levels, quest completion, rewards, streak, authoritative progress, permissions, security decisions, or database truth.

---

## 1. Architecture

```
                 USER STATE (real DB rows only)
                           │
                           ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                        LIFE ENGINE (deterministic)          │
   │  Streak Engine      Momentum Engine     Weakness Engine     │
   │  Recovery Engine    Difficulty Engine   Recommendation Engine│
   │  Goal Engine        Daily Plan Engine   Weekly Review Engine│
   │  Milestone Forecast Behavior Pattern    Quest (Rotation)     │
   │  Daily Task Engine  Life Tip Engine     Chat Intent Layer   │
   └─────────────────────────────────────────────────────────────┘
                           │
                           ▼
                 LIFE PLAN / RECOMMENDATIONS
                           │
                           ▼
                  API (routes/*.ts, no business logic)
```

- **Pure engine modules** (`lib/life-engine/*-engine.ts`) contain no DB, no I/O, no randomness. Identical input state → identical output.
- **Loaders** (`state.ts`, `analytics.ts`) build bounded state snapshots from real tables.
- **Routes** (`routes/life-engine.ts`, `routes/ai.ts`, `routes/progression.ts`) only fetch state and delegate to engines.

---

## 2. Engine catalogue

### 2.1 Streak Engine (`streak-engine.ts`)
- **Inputs:** `AnalyticsState` (active days, current/longest streak, inactivity).
- **Outputs:** `{ currentStreak, longestStreak, streakRisk: none|low|high, missedDays, comebackStatus }`.
- **Rule:** `streakRisk = high` when an active streak is one inactive day from breaking; `low` when protected today; `none` when no streak.
- **Data source:** `xp_transactions.createdAt` (bounded 90d). No new tables.

### 2.2 Momentum Engine (`momentum-engine.ts`)
- **Outputs:** `{ score: 0–100, direction: rising|stable|falling, factors: [{name, value, weight}] }`.
- **Formula (transparent):**
  - `recent_xp` (40%) = `min(100, last7dXP / 200 * 100)`
  - `completion` (30%) = last-7d task completion rate × 100
  - `streak` (20%) = `min(100, streak * 20)`
  - `xp_trend` (10%) = `50 + (last7dXP − prior7dXP)/200 * 50`, clamped; `0` when both windows empty.
  - `score = round(0.4·recent_xp + 0.3·completion + 0.2·streak + 0.1·xp_trend)`
- **Direction:** `rising` if last7d > prior7d × 1.1; `falling` if last7d < prior7d × 0.9 (prior > 0); else `stable`.

### 2.3 Weakness Engine (`weakness-engine.ts`)
- **Outputs:** `WeaknessResult[] = { area, score: 0–100, confidence: 0–1, evidence[], recommendedAction }`.
- **Signals (behavioral only):** low trained attribute value relative to strongest area (only when the user has trained something), low per-category task completion rate, abandoned quests, low recent category XP. Weakness scores < 25 are suppressed.
- **Confidence** = `min(1, evidence.length / 3)`.
- **No psychological/medical claims** — purely product analytics.

### 2.4 Recovery Engine (`recovery-engine.ts`)
- **Outputs:** `{ active, reason, level: none|light|full, suggestedDailyTasks, suggestedDifficulty, priority }`.
- **Triggers:** broken streak after ≥3-day build; ≥2 abandoned quests in 30d; declining momentum (`score<35` & `falling`). **Never resets progress** — only lowers near-term workload/difficulty.

### 2.5 Difficulty Engine (`difficulty-engine.ts`)
- **Outputs:** `{ recommended, xpReward, suggestedQuestType, previousLevel, adjustment: increase|maintain|decrease, reason }`.
- **Policy (bounded, non-punitive):** completion rate ≥70% → increase; 40–70% → maintain; <40% → decrease. Adjustments move at most one step on `EASY→MEDIUM→HARD`.
- **XP:** `EASY 30 / MEDIUM 50 / HARD 80`.

### 2.6 Recommendation Engine (`recommendation-engine.ts`)
- **Outputs:** scored task and quest recommendations with `{ score: 0–100, reasonCodes[] }`.
- **Factors:** goal relevance (25%), difficulty fit (20%), weakness (20%), freshness/novelty (15%), streak preservation (10%), archetype (10%).
- **Reason codes:** `GOAL_RELEVANT`, `WEAK_AREA`, `APPROPRIATE_DIFFICULTY`, `STREAK_PRESERVING`, `NOVEL`, `ARCHETYPE_ALIGNED`.

### 2.7 Goal Decomposition Engine (`goal-engine.ts`)
- **Outputs:** `DecomposedGoal[] = { key, goal, milestones[{title, weeklyObjectives[]}] }`.
- Predefined `GOAL_LIBRARY` (strength, endurance, mind, discipline) + keyword matching for free-text goals + generic fallback. **No LLM.**

### 2.8 Daily Plan Engine (`daily-plan-engine.ts`)
- **Outputs:** `{ date, priority, tasks[], recommendedDifficulty, estimatedEffort, focusArea, recoveryMode, reason }`.
- Composed via `composeDailyPlan()` (orchestrator): tasks + difficulty + recovery + momentum + focus area. Every recommendation has an explainable `reason`.

### 2.9 Weekly Review Engine (`weekly-review-engine.ts`)
- **Outputs:** `{ startDate, endDate, xpEarned, questsCompleted, completionRate, streakPerformance, strongestArea, weakestArea, momentumTrend, recommendedFocus, milestoneProgress }`.

### 2.10 Milestone Forecast Engine (`milestone-forecast-engine.ts`)
- **Outputs:** `{ milestone, xpNeeded, daysEstimated|null, estimatedDate|null, isEstimate: true, basis }`.
- `xpNeeded = 100·level² − totalXp`; `days = ceil(xpNeeded / avgDailyXp)`. Forecasts are **always labelled estimates**, never guarantees.

### 2.11 Behavior Pattern Engine (`behavior-engine.ts`)
- **Outputs:** `BehaviorPattern[] = { pattern, evidence, confidence }`.
- Detects: weekday vs weekend activity, morning/evening consistency, task abandonment, improving/declining consistency. Descriptive only.

### 2.12 Quest Rotation Engine (`quest-engine.ts`)
- **Outputs:** deterministically ordered `Recommendation[]`.
- Excludes active + recently-completed quests; balances categories; tie-breaks by `hash(userId, date, id)` for stable day-to-day rotation (no randomness).

### 2.13 Daily Task Engine (`daily-task-engine.ts`) — from Stage 16 foundation
- 28 task templates across 7 attributes; weighted scoring; category diversity; XP clamped `[10, 50]`; repetition avoidance; cached per user/day.

### 2.14 Life Tip Engine (`life-tip-engine.ts`) — from Stage 16 foundation
- Rule-matched tip library (inactivity/streak-protection/consistency/progression/weakness/general); deterministic date-hash rotation.

### 2.15 Chat Intent Layer (`intents.ts`)
- Conservative keyword matching for 12 intents (level, xp, quests, streak, completed-today, progress, daily-plan, weekly-review, weaknesses, recommendations, goals, momentum). Open-ended → Groq.

---

## 3. Data sources (no schema changes)

| Data | Tables |
|------|--------|
| XP / activity / streak | `xp_transactions`, `user_levels` |
| Attributes | `user_attributes`, `attribute_history` |
| Goals | `user_goals` (structured keys), `ai_user_goals` (free text) |
| Quests | `user_quests`, `quest_templates` |
| Daily tasks / tips | `ai_daily_tasks`, `ai_daily_tips` |
| Archetype | `user_characters`, `archetypes` |

**Database changes: NONE.**

---

## 4. Complexity (Part 21)

| Engine | Complexity | Notes |
|--------|-----------|-------|
| `buildAnalyticsState` | 8 parallel bounded queries | `LIMIT 500` XP (90d), `LIMIT 100` quests, `LIMIT 500` tasks; all indexed by `user_id`. No N+1. |
| Streak / Momentum / Difficulty / Weekly / Forecast | O(n) over ≤500 events | Pure, in-memory. |
| Weakness | O(7·(tasks+quests+xp)) | Bounded. |
| Recommendation (tasks) | O(28 templates) | Constant. |
| Recommendation (quests) | O(active templates) | Bounded. |
| Goal / Behavior / Recovery / Daily-plan | O(1)–O(n) | Pure. |

---

## 5. Deterministic guarantees

- All engine outputs depend only on input state; there is no `Math.random()` in any engine.
- Tie-breaks are by stable ids or `hash(userId, date, id)` (a pure function).
- Verified by tests: byte-identical output for identical state across all engines.

---

## 6. Offline behavior

| Capability | No key / offline |
|------------|------------------|
| Daily tasks, life tips, all 12 Life Engine endpoints | ✅ fully deterministic |
| Chat — data intents | ✅ deterministic |
| Chat — open-ended | ❌ requires Groq (graceful 503) |

---

## 7. AI dependency

| | BEFORE | AFTER |
|---|---|---|
| AI-dependent surface | 3 (daily-tasks, life-tip, chat) | **1 (open-ended chat)** |
| Deterministic AI-replacement | — | daily-tasks, life-tip, + 12 Life Engine endpoints |
| Remaining AI dependency | — | open-ended coaching conversation only |
