import { describe, it, expect, beforeAll } from "vitest";
import { ATTRIBUTES } from "@workspace/db/schema";
import type { AnalyticsState, Attribute, QuestTemplate } from "../lib/life-engine/types";
import {
  analyzeStreak,
  comebackStatusOf,
  computeMomentum,
  detectWeaknesses,
  detectRecoveryMode,
  recommendDifficulty,
  recommendTasks,
  recommendQuests,
  rotateQuests,
  decomposeGoals,
  buildWeeklyReview,
  forecastNextMilestone,
  analyzeBehavior,
  detectIntent,
} from "../lib/life-engine";
import { DAILY_TASK_COUNT, levelDifficulty } from "../lib/life-engine/templates";

const DAY = 24 * 60 * 60 * 1000;

function attrs(patch: Partial<Record<Attribute, number>> = {}): Record<Attribute, number> {
  const out = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) out[a] = 0;
  return { ...out, ...patch };
}

function st(overrides: Partial<AnalyticsState> = {}): AnalyticsState {
  return {
    userId: "u1",
    level: 1,
    totalXp: 0,
    rank: "Initiate",
    goalsText: "",
    goalKeys: [],
    attributes: attrs(),
    weakestAttribute: null,
    archetypeFocusAreas: [],
    xpEvents: [],
    activeDays: new Set(),
    currentStreak: 0,
    longestStreak: 0,
    inactiveDays: 0,
    missedDays: 0,
    comebackStatus: "none",
    quests: [],
    dailyTasks: [],
    completionTrend: null,
    ...overrides,
  };
}

const now = Date.now();
function day(daysAgo: number): Date {
  return new Date(now - daysAgo * DAY);
}

describe("Streak Engine", () => {
  it("reports no streak for a fresh user", () => {
    const a = analyzeStreak(st());
    expect(a.currentStreak).toBe(0);
    expect(a.longestStreak).toBe(0);
    expect(a.streakRisk).toBe("none");
    expect(a.comebackStatus).toBe("none");
  });

  it("flags a streak at risk when inactive for one day", () => {
    const a = analyzeStreak(st({ currentStreak: 4, inactiveDays: 1 }));
    expect(a.streakRisk).toBe("high");
  });

  it("keeps risk low when the streak is active today", () => {
    const a = analyzeStreak(st({ currentStreak: 4, inactiveDays: 0 }));
    expect(a.streakRisk).toBe("low");
  });

  it("classifies comeback tiers from inactivity", () => {
    expect(comebackStatusOf(2)).toBe("none");
    expect(comebackStatusOf(3)).toBe("re_entry");
    expect(comebackStatusOf(7)).toBe("comeback");
    expect(comebackStatusOf(14)).toBe("restart");
  });
});

describe("Momentum Engine", () => {
  it("scores a fresh user at the floor with stable direction", () => {
    const m = computeMomentum(st());
    expect(m.score).toBe(0);
    expect(m.direction).toBe("stable");
    expect(m.factors).toHaveLength(4);
  });

  it("scores higher for an active, high-performing user and detects rising direction", () => {
    const xpEvents = [
      ...Array.from({ length: 7 }, (_, i) => ({ amount: 50, createdAt: day(i), sourceType: "DAILY_TASK", category: "STRENGTH" })),
    ];
    const m = computeMomentum(st({ xpEvents, currentStreak: 7, activeDays: new Set(xpEvents.map((e) => e.createdAt.toISOString().split("T")[0])) }));
    expect(m.score).toBeGreaterThan(50);
    expect(m.direction).toBe("rising");
  });

  it("is deterministic for identical state", () => {
    const s = st({ xpEvents: [{ amount: 30, createdAt: day(1), sourceType: "X", category: null }] });
    expect(JSON.stringify(computeMomentum(s))).toBe(JSON.stringify(computeMomentum(s)));
  });

  it("keeps the score within [0, 100]", () => {
    const huge = st({ xpEvents: [{ amount: 100000, createdAt: day(0), sourceType: "X", category: null }], currentStreak: 999 });
    expect(computeMomentum(huge).score).toBeLessThanOrEqual(100);
    expect(computeMomentum(huge).score).toBeGreaterThanOrEqual(0);
  });
});

