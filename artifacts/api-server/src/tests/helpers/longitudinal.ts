/**
 * Stage 18 — Longitudinal simulation harness (TEST-ONLY).
 *
 * This harness models a *user* over many days and feeds each day's snapshot to
 * the REAL production Life Engine functions. It contains NO reimplementation of
 * any engine's decision logic:
 *
 *   - Momentum / weakness / recovery / difficulty / recommendation / goal
 *     decomposition / daily plan / weekly review / forecast / behavior /
 *     quest rotation / streak analysis are all the real exported functions.
 *   - Streak/comeback/missed-day/weakest-attribute/rank helpers are the real
 *     exported utilities from analytics.ts / state.ts.
 *
 * The only "world model" code here is the trivial accumulation the DATABASE
 * performs in production (sum XP → totalXp, per-category XP → attributes, and
 * the level formula). That accumulation is cross-checked against the real
 * `awardXp` + `buildAnalyticsState` path in the DB-integrated test.
 */
import { ATTRIBUTES } from "@workspace/db/schema";
import type {
  AnalyticsState,
  Attribute,
  ComebackStatus,
  DailyTaskRecord,
  QuestRecord,
  XpEvent,
} from "../../lib/life-engine/types";
import {
  analyzeStreak,
  analyzeBehavior,
  buildDailyPlan,
  buildWeeklyReview,
  comebackStatusOf,
  computeLongestStreak,
  computeMissedDays,
  computeMomentum,
  decomposeGoals,
  detectRecoveryMode,
  detectWeaknesses,
  dayKey,
  emptyAttributes,
  forecastNextMilestone,
  getRankName,
  recommendDifficulty,
  recommendTasks,
  weakestOf,
} from "../../lib/life-engine";

export const DAY_MS = 86_400_000;

/**
 * The production level formula (lib/progression.ts `calculateLevel`). Kept here
 * only to model the world's level progression; the real formula is exercised in
 * the DB test via awardXp.
 */
export function worldLevel(totalXp: number): number {
  return Math.floor(Math.sqrt(totalXp / 100)) + 1;
}

// ── Persona world model ──────────────────────────────────────────────────────

export interface DayActivity {
  /** Total XP earned this day (split evenly across `categories`). */
  xp: number;
  /** Categories trained today (XP is divided among them). */
  categories: Attribute[];
  /** Daily tasks assigned today. */
  tasksAssigned: number;
  /** Daily tasks completed today (≤ tasksAssigned). */
  tasksCompleted: number;
  /** Quests completed today. */
  questsCompleted: number;
  /** Quests abandoned (failed) today. */
  questsAbandoned: number;
  /** Category of each quest completed/abandoned today (cycled). */
  questCategories: Attribute[];
}

export interface Persona {
  name: string;
  /** Structured goal keys in effect on `day` (may change over time). */
  goalKeys: (day: number) => string[];
  /** Free-text goals on `day`. */
  goalsText: (day: number) => string;
  /** The activity that happens on `day` (0-indexed). */
  activity: (day: number) => DayActivity;
}

// ── Snapshot type ────────────────────────────────────────────────────────────

export interface DaySnapshot {
  day: number;
  date: string;
  state: AnalyticsState;
  momentum: ReturnType<typeof computeMomentum>;
  streak: ReturnType<typeof analyzeStreak>;
  weaknesses: ReturnType<typeof detectWeaknesses>;
  recovery: ReturnType<typeof detectRecoveryMode>;
  difficulty: ReturnType<typeof recommendDifficulty>;
  recommendations: ReturnType<typeof recommendTasks>;
  goals: ReturnType<typeof decomposeGoals>;
  weeklyReview: ReturnType<typeof buildWeeklyReview>;
  forecast: ReturnType<typeof forecastNextMilestone>;
  behavior: ReturnType<typeof analyzeBehavior>;
  dailyPlan: ReturnType<typeof buildDailyPlan>;
}

function activityOf(persona: Persona, day: number): DayActivity {
  return persona.activity(day);
}

