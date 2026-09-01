import { describe, it, expect } from "vitest";
import { ATTRIBUTES } from "@workspace/db/schema";
import type { AnalyticsState, Attribute } from "../lib/life-engine/types";
import {
  analyzeStreak, computeMomentum, detectWeaknesses, detectRecoveryMode,
  recommendDifficulty, recommendTasks, decomposeGoals, buildWeeklyReview,
  forecastNextMilestone, analyzeBehavior, buildDailyPlan,
} from "../lib/life-engine";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const day = (d: number) => new Date(now - d * DAY);

function attrs(p: Partial<Record<Attribute, number>> = {}): Record<Attribute, number> {
  const o = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) o[a] = 0;
  return { ...o, ...p };
}
function st(o: Partial<AnalyticsState> = {}): AnalyticsState {
  return {
    userId: "u", level: 1, totalXp: 0, rank: "Initiate", goalsText: "", goalKeys: [],
    attributes: attrs(), weakestAttribute: null, archetypeFocusAreas: [], xpEvents: [],
    activeDays: new Set(), currentStreak: 0, longestStreak: 0, inactiveDays: 0, missedDays: 0,
    comebackStatus: "none", quests: [], dailyTasks: [], completionTrend: null, ...o,
  };
}

// Recursively detect NaN / Infinity / negative numbers in a JSON-ish value.
function badNumbers(v: unknown, path = "$"): string[] {
  const out: string[] = [];
  if (typeof v === "number") {
    if (Number.isNaN(v)) out.push(`${path}=NaN`);
    else if (!Number.isFinite(v)) out.push(`${path}=Inf`);
    else if (v < 0) out.push(`${path}=${v} (<0)`);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => out.push(...badNumbers(x, `${path}[${i}]`)));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out.push(...badNumbers(x, `${path}.${k}`));
  }
  return out;
}

function runAll(s: AnalyticsState) {
  const momentum = computeMomentum(s);
  const recovery = detectRecoveryMode(s, momentum);
  const difficulty = recommendDifficulty(s);
  const tasks = Array.from({ length: 5 }, (_, i) => ({
    id: `t${i}`, date: "2026-09-01", taskText: `T${i}`, category: "STRENGTH" as Attribute,
    xpReward: 20, isCompleted: false, completedAt: null, createdAt: new Date(),
  }));
  return {
    streak: analyzeStreak(s),
    momentum,
    weaknesses: detectWeaknesses(s),
    recovery,
    difficulty,
    recommendations: recommendTasks(s),
    goals: decomposeGoals(s),
    weeklyReview: buildWeeklyReview(s, momentum),
    forecast: forecastNextMilestone(s),
    behavior: analyzeBehavior(s),
    dailyPlan: buildDailyPlan(s, tasks, difficulty, recovery, momentum),
  };
}

describe("STAGE 17 audit — extreme states (Part 4)", () => {
  const states: Record<string, AnalyticsState> = {
    A_empty: st(),
    B_huge_level: st({ level: 100, totalXp: 1_000_000 }),
    C_huge_xp_event: st({ xpEvents: [{ amount: 1e9, createdAt: day(0), sourceType: "X", category: null }], currentStreak: 99999, longestStreak: 99999 }),
    D_sparse_single_event: st({ totalXp: 5, attributes: attrs({ STRENGTH: 3 }), xpEvents: [{ amount: 5, createdAt: day(0), sourceType: "X", category: "STRENGTH" }] }),
    E_all_max_attributes: st({ attributes: attrs({ STRENGTH: 999, ENDURANCE: 999, DISCIPLINE: 999, NUTRITION: 999, KNOWLEDGE: 999, RECOVERY: 999, MOBILITY: 999 }), totalXp: 9999 }),
    F_broken_streak: st({ currentStreak: 0, longestStreak: 50, inactiveDays: 30, missedDays: 30, comebackStatus: "restart" }),
    G_negative_lookalike: st({ level: 0, totalXp: 0 }),
    H_many_quests: st({ quests: Array.from({ length: 200 }, (_, i) => ({ id: `q${i}`, templateId: `t${i}`, status: (["COMPLETED", "ABANDONED", "IN_PROGRESS"] as const)[i % 3], category: ATTRIBUTES[i % 7], difficulty: "HARD", assignedAt: day(i % 90), completedAt: i % 3 === 0 ? day(i % 90) : null })) }),
    I_many_daily_tasks: st({ dailyTasks: Array.from({ length: 500 }, (_, i) => ({ date: day(i % 90).toISOString().split("T")[0], category: ATTRIBUTES[i % 7], isCompleted: i % 2 === 0, completedAt: i % 2 === 0 ? day(i % 90) : null, xpReward: 30 })) }),
    J_future_timestamps: st({ xpEvents: [{ amount: 100, createdAt: new Date(now + 10 * DAY), sourceType: "X", category: null }], dailyTasks: [{ date: "2099-01-01", category: "STRENGTH", isCompleted: true, completedAt: new Date(now + 10 * DAY), xpReward: 30 }] }),
  };

  it("produces no NaN/Inf/negative values for any extreme state", () => {
    for (const [name, s] of Object.entries(states)) {
      const all = runAll(s);
      const bad = badNumbers(all);
      console.log(`[EXTREME ${name}] bad-values=${bad.length}${bad.length ? " :: " + bad.join(", ") : ""}`);
      expect(bad, `${name}: ${bad.join(", ")}`).toEqual([]);
    }
  });
});

