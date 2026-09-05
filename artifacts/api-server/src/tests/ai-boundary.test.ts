/**
 * STAGE 20 — Part 10: AI boundary enforcement.
 *
 * Confirms the deterministic Life Engine and the deterministic chat-intent
 * layer never call Groq, never mutate XP/progression, never bypass
 * authorization, and remain fully functional with GROQ_API_KEY absent.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 20 — AI boundary (Part 10)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let app: import("express").Express;
  let tokenA: string;
  let userA: string;
  const suffix = `ab-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    // Guarantee the AI-native path is disabled for these tests.
    delete process.env.GROQ_API_KEY;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    app = (await import("../app")).default;
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    userA = a.id;
    const { signToken } = await import("../lib/auth");
    tokenA = signToken({ sub: userA, email: `${suffix}@x.com` });
  });

  it("no deterministic engine module imports the Groq SDK", () => {
    const dir = path.resolve(__dirname, "../lib/life-engine");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      expect(src, `${f} must not import groq`).not.toMatch(/from\s+["']groq-sdk["']|require\(["']groq-sdk["']\)/i);
    }
  });

  it("deterministic chat intents work with no GROQ_API_KEY (200, engine answer)", async () => {
    for (const msg of ["what's my progress", "what is my momentum", "what are my weaknesses", "what should i do today"]) {
      const res = await request(app).post("/api/ai/chat").set("Authorization", `Bearer ${tokenA}`).send({ message: msg });
      expect(res.status, msg).toBe(200);
      expect(res.body.message).toBeTruthy();
    }
  });

  it("open-ended chat returns 503 when GROQ_API_KEY is absent (graceful)", async () => {
    const res = await request(app).post("/api/ai/chat").set("Authorization", `Bearer ${tokenA}`).send({ message: "tell me the meaning of life" });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/GROQ_API_KEY/i);
  });

  it("deterministic engines never mutate XP or progression", async () => {
    const engine = await import("../lib/life-engine");
    const before = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, userA));

    // Run the full deterministic engine surface (reads only).
    const state = await engine.buildAnalyticsState(userA);
    engine.recommendTasks(state);
    engine.detectWeaknesses(state);
    engine.computeMomentum(state);
    engine.decomposeGoals(state);

    const after = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, userA));
    expect(after.length).toBe(before.length); // no new XP transactions

    const lvl = await db.select().from(schema.userLevelsTable).where(eq(schema.userLevelsTable.userId, userA));
    expect(lvl[0]?.totalXp ?? 0).toBe(0); // no hidden level mutation
  });

  it("deterministic chat answers do not award XP", async () => {
    const before = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, userA));
    await request(app).post("/api/ai/chat").set("Authorization", `Bearer ${tokenA}`).send({ message: "what's my progress" });
    const after = await db.select().from(schema.xpTransactionsTable).where(eq(schema.xpTransactionsTable.userId, userA));
    expect(after.length).toBe(before.length);
  });

  it("deterministic intent layer does not bypass authorization (401 without token)", async () => {
    const res = await request(app).post("/api/ai/chat").send({ message: "what's my progress" });
    expect(res.status).toBe(401);
  });
});