/** Build the AnalyticsState "as of the end of day `d`", anchored so day `d` = `now`. */
export function buildStateAt(
  persona: Persona,
  d: number,
  now: Date,
  cumulative: {
    totalXp: number;
    attributes: Record<Attribute, number>;
    xpLog: Array<{ day: number; category: Attribute; amount: number }>;
    questLog: Array<{ day: number; category: Attribute; status: QuestRecord["status"]; templateId: string }>;
    taskLog: Array<{ day: number; category: Attribute; isCompleted: boolean; xpReward: number }>;
    activeDays: Set<number>;
  },
): AnalyticsState {
  const dateOf = (day: number) => new Date(now.getTime() - (d - day) * DAY_MS);

  const xpEvents: XpEvent[] = [];
  for (const x of cumulative.xpLog) {
    if (x.day > d) continue;
    xpEvents.push({
      amount: x.amount,
      createdAt: dateOf(x.day),
      sourceType: "DAILY_TASK",
      category: x.category,
    });
  }

  const quests: QuestRecord[] = [];
  for (const q of cumulative.questLog) {
    if (q.day > d) continue;
    quests.push({
      id: `q-${q.day}-${q.templateId}`,
      templateId: q.templateId,
      status: q.status,
      category: q.category,
      difficulty: "MEDIUM",
      assignedAt: dateOf(q.day),
      completedAt: q.status === "COMPLETED" ? dateOf(q.day) : null,
    });
  }

  const dailyTasks: DailyTaskRecord[] = [];
  for (const t of cumulative.taskLog) {
    if (t.day > d) continue;
    dailyTasks.push({
      date: dayKey(dateOf(t.day)),
      category: t.category,
      isCompleted: t.isCompleted,
      completedAt: t.isCompleted ? dateOf(t.day) : null,
      xpReward: t.xpReward,
    });
  }

  const activeDays = new Set<string>();
  for (const ad of cumulative.activeDays) {
    if (ad <= d) activeDays.add(dayKey(dateOf(ad)));
  }

  const totalXp = cumulative.totalXp;
  const level = worldLevel(totalXp);

  // Current streak: consecutive active days ending today or yesterday.
  let currentStreak = 0;
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(new Date(now.getTime() - DAY_MS));
  const cursor = activeDays.has(todayKey) ? todayKey : yesterdayKey;
  if (activeDays.has(cursor)) {
    let t = new Date(`${cursor}T00:00:00Z`);
    while (activeDays.has(dayKey(t))) {
      currentStreak++;
      t = new Date(t.getTime() - DAY_MS);
    }
  }
  const longestStreak = computeLongestStreak(activeDays);
  const missedDays = computeMissedDays(activeDays, now, 30);

  // Days since the most recent active day (0 = active today, or no history).
  const activeUpToD = [...cumulative.activeDays].filter((x) => x <= d);
  const inactiveDays = activeUpToD.length > 0 ? d - Math.max(...activeUpToD) : 0;

  return {
    userId: `persona-${persona.name}`,
    level,
    totalXp,
    rank: getRankName(level),
    goalsText: persona.goalsText(d),
    goalKeys: persona.goalKeys(d),
    attributes: { ...cumulative.attributes },
    weakestAttribute: weakestOf(cumulative.attributes),
    archetypeFocusAreas: [],
    xpEvents,
    activeDays,
    currentStreak,
    longestStreak,
    inactiveDays,
    missedDays,
    comebackStatus: comebackStatusOf(inactiveDays) as ComebackStatus,
    quests,
    dailyTasks,
    completionTrend: null,
  };
}

/** Run the full engine stack on a state and return a normalized snapshot. */
export function runEngines(state: AnalyticsState, now: Date): DaySnapshot {
  const momentum = computeMomentum(state);
  const recovery = detectRecoveryMode(state, momentum);
  const difficulty = recommendDifficulty(state);
  const recommendations = recommendTasks(state);

  // Synthesize the day's generated tasks from the real recommendation engine
  // (this is what generateDailyTasks ultimately ranks via selectTasks).
  const tasks = recommendations.slice(0, 5).map((r) => ({
    id: r.id,
    date: dayKey(now),
    taskText: r.label,
    category: r.category,
    xpReward: 25,
    isCompleted: false,
    completedAt: null,
    createdAt: now,
  }));

  const dailyPlan = buildDailyPlan(state, tasks, difficulty, recovery, momentum);

  return {
    day: 0,
    date: dayKey(now),
    state,
    momentum,
    streak: analyzeStreak(state),
    weaknesses: detectWeaknesses(state),
    recovery,
    difficulty,
    recommendations,
    goals: decomposeGoals(state),
    weeklyReview: buildWeeklyReview(state, momentum),
    forecast: forecastNextMilestone(state),
    behavior: analyzeBehavior(state),
    dailyPlan,
  };
}

export interface SimulationResult {
  persona: Persona;
  days: number;
  snapshots: DaySnapshot[];
}

