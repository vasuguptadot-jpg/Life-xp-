# Stage 17 — Engine Intelligence & Decision Validation Audit

**Result:** ✅ **138 / 138 tests passing** (12 files), typecheck ✅, build ✅, API/Security/SSE/offline smoke ✅.
**Verdict:** **GREEN** — final architecture decision **A** (multi-engine coherent), after 4 confirmed defects were reproduced and fixed with minimal, regression-tested changes.

---

## 1. Scope & method

The Stage 17 question was: *do the deterministic engines make coherent, useful, internally consistent decisions for realistic, extreme, sparse, and contradictory user states?*

Method (per the standing rules): baseline verification first → inspect existing implementation → reproduce every suspected defect before touching code → smallest fix → regression test → rerun affected + full suite. No speculative architecture, no AI added to deterministic features, no schema changes, no fabricated results.

- Baseline confirmed before edits: **110 / 110** tests passing at `503f5e0`, clean tree, real PostgreSQL (v18.4) running on port 5434.
- Every engine module was read end-to-end for the Part 2 contract audit.
- Four candidate defects were **reproduced** in a throwaway `_repro.test.ts` before any source change (that file was deleted after reproduction).
- A grep over the existing test suite confirmed **no existing test depended on the buggy behavior** before fixes were applied.

---

## 2. Confirmed defects (reproduced → root cause → fix → regression test)

### Defect 1 — Recovery workload contradiction (recovery ↔ daily plan)

- **Reproduce:** with broken streak state, `detectRecoveryMode` returns `active: true, suggestedDailyTasks: 3`, but `buildDailyPlan` fed 5 generated tasks returned `recoveryMode: true` while still listing **5** tasks.
- **Root cause:** `daily-plan-engine.ts` computed `totalXp` and mapped the task list over the full `tasks` array, ignoring `recovery.suggestedDailyTasks`.
- **Fix:** `plannedTasks = recovery.active ? tasks.slice(0, recovery.suggestedDailyTasks) : tasks`; all downstream `totalXp`/`estimatedEffort`/returned tasks use `plannedTasks`.
- **Regression:** `life-engine-intelligence.test.ts` → "reduces the daily plan to the recovery-suggested task count" / "keeps the full workload when recovery is inactive".

### Defect 2 — Forecast used active-day pace, overstating progress

- **Reproduce:** 300 XP over 3 active days in the last 7 days → `daysEstimated: 3`, basis "100 XP/day over the last 3 active day(s)".
- **Root cause:** `milestone-forecast-engine.ts` divided recent XP by the count of *active* days, so a user active 3-of-7 days looked 2.3× faster than reality.
- **Fix:** denominator is now a fixed 7 calendar days (`recentXp / 7`); `daysEstimated = ceil(xpNeeded * 7 / recentXp)` (exact integer arithmetic avoids float-ceil drift); basis reads "over the last 7 days".
- **Regression:** "estimates days using a calendar-day pace, not active-day pace" (expects `daysEstimated: 7`) + "returns no date estimate when there is no recent activity".

### Defect 3 — Chat intent over-matching on substrings

- **Reproduce:** `"Can you explain how to lift?"` → `xp`; `"I have a question"` → `quests`; `"what experience do I need"` → `xp`; `"expect the best"` → `xp`; `"give me a book request"` → `quests`.
- **Root cause:** `intents.ts` used `text.includes(word)`, so short tokens `"xp"`/`"quest"` matched inside `"explain"`, `"experience"`, `"expect"`, `"question"`, `"request"`.
- **Fix:** added `escapeRegex` + `tokenMatches`; single-token patterns now require whole-word boundaries (`\b`), multi-word phrases keep substring semantics; added plural variants (`quests`, `streaks`, `goals`, `recommendations`, `weaknesses`, `ranks`, `levels`, etc.).
- **Regression:** 4 negative assertions (no false routing) + 5 positive assertions (genuine xp/quests/level/streak questions still route).

### Defect 4 — Weakness false positives on sparse data

- **Reproduce:** user with `totalXp: 15`, `STRENGTH: 7` → 6 weaknesses, each `score: 55`, `confidence: 0.67`.
- **Root cause:** `weakness-engine.ts` gated the low-attribute gap on `maxAttr > 0` only, so *untrained* attributes (value 0) were reported as "weak" whenever the user had trained any single attribute.
- **Fix:** condition is now `maxAttr > 0 && state.attributes[a] > 0` — an attribute at 0 with no history is "untrained", not "underperforming".
- **Regression:** "reports no weaknesses for a brand-new user", "no weaknesses for a user with a single small training event", "still detects a genuinely TRAINED-but-behind attribute".

---

## 3. Part-by-part findings

