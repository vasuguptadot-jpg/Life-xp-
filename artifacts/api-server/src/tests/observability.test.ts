/**
 * STAGE 22 — observability: error taxonomy + request correlation.
 *
 * Verifies BEHAVIOR, not source-code presence:
 *   - every failure mode maps to a consistent error category
 *   - a single request can be correlated end-to-end via a unique request id
 *   - concurrent requests receive DISTINCT request ids
 *   - expected client errors are not treated as fatal server incidents
 *   - genuine internal failures are observable and classified
 *   - raw error details never leak to clients
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  classifyError,
  classifyHttpStatus,
  requestContext,
} from "../lib/observability";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

describe("STAGE 22 — error taxonomy", () => {
  it("classifies HTTP status codes into the canonical taxonomy", () => {
    expect(classifyHttpStatus(400)).toEqual({ category: "validation", isClientError: true });
    expect(classifyHttpStatus(401)).toEqual({ category: "authentication", isClientError: true });
    expect(classifyHttpStatus(403)).toEqual({ category: "authorization", isClientError: true });
    expect(classifyHttpStatus(404)).toEqual({ category: "not_found", isClientError: true });
    expect(classifyHttpStatus(409)).toEqual({ category: "conflict", isClientError: true });
    expect(classifyHttpStatus(429)).toEqual({ category: "rate_limit", isClientError: true });
    expect(classifyHttpStatus(500)).toEqual({ category: "internal", isClientError: false });
    expect(classifyHttpStatus(503)).toEqual({ category: "internal", isClientError: false });
  });

  it("classifies PostgreSQL SQLSTATE codes into database/transaction/timeout categories", () => {
    expect(classifyError({ code: "23505" })).toBe("conflict"); // unique_violation
    expect(classifyError({ code: "23503" })).toBe("conflict"); // fk violation
    expect(classifyError({ code: "40001" })).toBe("transaction"); // serialization
    expect(classifyError({ code: "40P01" })).toBe("transaction"); // deadlock
    expect(classifyError({ code: "57014" })).toBe("timeout"); // statement timeout
    expect(classifyError({ code: "53300" })).toBe("database"); // too_many_connections
    expect(classifyError({ code: "08006" })).toBe("database"); // connection failure
  });

  it("classifies connection/timeout errors via cause chain", () => {
    expect(classifyError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe("external_service");
    expect(classifyError({ name: "TimeoutError", message: "x" })).toBe("timeout");
    // walks the cause chain
    expect(classifyError({ cause: { code: "40P01" } })).toBe("transaction");
    expect(classifyError(new Error("something unknown"))).toBe("internal");
  });

  it("requestContext never includes sensitive fields", () => {
    const ctx = requestContext({
      id: "abc-123",
      user: { sub: "user-1" },
      method: "POST",
      originalUrl: "/api/quests/x/complete?token=SECRET",
    });
    expect(ctx).toEqual({
      requestId: "abc-123",
      userId: "user-1",
      method: "POST",
      path: "/api/quests/x/complete", // query string (tokens) stripped
    });
  });
});

maybe("STAGE 22 — request correlation (live server)", () => {
  let app: import("express").Express;
  let tokenA: string;
  let userA: string;
  const suffix = `obs-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    app = (await import("../app")).default;
    const schema = await import("@workspace/db/schema");
    const db = (await import("@workspace/db")).db;
    const [a] = await db.insert(schema.usersTable).values({ email: `${suffix}@x.com`, username: `a${suffix}`, passwordHash: "x" }).returning();
    userA = a.id;
    const { signToken } = await import("../lib/auth");
    tokenA = signToken({ sub: userA, email: `${suffix}@x.com` });
  });

  it("every response carries a unique X-Request-Id", async () => {
    const r = await request(app).get("/api/healthz");
    expect(r.status).toBe(200);
    expect(r.headers["x-request-id"]).toBeTruthy();
  });

  it("concurrent requests receive DISTINCT request ids", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () => request(app).get("/api/healthz")),
    );
    const ids = results.map((r) => r.headers["x-request-id"]);
    expect(new Set(ids).size).toBe(50); // all distinct
  });

  it("malformed UUID on a mutation returns 400 (not 500) and is not a fatal incident", async () => {
    const r = await request(app)
      .post("/api/quests/not-a-uuid/complete")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(r.status).toBe(400);
  });

  it("client errors never expose stack traces / raw DB detail", async () => {
    // A valid request succeeds (sanity).
    const ok = await request(app)
      .get("/api/users/me/profile-extra")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(ok.status).toBe(200);

    // A client error (invalid UUID) must return a clean JSON message with no
    // stack trace, SQL, or internal error detail.
    const bad = await request(app)
      .post("/api/quests/not-a-uuid/complete")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(bad.status).toBe(400);
    const bodyText = JSON.stringify(bad.body);
    expect(bodyText).not.toMatch(/stack|at |SELECT|INSERT|FROM|connection|password/i);
  });
});