/** Simulate a persona for `days` days, returning one snapshot per day. */
export function simulatePersona(persona: Persona, days: number, now: Date): SimulationResult {
  const cumulative = {
    totalXp: 0,
    attributes: emptyAttributes(),
    xpLog: [] as Array<{ day: number; category: Attribute; amount: number }>,
    questLog: [] as Array<{ day: number; category: Attribute; status: QuestRecord["status"]; templateId: string }>,
    taskLog: [] as Array<{ day: number; category: Attribute; isCompleted: boolean; xpReward: number }>,
    activeDays: new Set<number>(),
  };

  const snapshots: DaySnapshot[] = [];

  for (let d = 0; d < days; d++) {
    const act = activityOf(persona, d);

    // ── World accumulation (what the DB does) ────────────────────────────────
    if (act.xp > 0 && act.categories.length > 0) {
      const per = Math.floor(act.xp / act.categories.length);
      for (const c of act.categories) {
        cumulative.xpLog.push({ day: d, category: c, amount: per });
        cumulative.attributes[c] += per;
        cumulative.totalXp += per;
      }
      cumulative.activeDays.add(d);
    }

    for (let i = 0; i < act.tasksAssigned; i++) {
      cumulative.taskLog.push({
        day: d,
        category: act.categories[i % Math.max(1, act.categories.length)],
        isCompleted: i < act.tasksCompleted,
        xpReward: 25,
      });
    }

    const qc = act.questCategories;
    for (let i = 0; i < act.questsCompleted; i++) {
      cumulative.questLog.push({
        day: d,
        category: qc[i % Math.max(1, qc.length)],
        status: "COMPLETED",
        templateId: `tpl-${qc[i % Math.max(1, qc.length)]}-${i}`,
      });
    }
    for (let i = 0; i < act.questsAbandoned; i++) {
      cumulative.questLog.push({
        day: d,
        category: qc[(i + act.questsCompleted) % Math.max(1, qc.length)],
        status: "ABANDONED",
        templateId: `tpl-ab-${i}`,
      });
    }

    const state = buildStateAt(persona, d, now, cumulative);
    const snapshot = runEngines(state, now);
    snapshot.day = d;
    snapshots.push(snapshot);
  }

  return { persona, days, snapshots };
}

// ── Persona library (Part 3) ─────────────────────────────────────────────────

const STRENGTH: Attribute = "STRENGTH";
const ENDURANCE: Attribute = "ENDURANCE";
const MOBILITY: Attribute = "MOBILITY";
const NUTRITION: Attribute = "NUTRITION";
const RECOVERY: Attribute = "RECOVERY";
const DISCIPLINE: Attribute = "DISCIPLINE";
const KNOWLEDGE: Attribute = "KNOWLEDGE";

