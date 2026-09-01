/**
 * STAGE 20 — Part 4: goal lifecycle adversarial testing.
 *
 * The current product models goals as a single free-text string per user
 * (ai_user_goals, unique per userId) — there is no per-goal progress,
 * completion, or abandon state machine. Tests here exercise what exists
 * (set/update/read, validation, IDOR, concurrency, decomposition) and
 * explicitly document what does NOT exist rather than fabricate a lifecycle.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 20 — goal lifecycle (Part 4)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let app: import("express").Express;
  let tokenA: string;
  let tokenB: string;
  let userA: string;
  let userB: string;
  const suffix = `gl-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    app = (await import("../app")).default;
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}-a@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    const [b] = await db.insert(schema.usersTable).values({ email: `${suffix}-b@x.com`, username: `b${suffix}`, passwordHash: "x" }).returning();
    userA = a.id;
    userB = b.id;
    const { signToken } = await import("../lib/auth");
    tokenA = signToken({ sub: userA, email: `${suffix}-a@x.com` });
    tokenB = signToken({ sub: userB, email: `${suffix}-b@x.com` });
  });

  async function goalRow(uid: string) {
    const rows = await db.select().from(schema.aiUserGoalsTable).where(eq(schema.aiUserGoalsTable.userId, uid));
    return rows[0];
  }

  it("create → read: setting a goal persists it", async () => {
    const set = await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: "build strength and endurance" });
    expect(set.status).toBe(200);
    const get = await request(app).get("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`);
    expect(get.body.goals).toBe("build strength and endurance");
  });

  it("update / rapid switching: re-setting replaces the goal (single row)", async () => {
    await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: "learn and read more" });
    await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: "run a marathon" });
    const row = await goalRow(userA);
    expect(row.goals).toBe("run a marathon"); // latest wins
    const rows = await db.select().from(schema.aiUserGoalsTable).where(eq(schema.aiUserGoalsTable.userId, userA));
    expect(rows).toHaveLength(1); // no duplicates
  });

  it("duplicate goal is idempotent (no error, no duplicate row)", async () => {
    const g = "practice discipline daily";
    await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: g });
    const dup = await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: g });
    expect(dup.status).toBe(200);
    expect((await db.select().from(schema.aiUserGoalsTable).where(eq(schema.aiUserGoalsTable.userId, userA)))).toHaveLength(1);
  });

  it("validation: empty / short / non-string goals are rejected", async () => {
    for (const body of [{}, { goals: "" }, { goals: "ab" }, { goals: 123 }]) {
      const res = await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send(body);
      expect(res.status).toBe(400);
    }
  });

  it("IDOR: user B cannot read or overwrite user A's goal", async () => {
    const getB = await request(app).get("/api/ai/goals").set("Authorization", `Bearer ${tokenB}`);
    expect(getB.body.goals).toBeNull(); // B has no goal (A's is isolated)

    // B sets their own goal; A's remains untouched.
    await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenB}`).send({ goals: "improve my nutrition" });
    const aRow = await goalRow(userA);
    expect(aRow.goals).toBe("practice discipline daily");
  });

  it("concurrent updates collapse to a single row (last-write-wins, no duplicates)", async () => {
    const texts = Array.from({ length: 10 }, (_, i) => `concurrent goal ${i} with length`);
    await Promise.all(
      texts.map((t) => request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: t })),
    );
    const rows = await db.select().from(schema.aiUserGoalsTable).where(eq(schema.aiUserGoalsTable.userId, userA));
    expect(rows).toHaveLength(1);
    expect(texts).toContain(rows[0].goals); // one of the concurrent writes won
  });

  it("stale goal data does not leak into recommendations (decomposition reflects current goal)", async () => {
    const { decomposeGoals, buildAnalyticsState } = await import("../lib/life-engine");
    await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: "build strength" });
    const state = await buildAnalyticsState(userA);
    const goals = decomposeGoals(state);
    expect(goals.length).toBeGreaterThan(0);
    expect(goals[0].key).toBe("strength");
  });

  it("decomposition maps free-text to the correct structured goal (keyword match)", async () => {
    const { decomposeGoals } = await import("../lib/life-engine");
    const base = {
      userId: "x", level: 1, totalXp: 0, rank: "X", goalKeys: [] as string[],
      attributes: {} as any, weakestAttribute: null as any, archetypeFocusAreas: [] as any[],
      xpEvents: [], activeDays: new Set<string>(), currentStreak: 0, longestStreak: 0, inactiveDays: 0,
      missedDays: 0, comebackStatus: "none" as const, quests: [], dailyTasks: [], completionTrend: null,
    };
    const mind = decomposeGoals({ ...base, goalsText: "I want to learn a new language and read books" });
    expect(mind[0].key).toBe("mind");
    const endurance = decomposeGoals({ ...base, goalsText: "I want to run more and build cardio" });
    expect(endurance[0].key).toBe("endurance");
  });
});