describe("STAGE 17 audit — contradictory signals (Part 6)", () => {
  it("observes coherent user-facing output for each contradiction", () => {
    const cases: Record<string, AnalyticsState> = {
      // 1. high current streak but no recent XP (stale)
      c1: st({ currentStreak: 30, longestStreak: 30, xpEvents: [{ amount: 10, createdAt: day(20), sourceType: "X", category: null }] }),
      // 2. rising XP but broken streak
      c2: st({ currentStreak: 0, longestStreak: 2, xpEvents: [{ amount: 500, createdAt: day(0), sourceType: "X", category: null }] }),
      // 3. all attributes maxed but level 1 / no XP
      c3: st({ level: 1, totalXp: 0, attributes: attrs({ STRENGTH: 999, ENDURANCE: 999, DISCIPLINE: 999, NUTRITION: 999, KNOWLEDGE: 999, RECOVERY: 999, MOBILITY: 999 }) }),
      // 4. many completed quests but zero XP events
      c4: st({ quests: Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, templateId: `t${i}`, status: "COMPLETED", category: "STRENGTH", difficulty: "HARD", assignedAt: day(3), completedAt: day(1) })), xpEvents: [] }),
      // 5. falling trend but active today
      c5: st({ currentStreak: 1, inactiveDays: 0, xpEvents: [{ amount: 1, createdAt: day(0), sourceType: "X", category: null }, { amount: 500, createdAt: day(6), sourceType: "X", category: null }] }),
      // 6. goal says strength, but only mind attributes trained
      c6: st({ goalKeys: ["strength"], goalsText: "get stronger", attributes: attrs({ KNOWLEDGE: 300, NUTRITION: 200 }), totalXp: 500 }),
    };
    for (const [name, s] of Object.entries(cases)) {
      const all = runAll(s);
      const bad = badNumbers(all);
      const c = { recoveryActive: all.recovery.active, recoveryReason: all.recovery.reason, direction: all.momentum.direction, difficulty: all.difficulty.recommended, planPriority: all.dailyPlan.priority, topRec: all.recommendations[0]?.category ?? null, topRecScore: all.recommendations[0]?.score ?? null };
      console.log(`[CONTRADICTION ${name}] ${JSON.stringify(c)}`);
      expect(bad, `${name}: ${bad.join(", ")}`).toEqual([]);
    }
  });
});

describe("STAGE 17 audit — personalization differentiation (Part 7)", () => {
  it("yields 5+ materially distinct daily plans for 5 materially distinct users", () => {
    const users: AnalyticsState[] = [
      st({ goalKeys: ["strength"], attributes: attrs({ STRENGTH: 300, ENDURANCE: 10 }), weakestAttribute: "ENDURANCE", currentStreak: 12 }),
      st({ goalKeys: ["mind"], attributes: attrs({ KNOWLEDGE: 300, NUTRITION: 10 }), weakestAttribute: "NUTRITION", currentStreak: 0, longestStreak: 0, inactiveDays: 3 }),
      st({ goalKeys: ["discipline"], attributes: attrs({ DISCIPLINE: 300, RECOVERY: 10 }), weakestAttribute: "RECOVERY", level: 25, totalXp: 50000 }),
      st({ goalKeys: ["balance"], archetypeFocusAreas: ["MOBILITY", "RECOVERY"], currentStreak: 1, comebackStatus: "re_entry" }),
      st({ goalKeys: [], attributes: attrs({ MOBILITY: 5 }), level: 1, totalXp: 0 }),
    ];
    const signatures = users.map((u) => {
      const momentum = computeMomentum(u);
      const recovery = detectRecoveryMode(u, momentum);
      const difficulty = recommendDifficulty(u);
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        id: `t${i}`, date: "2026-09-01", taskText: `T${i}`, category: u.goalKeys[0]?.toUpperCase() as Attribute ?? "STRENGTH",
        xpReward: 20, isCompleted: false, completedAt: null, createdAt: new Date(),
      }));
      return JSON.stringify(buildDailyPlan(u, tasks, difficulty, recovery, momentum));
    });
    // All five plans differ from one another.
    const unique = new Set(signatures);
    console.log(`[PART7] ${signatures.length} users → ${unique.size} distinct daily plans`);
    expect(unique.size).toBe(signatures.length);
  });
});

describe("STAGE 17 audit — temporal behavior (Part 12)", () => {
  it("forecast basis shifts with controlled timestamps", () => {
    const s = st({ level: 2, totalXp: 100, xpEvents: [{ amount: 100, createdAt: day(0), sourceType: "X", category: null }] });
    const f = forecastNextMilestone(s);
    console.log(`[TEMPORAL] recent=1d → daysEstimated=${f.daysEstimated} basis="${f.basis}"`);
    expect(f.daysEstimated).toBe(21); // 100/7 ≈ 14.3/day → 300 needed → ceil(300*7/100)=21
  });
});
