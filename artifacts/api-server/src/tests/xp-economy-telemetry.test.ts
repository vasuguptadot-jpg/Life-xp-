/**
 * STAGE 22 — XP economy incident detection + replay telemetry.
 *
 * The XP ledger must be reconcilable from the database alone: the sum of all
 * xp_transactions for a user equals user_levels.totalXp (no hidden minting /
 * no loss). Replays are detectable via the idempotency key and award nothing.
 * Diagnostics here DETECT and REPORT anomalies — they never correct accounting.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 22 — XP economy incident detection", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let progression: typeof import("../lib/progression");
  let userA: string;
  const suffix = `xp-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    progression = await import("../lib/progression");
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    userA = a.id;
  });

  async function ledger(userId: string) {
    const rows = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, userId));
    const [level] = await db.select().from(schema.userLevelsTable).where(eq(schema.userLevelsTable.userId, userId));
    return {
      sum: rows.reduce((s, r) => s + Number(r.amount), 0),
      count: rows.length,
      totalXp: level ? Number(level.totalXp) : 0,
    };
  }

  it("sum of xp_transactions == user_levels.totalXp (no hidden minting, no loss)", async () => {
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: 100, idempotencyKey: `${suffix}-1` });
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: 50, idempotencyKey: `${suffix}-2` });
    const { sum, totalXp, count } = await ledger(userA);
    expect(sum).toBe(totalXp);
    expect(totalXp).toBe(150);
    expect(count).toBe(2);
  });

  it("a replayed award is detected (alreadyAwarded) and mints nothing", async () => {
    const before = await ledger(userA);
    const replay = await progression.awardXp({ userId: userA, sourceType: "TEST", xp: 100, idempotencyKey: `${suffix}-1` });
    expect(replay.alreadyAwarded).toBe(true);
    expect(replay.levelRow).toBeNull();
    const after = await ledger(userA);
    expect(after.totalXp).toBe(before.totalXp); // unchanged
    expect(after.count).toBe(before.count);
  });

  it("totalXp never decreases across a mix of awards and replays", async () => {
    const start = (await ledger(userA)).totalXp;
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: 30, idempotencyKey: `${suffix}-3` });
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: 30, idempotencyKey: `${suffix}-3` }); // replay
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: -500, idempotencyKey: `${suffix}-neg` }); // negative dropped
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: NaN, idempotencyKey: `${suffix}-nan` }); // NaN dropped
    const end = (await ledger(userA)).totalXp;
    expect(end).toBe(start + 30); // only the one legitimate award applied
    expect(end).toBeGreaterThanOrEqual(start);
  });

  it("failed award leaves no XP mutation behind (rollback integrity)", async () => {
    const before = await ledger(userA);
    // A bogus user id would fail a FK constraint at insert; the whole award
    // rolls back and totalXp is unchanged.
    await expect(
      progression.awardXp({ userId: "00000000-0000-0000-0000-00000000dead", sourceType: "TEST", xp: 999, idempotencyKey: `${suffix}-fk` }),
    ).rejects.toThrow();
    const after = await ledger(userA);
    expect(after.totalXp).toBe(before.totalXp);
  });
});
