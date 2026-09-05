/**
 * STAGE 21 — Part 3: idempotency audit.
 *
 * Systematically classifies every state-mutating endpoint by whether a client
 * can safely retry it after a network timeout, and whether concurrent requests
 * are safe. Each assertion encodes the matrix cell for that endpoint.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 21 — idempotency audit (Part 3)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let app: import("express").Express;
  let tokenA: string;
  let tokenB: string;
  let userA: string;
  let userB: string;
  const suffix = `id-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    app = (await import("../app")).default;
    const { signToken } = await import("../lib/auth");
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}-a@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    const [b] = await db.insert(schema.usersTable).values({ email: `${suffix}-b@x.com`, username: `b${suffix}`, passwordHash: "x" }).returning();
    userA = a.id; userB = b.id;
    tokenA = signToken({ sub: userA, email: `${suffix}-a@x.com` });
    tokenB = signToken({ sub: userB, email: `${suffix}-b@x.com` });
  });

  it("quest completion is idempotent + replay-safe (retry after timeout returns alreadyAwarded)", async () => {
    const [tpl] = await db.insert(schema.questTemplatesTable).values({
      title: "id-a", description: "d", category: "STRENGTH", questType: "SIMPLE", status: "ACTIVE", progressionConfig: { xp: 50 },
    }).returning();
    const qid = (await request(app).post(`/api/quests/assign/${tpl.id}`).set("Authorization", `Bearer ${tokenA}`)).body.id;

    const r1 = await request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`);
    const r2 = await request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body.xp.alreadyAwarded).toBe(true);

    const tx = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, userA));
    expect(tx.filter((t) => t.sourceType === "QUEST_COMPLETION" && t.sourceId === qid).length).toBe(1);
  });

  it("daily-task completion is idempotent + replay-safe", async () => {
    const [task] = await db.insert(schema.aiDailyTasksTable).values({
      userId: userA, date: "2026-09-02", taskText: "id task", category: "ENDURANCE", xpReward: 25,
    }).returning();
    const r1 = await request(app).post(`/api/ai/daily-tasks/${task.id}/complete`).set("Authorization", `Bearer ${tokenA}`);
    const r2 = await request(app).post(`/api/ai/daily-tasks/${task.id}/complete`).set("Authorization", `Bearer ${tokenA}`);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body.alreadyCompleted).toBe(true);
    const tx = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, userA));
    expect(tx.filter((t) => t.sourceType === "DAILY_TASK" && t.sourceId === task.id).length).toBe(1);
  });

  it("goals upsert is idempotent (retry converges to one row, latest wins)", async () => {
    await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: "goal v1" });
    await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: "goal v1" });
    const rows = await db.select().from(schema.aiUserGoalsTable).where(eq(schema.aiUserGoalsTable.userId, userA));
    expect(rows.length).toBe(1);
    expect(rows[0].goals).toBe("goal v1");
  });

  it("like/unlike are idempotent (repeat like = one row, repeat unlike = no crash, non-negative count)", async () => {
    const [post] = await db.insert(schema.postsTable).values({ userId: userA, caption: "id post" }).returning();
    await request(app).post(`/api/social/posts/${post.id}/like`).set("Authorization", `Bearer ${tokenA}`);
    await request(app).post(`/api/social/posts/${post.id}/like`).set("Authorization", `Bearer ${tokenA}`);
    const likes = await db.select().from(schema.postLikesTable).where(eq(schema.postLikesTable.postId, post.id));
    expect(likes.length).toBe(1); // ON CONFLICT DO NOTHING

    await request(app).delete(`/api/social/posts/${post.id}/like`).set("Authorization", `Bearer ${tokenA}`);
    await request(app).delete(`/api/social/posts/${post.id}/like`).set("Authorization", `Bearer ${tokenA}`);
    const [p] = await db.select().from(schema.postsTable).where(eq(schema.postsTable.id, post.id));
    expect(p.likesCount).toBe(0); // GREATEST(count-1, 0) never negative
  });

  it("follow is idempotent (repeat follow = one row, cross-user safe)", async () => {
    await request(app).post(`/api/social/users/${userB}/follow`).set("Authorization", `Bearer ${tokenA}`);
    await request(app).post(`/api/social/users/${userB}/follow`).set("Authorization", `Bearer ${tokenA}`);
    const rows = await db.execute(
      (await import("drizzle-orm")).sql`SELECT COUNT(*)::int AS c FROM follows WHERE follower_id = ${userA} AND following_id = ${userB}`,
    );
    expect(Number(rows.rows[0].c)).toBe(1);
  });

  it("FINDING (C): concurrent conversation creation can mint duplicate conversations for the same pair", async () => {
    // Two concurrent POST /conversations for the same (userA, userB) can both pass
    // the "already exists?" check and each create a conversation, because there is
    // no uniqueness constraint on the unordered member pair. No data loss / no XP
    // impact — but the user ends up with two threads to the same person, and there
    // is no delete-conversation endpoint to clean it up.
    const [r1, r2] = await Promise.all([
      request(app).post("/api/messages/conversations").set("Authorization", `Bearer ${tokenA}`).send({ otherUserId: userB }),
      request(app).post("/api/messages/conversations").set("Authorization", `Bearer ${tokenA}`).send({ otherUserId: userB }),
    ]);
    // Timing-dependent: the race window is narrow, so the second request may
    // either create a duplicate (201) or observe the first (200, existing=true).
    // Either way the finding stands: the check-then-insert is not atomic.
    expect([200, 201]).toContain(r1.status);
    expect([200, 201]).toContain(r2.status);

    // Count conversations shared by the pair.
    const rows = await db.execute(
      (await import("drizzle-orm")).sql`
        SELECT COUNT(*)::int AS c FROM conversations c
        WHERE (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) = 2
          AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = ${userA})
          AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = ${userB})
      `,
    );
    // Recorded as a finding: this may be 1 or 2 depending on interleaving.
    expect(Number(rows.rows[0].c)).toBeGreaterThanOrEqual(1);
  });
});
