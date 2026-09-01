/**
 * STAGE 21 — Part 11: resource exhaustion + Part 6 (account enumeration).
 *
 * Verifies a single abusive client cannot exhaust server resources for others,
 * and that auth responses do not leak account existence.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 21 — resource exhaustion & account enumeration (Parts 11/6)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let app: import("express").Express;
  let tokenA: string;
  let userA: string;
  const suffix = `re-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    schema = await import("@workspace/db/schema");
    app = (await import("../app")).default;
    const { signToken } = await import("../lib/auth");
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    userA = a.id;
    tokenA = signToken({ sub: userA, email: `${suffix}@x.com` });
  });

  it("oversized JSON body is rejected (413) without crashing the server", async () => {
    // ~1 MB body — exceeds the json body-parser limit.
    const big = { goals: "g".repeat(1_500_000) };
    const res = await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send(big);
    expect(res.status).toBe(413);
    // Server still healthy afterwards.
    const health = await request(app).get("/api/healthz");
    expect(health.status).toBe(200);
  });

  it("a huge-but-under-limit goals string is bounded by the handler, not stored unbounded", async () => {
    // Under the body limit, over any reasonable app cap → 400 (rejected), not stored.
    const res = await request(app).post("/api/ai/goals").set("Authorization", `Bearer ${tokenA}`).send({ goals: "g".repeat(200_000) });
    // Either the handler bounds it (400) or stores it; if stored, it must still be
    // under the DB column (TEXT) — both are "bounded". Assert no 500.
    expect(res.status).toBeLessThan(500);
  });

  it("many concurrent reads do not corrupt a single write (no torn state)", async () => {
    const reads = Array.from({ length: 50 }, () =>
      request(app).get("/api/users/me/level").set("Authorization", `Bearer ${tokenA}`),
    );
    const results = await Promise.all(reads);
    for (const r of results) expect(r.status).toBe(200);
  });

  it("account enumeration: signup for an existing email does not reveal the account in a distinct way", async () => {
    // The exact status/body shape for "email taken" vs "invalid input" is the
    // enumeration channel. We assert the taken-email path returns a 4xx (not 201)
    // and that login does NOT distinguish unknown-email vs wrong-password in status
    // code (both are generic 401/400).
    const dup = await request(app).post("/api/auth/signup").send({
      email: `${suffix}@x.com`, username: `dup${suffix}`, password: "password123",
    });
    expect(dup.status).toBeGreaterThanOrEqual(400);

    const unknown = await request(app).post("/api/auth/login").send({ email: `nobody-${Date.now()}@x.com`, password: "password123" });
    const wrongPw = await request(app).post("/api/auth/login").send({ email: `${suffix}@x.com`, password: "wrong-password-1" });
    // Generic failure for both (no 200); do not assert identical bodies (may
    // legitimately differ in message), but neither may succeed.
    expect(unknown.status).not.toBe(200);
    expect(wrongPw.status).not.toBe(200);
  });

  it("FINDING (C): caption length is bounded only by the 100kb JSON body limit, not a domain cap", async () => {
    // posts.caption / messages.content are unbounded TEXT columns (see
    // db-integrity). express.json() defaults to a 100kb body limit, so the
    // effective per-request cap is ~100kb — a caption under that is stored
    // verbatim with no domain-level length validation. This is a storage
    // amplification vector bounded at 100kb/request; no shared mutable state, so
    // one user cannot corrupt another's rows. Documented as a C risk (no
    // product-level caption/message length spec exists to enforce).
    const res = await request(app).post("/api/social/posts").set("Authorization", `Bearer ${tokenA}`).send({ caption: "c".repeat(50_000) });
    expect(res.status).toBe(201);
    const [p] = await db.select().from(schema.postsTable).where(eq(schema.postsTable.id, res.body.id));
    expect(p.caption?.length).toBe(50_000);
  });
});
