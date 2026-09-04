import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

// Regression guard for malformed body-field types. Before the fix, non-string
// hashtags, non-string goals, and non-numeric profile fields threw inside the
// handler (TypeError) or hit a Postgres cast error -> 500. A NUL byte in a
// text field tripped PostgreSQL's "invalid byte sequence for encoding UTF8".
// All must now be handled (400) or sanitized without a 500.
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("input validation — malformed body fields do not 500", () => {
  let app: import("express").Express;
  let token: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    app = (await import("../app")).default;
    // Create a real user so FK constraints on post/profile inserts resolve.
    const { db } = await import("@workspace/db");
    const schema = await import("@workspace/db/schema");
    const suffix = Date.now();
    const [u] = await db
      .insert(schema.usersTable)
      .values({ email: `inp-${suffix}@example.com`, username: `inp-${suffix}`, passwordHash: "x" })
      .returning();
    const { signToken } = await import("../lib/auth");
    token = signToken({ sub: u.id, email: `inp-${suffix}@example.com` });
  });

  it("POST /api/social/posts with non-string hashtags -> not 500", async () => {
    const res = await request(app)
      .post("/api/social/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({ caption: "x", hashtags: [null, 123, {}] });
    expect(res.status).toBeLessThan(500);
  });

  it("POST /api/onboarding/goals with non-string goals -> 400", async () => {
    const res = await request(app)
      .post("/api/onboarding/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ goals: [123, null, {}] });
    expect(res.status).toBe(400);
  });

  it("PATCH /api/users/me/profile-extra with non-numeric age -> 400", async () => {
    const res = await request(app)
      .patch("/api/users/me/profile-extra")
      .set("Authorization", `Bearer ${token}`)
      .send({ age: "notnum" });
    expect(res.status).toBe(400);
  });

  it("PATCH /api/users/me/profile-extra with non-numeric heightCm -> 400", async () => {
    const res = await request(app)
      .patch("/api/users/me/profile-extra")
      .set("Authorization", `Bearer ${token}`)
      .send({ heightCm: "tall" });
    expect(res.status).toBe(400);
  });

  it("POST /api/social/posts with NUL byte in caption -> not 500", async () => {
    const res = await request(app)
      .post("/api/social/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({ caption: "héllo wörld 🎉 你好 \u0000", hashtags: ["café"] });
    expect(res.status).toBeLessThan(500);
  });

  it("PATCH /api/users/me/profile-extra with valid numbers -> success", async () => {
    const res = await request(app)
      .patch("/api/users/me/profile-extra")
      .set("Authorization", `Bearer ${token}`)
      .send({ age: 30, heightCm: 180, weightKg: 72.5 });
    expect(res.status).toBe(200);
  });
});

maybe("input validation — malformed pagination params do not 500", () => {
  let app: import("express").Express;
  let token: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    app = (await import("../app")).default;
    const { db } = await import("@workspace/db");
    const schema = await import("@workspace/db/schema");
    const suffix = Date.now();
    const [u] = await db
      .insert(schema.usersTable)
      .values({ email: `pag-${suffix}@example.com`, username: `pag-${suffix}`, passwordHash: "x" })
      .returning();
    const { signToken } = await import("../lib/auth");
    token = signToken({ sub: u.id, email: `pag-${suffix}@example.com` });
  });

  it("GET /api/social/posts?limit=-1 -> 200 (sanitized, no 500)", async () => {
    const res = await request(app)
      .get("/api/social/posts")
      .query({ limit: "-1" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it("GET /api/social/posts?limit=abc -> 200 (default applied, no 500)", async () => {
    const res = await request(app)
      .get("/api/social/posts")
      .query({ limit: "abc" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/social/posts?offset=-5 -> 200 (sanitized, no 500)", async () => {
    const res = await request(app)
      .get("/api/social/posts")
      .query({ offset: "-5" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/social/leaderboard?limit=-1 -> 200 (no 500)", async () => {
    const res = await request(app)
      .get("/api/social/leaderboard")
      .query({ limit: "-1" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("GET /api/messages/conversations?limit=abc -> 200 (no 500)", async () => {
    const res = await request(app)
      .get("/api/messages/conversations")
      .query({ limit: "abc" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("GET /api/progression/attribute-history?limit=-1 -> 200 (no 500)", async () => {
    const res = await request(app)
      .get("/api/progression/attribute-history")
      .query({ limit: "-1" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

maybe("input validation — deeply nested JSON does not 500", () => {
  let app: import("express").Express;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    app = (await import("../app")).default;
  });

  it("POST /api/auth/signup with 5000-deep JSON -> not 500", async () => {
    // Build a 5000-level nested document; before the fix the NUL-stripping
    // middleware recursed and threw `RangeError: Maximum call stack size exceeded`.
    let deep = "1";
    for (let i = 0; i < 5000; i++) deep = `{"a":${deep}}`;
    const res = await request(app)
      .post("/api/auth/signup")
      .set("Content-Type", "application/json")
      .send(deep);
    expect(res.status).toBeLessThan(500);
  });
});
