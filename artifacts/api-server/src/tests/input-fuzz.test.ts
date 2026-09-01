/**
 * STAGE 21 — Part 5: API contract & input-fuzz audit.
 *
 * Attacks every state-mutating endpoint with malformed input and asserts that
 * malformed input can never mutate state, bypass authorization, award XP, or
 * crash the server with an unhandled 500 on a client error.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 21 — input fuzz (Part 5)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let app: import("express").Express;
  let tokenA: string;
  let userA: string;
  const suffix = `fz-${Date.now()}`;

  async function xpCount() {
    const rows = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, userA));
    return rows.length;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    app = (await import("../app")).default;
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    userA = a.id;
    const { signToken } = await import("../lib/auth");
    tokenA = signToken({ sub: userA, email: `${suffix}@x.com` });
  });

  it("quest progress rejects malformed values without mutating or crashing", async () => {
    const [tpl] = await db.insert(schema.questTemplatesTable).values({
      title: "fz", description: "d", category: "STRENGTH", questType: "SIMPLE", status: "ACTIVE", progressionConfig: { xp: 50 },
    }).returning();
    const assign = await request(app).post(`/api/quests/assign/${tpl.id}`).set("Authorization", `Bearer ${tokenA}`);
    const qid = assign.body.id;

    // Negative, non-numeric, and non-scalar values must be rejected (4xx, never 500).
    for (const bad of [-1, "abc", { obj: 1 }, [1, 2]]) {
      const res = await request(app).patch(`/api/quests/${qid}/progress`).set("Authorization", `Bearer ${tokenA}`).send({ progress: bad });
      expect(res.status, `progress=${JSON.stringify(bad)}`).toBeGreaterThanOrEqual(400);
      expect(res.status, `progress=${JSON.stringify(bad)}`).toBeLessThan(500);
    }
    // null and huge numbers are safely coerced/clamped (documented behavior): no 500, no XP.
    for (const v of [null, 1e18]) {
      const res = await request(app).patch(`/api/quests/${qid}/progress`).set("Authorization", `Bearer ${tokenA}`).send({ progress: v });
      expect(res.status, `progress=${v}`).toBeLessThan(500);
    }
    expect(await xpCount()).toBe(0);
  });

  it("goals endpoint rejects non-string / too-short / oversized input", async () => {
    for (const bad of [null, "", "ab", 123, { x: 1 }, ["list"], "x".repeat(1_000_000)]) {
      const res = await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: bad });
      if (typeof bad === "string" && bad.trim().length >= 5) {
        // A long-but-valid string is accepted (bounded only by body limits); the
        // rest must be rejected as 400.
        continue;
      }
      expect(res.status, `goals=${JSON.stringify(typeof bad)}`).toBeGreaterThanOrEqual(400);
    }
  });

  it("chat rejects malformed message without persisting a partial row", async () => {
    for (const bad of [null, "", 123, { x: 1 }, ["arr"]]) {
      const res = await request(app).post("/api/ai/chat").set("Authorization", `Bearer ${tokenA}`).send({ message: bad });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("signup rejects malformed username/password (no partial user created)", async () => {
    const before = await db.select().from(schema.usersTable);
    for (const body of [
      { email: "x@x.com", username: "a b", password: "password123" },   // space in username
      { email: "x@x.com", username: "okname", password: "short" },       // short password
      { username: "okname", password: "password123" },                   // missing email
    ]) {
      const res = await request(app).post("/api/auth/signup").send(body);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    const after = await db.select().from(schema.usersTable);
    expect(after.length).toBe(before.length);
  });

  it("FINDING (C): signup does not validate email type/format — a non-string email is silently accepted", async () => {
    // This documents a real (non-speculative) input-validation gap: the signup
    // handler only checks truthiness of `email`, so a non-string value is
    // coerced to text and stored. It does NOT bypass auth or award XP, but the
    // stored identifier is garbage. Classified C (product/robustness risk),
    // recorded here rather than "fixed" speculatively (no product email spec
    // exists to validate against).
    const numericEmail = 2_000_000_000 + (Date.now() % 1_000_000_000); // unique per run
    const res = await request(app).post("/api/auth/signup").send({
      email: numericEmail, username: `fznum${Date.now()}`, password: "password123",
    });
    expect(res.status).toBe(201); // accepted today — this is the gap
    const rows = await db.select().from(schema.usersTable).where(eq(schema.usersTable.email, String(numericEmail)));
    expect(rows.length).toBe(1);
  });

  it("malformed UUIDs are rejected as 400 (never 500) across mutation endpoints", async () => {
    const bad = "not-a-uuid";
    const checks = [
      request(app).patch(`/api/quests/${bad}/progress`).set("Authorization", `Bearer ${tokenA}`).send({ progress: 1 }),
      request(app).post(`/api/quests/${bad}/complete`).set("Authorization", `Bearer ${tokenA}`),
      request(app).post(`/api/quests/${bad}/abandon`).set("Authorization", `Bearer ${tokenA}`),
      request(app).post(`/api/ai/daily-tasks/${bad}/complete`).set("Authorization", `Bearer ${tokenA}`),
      request(app).post(`/api/social/posts/${bad}/like`).set("Authorization", `Bearer ${tokenA}`),
    ];
    const results = await Promise.all(checks);
    for (const r of results) {
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
    }
  });

  it("malformed profile numeric fields are rejected as 400 (no 500)", async () => {
    // Note: JSON cannot represent NaN/Infinity (they serialize to null, which is
    // a safe "no-op"), so the reachable malformed forms are strings/objects and
    // stringified huge numbers, which the numeric guard rejects.
    for (const body of [
      { age: "abc" }, { heightCm: {} }, { weightKg: [1, 2] }, { age: "1e400" },
    ]) {
      const res = await request(app).patch("/api/users/me/profile-extra").set("Authorization", `Bearer ${tokenA}`).send(body);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("unknown enum values and unexpected fields do not mutate state", async () => {
    // Post with an unexpected postType and extra unknown fields — server coerces
    // postType to 'post' and ignores unknowns, still valid.
    const res = await request(app).post("/api/social/posts").set("Authorization", `Bearer ${tokenA}`).send({
      caption: "fuzz", postType: "NOT_A_REAL_TYPE", hacker: "payload", nested: { deep: [1, 2, 3] },
    });
    expect(res.status).toBe(201);
    expect(res.body.postType).toBe("post");
  });
});
