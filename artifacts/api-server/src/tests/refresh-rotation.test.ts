import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

// Regression for refresh-token rotation atomicity. The original implementation
// did SELECT-then-UPDATE as two statements, so concurrent replays of the same
// refresh token could each observe it as "unrevoked" and mint new token pairs.
// The fix claims the token atomically (UPDATE ... SET revoked_at ... WHERE
// revoked_at IS NULL RETURNING), so exactly one replay may succeed.
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("auth — refresh token rotation is atomic (no concurrent replay)", () => {
  let app: import("express").Express;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    // Disable rate limiting so the concurrent refreshes aren't throttled.
    process.env.NODE_ENV = "test";
    app = (await import("../app")).default;
  });

  it("a rotated refresh token cannot be replayed (sequential)", async () => {
    const suffix = Date.now();
    const email = `rt-seq-${suffix}@example.com`;
    await request(app)
      .post("/api/auth/signup")
      .send({ email, username: `rtseq${suffix}`, password: "Password123!" });
    const login = await request(app)
      .post("/api/auth/signin")
      .send({ email, password: "Password123!" });

    const rt = login.body.refreshToken;
    expect(rt).toBeTruthy();

    // First refresh succeeds and rotates.
    const first = await request(app).post("/api/auth/refresh").send({ refreshToken: rt });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(rt);

    // Replaying the SAME (now-rotated) token must be rejected.
    const replay = await request(app).post("/api/auth/refresh").send({ refreshToken: rt });
    expect(replay.status).toBe(401);
  });

  it("concurrent replays of one token yield at most one success", async () => {
    const suffix = Date.now();
    const email = `rt-cc-${suffix}@example.com`;
    await request(app)
      .post("/api/auth/signup")
      .send({ email, username: `rtcc${suffix}`, password: "Password123!" });
    const login = await request(app)
      .post("/api/auth/signin")
      .send({ email, password: "Password123!" });

    const rt = login.body.refreshToken;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post("/api/auth/refresh").send({ refreshToken: rt })),
    );
    const successes = results.filter((r) => r.status === 200);
    expect(successes.length).toBeLessThanOrEqual(1);
  });
});
