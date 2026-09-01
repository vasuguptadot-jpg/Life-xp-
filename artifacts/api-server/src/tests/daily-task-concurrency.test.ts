/**
 * STAGE 21 — Part 1 follow-up: concurrent daily-task / daily-tip generation.
 *
 * Stage 20 flagged a candidate follow-up: a unique index on
 * ai_daily_tasks(user_id, date). This suite determines the ACTUAL requirement:
 *   - a plain unique (user_id, date) index would be WRONG (5 tasks legitimately
 *     share the same date), so it must NOT be added;
 *   - the real hazard — concurrent first-of-day generation minting duplicate
 *     5-task sets (double daily XP) — is real and is closed with an advisory
 *     lock serializing the check-then-insert per (user, date).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 21 — daily-task / tip concurrent generation (Part 1)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let engine: typeof import("../lib/life-engine");
  let userA: string;
  const suffix = `dtc-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    engine = await import("../lib/life-engine");
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    userA = a.id;
  });

  it("concurrent first-of-day task generation produces exactly one 5-task set (no duplicates)", async () => {
    // Fire 8 concurrent generateDailyTasks calls for the same user on the same day.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => engine.generateDailyTasks(userA)),
    );

    // Every caller sees the same (single) task set.
    const ids = results.map((r) => r.map((t) => t.id).sort().join(","));
    expect(new Set(ids).size).toBe(1);

    // Exactly 5 tasks exist in the DB for today (not 40).
    const today = new Date().toISOString().split("T")[0];
    const rows = await db
      .select()
      .from(schema.aiDailyTasksTable)
      .where(and(eq(schema.aiDailyTasksTable.userId, userA), eq(schema.aiDailyTasksTable.date, today)));
    expect(rows.length).toBe(5);
  });

  it("concurrent first-of-day tip generation produces at most one tip row", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => engine.generateDailyTip(userA)),
    );
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(1);

    const today = new Date().toISOString().split("T")[0];
    const rows = await db
      .select()
      .from(schema.aiDailyTipsTable)
      .where(and(eq(schema.aiDailyTipsTable.userId, userA), eq(schema.aiDailyTipsTable.date, today)));
    expect(rows.length).toBe(1);
  });

  it("generated tasks are still deterministic (identical to a re-generation is the same cached set)", async () => {
    const a = await engine.generateDailyTasks(userA);
    const b = await engine.generateDailyTasks(userA);
    expect(JSON.stringify(a.map((t) => t.taskText))).toBe(JSON.stringify(b.map((t) => t.taskText)));
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
  });
});