describe("Weakness Engine", () => {
  it("returns no weaknesses for a fresh user", () => {
    expect(detectWeaknesses(st())).toEqual([]);
  });

  it("detects an underperforming attribute with evidence and confidence", () => {
    const s = st({
      attributes: attrs({ STRENGTH: 100, ENDURANCE: 5 }),
      totalXp: 500,
      xpEvents: Array.from({ length: 10 }, (_, i) => ({ amount: 50, createdAt: day(i), sourceType: "DAILY_TASK", category: "STRENGTH" })),
    });
    const w = detectWeaknesses(s);
    expect(w.length).toBeGreaterThan(0);
    const areas = w.map((x) => x.area);
    expect(areas).toContain("ENDURANCE");
    const end = w.find((x) => x.area === "ENDURANCE")!;
    expect(end.score).toBeGreaterThanOrEqual(25);
    expect(end.confidence).toBeGreaterThanOrEqual(0);
    expect(end.confidence).toBeLessThanOrEqual(1);
    expect(end.evidence.length).toBeGreaterThan(0);
    expect(end.recommendedAction.length).toBeGreaterThan(0);
  });
});

describe("Recovery Engine", () => {
  it("is inactive for a fresh user", () => {
    const s = st();
    expect(detectRecoveryMode(s, computeMomentum(s)).active).toBe(false);
  });

  it("activates full recovery on a broken streak", () => {
    const s = st({ currentStreak: 0, longestStreak: 5, inactiveDays: 2 });
    const r = detectRecoveryMode(s, computeMomentum(s));
    expect(r.active).toBe(true);
    expect(r.level).toBe("full");
    expect(r.suggestedDifficulty).toBe("EASY");
  });

  it("activates recovery on repeated abandonment", () => {
    const s = st({
      quests: [
        { id: "q1", templateId: "t1", status: "ABANDONED", category: "STRENGTH", difficulty: "MEDIUM", assignedAt: day(2), completedAt: null },
        { id: "q2", templateId: "t2", status: "ABANDONED", category: "STRENGTH", difficulty: "MEDIUM", assignedAt: day(1), completedAt: null },
      ],
    });
    const r = detectRecoveryMode(s, computeMomentum(s));
    expect(r.active).toBe(true);
  });

  it("does not reset progress — level/totalXp untouched by detection", () => {
    const s = st({ level: 10, totalXp: 5000, currentStreak: 0, longestStreak: 5, inactiveDays: 2 });
    detectRecoveryMode(s, computeMomentum(s));
    expect(s.level).toBe(10);
    expect(s.totalXp).toBe(5000);
  });
});

describe("Difficulty Engine", () => {
  it("uses level-based difficulty with no history and maintains", () => {
    const d = recommendDifficulty(st({ level: 1 }));
    expect(d.recommended).toBe("EASY");
    expect(d.adjustment).toBe("maintain");
  });

  it("increases difficulty on high completion rate", () => {
    const s = st({
      level: 1,
      quests: Array.from({ length: 4 }, (_, i) => ({
        id: `c${i}`, templateId: `t${i}`, status: "COMPLETED", category: "STRENGTH", difficulty: "EASY", assignedAt: day(5), completedAt: day(4),
      })),
    });
    const d = recommendDifficulty(s);
    expect(d.adjustment).toBe("increase");
    expect(d.recommended).toBe("MEDIUM");
  });

  it("does not escalate a user who is not active today (stale completion rate)", () => {
    // Regression: a high 30-day completion rate must NOT raise difficulty while
    // the user is currently inactive — the rate is stale relative to a gap.
    const s = st({
      level: 1,
      inactiveDays: 6,
      quests: Array.from({ length: 4 }, (_, i) => ({
        id: `c${i}`, templateId: `t${i}`, status: "COMPLETED", category: "STRENGTH", difficulty: "EASY", assignedAt: day(5), completedAt: day(4),
      })),
    });
    const d = recommendDifficulty(s);
    expect(d.adjustment).not.toBe("increase");
    expect(d.recommended).toBe("EASY");
    expect(d.reason).toMatch(/not active today/i);
  });

  it("decreases difficulty on repeated failure", () => {
    const s = st({
      level: 10,
      quests: Array.from({ length: 4 }, (_, i) => ({
        id: `a${i}`, templateId: `t${i}`, status: "ABANDONED", category: "STRENGTH", difficulty: "MEDIUM", assignedAt: day(5), completedAt: null,
      })),
    });
    const d = recommendDifficulty(s);
    expect(d.adjustment).toBe("decrease");
  });

  it("never moves more than one ladder step", () => {
    const base = levelDifficulty(20);
    const d = recommendDifficulty(st({ level: 20, quests: Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, templateId: `t${i}`, status: "COMPLETED", category: "X", difficulty: "HARD", assignedAt: day(5), completedAt: day(4) })) }));
    const ladder = ["EASY", "MEDIUM", "HARD"];
    expect(Math.abs(ladder.indexOf(d.recommended) - ladder.indexOf(base))).toBeLessThanOrEqual(1);
  });
});

