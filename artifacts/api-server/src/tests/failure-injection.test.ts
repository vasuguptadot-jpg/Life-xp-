/**
 * STAGE 21 — Part 2: failure injection / transaction integrity.
 *
 * Injects REAL failures (PostgreSQL errors, not mocks) at the reward step of
 * quest/task completion and proves that completion and reward are atomic: a
 * failure rolls BOTH back, so the system never enters "quest complete but XP
 * missing" (or the reverse). Also proves idempotency/replay-safety and
 * duplicate-request behavior on retry-after-timeout.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

// int4 (PostgreSQL "integer") upper bound is 2,147,483,647. A reward above this
// makes the INSERT fail with a real DB error — a genuine injected failure with
// no mocking.
const INT4_OVERFLOW_XP = 3_000_000_000;

maybe("STAGE 21 — failure injection / transaction integrity (Part 2)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let app: import("express").Express;
  let tokenA: string;
  let userA: string;
  const suffix = `fi-${Date.now()}`;
  let seq = 0;

  async function freshTemplate(xp = 50): Promise<string> {
    const [t] = await db.insert(schema.questTemplatesTable).values({
      title: `FI ${seq++}`, description: "d", category: "STRENGTH", questType: "SIMPLE",
      status: "ACTIVE", progressionConfig: { xp, attributes: [{ attribute: "STRENGTH", xp: Math.floor(xp / 2) }] },
    }).returning();
    return t.id;
  }
  async function assignQuest(templateId: string): Promise<string> {
    const res = await request(app).post(`/api/quests/assign/${templateId}`).set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(201);
    return res.body.id;
  }
  async function questRow(id: string) {
    const [r] = await db.select().from(schema.userQuestsTable).where(eq(schema.userQuestsTable.id, id));
    return r;
  }
  async function xpCount() {
    const rows = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, userA));
    return rows.length;
  }
  async function totalXp() {
    const [r] = await db.select().from(schema.userLevelsTable).where(eq(schema.userLevelsTable.userId, userA));
    return r?.totalXp ?? 0;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    app = (await import("../app")).default;
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}-a@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    userA = a.id;
    const { signToken } = await import("../lib/auth");
    tokenA = signToken({ sub: userA, email: `${suffix}-a@x.com` });
  });

  it("quest completion + XP award are atomic — an injected reward failure rolls back the COMPLETED status", async () => {
    // A template whose reward overflows int4 makes awardXp's INSERT throw a real
    // PostgreSQL error AFTER the status UPDATE would have run. With atomicity,
    // the whole transaction rolls back and the quest is NOT left COMPLETED.
    const tpl = await freshTemplate(INT4_OVERFLOW_XP);
    const qid = await assignQuest(tpl);

    const beforeXp = await xpCount();
    const res = await request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`);
    // The overflow surfaces as a 500 via the global error handler.
    expect(res.status).toBeGreaterThanOrEqual(500);

    const q = await questRow(qid);
    // KEY ASSERTION: the status must NOT be COMPLETED (rolled back with the
    // failed reward). Pre-fix this was COMPLETED with zero XP — the exact
    // "quest complete but XP missing" inconsistency this stage exists to find.
    expect(q.status).not.toBe("COMPLETED");
    expect(await xpCount()).toBe(beforeXp); // no XP transaction committed
    expect(await totalXp()).toBe(0); // no level mutation committed
  });

  it("daily-task completion + XP award are atomic — injected failure rolls back isCompleted", async () => {
    // Seed STRENGTH near int4 max so the attribute half-reward overflows int4 at
    // the award step (a real PostgreSQL error, no mocking).
    const BIG = 2_000_000_000;
    await db.insert(schema.userAttributesTable).values({ userId: userA, attribute: "STRENGTH", currentValue: BIG });

    const [task] = await db.insert(schema.aiDailyTasksTable).values({
      userId: userA, date: "2026-09-01", taskText: "overflow task", category: "STRENGTH", xpReward: BIG,
    }).returning();

    const beforeXp = await xpCount();
    const res = await request(app).post(`/api/ai/daily-tasks/${task.id}/complete`).set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBeGreaterThanOrEqual(500);

    const [t] = await db.select().from(schema.aiDailyTasksTable).where(eq(schema.aiDailyTasksTable.id, task.id));
    expect(t.isCompleted).toBe(false); // rolled back with the failed reward
    expect(await xpCount()).toBe(beforeXp);
  });

  it("retry after a lost response is safe — re-complete is idempotent (no double XP)", async () => {
    const tpl = await freshTemplate(50);
    const qid = await assignQuest(tpl);

    const first = await request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`);
    expect(first.status).toBe(200);

    // Simulate a client retrying because the response was lost (network timeout).
    const retry = await request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`);
    expect(retry.status).toBe(200);
    expect(retry.body.xp.alreadyAwarded).toBe(true);

    // Exactly ONE XP transaction, ONE level increment.
    const tx = await db.select().from(schema.xpTransactionsTable)
      .where(eq(schema.xpTransactionsTable.userId, userA));
    const questTx = tx.filter((t) => t.sourceType === "QUEST_COMPLETION");
    expect(questTx.length).toBe(1);
    expect(await totalXp()).toBe(50);
  });

  it("awardXpInTransaction rolls back cleanly on a mid-transaction failure (no partial attribute award)", async () => {
    // Manually drive the transaction primitive: award XP + attribute, but force
    // the second attribute to overflow so the transaction fails after the first
    // attribute write. Everything must roll back.
    const progression = await import("../lib/progression");
    const beforeAttrs = await db.select().from(schema.userAttributesTable).where(eq(schema.userAttributesTable.userId, userA));

    let threw = false;
    try {
      await db.transaction(async (tx) => {
        await progression.awardXpInTransaction(tx, {
          userId: userA, sourceType: "TEST", sourceId: `${suffix}-partial`,
          xp: 25, attributes: [
            { attribute: "STRENGTH", xp: 10 },
            { attribute: "ENDURANCE", xp: INT4_OVERFLOW_XP }, // overflows int4
          ],
        });
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // No attribute rows created (STRENGTH award rolled back too).
    const afterAttrs = await db.select().from(schema.userAttributesTable).where(eq(schema.userAttributesTable.userId, userA));
    expect(afterAttrs.length).toBe(beforeAttrs.length);
  });

  it("duplicate-request concurrent completion awards XP exactly once", async () => {
    const tpl = await freshTemplate(75);
    const qid = await assignQuest(tpl);

    // Fire 6 concurrent completions of the SAME quest.
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app).post(`/api/quests/${qid}/complete`).set("Authorization", `Bearer ${tokenA}`),
      ),
    );
    // All requests succeed (idempotency, no 500s).
    for (const r of results) expect([200]).toContain(r.status);

    const tx = await db.select().from(schema.xpTransactionsTable)
      .where(eq(schema.xpTransactionsTable.userId, userA));
    const questTx = tx.filter((t) => t.sourceType === "QUEST_COMPLETION");
    // One quest-complete reward for the template-scoped key (plus the earlier test's).
    const tplRewards = questTx.filter((t) => t.description?.includes("FI "));
    // This test's template should yield exactly one reward regardless of concurrency.
    const thisTpl = await db.select().from(schema.questTemplatesTable).where(eq(schema.questTemplatesTable.id, tpl));
    const thisRewards = questTx.filter((t) => t.description === `Completed quest: ${thisTpl[0].title}`);
    expect(thisRewards.length).toBe(1);
  });

  it("advancing progress to target does NOT complete the quest (completion+reward is /complete's job only)", async () => {
    const tpl = await freshTemplate(75);
    const qid = await assignQuest(tpl);
    const before = await totalXp();
    const txBefore = await xpCount();

    // Drive progress straight to the target via PATCH /progress — a client could
    // do this directly (or a lost response could strand the follow-up complete).
    const prog = await request(app).patch(`/api/quests/${qid}/progress`)
      .set("Authorization", `Bearer ${tokenA}`).send({ progress: 9999 });
    expect(prog.status).toBe(200);
    expect(prog.body.status).toBe("IN_PROGRESS"); // must NOT be COMPLETED

    const row = await questRow(qid);
    expect(row.status).toBe("IN_PROGRESS");
    expect(Number(row.progressValue)).toBe(Number(row.targetValue));
    // No XP may be awarded by progress alone (no NEW xp transactions).
    expect(await totalXp()).toBe(before);
    expect(await xpCount()).toBe(txBefore);

    // Completion is the sole reward path.
    const complete = await request(app).post(`/api/quests/${qid}/complete`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(complete.status).toBe(200);
    expect(await totalXp()).toBe(before + 75);

    const done = await questRow(qid);
    expect(done.status).toBe("COMPLETED");
  });
});
