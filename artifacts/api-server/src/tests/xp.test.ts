import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { app, createTestUser } from "./helpers";

const createdEmails: string[] = [];

afterEach(async () => {
  for (const email of createdEmails.splice(0)) {
    // CASCADE deletes all related data (xp_transactions, user_levels, etc.)
    await db.delete(usersTable).where(eq(usersTable.email, email));
  }
});

describe("XP security — client cannot forge XP", () => {
  it("POST /api/progression/award does not exist (endpoint removed)", async () => {
    const user = await createTestUser();
    createdEmails.push(user.email);

    const res = await request(app)
      .post("/api/progression/award")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ sourceType: "cheat", xp: 99999 });

    // Must not be 200 or 201 — endpoint should not exist
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);
    // 404 expected since route is removed
    expect(res.status).toBe(404);
  });

  it("unauthenticated requests to progression are rejected", async () => {
    const res = await request(app).get("/api/progression/summary");
    expect(res.status).toBe(401);
  });

  it("authenticated user sees progression summary", async () => {
    const user = await createTestUser();
    createdEmails.push(user.email);

    const res = await request(app)
      .get("/api/progression/summary")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("level");
    expect(res.body).toHaveProperty("attributes");
    expect(res.body).toHaveProperty("recentTransactions");
  });
});

describe("XP idempotency", () => {
  it("awards XP once and skips duplicate idempotency key (via internal service)", async () => {
    const { awardXp } = await import("../lib/progression");
    const user = await createTestUser();
    createdEmails.push(user.email);

    const idempotencyKey = `test-idem-${Date.now()}`;

    const first = await awardXp({
      userId: user.id,
      sourceType: "TEST",
      idempotencyKey,
      xp: 50,
    });
    expect(first.alreadyAwarded).toBe(false);
    expect(first.levelRow?.totalXp).toBe(50);

    const second = await awardXp({
      userId: user.id,
      sourceType: "TEST",
      idempotencyKey,
      xp: 50,
    });
    expect(second.alreadyAwarded).toBe(true);

    // XP must not have been doubled
    const summary = await request(app)
      .get("/api/progression/summary")
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(summary.body.level.totalXp).toBe(50);
  });
});

describe("Attribute idempotency by (sourceId, attribute)", () => {
  it("the same sourceId can award different attributes independently", async () => {
    const { awardXp } = await import("../lib/progression");
    const user = await createTestUser();
    createdEmails.push(user.email);

    const sourceId = `test-source-${Date.now()}`;

    // Award STRENGTH for sourceId
    const r1 = await awardXp({
      userId: user.id,
      sourceType: "TEST",
      sourceId,
      xp: 10,
      attributes: [{ attribute: "STRENGTH", xp: 5 }],
    });
    expect(r1.attributeResults.find((a) => a.attribute === "STRENGTH")).toBeDefined();

    // Award ENDURANCE for the same sourceId — must NOT be blocked by STRENGTH
    const r2 = await awardXp({
      userId: user.id,
      sourceType: "TEST",
      sourceId,
      xp: 10,
      attributes: [{ attribute: "ENDURANCE", xp: 5 }],
    });
    expect(r2.attributeResults.find((a) => a.attribute === "ENDURANCE")).toBeDefined();

    // Award STRENGTH again for the same sourceId — must be skipped (duplicate)
    const r3 = await awardXp({
      userId: user.id,
      sourceType: "TEST",
      sourceId,
      attributes: [{ attribute: "STRENGTH", xp: 5 }],
    });
    expect(r3.attributeResults.find((a) => a.attribute === "STRENGTH")).toBeUndefined();
  });
});