describe("Recommendation Engine", () => {
  it("scores task templates with reason codes within [0,100]", () => {
    const recs = recommendTasks(st());
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(r.reasonCodes)).toBe(true);
    }
    // sorted descending
    for (let i = 1; i < recs.length; i++) expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
  });

  it("emits GOAL_RELEVANT for goal-aligned tasks", () => {
    const recs = recommendTasks(st({ goalKeys: ["strength"] }));
    const strengthRec = recs.find((r) => r.category === "STRENGTH");
    expect(strengthRec?.reasonCodes).toContain("GOAL_RELEVANT");
  });

  it("scores quest templates deterministically", () => {
    const templates: QuestTemplate[] = [
      { id: "t1", title: "Push-up challenge", category: "STRENGTH", difficulty: "EASY", primaryAttributes: ["STRENGTH"], compatibleGoals: ["strength"] },
      { id: "t2", title: "Reading sprint", category: "KNOWLEDGE", difficulty: "EASY", primaryAttributes: ["KNOWLEDGE"], compatibleGoals: ["mind"] },
    ];
    const a = recommendQuests(st({ goalKeys: ["strength"] }), templates);
    const b = recommendQuests(st({ goalKeys: ["strength"] }), templates);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0].id).toBe("t1");
  });
});

describe("Quest Rotation Engine", () => {
  it("excludes active and recently completed quests and is deterministic", () => {
    const templates: QuestTemplate[] = [
      { id: "t1", title: "A", category: "STRENGTH", difficulty: "EASY", primaryAttributes: ["STRENGTH"], compatibleGoals: ["strength"] },
      { id: "t2", title: "B", category: "ENDURANCE", difficulty: "EASY", primaryAttributes: ["ENDURANCE"], compatibleGoals: ["endurance"] },
      { id: "t3", title: "C", category: "KNOWLEDGE", difficulty: "EASY", primaryAttributes: ["KNOWLEDGE"], compatibleGoals: ["mind"] },
      { id: "t4", title: "D", category: "MOBILITY", difficulty: "EASY", primaryAttributes: ["MOBILITY"], compatibleGoals: [] },
    ];
    const s = st({
      goalKeys: ["strength"],
      quests: [
        { id: "q1", templateId: "t1", status: "IN_PROGRESS", category: "STRENGTH", difficulty: "EASY", assignedAt: day(1), completedAt: null },
        { id: "q2", templateId: "t2", status: "COMPLETED", category: "ENDURANCE", difficulty: "EASY", assignedAt: day(3), completedAt: day(2) },
      ],
    });
    const r1 = rotateQuests(s, templates, 3);
    const r2 = rotateQuests(s, templates, 3);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    const ids = r1.map((r) => r.id);
    expect(ids).not.toContain("t1");
    expect(ids).not.toContain("t2");
  });
});

describe("Goal Decomposition Engine", () => {
  it("decomposes a structured goal into milestones", () => {
    const goals = decomposeGoals(st({ goalKeys: ["strength"] }));
    expect(goals).toHaveLength(1);
    expect(goals[0].key).toBe("strength");
    expect(goals[0].milestones.length).toBeGreaterThan(0);
    expect(goals[0].milestones[0].weeklyObjectives.length).toBeGreaterThan(0);
  });

  it("maps a free-text goal via keywords", () => {
    const goals = decomposeGoals(st({ goalsText: "I want to build muscle and get stronger" }));
    expect(goals[0].key).toBe("strength");
  });

  it("falls back to a generic decomposition when nothing matches", () => {
    const goals = decomposeGoals(st());
    expect(goals).toHaveLength(1);
    expect(goals[0].key).toBe("general");
  });
});

