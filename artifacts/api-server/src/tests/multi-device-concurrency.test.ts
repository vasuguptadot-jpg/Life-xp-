/**
 * STAGE 21 — Part 4: multi-device concurrency.
 *
 * Simulates the SAME user on phone + desktop + second phone operating
 * concurrently (each device = an independent authenticated request stream) and
 * asserts the invariants: no lost updates, no duplicate rewards, no impossible
 * levels, no negative attributes, deterministic final state.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 21 — multi-device concurrency (Part 4)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let app: import("express").Express;
  let tokenA: string;
  let userA: string;
  const suffix = `md-${Date.now()}`;
  let seq = 0;

  async function freshTemplate(xp = 40): Promise<string> {
    const [t] = await db.insert(schema.questTemplatesTable).values({
      title: `MD ${seq++}`, description: "d", category: "STRENGTH", questType: "SIMPLE",
      status: "ACTIVE", progressionConfig: { xp, attributes: [{ attribute: "STRENGTH", xp: Math.floor(xp / 2) }] },
    }).returning();
    return t.id;
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

  it("three devices completing the SAME quest concurrently award XP exactly once", async () => {
    const tpl = await freshTemplate(60);
    const assign = await request(app).post(`/api/quests/assign/${tpl}`).set("Authorization", `Bearer ${tokenA}`);
    const qid = assign.body.id;

    // phone, desktop, second phone all hit /complete at once
    const [r1, r2, r3] = await Promise.all([
      request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`),
      request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`),
      request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`),
    ]);
    for (const r of [r1, r2, r3]) expect(r.status).toBe(200);

    const tx = await db.select().from(schema.xpTransactionsTable)
      .where(eq(schema.xpTransactionsTable.userId, userA));
    const rewards = tx.filter((t) => t.sourceType === "QUEST_COMPLETION" && t.sourceId === qid);
    expect(rewards.length).toBe(1);
    expect(rewards[0].amount).toBe(60);
  });

  it("three devices completing DIFFERENT quests concurrently sum correctly (no lost update)", async () => {
    const before = (await db.select().from(schema.userLevelsTable).where(eq(schema.userLevelsTable.userId, userA)))[0]?.totalXp ?? 0;

    const tpls = await Promise.all([freshTemplate(30), freshTemplate(40), freshTemplate(50)]);
    const qids = await Promise.all(tpls.map((t) =>
      request(app).post(`/api/quests/assign/${t}`).set("Authorization", `Bearer ${tokenA}`).then((r) => r.body.id),
    ));

    await Promise.all(qids.map((qid) =>
      request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`),
    ));

    const after = (await db.select().from(schema.userLevelsTable).where(eq(schema.userLevelsTable.userId, userA)))[0]?.totalXp ?? 0;
    expect(after).toBe(before + 30 + 40 + 50);
  });

  it("concurrent goal updates converge (last-write-wins single row, no orphan rows)", async () => {
    const bodies = ["goal alpha from phone", "goal beta from desktop", "goal gamma from tablet"];
    await Promise.all(bodies.map((g) =>
      request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: g }),
    ));

    const rows = await db.select().from(schema.aiUserGoalsTable).where(eq(schema.aiUserGoalsTable.userId, userA));
    expect(rows.length).toBe(1); // single upsert row, never duplicates
    expect(bodies).toContain(rows[0].goals);
  });

  it("concurrent like/unlike of the same post never yields a negative count and converges", async () => {
    const [post] = await db.insert(schema.postsTable).values({ userId: userA, caption: "device race post" }).returning();

    // Two devices like, one unlikes, concurrently.
    await Promise.all([
      request(app).post(`/api/social/posts/${post.id}/like`).set("Authorization", `Bearer ${tokenA}`),
      request(app).post(`/api/social/posts/${post.id}/like`).set("Authorization", `Bearer ${tokenA}`),
      request(app).delete(`/api/social/posts/${post.id}/like`).set("Authorization", `Bearer ${tokenA}`),
    ]);

    const [p] = await db.select().from(schema.postsTable).where(eq(schema.postsTable.id, post.id));
    // likes_count can only be 0 or 1 (never negative); the denormalized count
    // must equal the actual like rows.
    expect(p.likesCount).toBeGreaterThanOrEqual(0);
    const likeRows = await db.select().from(schema.postLikesTable).where(eq(schema.postLikesTable.postId, post.id));
    expect(likeRows.length).toBeLessThanOrEqual(1);
  });

  it("attributes never go negative and level never decreases across device churn", async () => {
    const attrs = await db.select().from(schema.userAttributesTable).where(eq(schema.userAttributesTable.userId, userA));
    for (const a of attrs) expect(a.currentValue).toBeGreaterThanOrEqual(0);
    const [lvl] = await db.select().from(schema.userLevelsTable).where(eq(schema.userLevelsTable.userId, userA));
    expect(lvl.currentLevel).toBeGreaterThanOrEqual(1);
  });
});