| Part | Focus | Result |
|------|-------|--------|
| 1 | Baseline recovery / integrity | ✅ tree recovered to `503f5e0`, 110/110 green before edits |
| 2 | Engine I/O contract audit | ✅ all 15 modules read; contracts documented in matrix |
| 3 | Empty / new-user state | ✅ no false weakness, no phantom momentum, no impossible forecast, no NaN/negative; "insufficient data" vs "poor performance" distinguished |
| 4 | Extreme states A–J | ✅ 0 NaN/Inf/negative values across all engines |
| 5 | Cross-engine consistency matrix | ✅ (see §4) |
| 6 | Contradictory signal cases 1–6 | ✅ coherent user-facing output, 0 bad values |
| 7 | Personalization differentiation | ✅ 5 materially distinct users → 5 distinct plans; identical state → identical output |
| 8 | Determinism / reproducibility | ✅ byte-identical JSON across repeated calls for every engine |
| 9 | Explainability audit | ✅ reasons/signals present (`factors`, `evidence`, `reasonCodes`, `basis`); no additions needed |
| 10 | Decision arbitration | ✅ no contradictions of class C; no arbitration layer added |
| 11 | Mathematical / threshold audit | ✅ boundaries asserted (momentum clamp, difficulty one-step, XP formula, null handling) |
| 12 | Temporal behavior | ✅ controlled timestamps; forecast basis "last 7 days" |
| 13 | Realistic data scale (10/100/1000) | ✅ 0.20–0.37 ms full engine pass; no N+1; no optimization needed |
| 14 | Dependency graph | ✅ flat composition; no duplicated-signal loops (see §5) |
| 15 | Offline / no-AI | ✅ all 11 endpoints + legacy paths work with no `GROQ_API_KEY`; only open-ended chat needs Groq (503 graceful) |
| 16 | Security / user isolation | ✅ two-user IDOR check: 0 leaks; unauthenticated → 401 |
| 17 | Fix confirmed defects | ✅ 4 defects reproduced → fixed → regression-tested |
| 18 | Final regression | ✅ typecheck, 138/138 tests, real PG, build, API/Security/SSE smoke |
| 19 | Architecture decision | ✅ **A** — multi-engine coherent (4 minor fixes applied) |
| 20 | Deliverables | ✅ this doc + RESULTS.json + RELEASE_GATE.md |

---

## 4. Cross-engine consistency matrix (Part 5)

| Pair | Check | Result |
|------|-------|--------|
| recovery ↔ momentum | recovery reads momentum input | ✅ coherent |
| weakness ↔ difficulty | difficulty ladder independent of weakness | ✅ no false coupling |
| momentum ↔ daily plan | falling momentum → "Stabilize"/"Recover" priority | ✅ |
| streak ↔ recovery | broken streak alone does not force recovery (needs inactivity) | ✅ |
| goals ↔ daily plan | goal keys drive focus area / task category | ✅ |
| quest completion ↔ difficulty | completions/abandonments drive ladder step | ✅ |
| behavior ↔ quest rotation | rotation excludes active/completed; stable | ✅ |
| weakness ↔ recommendation | `weakestAttribute` surfaces `WEAK_AREA` reason | ✅ |
| forecast ↔ momentum | forecast uses calendar-day pace, independent of momentum | ✅ |
| daily task ↔ daily plan | plan consumes generated tasks; recovery slices them | ✅ (fixed) |

---

## 5. Dependency graph (Part 14)

Composition is **flat** with a single wiring root:

```
orchestrator.composeDailyPlan(userId)
  ├─ buildAnalyticsState(userId)            (8 bounded parallel queries)
  ├─ generateDailyTasks(userId)
  ├─ recommendDifficulty(state)
  ├─ computeMomentum(state)
  ├─ detectRecoveryMode(state, momentum)
  └─ buildDailyPlan(state, tasks, difficulty, recovery, momentum)

leaf engines (no cross-engine imports): streak, momentum, weakness, difficulty,
  goal, weekly-review, milestone-forecast, behavior, recovery, daily-task, life-tip
shared utilities: templates, scoring, state, analytics
single intra-engine edge: quest-engine → recommendation-engine.recommendQuests
```

**Duplicated-signal analysis:** the only signals read in more than one place are `weakestAttribute` (weakness → recommendation) and goal keys (goal → recommendation/plan), both *read-only* and consistent. No engine mutates state, and no two engines compute the same derived value divergently. No signal loop.

---

## 6. Contradiction classification (Part 10)

Every contradiction discovered resolved to class **D** (concrete correctness defect, fixed at source). No class **C** case (two engines disagreeing on a genuinely ambiguous value) was found, so **no arbitration layer** was introduced.

| # | Contradiction | Class | Disposition |
|---|---------------|-------|-------------|
| 1 | recovery says 3 tasks, plan lists 5 | D | fixed in daily-plan-engine |
| 2 | forecast overstates pace (active vs calendar) | D | fixed in milestone-forecast-engine |
| 3 | intent misroutes "explain"→xp, "question"→quests | D | fixed in intents |
| 4 | weakness flags untrained attributes | D | fixed in weakness-engine |

---

## 7. Performance (Part 13)

Measured full-engine-pass (streak + momentum + weakness + recovery + difficulty + recommendations + goals + weekly review + forecast + behavior) over synthetic event counts, 200 iterations each after warm-up:

| Events | ms / full pass |
|--------|----------------|
| 10 | 0.197 |
| 100 | 0.323 |
| 1000 | 0.372 |

No N+1: `buildAnalyticsState` issues a fixed set of bounded queries regardless of history size. No optimization performed — none warranted.

---

## 8. Offline / no-AI (Part 15) & security (Part 16)

- With `GROQ_API_KEY` **absent**, all 11 `/api/life-engine/*` endpoints, both legacy `/api/ai/daily-tasks` and `/api/ai/life-tip` paths, and `GET /api/progression/daily-plan` returned **200**.
- Open-ended `POST /api/ai/chat` returned **503** (graceful degradation, no crash) — the only surface requiring Groq.
- Two-user IDOR check: user B's engine responses contained **0** occurrences of user A's id across daily-plan, momentum, forecast, behavior, weaknesses.
- Unauthenticated requests to engine endpoints returned **401**.
- SSE smoke: `GET /api/messages/conversations/:id/events` returned `200` with `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