describe("Weekly Review Engine", () => {
  it("computes XP, completion rate, and milestone progress", () => {
    const s = st({
      level: 3,
      totalXp: 500,
      xpEvents: [{ amount: 100, createdAt: day(1), sourceType: "X", category: null }],
      dailyTasks: [
        { date: day(1).toISOString().split("T")[0], category: "STRENGTH", isCompleted: true, completedAt: day(1), xpReward: 20 },
        { date: day(2).toISOString().split("T")[0], category: "STRENGTH", isCompleted: false, completedAt: null, xpReward: 20 },
      ],
      currentStreak: 2,
      attributes: attrs({ STRENGTH: 50 }),
    });
    const m = computeMomentum(s);
    const r = buildWeeklyReview(s, m);
    expect(r.xpEarned).toBe(100);
    expect(r.completionRate).toBe(50);
    expect(r.streakPerformance).toBe(2);
    expect(r.strongestArea).toBe("STRENGTH");
    expect(r.milestoneProgress.level).toBe(3);
    expect(r.milestoneProgress.xpToNextLevel).toBe(400);
  });
});

describe("Milestone Forecast Engine", () => {
  it("returns an estimate with no date when there is no recent activity", () => {
    const f = forecastNextMilestone(st({ level: 2, totalXp: 100 }));
    expect(f.milestone).toBe("Level 3");
    expect(f.isEstimate).toBe(true);
    expect(f.daysEstimated).toBeNull();
    expect(f.estimatedDate).toBeNull();
  });

  it("estimates a date at the current pace", () => {
    const s = st({
      level: 2,
      totalXp: 100,
      xpEvents: Array.from({ length: 7 }, (_, i) => ({ amount: 40, createdAt: day(i), sourceType: "X", category: null })),
    });
    const f = forecastNextMilestone(s);
    expect(f.daysEstimated).toBeGreaterThan(0);
    expect(f.estimatedDate).not.toBeNull();
  });
});

describe("Behavior Pattern Engine", () => {
  it("returns no patterns for a fresh user", () => {
    expect(analyzeBehavior(st())).toEqual([]);
  });

  it("detects improving consistency from a positive trend", () => {
    const p = analyzeBehavior(st({ completionTrend: 3 }));
    expect(p.map((x) => x.pattern)).toContain("improving_consistency");
  });
});

describe("Intent Detection (expanded)", () => {
  it("routes engine-driven intents correctly", () => {
    expect(detectIntent("what should i do today")).toBe("daily_plan");
    expect(detectIntent("how was my week")).toBe("weekly_review");
    expect(detectIntent("what are my weaknesses")).toBe("weaknesses");
    expect(detectIntent("what should i do")).toBe("recommendations");
    expect(detectIntent("what are my goals")).toBe("goals");
    expect(detectIntent("what is my momentum")).toBe("momentum");
    expect(detectIntent("my progress")).toBe("progress");
  });

  it("still leaves open-ended coaching to Groq", () => {
    expect(detectIntent("Can you help me finally wake up earlier?")).toBeNull();
  });
});

describe("Determinism (all pure engines)", () => {
  it("produces byte-identical output for identical state across all engines", () => {
    const s = st({
      level: 6,
      totalXp: 1200,
      goalKeys: ["strength"],
      attributes: attrs({ STRENGTH: 80, ENDURANCE: 10 }),
      currentStreak: 3,
      xpEvents: [{ amount: 50, createdAt: day(0), sourceType: "DAILY_TASK", category: "STRENGTH" }],
      dailyTasks: [{ date: day(0).toISOString().split("T")[0], category: "STRENGTH", isCompleted: true, completedAt: day(0), xpReward: 25 }],
      quests: [{ id: "q", templateId: "t", status: "COMPLETED", category: "STRENGTH", difficulty: "EASY", assignedAt: day(5), completedAt: day(4) }],
    });
    const momentum = computeMomentum(s);
    const weaknesses = detectWeaknesses(s);
    const outputs = [
      analyzeStreak(s),
      momentum,
      weaknesses,
      detectRecoveryMode(s, momentum),
      recommendDifficulty(s),
      recommendTasks(s),
      decomposeGoals(s),
      buildWeeklyReview(s, momentum),
      forecastNextMilestone(s),
      analyzeBehavior(s),
    ];
    const again = [
      analyzeStreak(s),
      computeMomentum(s),
      detectWeaknesses(s),
      detectRecoveryMode(s, computeMomentum(s)),
      recommendDifficulty(s),
      recommendTasks(s),
      decomposeGoals(s),
      buildWeeklyReview(s, computeMomentum(s)),
      forecastNextMilestone(s),
      analyzeBehavior(s),
    ];
    expect(JSON.stringify(outputs)).toBe(JSON.stringify(again));
  });
});

describe("Daily task engine constants", () => {
  it("exposes the daily task count used by plans", () => {
    expect(DAILY_TASK_COUNT).toBe(5);
  });
});
