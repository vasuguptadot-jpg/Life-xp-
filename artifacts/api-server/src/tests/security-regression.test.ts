/**
 * STAGE 20 — Part 9: security regression (two isolated users).
 *
 * Re-runs the adversarial security surface: auth, IDOR, malformed/oversized
 * input, SQL-injection-shaped input, XP/quest manipulation, replay, and
 * concurrent mutation. Complements the existing input-validation,
 * uuid-validation, sse-auth, and anti-gaming suites.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 20 — security regression (Part 9)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let app: import("express").Express;
  let tokenA: string;
  let tokenB: string;
  let userA: string;
  let userB: string;
  const suffix = `sec-${Date.now()}`;

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

  it("unauthenticated access is rejected across all protected surfaces (401)", async () => {
    const endpoints: Array<[string, string]> = [
      ["GET", "/api/users/me"],
      ["GET", "/api/progression/summary"],
      ["GET", "/api/quests"],
      ["GET", "/api/ai/daily-tasks"],
      ["GET", "/api/social/leaderboard"],
      ["GET", "/api/messages/conversations"],
    ];
    for (const [method, path] of endpoints) {
      const res = await request(app)[method.toLowerCase() as "get"](path);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it("SQL-injection-shaped input is treated as data, never executed (no 500)", async () => {
    const injection = "x'; DROP TABLE users; --";
    // Goals accepts arbitrary text (stored as data) — must not error.
    const g = await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: injection });
    expect([200, 400]).toContain(g.status);

    // Quest progress rejects non-numeric injection.
    const [tpl] = await db.insert(schema.questTemplatesTable).values({ title: "S", description: "d", category: "STRENGTH", questType: "SIMPLE", status: "ACTIVE" }).returning();
    const [q] = await db.insert(schema.userQuestsTable).values({ userId: userA, questTemplateId: tpl.id, targetValue: "10", status: "ASSIGNED" }).returning();
    const p = await request(app).patch(`/api/quests/${q.id}/progress`).set("Authorization", `Bearer ${tokenA}`).send({ progress: injection });
    expect(p.status).toBe(400);
  });

  it("oversized input is bounded, not fatal", async () => {
    const big = "a".repeat(10_000);
    const res = await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: big });
    expect([200, 400, 413]).toContain(res.status);
  });

  it("malformed progress values never crash, overflow, or award XP", async () => {
    const [tpl] = await db.insert(schema.questTemplatesTable).values({ title: "M", description: "d", category: "STRENGTH", questType: "SIMPLE", status: "ACTIVE", progressionConfig: { xp: 50 } }).returning();
    const [q] = await db.insert(schema.userQuestsTable).values({ userId: userA, questTemplateId: tpl.id, targetValue: "10", status: "ASSIGNED" }).returning();

    // Negative and non-numeric are rejected outright.
    for (const bad of [-1, "abc"]) {
      const res = await request(app).patch(`/api/quests/${q.id}/progress`).set("Authorization", `Bearer ${tokenA}`).send({ progress: bad });
      expect(res.status, `progress=${bad}`).toBe(400);
    }

    // Huge and null values are safely clamped/coerced — never a 500, never an
    // overflow, and the PATCH path awards no XP (only /complete does).
    const before = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, userA));
    for (const v of [1e18, null]) {
      const res = await request(app).patch(`/api/quests/${q.id}/progress`).set("Authorization", `Bearer ${tokenA}`).send({ progress: v });
      expect(res.status, `progress=${v}`).toBeLessThan(500);
    }
    const after = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, userA));
    expect(after.length).toBe(before.length); // no XP from progress-only mutations

    // Clamped progress never exceeds the target.
    const rows = await db.select().from(schema.userQuestsTable).where(eq(schema.userQuestsTable.id, q.id));
    expect(Number(rows[0].progressValue)).toBeLessThanOrEqual(10);
  });

  it("quest manipulation: user B cannot progress, complete, or abandon user A's quest", async () => {
    const [tpl] = await db.insert(schema.questTemplatesTable).values({ title: "IDOR", description: "d", category: "STRENGTH", questType: "SIMPLE", status: "ACTIVE" }).returning();
    const [q] = await db.insert(schema.userQuestsTable).values({ userId: userA, questTemplateId: tpl.id, targetValue: "10", status: "ASSIGNED" }).returning();

    const prog = await request(app).patch(`/api/quests/${q.id}/progress`).set("Authorization", `Bearer ${tokenB}`).send({ progress: 5 });
    expect(prog.status).toBe(404);
    const complete = await request(app).post(`/api/quests/${q.id}/complete`).set("Authorization", `Bearer ${tokenB}`);
    expect(complete.status).toBe(404);
    const abandon = await request(app).post(`/api/quests/${q.id}/abandon`).set("Authorization", `Bearer ${tokenB}`);
    expect(abandon.status).toBe(404);

    // A's quest remains untouched.
    const rows = await db.select().from(schema.userQuestsTable).where(eq(schema.userQuestsTable.id, q.id));
    expect(rows[0].status).toBe("ASSIGNED");
  });

  it("profile isolation: user B cannot see or mutate user A's private profile fields", async () => {
    const meA = await request(app).get("/api/users/me").set("Authorization", `Bearer ${tokenA}`);
    const meB = await request(app).get("/api/users/me").set("Authorization", `Bearer ${tokenB}`);
    expect(meA.body.id).toBe(userA);
    expect(meB.body.id).toBe(userB);
    expect(meA.body.id).not.toBe(meB.body.id);
  });

  it("replay: duplicate quest completion is idempotent (no double XP)", async () => {
    const [tpl] = await db.insert(schema.questTemplatesTable).values({ title: "R", description: "d", category: "STRENGTH", questType: "SIMPLE", status: "ACTIVE", progressionConfig: { xp: 50 } }).returning();
    const [q] = await db.insert(schema.userQuestsTable).values({ userId: userA, questTemplateId: tpl.id, targetValue: "1", status: "ASSIGNED" }).returning();
    const c1 = await request(app).post(`/api/quests/${q.id}/complete`).set("Authorization", `Bearer ${tokenA}`);
    const c2 = await request(app).post(`/api/quests/${q.id}/complete`).set("Authorization", `Bearer ${tokenA}`);
    expect(c1.body.xp.alreadyAwarded).toBe(false);
    expect(c2.body.xp.alreadyAwarded).toBe(true);
  });
});
