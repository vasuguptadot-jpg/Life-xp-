import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

// DB integration + authorization (IDOR) tests for the Life Engine analytics
// layer and its endpoints. Gated on TEST_DATABASE_URL.
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("Life Engine — analytics state + endpoints (DB)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let engine: typeof import("../lib/life-engine");
  let app: import("express").Express;
  let token: string;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    engine = await import("../lib/life-engine");
    app = (await import("../app")).default;

    const suffix = Date.now();
    const [a] = await db
      .insert(schema.usersTable)
      .values({ email: `le-a-${suffix}@example.com`, username: `lea${suffix}`, passwordHash: "x" })
      .returning();
    const [b] = await db
      .insert(schema.usersTable)
      .values({ email: `le-b-${suffix}@example.com`, username: `leb${suffix}`, passwordHash: "x" })
      .returning();
    userA = a.id;
    userB = b.id;

    // Award XP to user A only.
    const { awardXp } = await import("../lib/progression");
    await awardXp({ userId: userA, sourceType: "TEST", xp: 300, idempotencyKey: `le-xp-${suffix}` });

    const { signToken } = await import("../lib/auth");
    token = signToken({ sub: userA, email: `le-a-${suffix}@example.com` });
  });

  it("buildAnalyticsState scopes strictly to the authenticated user (IDOR boundary)", async () => {
    const sa = await engine.buildAnalyticsState(userA);
    const sb = await engine.buildAnalyticsState(userB);
    expect(sa.userId).toBe(userA);
    expect(sb.userId).toBe(userB);
    expect(sa.totalXp).toBe(300);
    expect(sb.totalXp).toBe(0);
  });

  it("composeDailyPlan returns a valid deterministic plan", async () => {
    const plan = await engine.composeDailyPlan(userA);
    expect(plan.tasks).toHaveLength(5);
    expect(plan.date).toBeTruthy();
    expect(["EASY", "MEDIUM", "HARD"]).toContain(plan.recommendedDifficulty);
    expect(plan.tasks.every((t) => t.taskText && t.category && t.xpReward > 0)).toBe(true);
  });

  it("rejects unauthenticated access to life-engine endpoints (401)", async () => {
    for (const path of ["/api/life-engine/streak", "/api/life-engine/daily-plan", "/api/progression/daily-plan"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it("serves all life-engine endpoints to the authenticated user (200)", async () => {
    const paths = [
      "/api/life-engine/streak",
      "/api/life-engine/momentum",
      "/api/life-engine/weaknesses",
      "/api/life-engine/recovery",
      "/api/life-engine/difficulty",
      "/api/life-engine/recommendations",
      "/api/life-engine/quests/rotation",
      "/api/life-engine/goals",
      "/api/life-engine/daily-plan",
      "/api/life-engine/weekly-review",
      "/api/life-engine/forecast",
      "/api/life-engine/behavior",
      "/api/progression/daily-plan",
    ];
    for (const path of paths) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${token}`);
      expect(`${path} -> ${res.status}`).toBe(`${path} -> 200`);
    }
  });

  it("weekly review reflects only the authenticated user's data", async () => {
    const res = await request(app)
      .get("/api/life-engine/weekly-review")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.xpEarned).toBe(300);
  });
});
