import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";

// SSE regression: the /conversations/:id/events route authenticates via ?token=
// (EventSource cannot send the Authorization header). Regression guard for the
// bug where router.use(requireAuth) rejected every SSE connection with 401
// before the ?token= fallback could run.
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("SSE auth — ?token= reaches the events handler (not 401)", () => {
  let app: express.Express;

  beforeAll(async () => {
    // Must be set before @workspace/db is imported (the pool reads it once).
    process.env.DATABASE_URL = TEST_DB_URL;
    const { default: messagesRouter } = await import("../routes/messages");
    const { signToken } = await import("../lib/auth");

    const server = express();
    server.use(express.json());
    server.use("/messages", messagesRouter);
    app = server;

    // A valid signed token for an arbitrary user; membership check will 403
    // (not a member) — the point is the request must NOT be a 401 from
    // requireAuth, proving the ?token= path is reachable.
    (globalThis as any).__validToken = signToken({ sub: "00000000-0000-0000-0000-000000000001", email: "sse@example.com" });
  });

  it("GET /events?token=<valid> bypasses requireAuth and reaches membership (403, not 401)", async () => {
    const token = (globalThis as any).__validToken as string;
    const res = await request(app)
      .get("/messages/conversations/00000000-0000-0000-0000-000000000002/events")
      .query({ token })
      .expect(403); // not a member — but crucially NOT 401 from requireAuth
    expect(res.status).toBe(403);
  });

  it("GET /events without any token -> 401", async () => {
    await request(app)
      .get("/messages/conversations/00000000-0000-0000-0000-000000000002/events")
      .expect(401);
  });

  it("GET /events with an invalid ?token= -> 401", async () => {
    await request(app)
      .get("/messages/conversations/00000000-0000-0000-0000-000000000002/events")
      .query({ token: "not-a-jwt" })
      .expect(401);
  });

  it("non-events route still requires Bearer auth", async () => {
    await request(app)
      .get("/messages/conversations")
      .expect(401);
  });
});
