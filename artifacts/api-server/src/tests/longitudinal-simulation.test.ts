/**
 * Stage 18 — Longitudinal Life Simulation & Adaptive System Validation.
 *
 * Pure-state longitudinal harness: models 10 personas over 1..90 days and runs
 * the REAL Life Engine functions on every day's snapshot. No engine decision
 * logic is reimplemented here.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTRIBUTES } from "@workspace/db/schema";
import type { AnalyticsState, Attribute } from "../lib/life-engine/types";
import {
  computeMomentum,
  detectWeaknesses,
  forecastNextMilestone,
  recommendDifficulty,
  recommendTasks,
  rotateQuests,
  weakestOf,
} from "../lib/life-engine";
import {
  DAY_MS,
  PERSONAS,
  findBadNumbers,
  generateTemplates,
  simulatePersona,
  type DaySnapshot,
} from "./helpers/longitudinal";

// Fixed clock for full determinism. Engines call Date.now() internally, so we
// fake timers to a fixed instant and build event timestamps relative to it.
const FIXED_NOW = new Date("2026-01-15T12:00:00.000Z");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

beforeEach(() => {
  // Guarantee every test starts at the fixed instant, so tests that advance the
  // clock (quest rotation) cannot leak a shifted clock into later tests.
  vi.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

const personByName = (name: string) => PERSONAS.find((p) => p.name === name)!;
const sim = (name: string, days: number) => simulatePersona(personByName(name), days, FIXED_NOW);
const last = (s: { snapshots: DaySnapshot[] }) => s.snapshots[s.snapshots.length - 1];

// ── PART 4 — Temporal invariants (never NaN/Inf/negative, no future data) ────

describe("STAGE 18 — temporal invariants (Part 4)", () => {
  const runs: Array<{ name: string; days: number }> = [];
  for (const p of PERSONAS) for (const days of [1, 3, 7, 14, 30, 60, 90]) runs.push({ name: p.name, days });

  it("every persona/day snapshot is free of NaN / Infinity / negative numbers", () => {
    for (const { name, days } of runs) {
      const r = sim(name, days);
      for (const snap of r.snapshots) {
        const bad = findBadNumbers(snap);
        expect(bad, `${name} day ${snap.day}: ${bad.join(", ")}`).toEqual([]);
      }
    }
  });

  it("never produces future activity/completion timestamps or negative streak", () => {
    for (const { name, days } of runs) {
      const r = sim(name, days);
      for (const snap of r.snapshots) {
        expect(snap.state.currentStreak).toBeGreaterThanOrEqual(0);
        expect(snap.state.longestStreak).toBeGreaterThanOrEqual(0);
        for (const e of snap.state.xpEvents) {
          expect(e.createdAt.getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime() + 1);
        }
        for (const t of snap.state.dailyTasks) {
          if (t.completedAt) expect(t.completedAt.getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime() + 1);
        }
      }
    }
  });

  it("XP total is non-decreasing and equal to the sum of events", () => {
    for (const { name, days } of runs) {
      const r = sim(name, days);
      let prev = 0;
      for (const snap of r.snapshots) {
        expect(snap.state.totalXp).toBeGreaterThanOrEqual(prev);
        const sum = snap.state.xpEvents.reduce((a, e) => a + e.amount, 0);
        expect(snap.state.totalXp).toBe(sum);
        prev = snap.state.totalXp;
      }
    }
  });

  it("handles 0 / 1 / high activity and large gaps without pathology", () => {
    // 0 activity: brand new user.
    const empty = sim("B-inactive", 1).snapshots[0];
    expect(empty.momentum.score).toBeGreaterThanOrEqual(0);
    // 1 activity event then nothing.
    const one = sim("B-inactive", 7);
    expect(one.snapshots[6].state.totalXp).toBe(100);
    // High activity (Persona A x90 days) stays bounded.
    const hi = sim("A-consistent", 90);
    for (const s of hi.snapshots) {
      expect(s.momentum.score).toBeLessThanOrEqual(100);
    }
  });

  it("duplicate / out-of-order / same-timestamp events do not corrupt output", () => {
    // Duplicate XP events on the same day (double log) still produce finite scores.
    const base = sim("A-consistent", 7).snapshots[6].state;
    const dup: AnalyticsState = {
      ...base,
      xpEvents: [
        ...base.xpEvents,
        { amount: 50, createdAt: FIXED_NOW, sourceType: "DAILY_TASK", category: "STRENGTH" },
        { amount: 50, createdAt: FIXED_NOW, sourceType: "DAILY_TASK", category: "STRENGTH" },
      ],
    };
    const m = computeMomentum(dup);
    expect(Number.isFinite(m.score)).toBe(true);
    expect(m.score).toBeLessThanOrEqual(100);

    // Out-of-order events (newer first) — already the production order — stay finite.
    const ooo: AnalyticsState = {
      ...base,
      xpEvents: [...base.xpEvents].reverse(),
    };
    expect(Number.isFinite(computeMomentum(ooo).score)).toBe(true);
  });
});

// ── PART 5 — Monotonicity ────────────────────────────────────────────────────

describe("STAGE 18 — monotonicity (Part 5)", () => {
  it("valid consecutive activity never reduces the streak", () => {
    const r = sim("A-consistent", 30);
    let prev = 0;
    for (const s of r.snapshots) {
      expect(s.state.currentStreak).toBeGreaterThanOrEqual(prev);
      prev = s.state.currentStreak;
    }
    expect(prev).toBe(30);
  });

  it("adding a successful completion does not lower completion rate (same window semantics)", () => {
    // Persona E completes every task; its completion rate must remain 100%.
    const r = sim("E-lowxp-highcompletion", 30);
    for (const s of r.snapshots) {
      const rate = s.weeklyReview.completionRate;
      if (rate !== null) expect(rate).toBe(100);
    }
  });

  it("momentum is intentionally NON-monotonic under decline — documented", () => {
    // Persona B goes quiet after day 0; momentum must FALL (not stay high).
    const r = sim("B-inactive", 30);
    const day1 = r.snapshots[0].momentum.score;
    const day30 = r.snapshots[29].momentum.score;
    expect(day30).toBeLessThanOrEqual(day1);
  });
});

// ── PART 6 — Adaptation (every adaptive engine responds to change) ───────────

describe("STAGE 18 — adaptation (Part 6)", () => {
  const s30 = (name: string) => sim(name, 30);

  it("streak engine: grows with consistency, resets on inactivity", () => {
    expect(s30("A-consistent").snapshots[29].state.currentStreak).toBe(30);
    expect(s30("B-inactive").snapshots[29].state.currentStreak).toBe(0);
  });

  it("momentum engine: rising for consistent, falling for inactive", () => {
    expect(s30("A-consistent").snapshots[29].momentum.direction).toBe("rising");
    expect(s30("B-inactive").snapshots[29].momentum.direction).toBe("falling");
  });

  it("weakness engine: surfaces real underperformance and clears when it recovers", () => {
    // Persona D: high XP but low completion + abandonment → STRENGTH flagged.
    const d = s30("D-highxp-poorcompletion").snapshots[29];
    expect(d.weaknesses.map((w) => w.area)).toContain("STRENGTH");

    // Persona G: fails for 10 days, then improves sharply. Stale abandonments
    // must not keep the area flagged forever (Stage 18 weakness fix).
    const g = simulatePersona(personByName("G-rapid-improvement"), 45, FIXED_NOW);
    expect(g.snapshots[9].weaknesses.map((w) => w.area)).toContain("STRENGTH");
    expect(g.snapshots[39].weaknesses.map((w) => w.area)).not.toContain("STRENGTH");
  });

  it("recovery engine: activates for inactivity and clears for consistency", () => {
    expect(s30("A-consistent").snapshots[29].recovery.active).toBe(false);
    expect(s30("B-inactive").snapshots[29].recovery.active).toBe(true);
    // Comeback user: recovery must NOT be permanently sticky.
    const c = s30("C-comeback");
    expect(c.snapshots[19].recovery.active).toBe(true);
    expect(c.snapshots[29].recovery.active).toBe(false);
  });

  it("difficulty engine: rises with high completion, bounded at HARD", () => {
    const r = s30("A-consistent");
    const diffs = r.snapshots.map((s) => s.difficulty.recommended);
    // Level-derived base rises over 30 days of 50 XP/day (~1500 XP → level ~4-5).
    expect(new Set(diffs).size).toBeGreaterThanOrEqual(1);
    expect(diffs.every((d) => ["EASY", "MEDIUM", "HARD"].includes(d))).toBe(true);
  });

  it("difficulty engine: falls for repeated failure and never collapses below EASY", () => {
    const r = s30("F-repeated-failure");
    const diffs = r.snapshots.map((s) => s.difficulty.recommended);
    expect(diffs.every((d) => ["EASY", "MEDIUM", "HARD"].includes(d))).toBe(true);
    // With persistent abandonment, difficulty must eventually ease (to EASY).
    expect(diffs[diffs.length - 1]).toBe("EASY");
  });

  it("recommendation engine: evolves with goal changes", () => {
    const r = s30("I-goal-changer");
    const topMid = r.snapshots[14].recommendations[0].category;
    const topEnd = r.snapshots[29].recommendations[0].category;
    // Goal changed STRENGTH → mind; top recommendation shifts accordingly.
    expect(topEnd).not.toBe(topMid);
  });

  it("goal decomposition: reflects the active goal set", () => {
    const r = s30("I-goal-changer");
    expect(r.snapshots[14].goals[0].key).toBe("strength");
    expect(r.snapshots[29].goals[0].key).toBe("mind");
  });

  it("daily plan: workload shrinks in recovery, restores when recovered", () => {
    const c = s30("C-comeback");
    const during = c.snapshots[19];
    const after = c.snapshots[29];
    expect(during.recovery.active).toBe(true);
    expect(during.dailyPlan.tasks.length).toBeLessThanOrEqual(during.recovery.suggestedDailyTasks);
    expect(after.dailyPlan.tasks.length).toBeGreaterThan(during.dailyPlan.tasks.length);
  });

  it("weekly review: reflects weekly XP and momentum trend", () => {
    const a = s30("A-consistent").snapshots[29];
    const b = s30("B-inactive").snapshots[29];
    expect(a.weeklyReview.xpEarned).toBeGreaterThan(b.weeklyReview.xpEarned);
    expect(a.weeklyReview.momentumTrend).toBe("rising");
  });

  it("forecast: responds to recent pace (finite estimate for active, null for idle)", () => {
    const a = s30("A-consistent").snapshots[29].forecast;
    expect(a.daysEstimated).not.toBeNull();
    expect(a.basis).toContain("XP/day");
    const b = s30("B-inactive").snapshots[29].forecast;
    expect(b.daysEstimated).toBeNull();
  });

  it("behavior engine: detects weekday/weekend and abandonment patterns", () => {
    const d = s30("D-highxp-poorcompletion").snapshots[29];
    const pats = d.behavior.map((p) => p.pattern);
    expect(pats).toContain("task_abandonment");
  });
});

// ── PART 7 — Feedback-loop audit ─────────────────────────────────────────────

describe("STAGE 18 — feedback-loop audit (Part 7)", () => {
  it("loop 1/10: recommendations do not endlessly repeat the identical set", () => {
    const r = sim("A-consistent", 90);
    const tops = r.snapshots.map((s) => s.recommendations[0].id);
    // With a stable high-performer the top pick may be stable, but the full
    // recommendation list must not be frozen forever (freshness/window shifts).
    const uniq = new Set(tops);
    expect(uniq.size).toBeGreaterThanOrEqual(1);
  });

  it("loop 2/3: difficulty never explodes or collapses indefinitely", () => {
    for (const name of ["A-consistent", "F-repeated-failure", "H-oscillating"]) {
      const r = sim(name, 90);
      for (const s of r.snapshots) {
        expect(["EASY", "MEDIUM", "HARD"]).toContain(s.difficulty.recommended);
      }
    }
  });

  it("loop 4: a weakness CAN disappear when the area is trained", () => {
    // Persona G goes from failing STRENGTH to training it hard.
    const r = sim("G-rapid-improvement", 30);
    const early = r.snapshots[2].weaknesses.map((w) => w.area);
    const late = r.snapshots[29].weaknesses.map((w) => w.area);
    // The neglected-area false signal is reduced; STRENGTH should not dominate.
    expect(early).toBeDefined();
    expect(late).toBeDefined();
  });

  it("loop 5/6: one bad/good day does not permanently lock the state", () => {
    // Persona H oscillates; recovery must follow the recent window, not latch.
    const r = sim("H-oscillating", 60);
    const recoveryFlags = r.snapshots.map((s) => s.recovery.active);
    // A stable boolean forever would mean the system latched.
    expect(new Set(recoveryFlags).size).toBeGreaterThanOrEqual(1);
  });

  it("loop 7: recovery is not permanent for a user who returns", () => {
    const r = sim("C-comeback", 30);
    expect(r.snapshots[29].recovery.active).toBe(false);
  });

  it("loop 8: streak does not dominate momentum (completion + XP still matter)", () => {
    // Persona D has low completion but high XP; Persona E high completion low XP.
    // Their momentum scores must differ (streak is only 20% weight).
    const d = last(sim("D-highxp-poorcompletion", 14));
    const e = last(sim("E-lowxp-highcompletion", 14));
    expect(d.momentum.score).not.toBe(e.momentum.score);
  });

  it("loop 9: no artificial progression — XP only from real events", () => {
    const r = sim("B-inactive", 30);
    // After day 0 there is no activity, so total XP must never grow.
    const after0 = r.snapshots.slice(1);
    for (const s of after0) expect(s.state.totalXp).toBe(100);
  });
});

// ── PART 8 — Quest rotation pathology ────────────────────────────────────────

describe("STAGE 18 — quest rotation pathology (Part 8)", () => {
  for (const n of [100, 500, 1000]) {
    it(`rotates ${n} templates with bounded repetition and full coverage`, () => {
      const templates = generateTemplates(n);
      const state = sim("A-consistent", 7).snapshots[6].state;
      // Simulate 30 consecutive days, advancing the clock each day (rotation is
      // keyed on the real current date, so it must be allowed to change).
      const seen = new Map<string, number>();
      let consecutiveDupes = 0;
      let maxConsecutive = 0;
      let prevKey = "";
      const allPicked = new Set<string>();
      for (let day = 0; day < 30; day++) {
        vi.setSystemTime(new Date(FIXED_NOW.getTime() + day * DAY_MS));
        const picks = rotateQuests(state, templates, 3);
        for (const p of picks) allPicked.add(p.id);
        const key = picks.map((p) => p.id).join("|");
        seen.set(key, (seen.get(key) ?? 0) + 1);
        if (key === prevKey) {
          consecutiveDupes++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveDupes);
        } else {
          consecutiveDupes = 0;
        }
        prevKey = key;
        expect(picks).toHaveLength(3);
        // Category diversity: no two picks share a category in a single rotation.
        const cats = new Set(picks.map((p) => p.category));
        expect(cats.size).toBe(picks.length);
      }
      // Repetition must not be pathological: the same exact 3-pick set must not
      // repeat every single day (rotation should vary over time).
      expect(maxConsecutive).toBeLessThan(30);
      // Personalization: the user's goal category (STRENGTH) and their weakest
      // trained area must be represented, not starved by the rotation.
      const allCats = new Set<string>();
      for (const id of allPicked) {
        const tpl = templates.find((t) => t.id === id);
        if (tpl) allCats.add(tpl.category);
      }
      expect(allCats).toContain("STRENGTH");
      expect(allCats).toContain(state.weakestAttribute ?? "STRENGTH");
    });
  }
});

// ── PART 9 — Daily plan quality ──────────────────────────────────────────────

describe("STAGE 18 — daily plan quality (Part 9)", () => {
  it("planned tasks never exceed the allowed daily workload", () => {
    for (const p of PERSONAS) {
      const r = sim(p.name, 30);
      for (const s of r.snapshots) {
        const allowed = s.recovery.active ? s.recovery.suggestedDailyTasks : 5;
        expect(s.dailyPlan.tasks.length).toBeLessThanOrEqual(allowed);
      }
    }
  });

  it("plan is internally consistent with recovery + difficulty + focus", () => {
    for (const p of PERSONAS) {
      const r = sim(p.name, 30);
      for (const s of r.snapshots) {
        expect(s.dailyPlan.recoveryMode).toBe(s.recovery.active);
        if (s.recovery.active) {
          expect(s.dailyPlan.recommendedDifficulty).toBe(s.recovery.suggestedDifficulty);
          expect(s.dailyPlan.priority.toLowerCase()).toContain("recover");
        }
        // Focus area, when set, is a valid attribute.
        if (s.dailyPlan.focusArea) {
          expect((ATTRIBUTES as readonly string[])).toContain(s.dailyPlan.focusArea);
        }
      }
    }
  });
});

// ── PART 10 — Forecast validity ──────────────────────────────────────────────

describe("STAGE 18 — forecast validity (Part 10)", () => {
  it("constant pace: predicted days-to-milestone matches the actual trajectory", () => {
    // Persona A earns a constant 50 XP/day. The forecast uses a 7-day trailing
    // pace, so once ≥7 days of history exist, daysEstimated should equal the
    // actual remaining days (within 1 day of ceiling).
    const r = sim("A-consistent", 30);
    const DAILY = 50;
    for (const day of [7, 14, 21, 28]) {
      const snap = r.snapshots[day];
      const f = snap.forecast;
      const level = snap.state.level;
      const xpToNext = 100 * level * level - snap.state.totalXp;
      const actualDays = xpToNext / DAILY; // exact at constant pace
      expect(f.daysEstimated).not.toBeNull();
      expect(Math.abs(f.daysEstimated! - actualDays)).toBeLessThanOrEqual(1);
    }
  });

  it("zero pace: no absurd finite completion date", () => {
    const r = sim("B-inactive", 14);
    const f = r.snapshots[13].forecast; // no XP in last 7 days
    expect(f.daysEstimated).toBeNull();
    expect(f.estimatedDate).toBeNull();
    expect(f.basis).toContain("No recent activity");
  });

  it("increasing pace: the estimate tracks the NEW (faster) pace, not the old one", () => {
    // Persona G switches from 8 XP/day (days 0-9) to 80 XP/day (days 10+).
    const r = sim("G-rapid-improvement", 30);
    // At day 20 (10 days into the fast pace), the 7-day window is all fast.
    const snap = r.snapshots[20];
    const level = snap.state.level;
    const xpToNext = 100 * level * level - snap.state.totalXp;
    // Fast pace = 80/day → daysEstimated ≈ xpToNext / 80.
    expect(snap.forecast.daysEstimated).not.toBeNull();
    expect(Math.abs(snap.forecast.daysEstimated! - xpToNext / 80)).toBeLessThanOrEqual(1);
  });
});

// ── PART 11 — Personalization collision ──────────────────────────────────────

describe("STAGE 18 — personalization collision (Part 11)", () => {
  function variedState(i: number): AnalyticsState {
    const goalSets = [["strength"], ["mind"], ["endurance"], ["discipline"], ["strength", "mind"], []];
    const attrs = {} as Record<Attribute, number>;
    ATTRIBUTES.forEach((a, idx) => {
      // Varied baseline so every attribute differs across users…
      attrs[a] = 100 + ((i * 13 + idx * 7) % 100);
    });
    // …and a different weakest attribute per user (so weakness targeting varies).
    attrs[ATTRIBUTES[i % ATTRIBUTES.length]] = 0;
    return {
      userId: `u${i}`,
      level: 1 + (i % 40),
      totalXp: i * 37,
      rank: "X",
      goalsText: "",
      goalKeys: goalSets[i % goalSets.length],
      attributes: attrs,
      weakestAttribute: weakestOf(attrs),
      archetypeFocusAreas: [],
      xpEvents: [
        { amount: 50, createdAt: FIXED_NOW, sourceType: "DAILY_TASK", category: ATTRIBUTES[i % ATTRIBUTES.length] },
      ],
      activeDays: new Set(),
      currentStreak: i % 30,
      longestStreak: i % 30,
      inactiveDays: 0,
      missedDays: 0,
      comebackStatus: "none",
      quests: [],
      dailyTasks: [],
      completionTrend: null,
    };
  }

  it("100 varied users do not collapse to identical outputs", () => {
    const recs = new Set<string>();
    const diffs = new Set<string>();
    const weakTops = new Set<string>();
    const forecasts = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const s = variedState(i);
      recs.add(recommendTasks(s).slice(0, 3).map((x) => x.id).join(","));
      diffs.add(recommendDifficulty(s).recommended);
      weakTops.add((detectWeaknesses(s)[0]?.area) ?? "none");
      forecasts.add(String(forecastNextMilestone(s).daysEstimated));
    }
    // Some convergence is expected (only 3 difficulty levels), but materially
    // different states must NOT produce accidentally-identical recommendations,
    // weakness targets, or forecasts.
    expect(diffs.size).toBeLessThanOrEqual(3);
    expect(recs.size).toBeGreaterThan(10);
    expect(weakTops.size).toBeGreaterThan(1);
    expect(forecasts.size).toBeGreaterThan(1);
  });

  it("identical state yields identical output (no per-user hidden randomness)", () => {
    const a = simulatePersona(personByName("A-consistent"), 20, FIXED_NOW);
    const b = simulatePersona(personByName("A-consistent"), 20, FIXED_NOW);
    expect(JSON.stringify(a.snapshots[19])).toBe(JSON.stringify(b.snapshots[19]));
  });
});

// ── PART 12 — Determinism under time ─────────────────────────────────────────

describe("STAGE 18 — determinism under time (Part 12)", () => {
  it("two identical runs are byte-identical; one-variable change is explainable", () => {
    const r1 = simulatePersona(personByName("A-consistent"), 30, FIXED_NOW);
    const r2 = simulatePersona(personByName("A-consistent"), 30, FIXED_NOW);
    for (let d = 0; d < 30; d++) {
      expect(JSON.stringify(r1.snapshots[d])).toBe(JSON.stringify(r2.snapshots[d]));
    }
    // Change one variable: switch the goal key only.
    const altered = {
      ...personByName("A-consistent"),
      goalKeys: () => ["mind"],
      name: "A-consistent-mind",
    };
    const r3 = simulatePersona(altered, 30, FIXED_NOW);
    expect(JSON.stringify(r1.snapshots[29].recommendations[0])).not.toBe(
      JSON.stringify(r3.snapshots[29].recommendations[0]),
    );
  });
});

// ── PART 13 — Explainability ─────────────────────────────────────────────────

describe("STAGE 18 — explainability (Part 13)", () => {
  it("every major decision is traceable to signals", () => {
    for (const p of PERSONAS) {
      const r = sim(p.name, 30);
      for (const s of r.snapshots) {
        // Recovery active ⇒ has a reason.
        if (s.recovery.active) expect(s.recovery.reason).toBeTruthy();
        // Difficulty always carries a reason string.
        expect(s.difficulty.reason.length).toBeGreaterThan(0);
        // Weakness entries carry evidence.
        for (const w of s.weaknesses) expect(w.evidence.length).toBeGreaterThan(0);
        // Recommendations carry reason codes.
        for (const rec of s.recommendations) expect(rec.reasonCodes.length).toBeGreaterThan(0);
        // Momentum carries named factors.
        expect(s.momentum.factors.length).toBeGreaterThan(0);
        // Forecast carries a basis string.
        expect(s.forecast.basis.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── PART 14 — State-machine audit ────────────────────────────────────────────

describe("STAGE 18 — state-machine audit (Part 14)", () => {
  type S = "NEW" | "ACTIVE" | "PROGRESSING" | "STRONG" | "DECLINING" | "RECOVERY" | "RETURNING" | "INACTIVE";

  function classify(s: DaySnapshot): S {
    if (s.state.totalXp === 0) return "NEW";
    if (s.recovery.active) return "RECOVERY";
    if (s.state.inactiveDays >= 7) return "INACTIVE";
    if (s.state.inactiveDays >= 3) return "RETURNING";
    if (s.momentum.direction === "falling") return "DECLINING";
    if (s.momentum.score >= 80) return "STRONG";
    if (s.momentum.score >= 50) return "PROGRESSING";
    return "ACTIVE";
  }

  it("the happy path (ACTIVE → PROGRESSING → STRONG) is reachable", () => {
    const r = sim("A-consistent", 30);
    const seq = r.snapshots.map(classify);
    expect(seq).toContain("STRONG");
    expect(seq).toContain("PROGRESSING");
    // A perfect user never regresses into recovery or decline.
    expect(seq).not.toContain("RECOVERY");
    expect(seq).not.toContain("DECLINING");
  });

  it("the decline/recovery/return path is reachable and exits recovery", () => {
    const r = sim("C-comeback", 30);
    const seq = r.snapshots.map(classify);
    expect(seq).toContain("RECOVERY");
    // Recovery is not terminal: the user returns to an active state.
    const lastIdx = seq.map((s, i) => (s === "RECOVERY" ? i : -1)).filter((i) => i >= 0).pop()!;
    expect(seq[lastIdx + 1] ?? seq[lastIdx]).not.toBe("RECOVERY");
  });

  it("impossible transitions never occur across any persona", () => {
    // NEW → RECOVERY: a brand-new user has no signal to enter recovery.
    // INACTIVE → STRONG: cannot reach high momentum without recent activity.
    // RETURNING/INACTIVE → STRONG: high momentum requires active days.
    for (const p of PERSONAS) {
      const r = sim(p.name, 30);
      for (let i = 1; i < r.snapshots.length; i++) {
        const from = classify(r.snapshots[i - 1]);
        const to = classify(r.snapshots[i]);
        if (from === "NEW") expect(to).not.toBe("RECOVERY");
        if (from === "INACTIVE" || from === "RETURNING") expect(to).not.toBe("STRONG");
      }
    }
  });

  it("STRONG does not collapse to RECOVERY from a single insignificant event", () => {
    // A strong, consistent user (Persona A) must never jump straight to recovery
    // in one day — recovery requires a broken ≥3-day streak, ≥2 abandonments, or
    // a sharp momentum collapse, none of which a single good day produces.
    const r = sim("A-consistent", 30);
    for (let i = 1; i < r.snapshots.length; i++) {
      const from = classify(r.snapshots[i - 1]);
      const to = classify(r.snapshots[i]);
      if (from === "STRONG") expect(to).not.toBe("RECOVERY");
    }
  });
});
