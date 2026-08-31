# Stage 15 — AI-Dependency Architectural Analysis (Life Engine)

**Branch:** `arena/01a05271-life-xp` · **Date:** 2026-09-01 · **Analysis-only (no code/schema changes)**

This document maps every AI dependency in the current codebase, classifies each,
designs the deterministic "Life Engine" that can replace or absorb it, and
identifies new capabilities that require no AI API at all. Conclusions are based
solely on the actual repository (traced execution paths, not filenames).

---

## 1. Complete AI dependency map

Every Groq/LLM touchpoint in the repository lives in **one file**
(`artifacts/api-server/src/routes/ai.ts`). There are no background workers,
cron jobs, or queues; the only timed behavior is the SSE heartbeat in
`messages.ts`. The full inventory:

| # | Endpoint | LLM call? | Input | Output | Execution path |
|---|---|---|---|---|---|
| 1 | `GET /api/ai/goals` | **No** | userId | `{goals, updatedAt}` | `use-ai.ts` → `ai.ts` → read `ai_user_goals` |
| 2 | `POST /api/ai/goals` | **No** | userId, `{goals}` (free text ≥5 chars) | saved goal row | `dashboard/quests` modal → `ai.ts` → upsert `ai_user_goals` → invalidate today's tasks/tips |
| 3 | `GET /api/ai/daily-tasks` | **Yes** | userId → `getUserContext` (level, XP, attributes, goals) | 5 tasks `[{taskText, category, xpReward}]` | `useDailyTasks` → `ai.ts` → **Groq `llama-3.3-70b-versatile`** → parse JSON → cache in `ai_daily_tasks` |
| 4 | `POST /api/ai/daily-tasks/:id/complete` | **No** | userId, taskId | `{task, xp}` | `useCompleteTask` → `ai.ts` → mark complete → **`awardXp()`** deterministic engine |
| 5 | `GET /api/ai/life-tip` | **Yes** | userId → context | `{tip, category, date}` | `useLifeTip` → `ai.ts` → **Groq** → cache in `ai_daily_tips` |
| 6 | `GET /api/ai/chat/history` | **No** | userId | message list | `useChatHistory` → `ai.ts` → read `ai_chat_messages` |
| 7 | `POST /api/ai/chat` | **Yes** | userId, `{message}` + context + 12-msg history | `{message, id}` | `ai-coach-panel.tsx` → `useSendMessage` → `ai.ts` → **Groq** → persist in `ai_chat_messages` |

**Frontend consumers:** `artifacts/web/src/hooks/use-ai.ts` (all 7 endpoints),
`pages/dashboard.tsx` (daily tasks ring, life tip, goal modal, AI coach panel),
`pages/quests.tsx` (goal editor + "Today's AI Tasks" section),
`components/ai-coach-panel.tsx` (chat UI, hardcoded "Powered by Groq · llama-3.3-70b").

**Deterministic engines that ALREADY exist in the codebase:**

- `lib/progression.ts` — `awardXp()` + `calculateLevel()` (`floor(sqrt(totalXp/100))+1`). This is the **XP Engine + Level Engine** and is already authoritative (idempotent, transactional, deduplicated).
- `routes/social.ts` `/posts/personalized` — a **weighted-scoring Recommendation Engine** already scoring posts by `recency*0.5 + likes*0.2 + goalRelevance*0.4`. This is proof that the multi-factor-scoring pattern is already idiomatic here.
- `routes/quests.ts` `/recommended` — currently a trivial "not-yet-active" filter (no scoring) — a natural home for a Quest Engine.
- `scripts/src/seed-archetypes.ts` — a static **Archetype registry** (7 archetypes with `focusAreas` attribute pairs).

---

## 2. Classification of current AI features

Only **three** features actually invoke Groq. The rest are DB reads/writes that
are merely *named* "ai".

