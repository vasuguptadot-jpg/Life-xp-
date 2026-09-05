import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";

// Regression guard for malformed UUIDs in :id route params. Before the fix,
// routes passed unvalidated ids straight to Drizzle/PostgreSQL, which threw
// "invalid input syntax for type uuid" -> HTTP 500. They must now return 400.
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("UUID validation — malformed :id returns 400 (not 500)", () => {
  let social: express.Router;
  let quests: express.Router;
  let messages: express.Router;
  let ai: express.Router;
  let token: string;

  beforeAll(async () => {
    // Must be set before @workspace/db is imported (the pool reads it once).
    process.env.DATABASE_URL = TEST_DB_URL;
    social = (await import("../routes/social")).default;
    quests = (await import("../routes/quests")).default;
    messages = (await import("../routes/messages")).default;
    ai = (await import("../routes/ai")).default;
    // requireAuth now verifies the account exists (Stage 24 D-2), so a real
    // user must back the token for these UUID-validation probes.
    const { db } = await import("@workspace/db");
    const { usersTable } = await import("@workspace/db/schema");
    const [u] = await db.insert(usersTable).values({ email: `uuid-${Date.now()}@example.com`, username: `uuid${Date.now()}`, passwordHash: "x" }).returning();
    const { signToken } = await import("../lib/auth");
    token = signToken({ sub: u.id, email: u.email });
  });

  function app() {
    const server = express();
    server.use(express.json());
    server.use("/social", social);
    server.use("/quests", quests);
    server.use("/messages", messages);
    server.use("/ai", ai);
    return server;
  }

  const cases: Array<[string, string]> = [
    ["DELETE", "/social/posts/not-a-uuid"],
    ["POST", "/social/posts/not-a-uuid/like"],
    ["DELETE", "/social/posts/not-a-uuid/like"],
    ["GET", "/social/users/not-a-uuid"],
    ["POST", "/social/users/not-a-uuid/follow"],
    ["DELETE", "/social/users/not-a-uuid/follow"],
    ["GET", "/quests/not-a-uuid"],
    ["PATCH", "/quests/not-a-uuid/progress"],
    ["POST", "/quests/not-a-uuid/abandon"],
    ["POST", "/quests/not-a-uuid/complete"],
    ["POST", "/quests/assign/not-a-uuid"],
    ["GET", "/messages/conversations/not-a-uuid/messages"],
    ["POST", "/messages/conversations/not-a-uuid/messages"],
    ["POST", "/ai/daily-tasks/not-a-uuid/complete"],
  ];

  it.each(cases)("%s %s -> 400", async (method, path) => {
    const res = await (request(app()) as any)[method.toLowerCase()](path)
      .set("Authorization", `Bearer ${token}`)
      .send(method === "PATCH" ? { progress: 50 } : (method === "POST" ? {} : undefined));
    expect(res.status).toBe(400);
  });

  it("GET /messages/conversations/:id/events (malformed) -> 400 via ?token=", async () => {
    const res = await request(app())
      .get("/messages/conversations/not-a-uuid/events")
      .query({ token });
    expect(res.status).toBe(400);
  });
});
