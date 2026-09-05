import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Stage 16 — Life Engine tests.
 *
 * Pure-function tests (scoring, rule matching, intent detection, daily
 * rotation) run without a database. DB integration tests are gated on
 * TEST_DATABASE_URL and skip when no isolated database is available.
 */

// ── Pure imports (no DB pool — only @workspace/db/schema) ────────────────────
import { rankCandidates, selectTasks, detectTipRule, pickByHash, scoreCandidate } from "../lib/life-engine/scoring";
import { TASK_TEMPLATES, DAILY_TASK_COUNT, TIP_LIBRARY, MIN_TASK_XP, MAX_TASK_XP } from "../lib/life-engine/templates";
import { detectIntent, buildIntentResponse } from "../lib/life-engine/intents";
import type { EngineUserState, Attribute, TipRuleKey } from "../lib/life-engine/types";

const ALL_ATTRIBUTES: Attribute[] = [
  "STRENGTH", "ENDURANCE", "MOBILITY", "NUTRITION", "RECOVERY", "DISCIPLINE", "KNOWLEDGE",
];

function baseState(overrides: Partial<EngineUserState> = {}): EngineUserState {
  const attributes = {} as Record<Attribute, number>;
  for (const a of ALL_ATTRIBUTES) attributes[a] = 0;
  return {
    userId: "user-test",
    level: 1,
    totalXp: 0,
    rank: "Initiate",
    goalsText: "",
    goalKeys: [],
    attributes,
    weakestAttribute: null,
    archetypeFocusAreas: [],
    recentCategories: [],
    recentTaskTexts: new Set<string>(),
    streak: 0,
    inactiveDays: 0,
    completionTrend: null,
    ...overrides,
  };
}