| Feature | Category | Justification |
|---|---|---|
| **Daily task generation** (`GET /daily-tasks`) | **A — 100% ENGINE REPLACEABLE** | Task selection is bounded: 7 fixed categories × templated, level-gated actions × XP from a deterministic difficulty formula. No open-ended reasoning. |
| **Life tip** (`GET /life-tip`) | **A — 100% ENGINE REPLACEABLE** | A curated tip library keyed by rule-match (weakest attribute / active goal / streak state) fully replaces it. LLM only improves prose. |
| **AI coach chat** (`POST /chat`) | **C — AI-NATIVE** | Open-ended natural-language coaching conversation; genuinely requires an LLM. (A deterministic intent/FAQ layer can cover common questions — see §7 hybrid.) |
| goals GET/POST | *(not AI)* | Pure DB read/write; mislabeled. |
| daily-tasks complete | *(not AI)* | Already deterministic via `awardXp()`. |
| chat history | *(not AI)* | Pure DB read. |

---

## 3. The Life Engine — proposed deterministic engines

For each candidate engine: whether an equivalent exists, the data it needs, the
deterministic rules it can use, what it powers, and whether it is offline/LLM-free.

Legend — **data available today** from the schema, no migration needed.

| # | Engine | Exists? | Data needed (all in schema today) | Deterministic rules | Powers | Offline | No Groq |
|---|---|---|---|---|---|---|---|
| 1 | **XP Engine** | ✅ `awardXp()` | `xp_transactions`, `user_levels` | idempotent award, category, dedupe | all XP events | ✅ | ✅ |
| 2 | **Level Engine** | ✅ `calculateLevel()` | `user_levels.totalXp` | sqrt curve + rank names | level/rank display | ✅ | ✅ |
| 3 | **Quest Engine** | ⚠️ partial (`/recommended` unscored) | `quest_templates` (category, difficulty, primaryAttributes, compatibleGoals, progressionConfig), `user_quests` | weighted candidate score (see §5) | smart quest rotation, adaptive difficulty | ✅ | ✅ |
| 4 | **Streak Engine** | ❌ | `xp_transactions.createdAt` per day | consecutive-day detection over timestamp series | streak display, streak protection | ✅ | ✅ |
| 5 | **Habit Engine** | ❌ (daily tasks exist but aren't analyzed) | `ai_daily_tasks` (category, isCompleted, completedAt, date) | per-category completion rate, consistency | habit tracking | ✅ | ✅ |
| 6 | **Goal Engine** | ⚠️ storage only | `user_goals` (goalKey, isPrimary, text) | goal↔attribute mapping, milestone decomposition | goal decomposition, relevance scoring | ✅ | ✅ |
| 7 | **Progression Engine** | ✅ read-only endpoints | `xp_transactions`, `attribute_history`, `user_attributes` | moving averages, deltas | summaries, charts | ✅ | ✅ |
| 8 | **Recommendation Engine** | ✅ in `posts/personalized` | posts, hashtags, goals, likes | weighted multi-factor score | personalized feed (already live), quest/task recs | ✅ | ✅ |
| 9 | **Personalization Engine** | ⚠️ naive | attributes, archetype focusAreas, activityLevel | weakness/top-attribute ranking | dashboard ordering | ✅ | ✅ |
| 10 | **Daily Mission Engine** | ⚠️ (LLM-driven today) | goals + attributes + recent activity + quests | rule/template selection + scoring (replaces Groq) | daily tasks | ✅ | ✅ |
| 11 | **Achievement Engine** | ❌ | derived from `xp_transactions`/`user_quests` | threshold rules (first quest, 10-day streak, level N) | achievements/badges | ✅ | ✅ |
| 12 | **Challenge Engine** | ❌ | quest templates + attributes | community/self challenge construction | challenges | ✅ | ✅ |
| 13 | **User State Engine** | ⚠️ fragmented | onboarding + levels + attributes + quests + goals | aggregate snapshot | single source of truth for all engines | ✅ | ✅ |
| 14 | **Health-Score Engine** | ❌ | `user_profiles` (weight/height/dob/activityLevel) + attributes | BMI/activity/consistency composite | health dashboard | ✅ | ✅ |
| 15 | **Behavior-Score Engine** | ❌ | timestamps across all tables | consistency, momentum, anomaly detection | momentum score, recovery mode | ✅ | ✅ |
| 16 | **Recovery Engine** | ❌ | activity gap detection + low RECOVERY attr | inactivity window + overtraining heuristics | comeback system, recovery mode | ✅ | ✅ |
| 17 | **Difficulty Engine** | ⚠️ static (`difficulty` string) | quest completion rate + level | adaptive difficulty curve | adaptive quests | ✅ | ✅ |
| 18 | **Adaptive Quest Engine** | ❌ | difficulty engine + quest engine | adjust targetValue/XP by performance | adaptive quests | ✅ | ✅ |
| 19 | **Notification Decision Engine** | ❌ | streak, recovery, momentum signals | rule/priority queue | when/what to notify | ⚠️ needs push infra | ✅ |
| 20 | **Reward Engine** | ⚠️ implicit in `progressionConfig` | progressionConfig + difficulty | deterministic XP/attribute allocation | reward consistency | ✅ | ✅ |
| 21 | **Profile/Archetype Engine** | ✅ seed + `user_characters` | archetypes, focusAreas | attribute-focus matching | class selection, personalization | ✅ | ✅ |
| 22 | **Leaderboard Engine** | ✅ `social.ts` `/leaderboard` | `user_levels.totalXp` | rank by XP | leaderboard (already live) | ✅ | ✅ |

**Conclusion:** ~6 of 22 engines already exist in some form; the remaining 16 are
derivable from data already in the schema, meaning **most require zero database
changes** (only streaks/achievements would benefit from dedicated tables for
authoritative storage, and even those can be derived on read).

---

## 4. Deterministic replacement design for each current AI feature

### 4a. Daily task generation → Daily Mission Engine

```
USER STATE (level, attributes, goals, archetype)
   ↓
GOALS  → map free-text / goalKey to attribute targets
   ↓
RECENT ACTIVITY (attribute_history, xp_transactions, today's completed tasks)
   ↓
STREAK + LEVEL + DIFFICULTY
   ↓
RULE ENGINE (template library: {category × level-tier × goal} → task templates)
   ↓
MISSION CANDIDATES → SCORING (weakest attribute, goal relevance, novelty) → TOP 5
   ↓
DAILY TASKS
```

- **100% engine-replaceable.** The 7 categories are fixed; the task text is
  templated ("Do N sets of M <exercise>"), XP is `10–50` clamped by difficulty
  (the exact clamp already exists in `ai.ts`). No open-ended generation needed.
- **AI role (optional):** rewrite a selected task's phrasing, or add a
  motivational one-liner — never the selection itself.

### 4b. Life tip → Rule-matched tip library

```
USER STATE → DETECTED PATTERN (weakest attribute, streak-at-risk, recent lull, level-up)
   ↓
RULE MATCH → curated tip template (category-tagged, backed by a fact)
   ↓
TIP (deterministic, varied by daily rotation/novelty)
```

- **100% engine-replaceable.** The no-key fallback already returns a static
  generic tip; upgrading it to a rule-matched library keyed on the *weakest
  attribute* / *active goal* / *streak state* makes it personalized without Groq.
- **AI role (optional):** enrich wording; keep a deterministic default so the
  feature never degrades to empty.

### 4c. Goal assistance → Goal Engine (decomposition)

```
goal category + difficulty + timeframe + level + history
   ↓
goal validation (category known? measurable? single vs. multi)
   ↓
milestones (split target into level-gated sub-targets)
   ↓
quest decomposition (map milestones → quest templates via compatibleGoals)
   ↓
XP allocation (per-milestone via Reward Engine)
```

- **Mostly engine-replaceable** for structured goals. Free-form NLP
  interpretation of an arbitrary sentence ("I want to get better at life") is the
  only part that benefits from an LLM.

---

## 5. Going beyond if/else — techniques that fit LifeXP

The codebase already contains one **weighted-scoring** engine
(`posts/personalized`), so these patterns are idiomatic and low-risk to extend:

| Technique | Where it fits |
|---|---|
| **Weighted scoring / multi-factor ranking** | Quest candidate score, daily-mission selection, feed, dashboard ordering |
| **Rule engine (template library + matcher)** | Daily tasks, life tips, achievements, notifications |
| **Finite-state machines** | Quest lifecycle (ASSIGNED→IN_PROGRESS→COMPLETED/ABANDONED), onboarding steps, user lifecycle (active/lapsing/recovered) |
| **Event-driven engine** | `awardXp()` is already the single chokepoint — attach streak/achievement/notification hooks to verified events |
| **Priority queue** | Notification Decision Engine (which signal fires first) |
| **Feature vectors** | User state vector `[7 attributes, level, streak, momentum]` for similarity/recommendation |
| **Adaptive difficulty** | `difficulty = f(completion rate, recent failures, level)` — Elo-style or EMA of success ratio |
| **Moving averages / trend detection** | XP/week, attribute deltas, consistency over rolling windows |
| **Anomaly detection** | Behavior-Score: flag drops below a z-score/percentile of the user's own baseline |
| **Bayesian/statistical** | Streak-break probability to prioritize streak-protection actions |
| **Behavior classification** | Cluster activity by hour-of-day/day-of-week to schedule tasks |

**Concrete example — Quest Candidate Score:**

```
score = w1·goalRelevance(compatibleGoals ∩ user goals)
      + w2·weaknessBoost(lowest attribute ∈ primaryAttributes)
      + w3·habitRelevance(category matches recently-consistent habit)
      + w4·difficultyFit(|questDifficulty − adaptiveDifficulty(user)| small)
      + w5·streakPreservation(quest preserves imminent streak)
      + w6·novelty(1 − recentlyCompleted(quest))
      + w7·context(matches current recovery/momentum state)
```

Rank candidates and assign the top-N — no LLM invents anything.

---

## 6. Offline-first capability matrix

| Feature | Fully Offline | Partially Offline | Requires Server | Requires AI |
|---|---|---|---|---|
| Dashboard (static + cached state) | ✅ (read) | ✅ (write sync) | ✅ (multi-device sync) | ❌ |
| XP | ✅ | | ✅ (authoritative) | ❌ |
| Levels | ✅ | | ✅ | ❌ |
| Quests | ✅ (assign/complete) | | ✅ | ❌ |
| Daily missions | ✅ (engine-generated) | | ✅ | ❌ (optional wording) |
| Streaks | ✅ | | ✅ | ❌ |
| Achievements | ✅ | | ✅ | ❌ |
| Goals | ✅ | | ✅ | ❌ |
| Progress | ✅ | | ✅ | ❌ |
| Leaderboard | | ✅ (cached) | ✅ (global) | ❌ |
| Recommendations | ✅ (local scoring) | | ✅ (social data) | ❌ |
| Notifications | | ✅ | ✅ (push infra) | ❌ |
| Personalization | ✅ | | ✅ | ❌ |
| Profile | ✅ | | ✅ | ❌ |
| Archetypes | ✅ | | ✅ | ❌ |
| Health tracking | ✅ | | ✅ | ❌ |
| Statistics | ✅ | | ✅ | ❌ |
| **AI coach chat** | ❌ | ❌ | ✅ | ✅ (required) |

**Estimated offline capability of the *deterministic* surface: ~95%** (everything
except the AI chat and global social sync). The only hard external dependencies
are: an LLM (chat only) and server reachability for cross-user data.

---

## 7. "AI as enhancement" architecture — does it fit?

Yes — and it is **already the direction of the codebase**:

- `awardXp()` is authoritative and unreachable from clients (progression has no
  public award endpoint).
- Quest completion, level calculation, permissions, and reward allocation are
  all deterministic server-side events today.
- The only places AI is authoritative are the three Groq call-sites — and two of
  them (tasks, tips) are content-generation, not state transitions.

**Target architecture (already compatible):**

```
           LIFE ENGINE (deterministic, authoritative)
           │  XP, levels, quests, streaks, rewards, permissions, scoring
           │
    ┌──────┴───────┐
    ↓              ↓
Engine result   AI Enhancement (optional, non-authoritative)
(always works)  │  wording, explanations, coaching, creative quest text
    │              │
    └──────┬───────┘
           ↓
     USER EXPERIENCE
```

**AI must NOT** be responsible for: awarding XP, completing quests, calculating
levels, streaks, permissions, rewards, scores, or authoritative progress. The
current code already enforces this — the change needed is only to make
daily-tasks and life-tip engine-owned with optional AI wording, and to keep chat
AI-native with graceful degradation (which it already has: 503 + fallbacks).

---

## 8. New high-value features (no AI API required)

Assessed against the current schema for immediate implementability:

| Feature | Implementable now? | Needs |
|---|---|---|
| **Adaptive quests** (difficulty from performance) | ✅ | logic only (completion rate + level) |
| **Dynamic daily plan** (goals+time+habits+performance) | ✅ | logic only (replaces LLM tasks) |
| **Weakness detection** (lowest attribute) | ✅ | logic only (`user_attributes`) |
| **Momentum score** (recent consistency) | ✅ | logic only (`xp_transactions` timestamps) |
| **Recovery mode** (temporary difficulty decrease) | ✅ | logic only (gap detection) |
| **Streak protection** (prioritize streak-saving actions) | ✅ | logic only (derived streaks) |
| **Goal decomposition** (goal→milestones→quests) | ✅ | logic only (`user_goals` + `quest_templates`) |
| **Smart quest rotation** (avoid repetition) | ✅ | logic only (novelty term vs `user_quests`) |
| **Behavior pattern detection** (trends) | ✅ | logic only (`attribute_history`, `xp_transactions`) |
| **Personal difficulty curve** (learn challenge level) | ✅ | logic only |
| **Reward optimization** (deterministic XP) | ✅ | logic only (`progressionConfig`) |
| **Weekly review engine** (structured report) | ✅ | logic only (aggregate history) |
| **Personalized dashboard** (reorder by behavior) | ✅ | logic only (reuse feed-scoring) |
| **Comeback system** (re-entry progression) | ✅ | logic only (inactivity window) |
| **Milestone forecasting** (ETA to goal) | ✅ | logic only (rate extrapolation) |
| **Consistency score** (vs. raw volume) | ✅ | logic only |

**All 16 are implementable now** from existing tables; none require new schema
(the only *optional* additions are dedicated streak/achievement tables for
authoritative persistence, and a `last_seen_activity_at` column for cheaper
inactivity queries — not required for a first cut).

---

## 9. Architectural impact (proposal only — nothing implemented)

| Concern | Required for the full vision | Minimal first cut |
|---|---|---|
| New tables | streak, achievement, notification (optional) | none (derive on read) |
| New columns | `users.last_seen_activity_at` (optional index aid) | none |
| New API endpoints | `/engine/daily-plan`, `/engine/insights`, `/engine/weekly-review`, `/engine/streaks` | add engine read endpoints |
| Background workers / cron | streak rollover, daily mission reset, weekly report | none (lazy compute on request) |
| Event system | attach streak/achievement hooks to `awardXp()` | none (recompute from history) |
| New frontend screens | Insights, Achievements, Weekly Review | reuse existing cards |
| New services | `lib/engine/*` (scoring, streak, difficulty, missions) | one `lib/engine` module |
| Caching | daily mission/tip cache (already exists) | reuse `ai_daily_*` tables |
| Indexes | `xp_transactions(user_id, created_at)`, `attribute_history` | existing indexes mostly suffice |

**Note:** the `ai_daily_tasks` / `ai_daily_tips` tables can be reused verbatim as
the deterministic engine's cache — only the *generation* source changes from Groq
to the engine.

---

## 10. Cost / reliability analysis

| Dimension | Current (Groq) | Engine (deterministic) | Hybrid |
|---|---|---|---|
| Latency | ~1–3s LLM round-trip | <5ms (DB + rules) | engine latency + optional LLM |
| Cost | per-token API cost | $0 | optional per-token only when requested |
| Reliability | depends on external provider | deterministic, always available | engine always available; AI best-effort |
| Offline | ❌ | ✅ | ✅ (core), AI optional |
| Determinism | low (temperature 0.7–0.8) | high (identical input → identical result) | high core |
| Testability | hard (nondeterministic, needs key) | trivial (pure functions) | core trivial |
| Privacy | sends context to third party | all local | local unless AI requested |
| Scalability | provider rate limits | linear, DB-bound | linear |
| Failure modes | 503/500, empty, unparseable JSON (already handled) | none (bounded) | degraded to engine |
| UX | rich but nondeterministic | predictable, consistent | best of both |

The codebase **already implements all failure-mode handling** for Groq (try/catch
→ empty/fallback, 503 for chat) — so the hybrid path is low-risk.

---

## 11. Final recommendation

| Current AI feature | Engine replacement | AI still useful? | Recommended architecture |
|---|---|---|---|
| Daily task generation | Daily Mission Engine (templates + scoring) | Optional wording only | **ENGINE-OWNED** (hybrid wording) |
| Life tip | Rule-matched tip library | Optional enrichment | **ENGINE-OWNED** (hybrid wording) |
| AI coach chat | Deterministic FAQ/intents for common Qs | Yes — core is conversational | **HYBRID** (intent layer → AI for open-ended) |
| Goals (GET/POST) | n/a (already deterministic) | No | unchanged |
| Daily-task complete | n/a (`awardXp()`) | No | unchanged |
| Chat history | n/a | No | unchanged |

### Summary of decisions

1. **BECOME ENGINE-OWNED:** daily-task generation, life-tip generation.
2. **BECOME HYBRID:** AI coach chat (deterministic intent/FAQ for common
   questions, AI for open-ended conversation); optional AI wording on tasks/tips.
3. **REMAIN AI:** open-ended coaching conversation (the only genuinely
   AI-native feature).
4. **NEW ENGINE FEATURES TO BUILD:** adaptive quests, dynamic daily plan,
   weakness detection, momentum/consistency score, recovery mode, streak
   protection, goal decomposition, smart quest rotation, weekly review,
   milestone forecasting, comeback system, behavior-pattern detection.
5. **FULLY OFFLINE:** everything except AI chat and cross-user social sync.
6. **STILL REQUIRE EXTERNAL INFRASTRUCTURE:** AI chat (LLM), and any
   server-side cross-user features (leaderboard, messaging) — the latter only
   needs the API server, no AI.

---

## Final metrics

- **CURRENT AI DEPENDENCY (Groq-invoking):** 3 features
- **100% ENGINE REPLACEABLE:** 2 (daily tasks, life tip)
- **ENGINE + OPTIONAL AI (hybrid):** 1 (coach chat — deterministic intents + AI for open-ended)
- **GENUINELY AI-NATIVE:** 1 (open-ended coach conversation)
- **NEW ENGINE FEATURES IDENTIFIED:** 16
- **POTENTIAL OFFLINE CAPABILITY:** ~95% of deterministic surface
- **CODE CHANGES:** 0 (this stage)
- **DATABASE CHANGES:** 0 (this stage)
- **FINAL RECOMMENDATION:** Move daily tasks and life tips to a deterministic
  "Life Engine" (templated/rule-based, with optional AI wording), keep the coach
  chat AI-native but add a deterministic intent/FAQ layer, and build the 16 new
  deterministic engine features — all from existing data, no schema changes
  required for a first cut. AI becomes a non-authoritative enhancement.
