import { describe, it, expect } from "vitest";
import { ATTRIBUTES } from "@workspace/db/schema";
import type { AnalyticsState, Attribute, QuestTemplate } from "../lib/life-engine/types";
import {
  analyzeStreak,
  buildDailyPlan,
  computeMomentum,
  detectIntent,
  detectRecoveryMode,
  detectWeaknesses,
  forecastNextMilestone,
  recommendDifficulty,
  recommendTasks,
  rotateQuests,
  decomposeGoals,
  buildWeeklyReview,
  analyzeBehavior,
} from "../lib/life-engine";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
function day(daysAgo: number): Date { return new Date(now - daysAgo * DAY); }

function attrs(patch: Partial<Record<Attribute, number>> = {}): Record<Attribute, number> {
  const out = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) out[a] = 0;
  return { ...out, ...patch };
}

function st(overrides: Partial<AnalyticsState> = {}): AnalyticsState {
  return {
    userId: "u1", level: 1, totalXp: 0, rank: "Initiate", goalsText: "", goalKeys: [],
    attributes: attrs(), weakestAttribute: null, archetypeFocusAreas: [], xpEvents: [],
    activeDays: new Set(), currentStreak: 0, longestStreak: 0, inactiveDays: 0, missedDays: 0,
    comebackStatus: "none", quests: [], dailyTasks: [], completionTrend: null, ...overrides,
  };
}

