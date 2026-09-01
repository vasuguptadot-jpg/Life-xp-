/**
 * STAGE 20 — Part 6: determinism / reproducibility (real DB, frozen clock).
 *
 * For identical database state, every engine output must be byte-identical.
 * The "clock abstraction" is the standard JS clock (Date.now / new Date),
 * which is frozen here with vitest fake timers — the same mechanism the
 * longitudinal harness uses. Legitimate time-dependent surfaces are
 * identified below and all derive from this single clock.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;
const FIXED_NOW = new Date("2026-01-15T12:00:00.000Z");

maybe("STAGE 20 — determinism / reproducibility (Part 6)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let progression: typeof import("../lib/progression");
  let engine: typeof import("../lib/life-engine");
  let userA: string;
  let userB: string;
  const suffix = `det-${Date.now()}`;

  async function fullPipeline(uid: string) {
    const state = await engine.buildAnalyticsState(uid);
    const momentum = engine.computeMomentum(state);
    const weaknesses = engine.detectWeaknesses(state);
    const recovery = engine.detectRecoveryMode(state, momentum);
    const difficulty = engine.recommendDifficulty(state);
    const recs = engine.recommendTasks(state);
    return { state, momentum, weaknesses, recovery, difficulty, recs };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    progression = await import("../lib/progression");
    engine = await import("../lib/life-engine");
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}-a@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    const [b] = await db.insert(schema.usersTable).values({ email: `${suffix}-b@x.com`, username: `b${suffix}`, passwordHash: "x" }).returning();
    userA = a.id;
    userB = b.id;
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("identical DB state → byte-identical read pipeline output (same user, two runs)", async () => {
    // composeDailyPlan is deliberately excluded here: it is a WRITE operation
    // (it generates and persists the day's tasks on first call), so two runs
    // are not "identical DB state". Its reproducibility is asserted separately
    // below. Everything else in the pipeline is read-only and must be
    // byte-identical for identical state.
    await progression.awardXp({ userId: userA, sourceType: "TEST", xp: 300, idempotencyKey: `${suffix}-xp`, attributes: [{ attribute: "STRENGTH", xp: 100 }] });
    const r1 = await fullPipeline(userA);
    const r2 = await fullPipeline(userA);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("engine output is a pure function of analytics state (no hidden nondeterminism)", async () => {
    // Two DIFFERENT users with equivalent (not byte-identical) DB history may
    // diverge ONLY on DB row timestamps (PostgreSQL now()), never on engine
    // logic. Here we prove the engines are pure: the same analytics state
    // object, fed twice, yields byte-identical results across every engine.
    const state = await engine.buildAnalyticsState(userA);
    const run = () => ({
      momentum: engine.computeMomentum(state),
      weaknesses: engine.detectWeaknesses(state),
      recovery: engine.detectRecoveryMode(state, engine.computeMomentum(state)),
      difficulty: engine.recommendDifficulty(state),
      recs: engine.recommendTasks(state),
    });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("recommendations and explanations are byte-identical across runs", async () => {
    const state = await engine.buildAnalyticsState(userA);
    const a = engine.recommendTasks(state);
    const b = engine.recommendTasks(state);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.map((r) => r.reasonCodes))).toBe(JSON.stringify(b.map((r) => r.reasonCodes)));
  });

  it("quest rotation is reproducible for the same (user, date)", async () => {
    const state = await engine.buildAnalyticsState(userA);
    const templates = [
      { id: "qt1", title: "t1", category: "STRENGTH" as const, difficulty: "EASY" as const, compatibleGoals: [], primaryAttributes: ["STRENGTH" as const] },
      { id: "qt2", title: "t2", category: "ENDURANCE" as const, difficulty: "EASY" as const, compatibleGoals: [], primaryAttributes: ["ENDURANCE" as const] },
      { id: "qt3", title: "t3", category: "MOBILITY" as const, difficulty: "MEDIUM" as const, compatibleGoals: [], primaryAttributes: ["MOBILITY" as const] },
      { id: "qt4", title: "t4", category: "DISCIPLINE" as const, difficulty: "MEDIUM" as const, compatibleGoals: [], primaryAttributes: ["DISCIPLINE" as const] },
    ] as any;
    const r1 = engine.rotateQuests(state, templates);
    const r2 = engine.rotateQuests(state, templates);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("daily plan is reproducible including its date field", async () => {
    const p1 = await engine.composeDailyPlan(userA);
    const p2 = await engine.composeDailyPlan(userA);
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p2));
    expect(p1.date).toBe("2026-01-15");
  });

  it("time-dependent surfaces are isolated to the single JS clock", async () => {
    // Advance the clock one day → the daily-plan date and rotation change,
    // but pure recommendation ranking over identical state does NOT (the
    // recommendation engine has no time input besides state-derived data).
    const before = await engine.buildAnalyticsState(userA);
    const recsBefore = engine.recommendTasks(before);

    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000));
    const after = await engine.buildAnalyticsState(userA);
    const recsAfter = engine.recommendTasks(after);

    // Recommendations over the same underlying state are stable; the daily
    // plan date is the surface that legitimately advances.
    expect(JSON.stringify(recsBefore)).toBe(JSON.stringify(recsAfter));
    const plan = await engine.composeDailyPlan(userA);
    expect(plan.date).toBe("2026-01-16");
    vi.setSystemTime(FIXED_NOW);
  });
});
