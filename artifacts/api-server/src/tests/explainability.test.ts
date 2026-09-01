/**
 * STAGE 20 — Part 3: recommendation explainability / trust metadata.
 *
 * Verifies that a recommendation surfaced for a weak area always carries the
 * WEAK_AREA reason code (closing the Stage 19 weakness_vs_reason gap), that
 * reason codes correspond to real signals, that stale signals cannot drive
 * current recommendations, and that identical state yields identical
 * explanations.
 */
import { describe, expect, it } from "vitest";
import { detectWeaknesses, recommendTasks, recommendQuests } from "../lib/life-engine";
import { ATTRIBUTES } from "@workspace/db/schema";
import type { AnalyticsState, Attribute } from "../lib/life-engine/types";

const DAY = 24 * 60 * 60 * 1000;

function mkState(overrides: Partial<AnalyticsState> = {}): AnalyticsState {
  const attributes = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) attributes[a] = 50;
  return {
    userId: "u1", level: 5, totalXp: 500, rank: "Adventurer", goalsText: "", goalKeys: ["strength"],
    attributes, weakestAttribute: "ENDURANCE", archetypeFocusAreas: [], xpEvents: [],
    activeDays: new Set(), currentStreak: 0, longestStreak: 0, inactiveDays: 0, missedDays: 0,
    comebackStatus: "none", quests: [], dailyTasks: [], completionTrend: null, ...overrides,
  };
}

describe("STAGE 20 — recommendation explainability (Part 3)", () => {
  it("every recommendation targeting a detected weak area carries WEAK_AREA", () => {
    // A user who has been failing ENDURANCE tasks and abandoning ENDURANCE quests.
    const state = mkState({
      attributes: { ...Object.fromEntries(ATTRIBUTES.map((a) => [a, 100])) , ENDURANCE: 10 } as Record<Attribute, number>,
      weakestAttribute: "ENDURANCE",
      dailyTasks: Array.from({ length: 4 }, () => ({ date: "2026-09-01", category: "ENDURANCE" as Attribute, isCompleted: false, completedAt: null, xpReward: 10 })),
      quests: Array.from({ length: 3 }, () => ({ id: "q", templateId: "tp", category: "ENDURANCE" as Attribute, status: "ABANDONED" as const, difficulty: "EASY", assignedAt: new Date(Date.now() - DAY), completedAt: null })),
    });

    const weaknesses = detectWeaknesses(state);
    const weakAreas = new Set(weaknesses.map((w) => w.area));
    expect(weakAreas.size).toBeGreaterThan(0); // ENDURANCE should be weak

    const recs = recommendTasks(state);
    for (const r of recs) {
      if (weakAreas.has(r.category as Attribute)) {
        expect(r.reasonCodes, `recommendation ${r.id} (${r.category}) should carry WEAK_AREA`).toContain("WEAK_AREA");
      }
    }
  });

  it("reason codes correspond to actual signals (GOAL_RELEVANT ⇔ goal attribute)", () => {
    const state = mkState({ goalKeys: ["strength"], goalsText: "build strength" });
    const recs = recommendTasks(state);
    for (const r of recs) {
      const goalAttrs = ["STRENGTH"];
      if (goalAttrs.includes(r.category)) {
        expect(r.reasonCodes).toContain("GOAL_RELEVANT");
      }
    }
  });

  it("stale abandoned quests (older than 30 days) do not produce a current weakness", () => {
    const old = new Date(Date.now() - 45 * DAY);
    const state = mkState({
      // Equal attributes and no activity → the ONLY signal is the stale quest.
      attributes: Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])) as Record<Attribute, number>,
      weakestAttribute: null as unknown as Attribute,
      quests: [
        { id: "q1", templateId: "t1", category: "STRENGTH" as Attribute, status: "ABANDONED" as const, difficulty: "EASY", assignedAt: old, completedAt: null },
      ],
    });
    const weaknesses = detectWeaknesses(state);
    // A 45-day-old abandonment is windowed out (30d) and attributes are all 0
    // (untrained, not underperforming) → STRENGTH is not a current weakness.
    expect(weaknesses.find((w) => w.area === "STRENGTH")).toBeUndefined();
  });

  it("contradictory signals remain explainable (falling momentum + recovery)", () => {
    // A user with a broken streak triggers recovery; recommendations must still
    // be deterministic and carry valid reason codes (no crash, no empty set).
    const state = mkState({ currentStreak: 0, longestStreak: 5, inactiveDays: 2, weakestAttribute: "ENDURANCE" });
    const recs = recommendTasks(state);
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(Array.isArray(r.reasonCodes)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it("identical state produces byte-identical recommendations and explanations", () => {
    const a = recommendTasks(mkState());
    const b = recommendTasks(mkState());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("recommendQuests also carries WEAK_AREA for detected weak areas", () => {
    const state = mkState({
      attributes: { ...Object.fromEntries(ATTRIBUTES.map((x) => [x, 100])), MOBILITY: 10 } as Record<Attribute, number>,
      weakestAttribute: "MOBILITY",
      dailyTasks: Array.from({ length: 4 }, () => ({ date: "2026-09-01", category: "MOBILITY" as Attribute, isCompleted: false, completedAt: null, xpReward: 10 })),
    });
    const templates = [{ id: "qt1", title: "Mobility flow", category: "MOBILITY" as Attribute, difficulty: "EASY", compatibleGoals: [], primaryAttributes: ["MOBILITY" as Attribute] }];
    const recs = recommendQuests(state, templates as any);
    const mob = recs.find((r) => r.category === "MOBILITY");
    expect(mob).toBeDefined();
    expect(mob!.reasonCodes).toContain("WEAK_AREA");
  });
});
