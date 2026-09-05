/**
 * STAGE 20 — Part 5: progression integrity (real PostgreSQL, no mocks).
 *
 * Verifies monotonicity, atomicity, and isolation of all progression
 * mutations, plus the concurrency fix for idempotency-key races.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 20 — progression integrity (Part 5)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let progression: typeof import("../lib/progression");
  let userA: string;
  let userB: string;
  const suffix = `pi-${Date.now()}`;

  async function level(uid: string) {
    const r = await db.select().from(schema.userLevelsTable).where(eq(schema.userLevelsTable.userId, uid));
    return r[0] ?? { currentLevel: 1, totalXp: 0 };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    progression = await import("../lib/progression");
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}-a@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    const [b] = await db.insert(schema.usersTable).values({ email: `${suffix}-b@x.com`, username: `b${suffix}`, passwordHash: "x" }).returning();
    userA = a.id;
    userB = b.id;
  });

  it("totalXp is monotonic across sequential awards and level never decreases", async () => {
    let prev = (await level(userA)).totalXp;
    let prevLvl = (await level(userA)).currentLevel;
    for (const xp of [10, 25, 40, 100, 250]) {
      await progression.awardXp({ userId: userA, sourceType: "TEST", xp, idempotencyKey: `${suffix}-m${xp}` });
      const l = await level(userA);
      expect(l.totalXp).toBe(prev + xp);
      expect(l.currentLevel).toBeGreaterThanOrEqual(prevLvl);
      prev = l.totalXp;
      prevLvl = l.currentLevel;
    }
  });

  it("level is recomputed correctly from totalXp (sqrt curve)", async () => {
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: 100_000, idempotencyKey: `${suffix}-lv` });
    const l = await level(userA);
    const expected = Math.floor(Math.sqrt(l.totalXp / 100)) + 1;
    expect(l.currentLevel).toBe(expected);
  });

  it("attributes never become negative even under negative-delta attempts", async () => {
    // Positive award first.
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: 10, idempotencyKey: `${suffix}-attr1`, attributes: [{ attribute: "STRENGTH", xp: 30 }] });
    // Negative delta attempt is sanitized (dropped).
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: 10, idempotencyKey: `${suffix}-attr2`, attributes: [{ attribute: "STRENGTH", xp: -1000 }] });
    const rows = await db.select().from(schema.userAttributesTable).where(eq(schema.userAttributesTable.userId, userA));
    const strength = rows.find((r) => r.attribute === "STRENGTH");
    expect(strength).toBeDefined();
    expect(strength!.currentValue).toBe(30);
    expect(strength!.currentValue).toBeGreaterThanOrEqual(0);
  });

  it("concurrent awards of distinct keys are all applied (no lost updates)", async () => {
    const before = (await level(userB)).totalXp;
    const n = 25;
    await Promise.all(
      Array.from({ length: n }, (_, i) =>
        progression.awardXp({ userId: userB, sourceType: "TEST", xp: 10, idempotencyKey: `${suffix}-c${i}` }),
      ),
    );
    const after = (await level(userB)).totalXp;
    expect(after - before).toBe(n * 10);
  });

  it("concurrent awards of the SAME key apply exactly once (no 500, no double-count)", async () => {
    const before = (await level(userB)).totalXp;
    const n = 30;
    const results = await Promise.all(
      Array.from({ length: n }, () =>
        progression.awardXp({ userId: userB, sourceType: "TEST", xp: 50, idempotencyKey: `${suffix}-same` }),
      ),
    );
    const awarded = results.filter((r) => !r.alreadyAwarded).length;
    const after = (await level(userB)).totalXp;
    expect(awarded).toBe(1); // exactly one "winner"
    expect(after - before).toBe(50);
  });

  it("failed transaction does not partially award (FK violation rolls back)", async () => {
    const bogus = "00000000-0000-4000-8000-000000000000";
    await expect(
      progression.awardXp({ userId: bogus, sourceType: "TEST", xp: 999, idempotencyKey: `${suffix}-fk`, attributes: [{ attribute: "STRENGTH", xp: 500 }] }),
    ).rejects.toThrow();
    const tx = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, bogus));
    const attrs = await db.select().from(schema.userAttributesTable).where(eq(schema.userAttributesTable.userId, bogus));
    expect(tx).toHaveLength(0);
    expect(attrs).toHaveLength(0);
  });

  it("user A's awards never affect user B (isolation)", async () => {
    const bBefore = (await level(userB)).totalXp;
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: 1000, idempotencyKey: `${suffix}-iso` });
    const bAfter = (await level(userB)).totalXp;
    expect(bAfter).toBe(bBefore);
  });
});
