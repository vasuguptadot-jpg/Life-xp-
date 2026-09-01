import { describe, it, expect } from "vitest";
import { computeMomentum, detectWeaknesses, detectRecoveryMode, recommendDifficulty, recommendTasks, buildDailyPlan } from "../lib/life-engine";
import type { AnalyticsState, Attribute } from "../lib/life-engine/types";

// ── STAGE 19 Part 13 — performance envelope (deterministic pipeline) ─────────
// The full decision chain (momentum → weakness → recovery → difficulty →
// recommendations → daily plan) must stay sub-linear-per-user in practice and
// must not blow up as a user's event history grows. Bounds are intentionally
// generous (10–50× observed) to avoid CI flakiness while still catching
// accidental O(n²) regressions.

const DAY = 86400000;
const ATTRS: Attribute[] = ["STRENGTH","ENDURANCE","MOBILITY","NUTRITION","RECOVERY","DISCIPLINE","KNOWLEDGE"];

function mkState(i: number, eventCount = 90): AnalyticsState {
  const attributes = {} as Record<Attribute, number>;
  ATTRS.forEach((a, j) => { attributes[a] = (i * 31 + j * 17) % 300; });
  const now = Date.now();
  const xpEvents = Array.from({ length: eventCount }, (_, d) => ({
    amount: 5 + ((i + d) % 40),
    createdAt: new Date(now - d * DAY),
    sourceType: "DAILY_TASK" as const,
    category: "daily",
  }));
  const activeDays = new Set<string>();
  for (let d = 0; d < Math.min(40, eventCount); d++) activeDays.add(new Date(now - d * DAY).toISOString().split("T")[0]);
  return {
    userId: `u${i}`, level: 1, totalXp: i * 500, rank: "X", goalsText: "", goalKeys: ["strength"],
    attributes, weakestAttribute: ATTRS[i % 7], archetypeFocusAreas: [], xpEvents, activeDays,
    currentStreak: i % 30, longestStreak: i % 40, inactiveDays: i % 3, missedDays: 0,
    comebackStatus: "none", quests: [], dailyTasks: [], completionTrend: null,
  };
}

function chain(state: AnalyticsState) {
  const momentum = computeMomentum(state);
  const weaknesses = detectWeaknesses(state);
  const recovery = detectRecoveryMode(state, momentum);
  const difficulty = recommendDifficulty(state);
  const recs = recommendTasks(state);
  const tasks = recs.slice(0, 5).map((r, i) => ({
    id: `${state.userId}-${i}`,
    date: "2026-09-01",
    taskText: r.label,
    category: r.category,
    xpReward: 25,
    isCompleted: false,
    completedAt: null,
    createdAt: new Date(),
  }));
  const plan = buildDailyPlan(state, tasks, difficulty, recovery, momentum);
  return { momentum, weaknesses, recovery, difficulty, recs, plan };
}

describe("STAGE 19 — performance envelope (Part 13)", () => {
  it("scales across 1/10/100/1000 users without per-user degradation", () => {
    chain(mkState(0)); // warmup
    let lastPerUser = 0;
    for (const n of [1, 10, 100, 1000]) {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) chain(mkState(i));
      const ms = performance.now() - t0;
      const perUser = ms / n;
      console.log(`[PERF] users=${n} per-user=${perUser.toFixed(3)}ms`);
      // Per-user cost must not degrade as batch grows (no shared quadratic work).
      if (n > 1) expect(perUser).toBeLessThanOrEqual(Math.max(lastPerUser * 3, 1.0));
      lastPerUser = perUser;
    }
  });

  it("handles large event histories (10k / 100k events) within a sane bound", () => {
    for (const e of [10000, 100000]) {
      const s = mkState(0, e);
      const t0 = performance.now();
      chain(s);
      const ms = performance.now() - t0;
      console.log(`[PERF] events=${e} full-chain=${ms.toFixed(1)}ms`);
      // Generous bound: ~50× observed 42ms at 100k events.
      expect(ms).toBeLessThan(2000);
    }
  });
});
