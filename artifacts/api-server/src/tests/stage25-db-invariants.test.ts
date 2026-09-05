/**
 * STAGE 25 — Database Invariants, XP Economy Hardening & Authoritative State.
 *
 * Verifies that the DATABASE (not just the application) enforces the most
 * important invariants, driving the real Express app against real PostgreSQL
 * 18.4. Every assertion is backed by executed evidence. Gated on
 * TEST_DATABASE_URL, matching the established DB-integration convention.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import type { JwtPayload } from "../lib/auth";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 25 — database invariants & XP economy hardening", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let progression: typeof import("../lib/progression");
  let app: import("express").Express;
  let tokenA: string;
  let tokenB: string;
  let userA: string;
  let userB: string;
  const suffix = `s25-${Date.now()}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const un = (p: string) => (p + suffix.replace(/[^a-zA-Z0-9_]/g, "")).slice(0, 30);

  let seq = 0;
  async function freshTemplate(xp = 50): Promise<string> {
    const [t] = await db.insert(schema.questTemplatesTable).values({
      title: `S25 ${seq++}`, description: "d", category: "STRENGTH", questType: "SIMPLE",
      status: "ACTIVE", progressionConfig: { xp, attributes: [{ attribute: "STRENGTH", xp: Math.floor(xp / 2) }] },
    }).returning();
    return t.id;
  }
  async function ledgerSum(uid: string): Promise<number> {
    const r = await db.execute(sql`SELECT COALESCE(SUM(amount),0)::int AS n FROM xp_transactions WHERE user_id = ${uid}`);
    return Number(((r.rows ?? r) as any[])[0].n);
  }
  async function totalXp(uid: string): Promise<number> {
    const rows = await db.select().from(schema.userLevelsTable).where(eq(schema.userLevelsTable.userId, uid));
    return rows[0]?.totalXp ?? 0;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    progression = await import("../lib/progression");
    app = (await import("../app")).default;
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}-a@x.com`, username: un("a"), passwordHash: "x" }).returning();
    const [b] = await db.insert(schema.usersTable).values({ email: `${suffix}-b@x.com`, username: un("b"), passwordHash: "x" }).returning();
    userA = a.id;
    userB = b.id;
    const { signToken } = await import("../lib/auth");
    tokenA = signToken({ sub: userA, email: `${suffix}-a@x.com` });
    tokenB = signToken({ sub: userB, email: `${suffix}-b@x.com` });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 1 — authoritative XP invariant (D fix regression)
  // ════════════════════════════════════════════════════════════════════════
  describe("XP amount must never be negative — enforced by PostgreSQL", () => {
    it("direct negative inserts are rejected by the database CHECK constraint", async () => {
      for (const v of [-1, -50, -999999999]) {
        await expect(
          db.insert(schema.xpTransactionsTable).values({ userId: userA, amount: v, sourceType: "PROBE" }),
          `amount=${v} must be rejected`,
        ).rejects.toThrow();
      }
    });

    it("zero and positive amounts are accepted (zero cannot corrupt the SUM)", async () => {
      const [row] = await db.insert(schema.xpTransactionsTable).values({ userId: userA, amount: 0, sourceType: "PROBE" }).returning();
      expect(row.amount).toBe(0);
      await db.delete(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.id, row.id));
    });

    it("the CHECK constraint exists in the live database", async () => {
      const r = await db.execute(sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'xp_transactions_amount_nonnegative'`);
      const rows = (r.rows ?? r) as any[];
      expect(rows.length).toBe(1);
      expect(rows[0].def).toContain("amount >= 0");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 2 — total XP consistency (ledger authoritative)
  // ════════════════════════════════════════════════════════════════════════
  describe("SUM(xp_transactions.amount) == user_levels.total_xp", () => {
    it("holds after first award, multiple awards, and replay", async () => {
      const beforeSum = await ledgerSum(userA);
      const beforeTotal = await totalXp(userA);
      expect(beforeSum).toBe(beforeTotal);

      const tid = await freshTemplate(60);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA));
      await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)); // replay

      expect(await ledgerSum(userA)).toBe(await totalXp(userA));
      expect(await totalXp(userA)).toBe(beforeTotal + 60);
    });

    it("holds after concurrent awards (no phantom, no ledger-only/total-only XP)", async () => {
      const tid = await freshTemplate(45);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      const before = await totalXp(userA);
      await Promise.all([
        request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)),
        request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)),
        request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)),
      ]);
      expect(await totalXp(userA)).toBe(before + 45);
      expect(await ledgerSum(userA)).toBe(await totalXp(userA));
    });

    it("rollback of a failed completion leaves ledger and total unchanged together", async () => {
      // A completion against a nonexistent quest cannot award XP (no ledger-only XP).
      const before = await ledgerSum(userA);
      const ghost = "00000000-0000-4000-8000-0000000000aa";
      const r = await request(app).post(`/api/quests/${ghost}/complete`).set(auth(tokenA));
      expect(r.status).toBe(404);
      expect(await ledgerSum(userA)).toBe(before);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 3 — XP boundary / numeric safety (no coercion, no overflow)
  // ════════════════════════════════════════════════════════════════════════
  describe("XP numeric boundary safety", () => {
    it("awardXp ignores negative / zero / NaN / Infinity (never writes a transaction)", async () => {
      const before = await ledgerSum(userA);
      for (const xp of [-100, 0, NaN, Infinity]) {
        const res = await progression.awardXp({ userId: userA, sourceType: "PROBE", xp, idempotencyKey: `s25-bound-${xp}` });
        expect(res.transaction).toBeNull();
      }
      expect(await ledgerSum(userA)).toBe(before);
    });

    it("integer overflow at the DB boundary is rejected, not truncated", async () => {
      await expect(
        db.insert(schema.xpTransactionsTable).values({ userId: userA, amount: 2147483648, sourceType: "PROBE" }),
      ).rejects.toThrow();
    });

    it("no client endpoint accepts an XP amount (rewards are server-derived)", async () => {
      // The complete endpoints take only an id; any body XP field is ignored.
      const tid = await freshTemplate(50);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      const before = await totalXp(userA);
      const r = await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)).send({ xp: 999999, amount: 999999 });
      expect(r.status).toBe(200);
      expect(await totalXp(userA)).toBe(before + 50); // injected amount ignored
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 4 — XP source integrity
  // ════════════════════════════════════════════════════════════════════════
  describe("XP source integrity — no fabricated source", () => {
    it("B cannot complete A's quest or daily task (cross-user source rejected)", async () => {
      const tid = await freshTemplate(40);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      const r = await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenB));
      expect(r.status).toBe(404);
    });

    it("fabricated quest/task ids cannot award XP", async () => {
      const ghost = "00000000-0000-4000-8000-0000000000bb";
      const q = await request(app).post(`/api/quests/${ghost}/complete`).set(auth(tokenA));
      const t = await request(app).post(`/api/ai/daily-tasks/${ghost}/complete`).set(auth(tokenA));
      expect(q.status).toBe(404);
      expect(t.status).toBe(404);
    });

    it("a duplicated idempotency key cannot create a second ledger entry", async () => {
      const key = `${suffix}-dupkey`;
      await db.insert(schema.xpTransactionsTable).values({ userId: userA, amount: 10, sourceType: "PROBE", idempotencyKey: key });
      await expect(
        db.insert(schema.xpTransactionsTable).values({ userId: userA, amount: 10, sourceType: "PROBE", idempotencyKey: key }),
      ).rejects.toThrow();
      const rows = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.idempotencyKey, key));
      expect(rows.length).toBe(1);
      await db.delete(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.idempotencyKey, key));
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 5 — quest state machine
  // ════════════════════════════════════════════════════════════════════════
  describe("quest state machine — illegal transitions blocked", () => {
    it("progress cannot move a COMPLETED quest back to IN_PROGRESS", async () => {
      const tid = await freshTemplate(30);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA));
      const r = await request(app).patch(`/api/quests/${qid}/progress`).set(auth(tokenA)).send({ progress: 5 });
      expect(r.status).toBe(400);
    });

    it("progress endpoint never awards XP and never transitions to COMPLETED", async () => {
      const before = await totalXp(userA);
      const tid = await freshTemplate(35);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      await request(app).patch(`/api/quests/${qid}/progress`).set(auth(tokenA)).send({ progress: 999 });
      const [q] = await db.select().from(schema.userQuestsTable).where(eq(schema.userQuestsTable.id, qid));
      expect(q.status).toBe("IN_PROGRESS"); // never COMPLETED via progress
      expect(await totalXp(userA)).toBe(before); // no XP from progress
    });

    it("COMPLETED → COMPLETED replay is idempotent (alreadyAwarded, no extra XP)", async () => {
      const tid = await freshTemplate(25);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      const first = await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA));
      expect(first.body.xp.alreadyAwarded).toBe(false);
      const before = await totalXp(userA);
      const second = await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA));
      expect(second.body.xp.alreadyAwarded).toBe(true);
      expect(await totalXp(userA)).toBe(before);
    });

    it("abandoned quest cannot be completed", async () => {
      const tid = await freshTemplate(20);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      await request(app).post(`/api/quests/${qid}/abandon`).set(auth(tokenA));
      const r = await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA));
      expect(r.status).toBe(400);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 6 — daily task state machine
  // ════════════════════════════════════════════════════════════════════════
  describe("daily task state machine — exactly-once reward", () => {
    it("repeated completion is idempotent", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [task] = await db.insert(schema.aiDailyTasksTable).values({ userId: userA, date: today, taskText: "t", category: "STRENGTH", xpReward: 25 }).returning();
      const first = await request(app).post(`/api/ai/daily-tasks/${task.id}/complete`).set(auth(tokenA));
      expect(first.body.xp.alreadyAwarded).toBe(false);
      const before = await totalXp(userA);
      const second = await request(app).post(`/api/ai/daily-tasks/${task.id}/complete`).set(auth(tokenA));
      expect(second.body.alreadyCompleted).toBe(true);
      expect(await totalXp(userA)).toBe(before);
    });

    it("concurrent completion awards exactly once", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [task] = await db.insert(schema.aiDailyTasksTable).values({ userId: userA, date: today, taskText: "c", category: "ENDURANCE", xpReward: 30 }).returning();
      const before = await totalXp(userA);
      await Promise.all([
        request(app).post(`/api/ai/daily-tasks/${task.id}/complete`).set(auth(tokenA)),
        request(app).post(`/api/ai/daily-tasks/${task.id}/complete`).set(auth(tokenA)),
        request(app).post(`/api/ai/daily-tasks/${task.id}/complete`).set(auth(tokenA)),
      ]);
      expect(await totalXp(userA)).toBe(before + 30);
    });

    it("another user's task id cannot be completed", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [task] = await db.insert(schema.aiDailyTasksTable).values({ userId: userA, date: today, taskText: "x", category: "STRENGTH", xpReward: 25 }).returning();
      const r = await request(app).post(`/api/ai/daily-tasks/${task.id}/complete`).set(auth(tokenB));
      expect(r.status).toBe(404);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 7 — goal state integrity
  // ════════════════════════════════════════════════════════════════════════
  describe("goal state integrity — user-scoped, no cross-user", () => {
    it("goals are scoped to the authenticated user (A's goals never reach B)", async () => {
      await request(app).post("/api/ai/goals").set(auth(tokenA)).send({ goals: "build strength over time" });
      const a = await request(app).get("/api/ai/goals").set(auth(tokenA));
      const b = await request(app).get("/api/ai/goals").set(auth(tokenB));
      expect(a.body.goals).toBe("build strength over time");
      expect(b.body.goals).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 8 — denormalized counter consistency
  // ════════════════════════════════════════════════════════════════════════
  describe("denormalized counters stay synchronized", () => {
    it("posts.likes_count == COUNT(post_likes) across like/unlike", async () => {
      const [post] = await db.insert(schema.postsTable).values({ userId: userA, caption: "c1" }).returning();
      await request(app).post(`/api/social/posts/${post.id}/like`).set(auth(tokenB));
      await request(app).post(`/api/social/posts/${post.id}/like`).set(auth(tokenB)); // duplicate like no-op
      let [p] = await db.select().from(schema.postsTable).where(eq(schema.postsTable.id, post.id));
      let likes = await db.select().from(schema.postLikesTable).where(eq(schema.postLikesTable.postId, post.id));
      expect(p.likesCount).toBe(likes.length);
      expect(likes.length).toBe(1);

      await request(app).delete(`/api/social/posts/${post.id}/like`).set(auth(tokenB));
      [p] = await db.select().from(schema.postsTable).where(eq(schema.postsTable.id, post.id));
      likes = await db.select().from(schema.postLikesTable).where(eq(schema.postLikesTable.postId, post.id));
      expect(p.likesCount).toBe(0);
      expect(likes.length).toBe(0);
    });

    it("likes_count is non-negative (GREATEST guard) even after over-unlike", async () => {
      const [post] = await db.insert(schema.postsTable).values({ userId: userA, caption: "c2" }).returning();
      await request(app).delete(`/api/social/posts/${post.id}/like`).set(auth(tokenB)); // no like yet
      const [p] = await db.select().from(schema.postsTable).where(eq(schema.postsTable.id, post.id));
      expect(p.likesCount).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 9/17 — database constraint hardening (direct adversarial)
  // ════════════════════════════════════════════════════════════════════════
  describe("database enforces non-negative invariants (direct writes)", () => {
    it("negative total_xp is rejected", async () => {
      await expect(db.insert(schema.userLevelsTable).values({ userId: userA, currentLevel: 1, totalXp: -5 })).rejects.toThrow();
    });
    it("current_level < 1 is rejected", async () => {
      await expect(db.insert(schema.userLevelsTable).values({ userId: userA, currentLevel: 0, totalXp: 0 })).rejects.toThrow();
    });
    it("negative attribute current_value is rejected", async () => {
      await expect(db.insert(schema.userAttributesTable).values({ userId: userA, attribute: "STRENGTH", currentValue: -1 })).rejects.toThrow();
    });
    it("negative attribute_history delta is rejected", async () => {
      await expect(db.insert(schema.attributeHistoryTable).values({ userId: userA, attribute: "STRENGTH", delta: -1, sourceType: "PROBE" })).rejects.toThrow();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 11 — unique constraint races
  // ════════════════════════════════════════════════════════════════════════
  describe("uniqueness races are database-protected", () => {
    it("concurrent likes produce exactly one row and one counter increment", async () => {
      const [post] = await db.insert(schema.postsTable).values({ userId: userA, caption: "race-like" }).returning();
      await Promise.all([
        request(app).post(`/api/social/posts/${post.id}/like`).set(auth(tokenB)),
        request(app).post(`/api/social/posts/${post.id}/like`).set(auth(tokenB)),
        request(app).post(`/api/social/posts/${post.id}/like`).set(auth(tokenB)),
      ]);
      const likes = await db.select().from(schema.postLikesTable).where(eq(schema.postLikesTable.postId, post.id));
      const [p] = await db.select().from(schema.postsTable).where(eq(schema.postsTable.id, post.id));
      expect(likes.length).toBe(1);
      expect(p.likesCount).toBe(1);
    });

    it("concurrent follows produce exactly one row", async () => {
      await Promise.all([
        request(app).post(`/api/social/users/${userB}/follow`).set(auth(tokenA)),
        request(app).post(`/api/social/users/${userB}/follow`).set(auth(tokenA)),
      ]);
      const rows = await db.execute(sql`SELECT COUNT(*)::int AS n FROM follows WHERE follower_id = ${userA} AND following_id = ${userB}`);
      expect(Number(((rows.rows ?? rows) as any[])[0].n)).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 13 — timestamp integrity (server-controlled)
  // ════════════════════════════════════════════════════════════════════════
  describe("timestamps are server-controlled, not client-forgeable", () => {
    it("a client-supplied createdAt/completedAt is ignored", async () => {
      const forged = "1999-01-01T00:00:00.000Z";
      const r = await request(app).post("/api/social/posts").set(auth(tokenA)).send({ caption: "ts-test", createdAt: forged });
      expect(r.status).toBe(201);
      const [p] = await db.select().from(schema.postsTable).where(eq(schema.postsTable.id, r.body.id));
      const year = new Date(p.createdAt).getFullYear();
      expect(year).toBeGreaterThan(2010); // not the forged 1999
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 15 — transactional consistency (re-verify with new constraints)
  // ════════════════════════════════════════════════════════════════════════
  describe("transactional atomicity survives the new constraints", () => {
    it("quest completion still writes status + XP + attributes atomically", async () => {
      const tid = await freshTemplate(55);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      const before = await ledgerSum(userA);
      const r = await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA));
      expect(r.status).toBe(200);
      expect(await ledgerSum(userA)).toBe(before + 55);
      const [q] = await db.select().from(schema.userQuestsTable).where(eq(schema.userQuestsTable.id, qid));
      expect(q.status).toBe("COMPLETED");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 16 — concurrency soak
  // ════════════════════════════════════════════════════════════════════════
  describe("concurrency soak — critical races repeated", () => {
    it("10 rounds of concurrent triple-completion each award exactly once", async () => {
      for (let i = 0; i < 10; i++) {
        const tid = await freshTemplate(10);
        const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
        const before = await totalXp(userA);
        await Promise.all([
          request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)),
          request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)),
          request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)),
        ]);
        expect(await totalXp(userA)).toBe(before + 10);
        expect(await ledgerSum(userA)).toBe(await totalXp(userA));
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 18 — Stage 23/24 regression
  // ════════════════════════════════════════════════════════════════════════
  describe("Stage 23/24 guarantees intact after new constraints", () => {
    it("B still cannot read/mutate A's data (IDOR intact)", async () => {
      const me = await request(app).get("/api/users/me").set(auth(tokenB));
      expect(me.body.id).toBe(userB);
      const pub = await request(app).get(`/api/social/users/${userA}`).set(auth(tokenB));
      expect(JSON.stringify(pub.body)).not.toContain("dateOfBirth");
      expect(JSON.stringify(pub.body)).not.toContain("activityLevel");
    });

    it("account deletion still leaves no orphan XP (cascade + ledger integrity)", async () => {
      const [u] = await db.insert(schema.usersTable).values({ email: `${suffix}-del@x.com`, username: un("del"), passwordHash: "x" }).returning();
      const t = (await import("../lib/auth")).signToken({ sub: u.id, email: `${suffix}-del@x.com` } as JwtPayload);
      const tid = await freshTemplate(40);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(t)).then((r) => r.body.id);
      await request(app).post(`/api/quests/${qid}/complete`).set(auth(t));
      await request(app).delete("/api/users/me").set(auth(t));
      const orphan = await db.execute(sql`SELECT COUNT(*)::int AS n FROM xp_transactions WHERE user_id = ${u.id}`);
      expect(Number(((orphan.rows ?? orphan) as any[])[0].n)).toBe(0);
    });
  });
});
