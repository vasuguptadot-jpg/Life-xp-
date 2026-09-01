/**
 * STAGE 20 — Part 1: XP Economy / Anti-Gaming adversarial tests.
 *
 * Exercises every XP-awarding path against real PostgreSQL. Gated on
 * TEST_DATABASE_URL, matching the existing DB-integration convention.
 *
 * The two award sources are:
 *   1. POST /api/quests/:id/complete   → awardXp(sourceType=QUEST_COMPLETION)
 *   2. POST /api/ai/daily-tasks/:id/complete → awardXp(sourceType=DAILY_TASK)
 * There is no public award endpoint; clients cannot mint arbitrary XP.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 20 — XP economy / anti-gaming (Part 1)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let progression: typeof import("../lib/progression");
  let app: import("express").Express;
  let tokenA: string;
  let tokenB: string;
  let userA: string;
  let userB: string;
  const suffix = `ag-${Date.now()}`;

  async function userLevel(uid: string) {
    const rows = await db.select().from(schema.userLevelsTable).where(eq(schema.userLevelsTable.userId, uid));
    return rows[0] ?? { currentLevel: 1, totalXp: 0 };
  }

  // Each test that assigns a quest gets its own fresh template, because a
  // completed template can no longer be re-assigned (the AG-1 fix itself).
  let seq = 0;
  async function freshTemplate(xp = 50): Promise<string> {
    const [t] = await db.insert(schema.questTemplatesTable).values({
      title: `Probe ${seq++}`, description: "d", category: "STRENGTH", questType: "SIMPLE",
      status: "ACTIVE", progressionConfig: { xp, attributes: [{ attribute: "STRENGTH", xp: Math.floor(xp / 2) }] },
    }).returning();
    return t.id;
  }
  async function assignQuest(uid: string, token: string, templateId: string): Promise<string> {
    const res = await request(app).post(`/api/quests/assign/${templateId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(201);
    return res.body.id;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    progression = await import("../lib/progression");
    app = (await import("../app")).default;

    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}-a@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    const [b] = await db.insert(schema.usersTable).values({ email: `${suffix}-b@x.com`, username: `b${suffix}`, passwordHash: "x" }).returning();
    userA = a.id;
    userB = b.id;

    const { signToken } = await import("../lib/auth");
    tokenA = signToken({ sub: userA, email: `${suffix}-a@x.com` });
    tokenB = signToken({ sub: userB, email: `${suffix}-b@x.com` });
  });

  // ── Quest completion ────────────────────────────────────────────────────────
  it("duplicate completion is idempotent — second complete awards nothing", async () => {
    const tid = await freshTemplate();
    const qid = await assignQuest(userA, tokenA, tid);
    const first = await request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`);
    expect(first.status).toBe(200);
    expect(first.body.xp.alreadyAwarded).toBe(false);

    const before = await userLevel(userA);
    const second = await request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`);
    expect(second.status).toBe(200);
    expect(second.body.xp.alreadyAwarded).toBe(true);
    const after = await userLevel(userA);
    expect(after.totalXp).toBe(before.totalXp); // no double award
  });

  it("repeated quest completion via re-assign is blocked (AG-1 fix)", async () => {
    const tid = await freshTemplate();
    const qid = await assignQuest(userA, tokenA, tid);
    await request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`);

    // Re-assigning the SAME template after completion must be refused.
    const reassign = await request(app).post(`/api/quests/assign/${tid}`).set("Authorization", `Bearer ${tokenA}`);
    expect(reassign.status).toBe(409);
    expect(reassign.body.message).toMatch(/already completed|repeat/i);

    // Exactly one QUEST_COMPLETION transaction for that quest.
    const tx = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.sourceId, qid));
    expect(tx).toHaveLength(1);
  });

  it("abandoned quests remain re-assignable (legitimate retry)", async () => {
    const tid = await freshTemplate();
    const qid = await assignQuest(userB, tokenB, tid);
    const abandon = await request(app).post(`/api/quests/${qid}/abandon`).set("Authorization", `Bearer ${tokenB}`);
    expect(abandon.status).toBe(200);

    const reassign = await request(app).post(`/api/quests/assign/${tid}`).set("Authorization", `Bearer ${tokenB}`);
    expect(reassign.status).toBe(201);
  });

  it("concurrent completion of the same quest awards XP exactly once", async () => {
    const tid = await freshTemplate();
    const qid = await assignQuest(userA, tokenA, tid);
    const before = await userLevel(userA);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`),
      ),
    );
    for (const r of results) expect([200, 409]).toContain(r.status);

    const after = await userLevel(userA);
    expect(after.totalXp - before.totalXp).toBe(50);
  });

  it("multiple reward sources in the same day both count (quest + daily task)", async () => {
    const { generateDailyTasks } = await import("../lib/life-engine");
    const tasks = await generateDailyTasks(userA);
    expect(tasks.length).toBeGreaterThan(0);

    const before = await userLevel(userA);
    const t = tasks[0];
    const res = await request(app).post(`/api/ai/daily-tasks/${t.id}/complete`).set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.xp.alreadyAwarded).toBe(false);
    const after = await userLevel(userA);
    expect(after.totalXp - before.totalXp).toBe(t.xpReward);

    // Replay the same daily-task completion → idempotent (alreadyCompleted flag).
    const replay = await request(app).post(`/api/ai/daily-tasks/${t.id}/complete`).set("Authorization", `Bearer ${tokenA}`);
    expect(replay.status).toBe(200);
    expect(replay.body.alreadyCompleted).toBe(true);
  });

  // ── Authorization / IDOR ────────────────────────────────────────────────────
  it("no public endpoint lets a client mint arbitrary XP", async () => {
    const res = await request(app).post("/api/progression/award").set("Authorization", `Bearer ${tokenA}`).send({ xp: 9999 });
    expect(res.status).toBe(404);
  });

  it("user B cannot complete user A's quest (IDOR)", async () => {
    const tid = await freshTemplate();
    const qid = await assignQuest(userA, tokenA, tid);
    const res = await request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
    const before = await userLevel(userB);
    expect(before.totalXp).toBe(0);
  });

  it("user B cannot complete user A's daily task (IDOR)", async () => {
    const { generateDailyTasks } = await import("../lib/life-engine");
    const tasks = await generateDailyTasks(userA);
    const res = await request(app).post(`/api/ai/daily-tasks/${tasks[0].id}/complete`).set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  // ── awardXp service boundary (defense in depth) ─────────────────────────────
  it("negative XP is ignored, not awarded", async () => {
    const before = await userLevel(userA);
    const r = await progression.awardXp({ userId: userA, sourceType: "TEST", xp: -500, idempotencyKey: `${suffix}-neg` });
    expect(r.transaction).toBeNull();
    const after = await userLevel(userA);
    expect(after.totalXp).toBe(before.totalXp);
  });

  it("malformed (NaN / Infinity) XP is ignored, not awarded", async () => {
    const before = await userLevel(userA);
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: NaN, idempotencyKey: `${suffix}-nan` });
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: Infinity, idempotencyKey: `${suffix}-inf` });
    const after = await userLevel(userA);
    expect(after.totalXp).toBe(before.totalXp);
  });

  it("negative / unknown attribute deltas are sanitized (attributes stay non-negative)", async () => {
    const before = await db.select().from(schema.userAttributesTable).where(eq(schema.userAttributesTable.userId, userA));
    const r = await progression.awardXp({
      userId: userA,
      sourceType: "TEST",
      xp: 10,
      idempotencyKey: `${suffix}-attrneg`,
      attributes: [
        { attribute: "STRENGTH" as any, xp: -100 },
        { attribute: "NOT_REAL" as any, xp: 50 },
        { attribute: "STRENGTH" as any, xp: 20 },
      ],
    });
    expect(r.attributeResults.map((a) => a.attribute)).toEqual(["STRENGTH"]);
    const after = await db.select().from(schema.userAttributesTable).where(eq(schema.userAttributesTable.userId, userA));
    const strengthBefore = before.find((a) => a.attribute === "STRENGTH")?.currentValue ?? 0;
    const strengthAfter = after.find((a) => a.attribute === "STRENGTH")?.currentValue ?? 0;
    expect(strengthAfter - strengthBefore).toBe(20);
    expect(strengthAfter).toBeGreaterThanOrEqual(0);
  });

  it("very large but in-range XP is awarded without level overflow", async () => {
    const r = await progression.awardXp({ userId: userA, sourceType: "TEST", xp: 1_000_000, idempotencyKey: `${suffix}-big` });
    expect(r.transaction).not.toBeNull();
    const lvl = await userLevel(userA);
    expect(lvl.totalXp).toBeGreaterThanOrEqual(1_000_000);
    expect(Number.isFinite(lvl.currentLevel)).toBe(true);
  });

  it("transaction rollback on FK failure leaves no partial award", async () => {
    const bogusId = "00000000-0000-4000-8000-000000000000";
    await expect(
      progression.awardXp({ userId: bogusId, sourceType: "TEST", xp: 50, idempotencyKey: `${suffix}-fk`, attributes: [{ attribute: "STRENGTH", xp: 25 }] }),
    ).rejects.toThrow();
    const tx = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, bogusId));
    expect(tx).toHaveLength(0);
  });
});
