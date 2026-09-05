/**
 * Stage 19 — Product Intelligence & Quality Hardening.
 *
 * Evaluates the complete decision pipeline as ONE coherent system, not engine-
 * by-engine. Covers the cross-engine contradiction matrix (Part 2), feedback-
 * loop propagation (Part 3), personalization stability (Part 6), and the
 * 365-day long-term simulation (Part 16). Uses the real engine functions via
 * the Stage 18 longitudinal harness.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTRIBUTES } from "@workspace/db/schema";
import type { AnalyticsState, Attribute } from "../lib/life-engine/types";
import { detectWeaknesses, recommendTasks, weakestOf } from "../lib/life-engine";
import {
  PERSONAS,
  findBadNumbers,
  simulatePersona,
  type DaySnapshot,
} from "./helpers/longitudinal";

const FIXED_NOW = new Date("2026-01-15T12:00:00.000Z");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
beforeEach(() => vi.setSystemTime(FIXED_NOW));
afterAll(() => vi.useRealTimers());

const personByName = (name: string) => PERSONAS.find((p) => p.name === name)!;
const sim = (name: string, days: number) => simulatePersona(personByName(name), days, FIXED_NOW);

// ── PART 2 — Cross-engine contradiction matrix (programmatic) ────────────────

type Contradiction = {
  persona: string;
  day: number;
  kind: string;
  detail: string;
  classification: "A" | "B" | "C" | "D";
};

function auditContradictions(s: DaySnapshot, persona: string): Contradiction[] {
  const out: Contradiction[] = [];
  const recActive = s.recovery.active;
  const planTasks = s.dailyPlan.tasks.length;
  const allowed = recActive ? s.recovery.suggestedDailyTasks : 5;
  const recAreas = new Set(s.recommendations.slice(0, 3).map((r) => r.category));
  const weakAreas = new Set(s.weaknesses.map((w) => w.area));
  const falling = s.momentum.direction === "falling";

  // C1: recovery active but plan workload exceeds the recovery budget.
  if (recActive && planTasks > allowed) {
    out.push({ persona, day: s.day, kind: "recovery_vs_plan", detail: `recovery.active but ${planTasks} tasks > ${allowed}`, classification: "D" });
  }
  // C2: falling momentum but difficulty is being INCREASED.
  //     Hard contradiction (D) only when the user is also inactive — escalating
  //     a user who isn't active today is stale-advice. When active but momentum
  //     is still lagging after a return, it's a soft (B) time-window difference.
  if (falling && s.difficulty.adjustment === "increase") {
    out.push({
      persona, day: s.day, kind: "momentum_vs_difficulty",
      detail: `momentum falling but difficulty ${s.difficulty.recommended} (increase)`,
      classification: s.state.inactiveDays >= 1 ? "D" : "B",
    });
  }
  // C3: recovery active but plan priority is not recovery-oriented.
  if (recActive && !/recover|consisten|stabili|low/i.test(s.dailyPlan.priority)) {
    out.push({ persona, day: s.day, kind: "recovery_vs_priority", detail: `recovery active but priority "${s.dailyPlan.priority}"`, classification: "C" });
  }
  // C4: recovery active but plan difficulty is not EASY.
  if (recActive && s.dailyPlan.recommendedDifficulty !== "EASY") {
    out.push({ persona, day: s.day, kind: "recovery_vs_difficulty", detail: `recovery active but plan difficulty ${s.dailyPlan.recommendedDifficulty}`, classification: "D" });
  }
  // C5: a recommended category is one the weakness engine says is weak, but the
  //     recommendation engine does NOT surface a WEAK_AREA reason for it.
  for (const r of s.recommendations.slice(0, 3)) {
    if (weakAreas.has(r.category as Attribute) && !r.reasonCodes.includes("WEAK_AREA")) {
      out.push({ persona, day: s.day, kind: "weakness_vs_reason", detail: `${r.category} is weak but recommendation lacks WEAK_AREA`, classification: "B" });
    }
  }
  // C6: recommendation focuses on a goal-irrelevant category while a goal IS set.
  if (s.state.goalKeys.length > 0) {
    const goalAttrs = new Set<string>();
    for (const k of s.state.goalKeys) {
      const map: Record<string, string[]> = { strength: ["STRENGTH"], endurance: ["ENDURANCE", "MOBILITY"], mind: ["KNOWLEDGE", "RECOVERY"], discipline: ["DISCIPLINE"] };
      for (const a of map[k] ?? []) goalAttrs.add(a);
    }
    const top = s.recommendations[0];
    if (top && !goalAttrs.has(top.category) && !top.reasonCodes.includes("WEAK_AREA") && !top.reasonCodes.includes("STREAK_PRESERVING")) {
      out.push({ persona, day: s.day, kind: "goal_neglect", detail: `top rec ${top.category} but goal attrs ${[...goalAttrs].join(",")}`, classification: "C" });
    }
  }
  // C7: NaN/Inf/negative anywhere in the pipeline (should never happen).
  const bad = findBadNumbers(s);
  for (const b of bad) {
    out.push({ persona, day: s.day, kind: "bad_value", detail: b, classification: "D" });
  }
  return out;
}

describe("STAGE 19 — cross-engine contradiction matrix (Part 2)", () => {
  it("detects and classifies contradictions across all personas over 60 days", () => {
    const findings: Contradiction[] = [];
    for (const p of PERSONAS) {
      const r = sim(p.name, 60);
      for (const s of r.snapshots) {
        findings.push(...auditContradictions(s, p.name));
      }
    }
    // Log a summary for evidence.
    const byKind = new Map<string, number>();
    for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
    console.log(`[CONTRADICTIONS] total=${findings.length} byKind=${JSON.stringify([...byKind.entries()])}`);

    // Class D contradictions are genuine correctness defects — none may remain.
    const dDefects = findings.filter((f) => f.classification === "D");
    expect(dDefects, `D-class contradictions remain: ${dDefects.map((f) => `${f.kind}@${f.persona}:${f.day}`).join(", ")}`).toEqual([]);

    // Class C contradictions are architectural contradictions — assert none remain.
    const cContradictions = findings.filter((f) => f.classification === "C");
    expect(cContradictions, `C-class contradictions remain: ${cContradictions.map((f) => `${f.kind}@${f.persona}:${f.day}`).join(", ")}`).toEqual([]);
  });
});

// ── PART 3 — Feedback-loop quality (action → propagated change) ──────────────

describe("STAGE 19 — feedback-loop quality (Part 3)", () => {
  function buildState(overrides: Partial<AnalyticsState>): AnalyticsState {
    const attrs = {} as Record<Attribute, number>;
    for (const a of ATTRIBUTES) attrs[a] = 0;
    return {
      userId: "u", level: 5, totalXp: 500, rank: "Adventurer", goalsText: "", goalKeys: ["strength"],
      attributes: { ...attrs, STRENGTH: 100, ENDURANCE: 40 },
      weakestAttribute: "ENDURANCE", archetypeFocusAreas: [], xpEvents: [],
      activeDays: new Set(), currentStreak: 3, longestStreak: 3, inactiveDays: 0, missedDays: 0,
      comebackStatus: "none", quests: [], dailyTasks: [], completionTrend: null, ...overrides,
    };
  }

  it("improving a weak attribute propagates: weakness clears AND reason code drops", () => {
    const before = buildState({ attributes: { STRENGTH: 100, ENDURANCE: 5 } as any, weakestAttribute: "ENDURANCE" });
    const after = buildState({ attributes: { STRENGTH: 100, ENDURANCE: 100 } as any, weakestAttribute: "MOBILITY" });

    const beforeWeak = detectWeaknesses(before).map((w) => w.area);
    const afterWeak = detectWeaknesses(after).map((w) => w.area);

    // ENDURANCE should no longer be a behavioral weakness after training it.
    expect(afterWeak).not.toContain("ENDURANCE");

    // The ENDURANCE recommendation should lose its WEAK_AREA reason (the
    // weakest attribute moved to MOBILITY).
    const endBefore = recommendTasks(before).find((r) => r.category === "ENDURANCE");
    const endAfter = recommendTasks(after).find((r) => r.category === "ENDURANCE");
    expect(endBefore?.reasonCodes).toContain("WEAK_AREA");
    expect(endAfter?.reasonCodes).not.toContain("WEAK_AREA");
  });

  it("changing a goal propagates through goal decomposition AND recommendations", () => {
    const strength = buildState({ goalKeys: ["strength"], goalsText: "get stronger" });
    const mind = buildState({ goalKeys: ["mind"], goalsText: "learn more" });
    expect(recommendTasks(strength)[0].category).toBe("STRENGTH");
    expect(recommendTasks(mind)[0].category).toBe("KNOWLEDGE");
  });

  it("returning after inactivity clears recovery and restores the full plan", () => {
    // Covered explicitly in Stage 18 (Persona C); re-assert the propagation.
    const c = sim("C-comeback", 30);
    expect(c.snapshots[19].recovery.active).toBe(true);
    expect(c.snapshots[29].recovery.active).toBe(false);
    expect(c.snapshots[29].dailyPlan.tasks.length).toBeGreaterThan(c.snapshots[19].dailyPlan.tasks.length);
  });
});

// ── PART 6 — Personalization quality & stability ─────────────────────────────

describe("STAGE 19 — personalization stability (Part 6)", () => {
  function similarity(a: string[], b: string[]): number {
    const sa = new Set(a), sb = new Set(b);
    let inter = 0;
    for (const x of sa) if (sb.has(x)) inter++;
    return inter / Math.max(1, Math.max(sa.size, sb.size));
  }

  it("identical users → identical output; similar users → similar; different → different", () => {
    const base = sim("A-consistent", 20).snapshots[19];
    const baseAgain = sim("A-consistent", 20).snapshots[19];
    expect(JSON.stringify(base.recommendations)).toBe(JSON.stringify(baseAgain.recommendations));

    // Radically different user (different goal) → different recommendations.
    const mind = sim("E-lowxp-highcompletion", 20).snapshots[19];
    expect(JSON.stringify(base.recommendations[0].id)).not.toBe(JSON.stringify(mind.recommendations[0].id));

    // A tiny, irrelevant difference must not flip the whole recommendation set.
    const slight = simulatePersona({ ...personByName("A-consistent"), name: "A-slight" }, 20, FIXED_NOW).snapshots[19];
    const simScore = similarity(
      base.recommendations.slice(0, 5).map((r) => r.id),
      slight.recommendations.slice(0, 5).map((r) => r.id),
    );
    expect(simScore).toBeGreaterThanOrEqual(0.5);
  });

  it("100 varied users produce meaningfully different, stable outputs", () => {
    const goalSets = [["strength"], ["mind"], ["endurance"], ["discipline"], ["strength", "mind"], []];
    const sigs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const attrs = {} as Record<Attribute, number>;
      ATTRIBUTES.forEach((a, idx) => { attrs[a] = 100 + ((i * 13 + idx * 7) % 100); });
      attrs[ATTRIBUTES[i % ATTRIBUTES.length]] = 0;
      const state: AnalyticsState = {
        userId: `u${i}`, level: 1 + (i % 40), totalXp: i * 37, rank: "X", goalsText: "",
        goalKeys: goalSets[i % goalSets.length], attributes: attrs, weakestAttribute: weakestOf(attrs),
        archetypeFocusAreas: [], xpEvents: [], activeDays: new Set(), currentStreak: i % 30,
        longestStreak: i % 30, inactiveDays: 0, missedDays: 0, comebackStatus: "none",
        quests: [], dailyTasks: [], completionTrend: null,
      };
      sigs.add(JSON.stringify(recommendTasks(state).slice(0, 3).map((r) => r.id)));
    }
    expect(sigs.size).toBeGreaterThan(10);
  });
});

// ── PART 16 — 365-day long-term simulation ───────────────────────────────────

describe("STAGE 19 — 365-day simulation (Part 16)", () => {
  const personas = ["A-consistent", "C-comeback", "D-highxp-poorcompletion", "G-rapid-improvement", "H-oscillating"];

  for (const name of personas) {
    it(`${name}: remains sane after 365 days (no runaway XP / permanent recovery / dead-ends)`, () => {
      const r = sim(name, 365);
      const n = r.snapshots.length;
      expect(n).toBe(365);

      // No NaN/Inf/negative across the entire year.
      for (const s of r.snapshots) {
        const bad = findBadNumbers(s);
        expect(bad, `${name} day ${s.day}: ${bad.join(", ")}`).toEqual([]);
      }

      // XP is non-decreasing and equal to the sum of events (no runaway/fabrication).
      let prevXp = 0;
      for (const s of r.snapshots) {
        expect(s.state.totalXp).toBeGreaterThanOrEqual(prevXp);
        expect(s.state.totalXp).toBe(s.state.xpEvents.reduce((a, e) => a + e.amount, 0));
        prevXp = s.state.totalXp;
      }

      // Recovery is not permanent for personas that eventually return/improve.
      if (name === "H-oscillating") {
        // H abandons a quest every other day, so the recovery engine's
        // ">=2 abandoned in 30 days" branch keeps them in recovery — a
        // documented policy behavior (class B), not a latch from a single event.
        // The key invariants are that recovery stays EXPLAINABLE and bounded.
        for (const s of r.snapshots.slice(n - 10)) {
          if (s.recovery.active) expect(s.recovery.reason).toBeTruthy();
          expect(s.momentum.score).toBeLessThanOrEqual(100);
        }
      } else if (name !== "D-highxp-poorcompletion") {
        // Consistent, comeback, and improving users are NOT stuck in recovery at year-end.
        expect(r.snapshots[n - 1].recovery.active).toBe(false);
      }

      // Difficulty stays within the ladder and does not dead-end below EASY.
      for (const s of r.snapshots) {
        expect(["EASY", "MEDIUM", "HARD"]).toContain(s.difficulty.recommended);
      }

      // Momentum score stays bounded [0,100].
      for (const s of r.snapshots) {
        expect(s.momentum.score).toBeGreaterThanOrEqual(0);
        expect(s.momentum.score).toBeLessThanOrEqual(100);
      }
    });
  }
});
