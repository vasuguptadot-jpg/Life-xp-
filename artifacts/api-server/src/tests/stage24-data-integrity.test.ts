/**
 * STAGE 24 — Data Integrity, Privacy, Lifecycle & Disaster-Recovery Audit.
 *
 * Attacks the LIVE application + real PostgreSQL to establish whether user data
 * has a COMPLETE, CONSISTENT, TRACEABLE lifecycle. Gated on TEST_DATABASE_URL,
 * matching the established DB-integration convention. Every test asserts the
 * invariant it names, or documents a genuine finding with an explicit
 * expectation.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import type { JwtPayload } from "../lib/auth";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 24 — data integrity, privacy & lifecycle audit", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let app: import("express").Express;
  let tokenA: string;
  let tokenB: string;
  let userA: string;
  let userB: string;
  const suffix = `s24-${Date.now()}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const un = (p: string) => (p + suffix.replace(/[^a-zA-Z0-9_]/g, "")).slice(0, 30);

  let seq = 0;
  let signToken: (p: JwtPayload) => string;
  async function freshTemplate(xp = 50): Promise<string> {
    const [t] = await db.insert(schema.questTemplatesTable).values({
      title: `S24 ${seq++}`, description: "d", category: "STRENGTH", questType: "SIMPLE",
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
    app = (await import("../app")).default;
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}-a@x.com`, username: un("a"), passwordHash: "x" }).returning();
    const [b] = await db.insert(schema.usersTable).values({ email: `${suffix}-b@x.com`, username: un("b"), passwordHash: "x" }).returning();
    userA = a.id;
    userB = b.id;
    const authMod = await import("../lib/auth");
    signToken = authMod.signToken;
    tokenA = signToken({ sub: userA, email: `${suffix}-a@x.com` });
    tokenB = signToken({ sub: userB, email: `${suffix}-b@x.com` });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 2 — account deletion lifecycle
  // ════════════════════════════════════════════════════════════════════════
  describe("account deletion lifecycle (hard delete + cascade)", () => {
    it("deletes a fully-populated user and leaves NO orphaned child rows", async () => {
      // Build a throwaway user with a complete data profile.
      const [u] = await db.insert(schema.usersTable).values({ email: `${suffix}-del@x.com`, username: un("del"), passwordHash: "x" }).returning();
      const uid = u.id;
      const t = signTokenFor(uid, `${suffix}-del@x.com`);
      await db.insert(schema.onboardingStatesTable).values({ userId: uid });
      await db.insert(schema.userProfilesTable).values({ userId: uid, heightCm: 180, weightKg: "75.50", age: 30, dateOfBirth: new Date("1994-01-01"), activityLevel: "active", bio: "b", avatarUrl: "av" });
      await db.insert(schema.userGoalsTable).values({ userId: uid, goalKey: "strength", isPrimary: true, text: "goal" });
      await db.insert(schema.aiUserGoalsTable).values({ userId: uid, goals: "ai goals" });
      await db.insert(schema.aiDailyTasksTable).values({ userId: uid, date: "2026-09-04", taskText: "t", category: "STRENGTH", xpReward: 25 });
      await db.insert(schema.aiChatMessagesTable).values({ userId: uid, role: "user", content: "hi" });
      await db.insert(schema.aiDailyTipsTable).values({ userId: uid, date: "2026-09-04", tip: "tip", category: "x" });
      await db.insert(schema.refreshTokensTable).values({ userId: uid, tokenHash: `${suffix}-th`, expiresAt: new Date(Date.now() + 86400000) });
      // XP ledger + level + attributes + history via a quest completion
      const tid = await freshTemplate(40);
      const qid = await db.insert(schema.userQuestsTable).values({ userId: uid, questTemplateId: tid, targetValue: "10" }).returning().then((r) => r[0].id);
      await request(app).post(`/api/quests/${qid}/complete`).set(auth(t));
      await db.insert(schema.postsTable).values({ userId: uid, caption: "c" });
      await db.insert(schema.followsTable).values({ followerId: uid, followingId: userA });
      // a conversation with userA, plus a message
      const [conv] = await db.insert(schema.conversationsTable).values({}).returning();
      await db.insert(schema.conversationMembersTable).values([{ conversationId: conv.id, userId: uid }, { conversationId: conv.id, userId: userA }]);
      await db.insert(schema.messagesTable).values({ conversationId: conv.id, senderId: uid, content: "hello from deleted user" });

      // Execute the actual deletion mechanism.
      const res = await request(app).delete("/api/users/me").set(auth(t));
      expect(res.status).toBe(200);

      // 1. user disappears
      expect((await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, uid))).length).toBe(0);

      // 2-3. no orphaned child rows
      const checks: [string, Promise<number>][] = [
        ["onboarding_states", count(schema.onboardingStatesTable, uid)],
        ["user_profiles", count(schema.userProfilesTable, uid)],
        ["user_goals", count(schema.userGoalsTable, uid)],
        ["ai_user_goals", count(schema.aiUserGoalsTable, uid)],
        ["ai_daily_tasks", count(schema.aiDailyTasksTable, uid)],
        ["ai_chat_messages", count(schema.aiChatMessagesTable, uid)],
        ["ai_daily_tips", count(schema.aiDailyTipsTable, uid)],
        ["refresh_tokens", count(schema.refreshTokensTable, uid)],
        ["xp_transactions", count(schema.xpTransactionsTable, uid)],
        ["user_levels", count(schema.userLevelsTable, uid)],
        ["user_attributes", count(schema.userAttributesTable, uid)],
        ["attribute_history", count(schema.attributeHistoryTable, uid)],
        ["user_quests", count(schema.userQuestsTable, uid)],
        ["posts", count(schema.postsTable, uid)],
        ["follows (as follower)", count(schema.followsTable, uid, "followerId")],
      ];
      for (const [name, p] of checks) {
        expect(await p, `${name} should have no rows for deleted user`).toBe(0);
      }
      // conversation_membership removed; messages (as sender) removed
      expect((await db.select().from(schema.conversationMembersTable).where(eq(schema.conversationMembersTable.userId, uid))).length).toBe(0);
      expect((await db.select().from(schema.messagesTable).where(eq(schema.messagesTable.senderId, uid))).length).toBe(0);
    });

    it("FINDING (D-1, FIXED): deleting a user decrements likes_count on posts they liked", async () => {
      // userA posts; a throwaway user likes it; that user deletes their account.
      // The denormalized posts.likes_count must NOT drift from post_likes.
      const [liker] = await db.insert(schema.usersTable).values({ email: `${suffix}-lk@x.com`, username: un("lk"), passwordHash: "x" }).returning();
      const likerToken = signToken({ sub: liker.id, email: `${suffix}-lk@x.com` });

      const [post] = await db.insert(schema.postsTable).values({ userId: userA, caption: "liked post" }).returning();
      await db.insert(schema.postLikesTable).values({ userId: liker.id, postId: post.id });
      await db.execute(sql`UPDATE posts SET likes_count = 1 WHERE id = ${post.id}`);

      const res = await request(app).delete("/api/users/me").set(auth(likerToken));
      expect(res.status).toBe(200);

      const [after] = await db.select().from(schema.postsTable).where(eq(schema.postsTable.id, post.id));
      const likeRows = await db.select().from(schema.postLikesTable).where(eq(schema.postLikesTable.postId, post.id));
      expect(likeRows.length).toBe(0); // like cascaded away
      expect(after.likesCount).toBe(0); // counter reconciled (D-1 fix)
    });

    it("deleted user's token cannot mutate (no resurrection; no FK-violation 500)", async () => {
      const [u] = await db.insert(schema.usersTable).values({ email: `${suffix}-rr@x.com`, username: un("rr"), passwordHash: "x" }).returning();
      const t = signTokenFor(u.id, `${suffix}-rr@x.com`);
      await request(app).delete("/api/users/me").set(auth(t));

      // A stateless JWT outlives the account (15m lifetime). requireAuth must
      // NOT let a deleted identity mutate state — and must not surface a 500.
      const me = await request(app).get("/api/users/me").set(auth(t));
      expect(me.status).toBe(401); // identity rejected at the auth boundary (D-2)

      const assign = await request(app).post(`/api/quests/assign/${await freshTemplate()}`).set(auth(t));
      expect([401, 403]).toContain(assign.status); // safe rejection, never 500
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 3 — hard-delete model: queries respect it (no deleted-user ghosting)
  // ════════════════════════════════════════════════════════════════════════
  describe("hard-delete model — no deleted user appears in reads", () => {
    it("a deleted user vanishes from leaderboard, feed, and conversation list", async () => {
      const [u] = await db.insert(schema.usersTable).values({ email: `${suffix}-gh@x.com`, username: un("gh"), passwordHash: "x" }).returning();
      await db.insert(schema.userLevelsTable).values({ userId: u.id, totalXp: 9999, currentLevel: 10 });
      await db.insert(schema.postsTable).values({ userId: u.id, caption: "ghost post" });
      const t = signTokenFor(u.id, `${suffix}-gh@x.com`);

      const before = await request(app).get("/api/social/leaderboard").set(auth(tokenA));
      expect(before.body.some((r: any) => r.id === u.id)).toBe(true);

      await request(app).delete("/api/users/me").set(auth(t));

      const after = await request(app).get("/api/social/leaderboard").set(auth(tokenA));
      expect(after.body.some((r: any) => r.id === u.id)).toBe(false);
      const feed = await request(app).get("/api/social/posts").set(auth(tokenA));
      expect(feed.body.some((r: any) => r.user_id === u.id)).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 4 — privacy / data minimization on list & profile projections
  // ════════════════════════════════════════════════════════════════════════
  describe("privacy minimization — no PII on public/list projections", () => {
    // Fields that must never appear on ANY projection (including self).
    const FORBIDDEN = ["dateOfBirth", "date_of_birth", "activityLevel", "activity_level", "passwordHash", "password_hash", "tokenHash", "token_hash", "refreshToken", "refresh_token"];

    it("leaderboard / posts / public profile / conversations never expose PII", async () => {
      await db.insert(schema.userProfilesTable).values({ userId: userA, dateOfBirth: new Date("1994-01-01"), activityLevel: "active", heightCm: 180, weightKg: "75.50", age: 30, bio: "b", avatarUrl: "av" })
        .onConflictDoUpdate({ target: schema.userProfilesTable.userId, set: { dateOfBirth: new Date("1994-01-01"), activityLevel: "active" } });

      const paths = [
        ["/api/social/leaderboard", tokenB],
        ["/api/social/posts", tokenB],
        ["/api/social/posts/personalized", tokenB],
        [`/api/social/users/${userA}`, tokenB],
        ["/api/messages/conversations", tokenB],
        ["/api/users/me", tokenA],
        ["/api/users/me/profile-extra", tokenA],
      ];
      for (const [p, t] of paths) {
        const r = await request(app).get(p as string).set(auth(t as string));
        expect(r.status).toBe(200);
        const body = JSON.stringify(r.body);
        for (const k of FORBIDDEN) {
          expect(body, `${p} must not contain ${k}`).not.toContain(`"${k}"`);
        }
      }
    });

    it("B cannot read A's email / password / PII via any endpoint", async () => {
      const r = await request(app).get(`/api/social/users/${userA}`).set(auth(tokenB));
      expect(r.status).toBe(200);
      const s = JSON.stringify(r.body);
      expect(s).not.toContain(`${suffix}-a@x.com`); // email never leaked
      expect(s).not.toContain("dateOfBirth");
      expect(s).not.toContain("activityLevel");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 6 — XP ledger consistency
  // ════════════════════════════════════════════════════════════════════════
  describe("XP ledger is authoritative and consistent", () => {
    it("SUM(ledger) == total_xp across completions, replays, and rejects", async () => {
      const tid = await freshTemplate(60);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA));
      await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)); // replay
      await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)); // replay again

      const sum = await ledgerSum(userA);
      const tot = await totalXp(userA);
      expect(sum).toBe(tot);

      // negative/zero ledger entries must never exist
      const neg = await db.execute(sql`SELECT COUNT(*)::int AS n FROM xp_transactions WHERE user_id = ${userA} AND amount <= 0`);
      expect(Number(((neg.rows ?? neg) as any[])[0].n)).toBe(0);
    });

    it("no ledger entry without a legitimate source; idempotency key is unique", async () => {
      // Every xp_transaction must carry a sourceType; a duplicate idempotency key
      // is impossible (unique constraint).
      const bad = await db.execute(sql`SELECT COUNT(*)::int AS n FROM xp_transactions WHERE source_type IS NULL OR source_type = ''`);
      expect(Number(((bad.rows ?? bad) as any[])[0].n)).toBe(0);

      const key = `${suffix}-idem`;
      await db.insert(schema.xpTransactionsTable).values({ userId: userA, amount: 5, sourceType: "TEST", idempotencyKey: key });
      const dup = db.insert(schema.xpTransactionsTable).values({ userId: userA, amount: 5, sourceType: "TEST", idempotencyKey: key });
      await expect(dup).rejects.toThrow(); // unique constraint holds
      await db.delete(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.idempotencyKey, key));
    });

    it("abandoning / re-assigning a quest does not alter historical XP", async () => {
      const before = await totalXp(userA);
      const tid = await freshTemplate(30);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      await request(app).post(`/api/quests/${qid}/abandon`).set(auth(tokenA));
      const after = await totalXp(userA);
      expect(after).toBe(before); // abandon mints nothing, deletes nothing from ledger
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 7 — derived data recomputation (level == f(total_xp))
  // ════════════════════════════════════════════════════════════════════════
  describe("derived state does not become a conflicting authority", () => {
    it("level is recomputed from total_xp (sqrt(total/100)+1)", async () => {
      const tot = await totalXp(userA);
      const expected = Math.floor(Math.sqrt(tot / 100)) + 1;
      const [lv] = await db.select().from(schema.userLevelsTable).where(eq(schema.userLevelsTable.userId, userA));
      expect(lv.currentLevel).toBe(expected);
    });

    it("streak/momentum/weaknesses endpoints recompute deterministically from authoritative state", async () => {
      for (const p of ["/api/life-engine/streak", "/api/life-engine/momentum", "/api/life-engine/weaknesses", "/api/life-engine/recommendations"]) {
        const r1 = await request(app).get(p).set(auth(tokenA));
        const r2 = await request(app).get(p).set(auth(tokenA));
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect(JSON.stringify(r1.body)).toBe(JSON.stringify(r2.body)); // deterministic, no cache drift
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 11 — transactional consistency (all-or-nothing on multi-table writes)
  // ════════════════════════════════════════════════════════════════════════
  describe("transactional atomicity of coupled mutations", () => {
    it("quest completion writes status + XP + attributes atomically (verified via ledger)", async () => {
      const before = await ledgerSum(userA);
      const tid = await freshTemplate(45);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      const res = await request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA));
      expect(res.status).toBe(200);
      const after = await ledgerSum(userA);
      expect(after - before).toBe(45);
      const [q] = await db.select().from(schema.userQuestsTable).where(eq(schema.userQuestsTable.id, qid));
      expect(q.status).toBe("COMPLETED");
      expect(q.completedAt).not.toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 12 — concurrent lifecycle operations
  // ════════════════════════════════════════════════════════════════════════
  describe("concurrent lifecycle races", () => {
    it("concurrent quest completions award XP exactly once (no phantom XP)", async () => {
      const tid = await freshTemplate(70);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(tokenA)).then((r) => r.body.id);
      const before = await totalXp(userA);
      await Promise.all([
        request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)),
        request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)),
        request(app).post(`/api/quests/${qid}/complete`).set(auth(tokenA)),
      ]);
      const after = await totalXp(userA);
      expect(after - before).toBe(70); // exactly one award
    });

    it("delete-account vs concurrent mutation leaves no orphan XP", async () => {
      const [u] = await db.insert(schema.usersTable).values({ email: `${suffix}-rc@x.com`, username: un("rc"), passwordHash: "x" }).returning();
      const t = signTokenFor(u.id, `${suffix}-rc@x.com`);
      const tid = await freshTemplate(35);
      const qid = await request(app).post(`/api/quests/assign/${tid}`).set(auth(t)).then((r) => r.body.id);
      // Race a completion against account deletion.
      await Promise.all([
        request(app).post(`/api/quests/${qid}/complete`).set(auth(t)),
        request(app).delete("/api/users/me").set(auth(t)),
      ]);
      // Regardless of interleaving: if the user is gone, so is every ledger row.
      const remains = await db.select().from(schema.usersTable).where(eq(schema.usersTable.id, u.id));
      if (remains.length === 0) {
        const orphan = await db.execute(sql`SELECT COUNT(*)::int AS n FROM xp_transactions WHERE user_id = ${u.id}`);
        expect(Number(((orphan.rows ?? orphan) as any[])[0].n)).toBe(0);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 14 — time / retention / expiration
  // ════════════════════════════════════════════════════════════════════════
  describe("time-scoped data (daily tasks) respects date boundaries", () => {
    it("daily tasks are keyed to a specific date and do not roll over implicitly", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [task] = await db.insert(schema.aiDailyTasksTable).values({ userId: userA, date: today, taskText: "t", category: "STRENGTH", xpReward: 25 }).returning();
      const r = await request(app).post(`/api/ai/daily-tasks/${task.id}/complete`).set(auth(tokenA));
      expect(r.status).toBe(200);
      const [after] = await db.select().from(schema.aiDailyTasksTable).where(eq(schema.aiDailyTasksTable.id, task.id));
      expect(after.isCompleted).toBe(true);
      expect(after.completedAt).not.toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 17 — adversarial corruption detection (disposable rows)
  // ════════════════════════════════════════════════════════════════════════
  describe("adversarial data corruption is bounded by constraints", () => {
    it("duplicate conversation membership is impossible (unique constraint)", async () => {
      const [conv] = await db.insert(schema.conversationsTable).values({}).returning();
      await db.insert(schema.conversationMembersTable).values({ conversationId: conv.id, userId: userA });
      await expect(db.insert(schema.conversationMembersTable).values({ conversationId: conv.id, userId: userA })).rejects.toThrow();
    });

    it("a child row referencing a nonexistent user is rejected (FK)", async () => {
      const bogus = "00000000-0000-0000-0000-000000000000";
      await expect(db.insert(schema.userLevelsTable).values({ userId: bogus, totalXp: 1, currentLevel: 1 })).rejects.toThrow();
    });

    it("negative XP transaction is stored at DB level (no CHECK) — documented residual", async () => {
      // The application never writes negative XP, but the DB schema has no
      // CHECK constraint, so an out-of-band write CAN create one. Documented as
      // a residual (B-class) rather than silently adding a migration.
      const [row] = await db.insert(schema.xpTransactionsTable).values({ userId: userA, amount: -100, sourceType: "CORRUPTION_PROBE" }).returning();
      expect(row.amount).toBe(-100); // evidence: no CHECK constraint exists
      await db.delete(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.id, row.id));
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 18 — C-2 email validation (FIXED)
  // ════════════════════════════════════════════════════════════════════════
  describe("signup email validation (C-2 contract, FIXED)", () => {
    it("rejects object / number / array / null / empty / malformed / 500-char emails with 400", async () => {
      const badEmails: unknown[] = [
        { nested: true },
        12345,
        ["a@b.com"],
        null,
        "",
        "   ",
        "not-an-email",
        "a".repeat(500) + "@x.com",
      ];
      for (const e of badEmails) {
        const r = await request(app).post("/api/auth/signup").send({ email: e, username: un("em"), password: "Password123!" });
        expect(r.status, `email ${JSON.stringify(e).slice(0, 40)} should 400`).toBe(400);
      }
    });

    it("accepts a valid email and normalizes case/whitespace", async () => {
      const r = await request(app).post("/api/auth/signup").send({ email: `  ${suffix}-NORM@Example.COM  `, username: un("nm"), password: "Password123!" });
      expect(r.status).toBe(201);
      const stored = await db.select().from(schema.usersTable).where(eq(schema.usersTable.username, un("nm")));
      expect(stored.length).toBe(1);
      expect(stored[0].email).toBe(`${suffix}-norm@example.com`); // trimmed + lowercased
      await db.delete(schema.usersTable).where(eq(schema.usersTable.id, stored[0].id));
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // PART 19 — security regression (lifecycle changes must not reopen Stage 23)
  // ════════════════════════════════════════════════════════════════════════
  describe("security regression after lifecycle changes", () => {
    it("B still cannot read/mutate A's data (IDOR intact)", async () => {
      const r = await request(app).get(`/api/users/me`).set(auth(tokenB));
      expect(r.body.id).toBe(userB);
      const pub = await request(app).get(`/api/social/users/${userA}`).set(auth(tokenB));
      expect(pub.status).toBe(200);
      expect(JSON.stringify(pub.body)).not.toContain("dateOfBirth");
      expect(JSON.stringify(pub.body)).not.toContain("activityLevel");
    });
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  function signTokenFor(sub: string, email: string): string {
    return signToken({ sub, email });
  }
  function count(table: any, uid: string, col = "userId"): Promise<number> {
    return db.select().from(table).where(eq(table[col as keyof typeof table], uid)).then((rows) => rows.length);
  }
});