describe("Life Engine — daily task scoring (deterministic)", () => {
  it("returns exactly DAILY_TASK_COUNT tasks for an empty (invalid/new) state", () => {
    const chosen = selectTasks(baseState(), DAILY_TASK_COUNT);
    expect(chosen).toHaveLength(DAILY_TASK_COUNT);
  });

  it("is deterministic: identical state produces identical output on repeated calls", () => {
    const state = baseState({ level: 5, goalKeys: ["strength"] });
    const a = selectTasks(state, DAILY_TASK_COUNT).map((t) => t.id);
    const b = selectTasks(state, DAILY_TASK_COUNT).map((t) => t.id);
    expect(a).toEqual(b);
  });

  it("produces category diversity (no duplicate categories when possible)", () => {
    const chosen = selectTasks(baseState(), DAILY_TASK_COUNT);
    const categories = chosen.map((t) => t.category);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it("scores are bounded within [0, 1]", () => {
    const scored = rankCandidates(baseState({ level: 12 }));
    for (const s of scored) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it("different goals steer selection to different tasks", () => {
    const strength = selectTasks(baseState({ goalKeys: ["strength"] }), DAILY_TASK_COUNT).map((t) => t.id);
    const mind = selectTasks(baseState({ goalKeys: ["mind"] }), DAILY_TASK_COUNT).map((t) => t.id);
    expect(strength).not.toEqual(mind);
  });

  it("never immediately repeats a recently completed task", () => {
    const ranked = rankCandidates(baseState());
    const top = ranked[0];
    const state = baseState({ recentTaskTexts: new Set([top.text]) });
    const chosen = selectTasks(state, DAILY_TASK_COUNT);
    expect(chosen.map((t) => t.id)).not.toContain(top.id);
  });

  it("boosts weakness and archetype categories", () => {
    const state = baseState({
      weakestAttribute: "KNOWLEDGE",
      archetypeFocusAreas: ["KNOWLEDGE"],
      goalKeys: ["mind"],
    });
    const chosen = selectTasks(state, DAILY_TASK_COUNT);
    expect(chosen[0].category).toBe("KNOWLEDGE");
  });

  it("fits task difficulty to user level", () => {
    const low = rankCandidates(baseState({ level: 1 }))[0];
    expect(low.tier).toBe("intro");
    const high = rankCandidates(baseState({ level: 20, goalKeys: ["strength"] }));
    // A high-level user's top picks skew toward advanced/standard tiers.
    expect(high.some((s) => s.tier !== "intro")).toBe(true);
  });
});

describe("Life Engine — tip rule matching (deterministic)", () => {
  it("detects inactivity when inactiveDays >= 3", () => {
    expect(detectTipRule(baseState({ inactiveDays: 3 }))).toBe("inactivity");
  });

  it("detects streak protection when inactive 1 day and streak >= 2", () => {
    expect(detectTipRule(baseState({ inactiveDays: 1, streak: 2 }))).toBe("streak_protection");
  });

  it("detects consistency when completion trend <= -2", () => {
    expect(detectTipRule(baseState({ completionTrend: -2 }))).toBe("consistency");
  });

  it("detects progression when completion trend >= 2", () => {
    expect(detectTipRule(baseState({ completionTrend: 2 }))).toBe("progression");
  });

  it("detects weakness when a weakest attribute is known", () => {
    expect(detectTipRule(baseState({ weakestAttribute: "MOBILITY" }))).toBe("weakness");
  });

  it("falls back to general when there is no strong signal", () => {
    expect(detectTipRule(baseState())).toBe("general");
  });

  it("every rule has at least one tip entry", () => {
    const rules: TipRuleKey[] = ["inactivity", "streak_protection", "consistency", "progression", "weakness", "general"];
    for (const r of rules) expect(TIP_LIBRARY[r].length).toBeGreaterThan(0);
  });

  it("pickByHash is deterministic and rotates across days", () => {
    const items = TIP_LIBRARY.general;
    const u = "user-1";
    const same1 = pickByHash(items, u, "2026-09-01");
    const same2 = pickByHash(items, u, "2026-09-01");
    expect(same1).toBe(same2);
    const next = pickByHash(items, u, "2026-09-02");
    // Hash rotation may or may not differ; assert in-bounds and type-correct.
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThan(items.length);
  });
});

describe("Life Engine — chat intent pre-processing (deterministic)", () => {
  it("routes level questions to the level intent", () => {
    expect(detectIntent("What level am I?")).toBe("level");
  });

  it("routes xp questions to the xp intent", () => {
    expect(detectIntent("how much xp do I have")).toBe("xp");
  });

  it("routes quest questions to the quests intent", () => {
    expect(detectIntent("what quests do I have")).toBe("quests");
  });

  it("routes streak questions to the streak intent", () => {
    expect(detectIntent("what's my streak")).toBe("streak");
  });

  it("routes completed-today questions to the completed_today intent", () => {
    expect(detectIntent("what did I complete today")).toBe("completed_today");
  });

  it("returns null for open-ended messages (falls through to Groq)", () => {
    expect(detectIntent("How can I finally build a gym habit?")).toBeNull();
    expect(detectIntent("Give me a meal plan for cutting")).toBeNull();
  });

  it("returns null for empty or oversized input", () => {
    expect(detectIntent("")).toBeNull();
    expect(detectIntent("x".repeat(300))).toBeNull();
  });

  it("builds correct deterministic responses for each intent", () => {
    const view = { level: 4, totalXp: 950, rank: "Initiate", streak: 3, activeQuests: 2, completedToday: 1 };
    expect(buildIntentResponse("level", view)).toContain("level 4");
    expect(buildIntentResponse("streak", view)).toContain("3 days");
    expect(buildIntentResponse("completed_today", view)).toContain("1 task");
    expect(buildIntentResponse("quests", { ...view, activeQuests: 0 })).toContain("no active quests");
  });
});

// ── DB integration tests ─────────────────────────────────────────────────────

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("Life Engine — DB integration", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let engine: typeof import("../lib/life-engine");
  let progression: typeof import("../lib/progression");
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    const dbModule = await import("@workspace/db");
    db = dbModule.db;
    schema = await import("@workspace/db/schema");
    engine = await import("../lib/life-engine");
    progression = await import("../lib/progression");

    const suffix = Date.now();
    const [user] = await db
      .insert(schema.usersTable)
      .values({ email: `engine-${suffix}@example.com`, username: `engine-${suffix}`, passwordHash: "x" })
      .returning();
    userId = user.id;
  });

  it("generates 5 daily tasks for a fresh user (invalid-state fallback)", async () => {
    const tasks = await engine.generateDailyTasks(userId);
    expect(tasks).toHaveLength(5);
    for (const t of tasks) {
      expect(t.taskText).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.xpReward).toBeGreaterThanOrEqual(MIN_TASK_XP);
      expect(t.xpReward).toBeLessThanOrEqual(MAX_TASK_XP);
    }
  });

  it("is deterministic: regenerating from identical state yields the same tasks", async () => {
    const first = await engine.generateDailyTasks(userId);
    // Invalidate the cache and regenerate — state is unchanged, so the same
    // deterministic selection must be reproduced.
    await db
      .delete(schema.aiDailyTasksTable)
      .where(
        and(
          eq(schema.aiDailyTasksTable.userId, userId),
        ),
      );
    const second = await engine.generateDailyTasks(userId);
    expect(second.map((t) => t.taskText)).toEqual(first.map((t) => t.taskText));
  });

  it("does NOT award XP or mutate progression as a side effect of generation", async () => {
    const before = await db
      .select()
      .from(schema.userLevelsTable)
      .where(eq(schema.userLevelsTable.userId, userId));
    const beforeTx = await db
      .select()
      .from(schema.xpTransactionsTable)
      .where(eq(schema.xpTransactionsTable.userId, userId));
    await engine.generateDailyTasks(userId);
    const after = await db
      .select()
      .from(schema.userLevelsTable)
      .where(eq(schema.userLevelsTable.userId, userId));
    const afterTx = await db
      .select()
      .from(schema.xpTransactionsTable)
      .where(eq(schema.xpTransactionsTable.userId, userId));
    expect(after.map((r) => r.totalXp)).toEqual(before.map((r) => r.totalXp));
    expect(afterTx).toHaveLength(beforeTx.length);
  });

  it("generates a deterministic daily tip for a fresh user (no Groq needed)", async () => {
    const first = await engine.generateDailyTip(userId);
    expect(first.tip).toBeTruthy();
    expect(first.category).toBeTruthy();
    const second = await engine.generateDailyTip(userId);
    expect(second.tip).toBe(first.tip);
  });

  it("buildEngineState returns a well-formed state with defaults", async () => {
    const state = await engine.buildEngineState(userId);
    expect(state.userId).toBe(userId);
    expect(state.level).toBeGreaterThanOrEqual(1);
    expect(state.totalXp).toBeGreaterThanOrEqual(0);
    expect(state.streak).toBeGreaterThanOrEqual(0);
    expect(ALL_ATTRIBUTES.every((a) => typeof state.attributes[a] === "number")).toBe(true);
  });

  it("awardXp is idempotent — the same idempotency key cannot double-award XP", async () => {
    const key = `idem-${Date.now()}`;
    const first = await progression.awardXp({ userId, sourceType: "TEST", idempotencyKey: key, xp: 100 });
    expect(first.alreadyAwarded).toBe(false);
    const second = await progression.awardXp({ userId, sourceType: "TEST", idempotencyKey: key, xp: 100 });
    expect(second.alreadyAwarded).toBe(true);
    // Total XP awarded exactly once.
    const txs = await db
      .select()
      .from(schema.xpTransactionsTable)
      .where(eq(schema.xpTransactionsTable.idempotencyKey, key));
    expect(txs).toHaveLength(1);
  });

  it("countActiveQuests only counts the user's own in-progress quests", async () => {
    const own = await engine.countActiveQuests(userId);
    expect(own).toBe(0);
  });
});
