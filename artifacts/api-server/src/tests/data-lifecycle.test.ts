/**
 * STAGE 21 — Part 7: data lifecycle & deletion integrity.
 *
 * Traces create → update → complete → abandon → delete → recreate, and verifies
 * account deletion cascades cleanly while surfacing orphan risks.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 21 — data lifecycle & deletion integrity (Part 7)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let app: import("express").Express;
  const suffix = `dl-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    app = (await import("../app")).default;
  });

  it("account deletion cascades all child data (no orphaned XP/level/attributes/goals/tasks)", async () => {
    const { signToken } = await import("../lib/auth");
    const [u] = await db.insert(schema.usersTable).values({ email: `${suffix}@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    const token = signToken({ sub: u.id, email: `${suffix}@x.com` });
    const h = { Authorization: `Bearer ${token}` };

    // Populate several child tables.
    const [tpl] = await db.insert(schema.questTemplatesTable).values({
      title: "dl", description: "d", category: "STRENGTH", questType: "SIMPLE", status: "ACTIVE", progressionConfig: { xp: 50 },
    }).returning();
    const qid = (await request(app).post(`/api/quests/assign/${tpl.id}`).set(h)).body.id;
    await request(app).post(`/api/quests/${qid}/complete`).set(h);
    await request(app).post("/api/ai/goals").set(h).send({ goals: "dl goal" });
    await db.insert(schema.aiDailyTasksTable).values({ userId: u.id, date: "2026-09-03", taskText: "dl", category: "STRENGTH", xpReward: 25 });

    // Delete the account.
    const del = await request(app).delete("/api/users/me").set(h);
    expect(del.status).toBe(200);

    // All child rows must be gone (FK onDelete: cascade).
    for (const [table, where] of [
      [schema.xpTransactionsTable, eq(schema.xpTransactionsTable.userId, u.id)],
      [schema.userLevelsTable, eq(schema.userLevelsTable.userId, u.id)],
      [schema.userAttributesTable, eq(schema.userAttributesTable.userId, u.id)],
      [schema.userQuestsTable, eq(schema.userQuestsTable.userId, u.id)],
      [schema.aiUserGoalsTable, eq(schema.aiUserGoalsTable.userId, u.id)],
      [schema.aiDailyTasksTable, eq(schema.aiDailyTasksTable.userId, u.id)],
    ] as const) {
      const rows = await db.select().from(table).where(where);
      expect(rows.length).toBe(0);
    }

    // The user row itself is gone.
    const users = await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, u.id));
    expect(users.length).toBe(0);
  });

  it("FINDING (C): deleting a user leaves orphaned conversations (no cascade on conversations)", async () => {
    const { signToken } = await import("../lib/auth");
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}2a@x.com`, username: `c${suffix}`, passwordHash: "x" }).returning();
    const [b] = await db.insert(schema.usersTable).values({ email: `${suffix}2b@x.com`, username: `d${suffix}`, passwordHash: "x" }).returning();
    const tokenA = signToken({ sub: a.id, email: `${suffix}2a@x.com` });

    const conv = await request(app).post("/api/messages/conversations").set("Authorization", `Bearer ${tokenA}`).send({ otherUserId: b.id });
    const convId = conv.body.id;

    // Delete user A.
    await request(app).delete("/api/users/me").set("Authorization", `Bearer ${tokenA}`);

    // The conversation row persists, now with only user B as a member.
    const convRows = await db.execute(sql`SELECT id FROM conversations WHERE id = ${convId}`);
    expect(convRows.rows.length).toBe(1);

    const memberRows = await db.execute(sql`SELECT COUNT(*)::int AS c FROM conversation_members WHERE conversation_id = ${convId}`);
    // A's membership was cascade-deleted; B's remains → orphaned/one-sided thread.
    expect(Number(memberRows.rows[0].c)).toBe(1);
  });

  it("abandoned quest does not award XP and can be re-assigned (retry path intact)", async () => {
    const { signToken } = await import("../lib/auth");
    const [u] = await db.insert(schema.usersTable).values({ email: `${suffix}3@x.com`, username: `e${suffix}`, passwordHash: "x" }).returning();
    const token = signToken({ sub: u.id, email: `${suffix}3@x.com` });
    const h = { Authorization: `Bearer ${token}` };

    const [tpl] = await db.insert(schema.questTemplatesTable).values({
      title: "dl-abandon", description: "d", category: "STRENGTH", questType: "SIMPLE", status: "ACTIVE", progressionConfig: { xp: 50 },
    }).returning();
    const qid = (await request(app).post(`/api/quests/assign/${tpl.id}`).set(h)).body.id;
    await request(app).post(`/api/quests/${qid}/abandon`).set(h);

    // Abandoning awarded no XP.
    const tx = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, u.id));
    expect(tx.length).toBe(0);

    // Re-assign (abandon is a legitimate retry path, unlike COMPLETED).
    const reassign = await request(app).post(`/api/quests/assign/${tpl.id}`).set(h);
    expect(reassign.status).toBe(201);
  });
});
