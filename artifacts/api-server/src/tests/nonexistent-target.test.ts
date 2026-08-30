import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";

// Regression guard for valid-UUID-but-nonexistent targets. Before the fix,
// these routes inserted rows referencing a non-existent user/post, hit the
// foreign-key constraint, and surfaced as an unhandled 500. They must now
// return 404 for well-formed-but-nonexistent ids.
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("nonexistent-target validation — valid UUID, no record -> 404 (not 500)", () => {
  let social: express.Router;
  let messages: express.Router;
  let token: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    social = (await import("../routes/social")).default;
    messages = (await import("../routes/messages")).default;
    const { signToken } = await import("../lib/auth");
    token = signToken({ sub: "00000000-0000-0000-0000-000000000001", email: "ghost@example.com" });
  });

  function app() {
    const server = express();
    server.use(express.json());
    server.use("/social", social);
    server.use("/messages", messages);
    return server;
  }

  // A well-formed UUID that does not correspond to any real row.
  const ghost = "00000000-0000-4000-8000-0000000000ff";

  it("POST /social/users/:id/follow (nonexistent) -> 404", async () => {
    const res = await request(app())
      .post(`/social/users/${ghost}/follow`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("POST /social/posts/:id/like (nonexistent) -> 404", async () => {
    const res = await request(app())
      .post(`/social/posts/${ghost}/like`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("POST /messages/conversations (nonexistent otherUserId) -> 404", async () => {
    const res = await request(app())
      .post("/messages/conversations")
      .set("Authorization", `Bearer ${token}`)
      .send({ otherUserId: ghost });
    expect(res.status).toBe(404);
  });
});