export const PERSONAS: Persona[] = [
  {
    name: "A-consistent",
    goalKeys: () => ["strength"],
    goalsText: () => "build strength",
    activity: (d) => ({
      xp: 50,
      categories: [STRENGTH, DISCIPLINE],
      tasksAssigned: 5,
      tasksCompleted: 5,
      questsCompleted: d % 3 === 0 ? 1 : 0,
      questsAbandoned: 0,
      questCategories: [STRENGTH],
    }),
  },
  {
    name: "B-inactive",
    goalKeys: () => ["strength"],
    goalsText: () => "build strength",
    activity: (d) =>
      d === 0
        ? { xp: 100, categories: [STRENGTH], tasksAssigned: 5, tasksCompleted: 5, questsCompleted: 1, questsAbandoned: 0, questCategories: [STRENGTH] }
        : { xp: 0, categories: [], tasksAssigned: 0, tasksCompleted: 0, questsCompleted: 0, questsAbandoned: 0, questCategories: [] },
  },
  {
    name: "C-comeback",
    goalKeys: () => ["strength"],
    goalsText: () => "build strength",
    activity: (d) => {
      const active = d < 10 || d >= 20;
      return active
        ? { xp: 40, categories: [STRENGTH], tasksAssigned: 5, tasksCompleted: 4, questsCompleted: 1, questsAbandoned: 0, questCategories: [STRENGTH] }
        : { xp: 0, categories: [], tasksAssigned: 0, tasksCompleted: 0, questsCompleted: 0, questsAbandoned: 0, questCategories: [] };
    },
  },
  {
    name: "D-highxp-poorcompletion",
    goalKeys: () => ["strength"],
    goalsText: () => "build strength",
    activity: (d) => ({
      xp: 100,
      categories: [STRENGTH],
      tasksAssigned: 5,
      tasksCompleted: 1,
      questsCompleted: 0,
      questsAbandoned: d % 2 === 0 ? 1 : 0,
      questCategories: [STRENGTH],
    }),
  },
  {
    name: "E-lowxp-highcompletion",
    goalKeys: () => ["mind"],
    goalsText: () => "learn more",
    activity: (d) => ({
      xp: 10,
      categories: [KNOWLEDGE],
      tasksAssigned: 5,
      tasksCompleted: 5,
      questsCompleted: 1,
      questsAbandoned: 0,
      questCategories: [KNOWLEDGE],
    }),
  },
  {
    name: "F-repeated-failure",
    goalKeys: () => ["endurance"],
    goalsText: () => "run more",
    activity: (d) => ({
      xp: 15,
      categories: [ENDURANCE],
      tasksAssigned: 5,
      tasksCompleted: 1,
      questsCompleted: 0,
      questsAbandoned: 1,
      questCategories: [ENDURANCE],
    }),
  },
  {
    name: "G-rapid-improvement",
    goalKeys: () => ["strength"],
    goalsText: () => "build strength",
    activity: (d) => {
      const good = d >= 10;
      return good
        ? { xp: 80, categories: [STRENGTH], tasksAssigned: 5, tasksCompleted: 5, questsCompleted: 1, questsAbandoned: 0, questCategories: [STRENGTH] }
        : { xp: 8, categories: [STRENGTH], tasksAssigned: 5, tasksCompleted: 1, questsCompleted: 0, questsAbandoned: 1, questCategories: [STRENGTH] };
    },
  },
  {
    name: "H-oscillating",
    goalKeys: () => ["strength"],
    goalsText: () => "build strength",
    activity: (d) =>
      d % 2 === 0
        ? { xp: 100, categories: [STRENGTH], tasksAssigned: 5, tasksCompleted: 5, questsCompleted: 1, questsAbandoned: 0, questCategories: [STRENGTH] }
        : { xp: 5, categories: [STRENGTH], tasksAssigned: 5, tasksCompleted: 0, questsCompleted: 0, questsAbandoned: 1, questCategories: [STRENGTH] },
  },
  {
    name: "I-goal-changer",
    goalKeys: (d) => (d < 15 ? ["strength"] : ["mind"]),
    goalsText: (d) => (d < 15 ? "get stronger" : "learn and read more"),
    activity: (d) => {
      const cats: Attribute[] = d < 15 ? [STRENGTH] : [KNOWLEDGE];
      return { xp: 40, categories: cats, tasksAssigned: 5, tasksCompleted: 4, questsCompleted: 1, questsAbandoned: 0, questCategories: cats };
    },
  },
  {
    name: "J-multigoal",
    goalKeys: () => ["strength", "mind", "endurance"],
    goalsText: () => "get stronger, learn, and build endurance",
    activity: (d) => ({
      xp: 45,
      categories: d % 5 === 4 ? [ENDURANCE] : d % 3 === 0 ? [STRENGTH] : [KNOWLEDGE],
      tasksAssigned: 5,
      tasksCompleted: 4,
      questsCompleted: 1,
      questsAbandoned: 0,
      questCategories: d % 5 === 4 ? [ENDURANCE] : d % 3 === 0 ? [STRENGTH] : [KNOWLEDGE],
    }),
  },
];

// ── Quest-template generator (Part 8) ────────────────────────────────────────

export interface GeneratedTemplate {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  primaryAttributes: Attribute[];
  compatibleGoals: string[];
}

const DIFFS = ["EASY", "MEDIUM", "HARD"] as const;
const GOAL_KEYS = ["strength", "endurance", "mind", "discipline"];

/** Generate `n` deterministic quest templates across categories/difficulties. */
export function generateTemplates(n: number): GeneratedTemplate[] {
  const out: GeneratedTemplate[] = [];
  for (let i = 0; i < n; i++) {
    const cat = ATTRIBUTES[i % ATTRIBUTES.length];
    const diff = DIFFS[i % DIFFS.length];
    out.push({
      id: `qt-${i}`,
      title: `${cat} quest ${i}`,
      category: cat,
      difficulty: diff,
      primaryAttributes: [cat],
      compatibleGoals: [GOAL_KEYS[i % GOAL_KEYS.length]],
    });
  }
  return out;
}

// ── Invariant helper ─────────────────────────────────────────────────────────

export function findBadNumbers(value: unknown, path = "$"): string[] {
  const out: string[] = [];
  if (typeof value === "number") {
    if (Number.isNaN(value)) out.push(`${path}=NaN`);
    else if (!Number.isFinite(value)) out.push(`${path}=Inf`);
    else if (value < 0) out.push(`${path}=${value}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => out.push(...findBadNumbers(v, `${path}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.push(...findBadNumbers(v, `${path}.${k}`));
    }
  }
  return out;
}
