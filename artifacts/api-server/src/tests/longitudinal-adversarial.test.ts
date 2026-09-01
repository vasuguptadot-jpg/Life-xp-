/**
 * STAGE 20 — Part 7: longitudinal adversarial simulation (365 days).
 *
 * Extends the Stage 18/19 harness with adversarial personas and measurable
 * invariants (not "looks reasonable" assertions). Simulations are computed
 * once and cached so each invariant assertion is cheap; the engines under
 * test are the real exported functions.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  PERSONAS,
  simulatePersona,
  worldLevel,
  type DaySnapshot,
  type Persona,
  type SimulationResult,
} from "./helpers/longitudinal";
import { ATTRIBUTES } from "@workspace/db/schema";
import type { Attribute } from "../lib/life-engine/types";

const FIXED_NOW = new Date("2026-01-15T12:00:00.000Z");
const DAYS = 365;
const GOAL_ATTR: Record<string, Attribute> = { strength: "STRENGTH", mind: "KNOWLEDGE", endurance: "ENDURANCE" };

function byName(name: string): Persona {
  const p = PERSONAS.find((x) => x.name === name);
  if (!p) throw new Error(`unknown persona ${name}`);
  return p;
}

// ── Adversarial personas (beyond the base library) ───────────────────────────
const COMPULSIVE: Persona = {
  name: "K-compulsive",
  goalKeys: () => ["strength"],
  goalsText: () => "build strength",
  // Completes a large number of quests every single day (farming behavior).
  activity: () => ({
    xp: 200, categories: ["STRENGTH"],
    tasksAssigned: 5, tasksCompleted: 5,
    questsCompleted: 5, questsAbandoned: 0, questCategories: ["STRENGTH"],
  }),
};

const SUPER_ACTIVE: Persona = {
  name: "L-superactive",
  goalKeys: () => ["strength", "mind", "endurance"],
  goalsText: () => "get strong, learn, and build endurance",
  activity: () => ({
    xp: 300, categories: ["STRENGTH", "KNOWLEDGE", "ENDURANCE"],
    tasksAssigned: 5, tasksCompleted: 5,
    questsCompleted: 3, questsAbandoned: 0,
    questCategories: ["STRENGTH", "KNOWLEDGE", "ENDURANCE"],
  }),
};

const GOAL_FLIPPER: Persona = {
  name: "M-goalflipper",
  // Switches goals every 3 days between three disjoint domains.
  goalKeys: (d) => [["strength", "mind", "endurance"][Math.floor(d / 3) % 3]],
  goalsText: (d) => ["build strength", "learn more", "run more"][Math.floor(d / 3) % 3],
  activity: () => ({
    xp: 60, categories: ["STRENGTH"],
    tasksAssigned: 5, tasksCompleted: 4,
    questsCompleted: 1, questsAbandoned: 0, questCategories: ["STRENGTH"],
  }),
};

const REPEATED_FAILURE: Persona = {
  name: "N-repeatedfailure",
  goalKeys: () => ["endurance"],
  goalsText: () => "run more",
  activity: () => ({
    xp: 5, categories: ["ENDURANCE"],
    tasksAssigned: 5, tasksCompleted: 0,
    questsCompleted: 0, questsAbandoned: 3, questCategories: ["ENDURANCE"],
  }),
};

// Personas simulated for the full year (representative + adversarial).
const YEAR_PERSONAS: Persona[] = [
  byName("A-consistent"),
  byName("B-inactive"),
  byName("C-comeback"),
  byName("G-rapid-improvement"),
  byName("I-goal-changer"),
  COMPULSIVE,
  SUPER_ACTIVE,
  GOAL_FLIPPER,
  REPEATED_FAILURE,
];

describe("STAGE 20 — longitudinal adversarial simulation (Part 7)", () => {
  const cache = new Map<string, SimulationResult>();
  beforeAll(() => {
    for (const p of YEAR_PERSONAS) {
      cache.set(p.name, simulatePersona(p, DAYS, FIXED_NOW));
    }
  }, 120_000);

  function year(name: string): SimulationResult {
    const r = cache.get(name);
    if (!r) throw new Error(`not simulated: ${name}`);
    return r;
  }

  function assertInvariants(s: DaySnapshot) {
    expect(s.state.level).toBe(worldLevel(s.state.totalXp));
    expect(s.state.level).toBeGreaterThanOrEqual(1);
    expect(s.momentum.score).toBeGreaterThanOrEqual(0);
    expect(s.momentum.score).toBeLessThanOrEqual(100);
    expect(["EASY", "MEDIUM", "HARD"]).toContain(s.difficulty.recommended);
    for (const r of s.recommendations) {
      expect(Number.isFinite(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  }

  it("365-day run satisfies all measurable invariants (monotonic XP/level, valid ranges)", () => {
    for (const p of YEAR_PERSONAS) {
      const r = year(p.name);
      expect(r.snapshots).toHaveLength(DAYS);
      let prevXp = -1;
      let prevLevel = 0;
      for (const s of r.snapshots) {
        assertInvariants(s);
        expect(s.state.totalXp).toBeGreaterThanOrEqual(prevXp);
        expect(s.state.level).toBeGreaterThanOrEqual(prevLevel);
        prevXp = s.state.totalXp;
        prevLevel = s.state.level;
      }
    }
  });

  it("no XP inflation: totalXp equals the sum of awarded events (no hidden minting)", () => {
    for (const p of YEAR_PERSONAS) {
      const last = year(p.name).snapshots[DAYS - 1];
      const sumEvents = last.state.xpEvents.reduce((acc, e) => acc + e.amount, 0);
      expect(last.state.totalXp).toBe(sumEvents);
    }
  });

  it("stale weakness clears for a recovered persona (not latched forever)", () => {
    const r = simulatePersona(byName("G-rapid-improvement"), 120, FIXED_NOW);
    const late = r.snapshots.slice(40);
    const stillWeak = late.filter((s) => s.weaknesses.some((w) => w.area === "STRENGTH"));
    expect(stillWeak.length).toBe(0);
  });

  it("goal switch propagates to recommendations within a bounded window (no stale advice)", () => {
    const r = simulatePersona(GOAL_FLIPPER, 30, FIXED_NOW);
    for (let d = 3; d < 30; d += 3) {
      const key = GOAL_FLIPPER.goalKeys(d)[0];
      const attr = GOAL_ATTR[key];
      const window = r.snapshots.slice(d, d + 3);
      const aligned = window.some((s) =>
        s.recommendations.some((rec) => rec.category === attr && rec.reasonCodes.includes("GOAL_RELEVANT")),
      );
      expect(aligned, `goal ${key} at day ${d} should align recommendations`).toBe(true);
    }
  });

  it("no personalization collapse: personas with different goals get different advice", () => {
    const sigs = new Set<string>();
    for (const name of ["A-consistent", "L-superactive", "M-goalflipper", "N-repeatedfailure"]) {
      const r = year(name);
      sigs.add(JSON.stringify(r.snapshots[DAYS - 1].recommendations.slice(0, 3).map((x) => x.id)));
    }
    expect(sigs.size).toBeGreaterThan(1);
  });

  it("compulsive quest-completion does not produce runaway levels (sqrt curve bounds it)", () => {
    const last = year("K-compulsive").snapshots[DAYS - 1];
    expect(last.state.totalXp).toBeGreaterThan(0);
    expect(last.state.level).toBe(worldLevel(last.state.totalXp));
    expect(last.state.level).toBeLessThan(60);
  });

  it("repeated failure does not destabilize the difficulty ladder or reset progress", () => {
    const r = year("N-repeatedfailure");
    const ladder = ["EASY", "MEDIUM", "HARD"];
    for (const s of r.snapshots) {
      expect(ladder).toContain(s.difficulty.recommended);
    }
    expect(r.snapshots[DAYS - 1].recovery.active).toBe(true);
    expect(r.snapshots[DAYS - 1].state.totalXp).toBeGreaterThanOrEqual(0);
  });

  it("no impossible state transitions across all 7 attributes (non-negative, finite)", () => {
    for (const p of YEAR_PERSONAS) {
      const attrs = year(p.name).snapshots[DAYS - 1].state.attributes;
      for (const a of ATTRIBUTES) {
        expect(attrs[a]).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(attrs[a])).toBe(true);
      }
    }
  });
});