function fakeTasks(n: number, xp = 20) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`, date: "2026-09-01", taskText: `Task ${i}`, category: "STRENGTH" as Attribute,
    xpReward: xp, isCompleted: false, completedAt: null, createdAt: new Date(),
  }));
}

// ── Regression tests for confirmed Stage 17 defects ─────────────────────────

describe("STAGE 17 regression — intent over-matching (defect 3)", () => {
  it("does not route 'explain' to the xp intent", () => {
    expect(detectIntent("Can you explain how to lift?")).toBeNull();
  });
  it("does not route 'question' to the quests intent", () => {
    expect(detectIntent("I have a question")).toBeNull();
  });
  it("does not route 'experience'/'expect' to the xp intent", () => {
    expect(detectIntent("what experience do I need")).toBeNull();
    expect(detectIntent("expect the best")).toBeNull();
  });
  it("does not route 'request' to the quests intent", () => {
    expect(detectIntent("give me a book request")).toBeNull();
  });
  it("still routes genuine xp/quest/level/streak questions", () => {
    expect(detectIntent("how much xp do I have")).toBe("xp");
    expect(detectIntent("what quests do I have")).toBe("quests");
    expect(detectIntent("what level am I")).toBe("level");
    expect(detectIntent("what is my streak")).toBe("streak");
    expect(detectIntent("my XP total")).toBe("xp");
  });
});

describe("STAGE 17 regression — weakness: insufficient data ≠ poor performance (defect 4)", () => {
  it("reports no weaknesses for a brand-new user (all-zero attributes)", () => {
    expect(detectWeaknesses(st())).toEqual([]);
  });
  it("reports no weaknesses for a user with a single small training event", () => {
    // totalXp=15, STRENGTH=7: everything else is untrained, not weak.
    const w = detectWeaknesses(st({ totalXp: 15, attributes: attrs({ STRENGTH: 7 }) }));
    expect(w).toEqual([]);
  });
  it("still detects a genuinely TRAINED-but-behind attribute", () => {
    const w = detectWeaknesses(st({
      attributes: attrs({ STRENGTH: 100, ENDURANCE: 5 }),
      totalXp: 500,
      xpEvents: Array.from({ length: 10 }, (_, i) => ({ amount: 50, createdAt: day(i), sourceType: "DAILY_TASK", category: "STRENGTH" })),
    }));
    expect(w.map((x) => x.area)).toContain("ENDURANCE");
  });
});

describe("STAGE 17 regression — recovery vs daily plan workload (defect 1)", () => {
  it("reduces the daily plan to the recovery-suggested task count", () => {
    const s = st({ currentStreak: 0, longestStreak: 5, inactiveDays: 2 });
    const momentum = computeMomentum(s);
    const recovery = detectRecoveryMode(s, momentum);
    expect(recovery.active).toBe(true);
    expect(recovery.suggestedDailyTasks).toBeLessThan(5);

    const plan = buildDailyPlan(s, fakeTasks(5), recommendDifficulty(s), recovery, momentum);
    expect(plan.tasks).toHaveLength(recovery.suggestedDailyTasks);
  });

  it("keeps the full workload when recovery is inactive", () => {
    const s = st();
    const momentum = computeMomentum(s);
    const recovery = detectRecoveryMode(s, momentum);
    expect(recovery.active).toBe(false);
    const plan = buildDailyPlan(s, fakeTasks(5), recommendDifficulty(s), recovery, momentum);
    expect(plan.tasks).toHaveLength(5);
  });
});

describe("STAGE 17 regression — forecast calendar-day denominator (defect 2)", () => {
  it("estimates days using a calendar-day pace, not active-day pace", () => {
    // 300 XP over 3 active days in the last 7 days.
    const s = st({
      level: 2, totalXp: 100,
      xpEvents: [0, 2, 4].map((d) => ({ amount: 100, createdAt: day(d), sourceType: "X", category: null })),
    });
    const f = forecastNextMilestone(s);
    // xpNeeded = 300; calendar pace = 300/7 ≈ 42.9/day → ~7 days, NOT 3.
    expect(f.xpNeeded).toBe(300);
    expect(f.daysEstimated).toBe(7);
    expect(f.basis).toContain("last 7 days");
  });

  it("returns no date estimate when there is no recent activity", () => {
    const f = forecastNextMilestone(st({ level: 2, totalXp: 100 }));
    expect(f.daysEstimated).toBeNull();
    expect(f.estimatedDate).toBeNull();
    expect(f.isEstimate).toBe(true);
  });
});

// ── Cross-engine consistency (Part 5) ───────────────────────────────────────

describe("STAGE 17 — cross-engine consistency", () => {
  it("declining momentum does not silently keep full difficulty when recovery triggers", () => {
    const s = st({
      level: 10, currentStreak: 0, longestStreak: 0, inactiveDays: 0,
      xpEvents: Array.from({ length: 3 }, (_, i) => ({ amount: 5, createdAt: day(i + 8), sourceType: "X", category: null })),
      dailyTasks: [{ date: day(0).toISOString().split("T")[0], category: "STRENGTH", isCompleted: false, completedAt: null, xpReward: 20 }],
    });
    const momentum = computeMomentum(s);
    const recovery = detectRecoveryMode(s, momentum);
    // Regardless of recovery, the plan's recommended difficulty must never be HARD
    // while recovery is active.
    const plan = buildDailyPlan(s, fakeTasks(5), recommendDifficulty(s), recovery, momentum);
    if (recovery.active) {
      expect(plan.recommendedDifficulty).toBe("EASY");
    }
  });

  it("recommendations surface the weakest area (weakness → recommendation)", () => {
    const s = st({ goalKeys: ["strength"], attributes: attrs({ STRENGTH: 100, ENDURANCE: 5 }), weakestAttribute: "ENDURANCE" });
    const recs = recommendTasks(s);
    // ENDURANCE (weak) should rank near the top given the weakness factor.
    const enduranceRec = recs.find((r) => r.category === "ENDURANCE");
    expect(enduranceRec?.reasonCodes).toContain("WEAK_AREA");
  });

  it("a broken streak alone does NOT force recovery mode", () => {
    // Longest streak 3, but currently active every day (currentStreak=3, inactiveDays=0).
    const s = st({ currentStreak: 3, longestStreak: 3, inactiveDays: 0 });
    const recovery = detectRecoveryMode(s, computeMomentum(s));
    expect(recovery.active).toBe(false);
  });

  it("daily plan priority reflects a falling-momentum state", () => {
    const s = st({
      currentStreak: 0, longestStreak: 0,
      xpEvents: [
        { amount: 200, createdAt: day(10), sourceType: "X", category: null },
      ],
    });
    const momentum = computeMomentum(s);
    // recent (7d) XP = 0, prior (8-14d) XP = 200 → falling
    expect(momentum.direction).toBe("falling");
    const recovery = detectRecoveryMode(s, momentum);
    const plan = buildDailyPlan(s, fakeTasks(5), recommendDifficulty(s), recovery, momentum);
    if (recovery.active) {
      expect(plan.priority).toContain("Recover");
    } else {
      expect(plan.priority).toContain("Stabilize");
    }
  });
});

// ── Determinism / reproducibility (Part 8) ──────────────────────────────────

describe("STAGE 17 — determinism across engines", () => {
  const fixture = st({
    level: 6, totalXp: 1200, goalKeys: ["strength"],
    attributes: attrs({ STRENGTH: 80, ENDURANCE: 10 }),
    currentStreak: 3,
    xpEvents: [{ amount: 50, createdAt: day(0), sourceType: "DAILY_TASK", category: "STRENGTH" }],
    dailyTasks: [{ date: day(0).toISOString().split("T")[0], category: "STRENGTH", isCompleted: true, completedAt: day(0), xpReward: 25 }],
    quests: [{ id: "q", templateId: "t", status: "COMPLETED", category: "STRENGTH", difficulty: "EASY", assignedAt: day(5), completedAt: day(4) }],
  });

  it("produces byte-identical output across repeated calls for every engine", () => {
    const momentum = computeMomentum(fixture);
    const run = () => JSON.stringify([
      analyzeStreak(fixture),
      momentum,
      detectWeaknesses(fixture),
      detectRecoveryMode(fixture, momentum),
      recommendDifficulty(fixture),
      recommendTasks(fixture),
      decomposeGoals(fixture),
      buildWeeklyReview(fixture, momentum),
      forecastNextMilestone(fixture),
      analyzeBehavior(fixture),
    ]);
    expect(run()).toBe(run());
    expect(run()).toBe(run());
  });

  it("two users with identical state receive identical recommendations", () => {
    const a = recommendTasks({ ...fixture, userId: "a" });
    const b = recommendTasks({ ...fixture, userId: "b" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("materially different histories produce materially different recommendations", () => {
    const strengthUser = recommendTasks(st({ goalKeys: ["strength"] }));
    const mindUser = recommendTasks(st({ goalKeys: ["mind"] }));
    expect(JSON.stringify(strengthUser)).not.toBe(JSON.stringify(mindUser));
    // Strength-oriented user's top pick should be a STRENGTH task.
    expect(strengthUser[0].category).toBe("STRENGTH");
  });
});

// ── Boundary / mathematical audit (Part 11) ─────────────────────────────────

describe("STAGE 17 — boundary values", () => {
  it("momentum clamps to [0, 100] for extreme inputs", () => {
    const huge = st({ xpEvents: [{ amount: 1_000_000, createdAt: day(0), sourceType: "X", category: null }], currentStreak: 9999 });
    const m = computeMomentum(huge);
    expect(m.score).toBeLessThanOrEqual(100);
    expect(m.score).toBeGreaterThanOrEqual(0);
  });

  it("difficulty never jumps more than one ladder step", () => {
    const ladder = ["EASY", "MEDIUM", "HARD"] as const;
    const highLevel = 25; // base HARD
    const s = st({ level: highLevel, quests: Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, templateId: `t${i}`, status: "ABANDONED", category: "X", difficulty: "HARD", assignedAt: day(5), completedAt: null })) });
    const d = recommendDifficulty(s);
    const base = "HARD";
    expect(Math.abs(ladder.indexOf(d.recommended) - ladder.indexOf(base))).toBeLessThanOrEqual(1);
  });

  it("weekly review reports null areas for an all-zero attribute user", () => {
    const s = st();
    const r = buildWeeklyReview(s, computeMomentum(s));
    expect(r.strongestArea).toBeNull();
    expect(r.weakestArea).toBeNull();
    expect(r.completionRate).toBeNull();
    expect(r.xpEarned).toBe(0);
  });

  it("weekly review xpToNextLevel matches progression formula (level^2 * 100)", () => {
    const s = st({ level: 4, totalXp: 950 });
    const r = buildWeeklyReview(s, computeMomentum(s));
    // 100*4^2 - 950 = 1600 - 950 = 650
    expect(r.milestoneProgress.xpToNextLevel).toBe(650);
  });

  it("quest rotation is stable and excludes active/completed quests", () => {
    const templates: QuestTemplate[] = [
      { id: "t1", title: "A", category: "STRENGTH", difficulty: "EASY", primaryAttributes: ["STRENGTH"], compatibleGoals: ["strength"] },
      { id: "t2", title: "B", category: "ENDURANCE", difficulty: "EASY", primaryAttributes: ["ENDURANCE"], compatibleGoals: ["endurance"] },
      { id: "t3", title: "C", category: "KNOWLEDGE", difficulty: "EASY", primaryAttributes: ["KNOWLEDGE"], compatibleGoals: ["mind"] },
    ];
    const s = st({ quests: [{ id: "q1", templateId: "t1", status: "IN_PROGRESS", category: "STRENGTH", difficulty: "EASY", assignedAt: day(1), completedAt: null }] });
    const r1 = rotateQuests(s, templates, 3);
    const r2 = rotateQuests(s, templates, 3);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(r1.map((r) => r.id)).not.toContain("t1");
  });
});
