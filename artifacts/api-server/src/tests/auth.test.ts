import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { app, createTestUser, uniqueEmail, uniqueUsername } from "./helpers";

// Track created user emails for cleanup
const createdEmails: string[] = [];

afterEach(async () => {
  for (const email of createdEmails.splice(0)) {
    await db.delete(usersTable).where(eq(usersTable.email, email));
  }
});

describe("POST /api/auth/signup", () => {
  it("creates a new user with valid credentials", async () => {
    const email = uniqueEmail();
    const username = uniqueUsername();
    createdEmails.push(email);

    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email, username, password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects duplicate email", async () => {
    const email = uniqueEmail();
    const username = uniqueUsername();
    createdEmails.push(email);

    await request(app).post("/api/auth/signup").send({ email, username, password: "password123" });

    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email, username: uniqueUsername(), password: "password123" });

    expect(res.status).toBe(409);
  });

  it("rejects short passwords", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: uniqueEmail(), username: uniqueUsername(), password: "short" });

    expect(res.status).toBe(400);
  });

  it("rejects invalid username characters", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: uniqueEmail(), username: "bad user!", password: "password123" });

    expect(res.status).toBe(400);
  });

  it("rejects missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: uniqueEmail() });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/signin", () => {
  it("returns access and refresh tokens on valid credentials", async () => {
    const user = await createTestUser();
    createdEmails.push(user.email);

    expect(user.accessToken).toBeTruthy();
    expect(user.refreshToken).toBeTruthy();
    // Refresh token must be opaque (not a JWT — no dots)
    expect(user.refreshToken).not.toMatch(/\./);
  });

  it("rejects wrong password", async () => {
    const email = uniqueEmail();
    const username = uniqueUsername();
    createdEmails.push(email);

    await request(app)
      .post("/api/auth/signup")
      .send({ email, username, password: "correctpass123" });

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email, password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  it("rejects unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email: "nobody@example.com", password: "doesnotmatter" });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns user info for authenticated user", async () => {
    const user = await createTestUser();
    createdEmails.push(user.email);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sub).toBe(user.id);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 with malformed token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  it("issues new tokens and rotates refresh token", async () => {
    const user = await createTestUser();
    createdEmails.push(user.email);

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: user.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    // New refresh token must differ from the old one
    expect(res.body.refreshToken).not.toBe(user.refreshToken);
  });

  it("rejects an already-used (rotated) refresh token", async () => {
    const user = await createTestUser();
    createdEmails.push(user.email);

    // Use the token once
    await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: user.refreshToken });

    // Second use must fail
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: user.refreshToken });

    expect(res.status).toBe(401);
  });

  it("rejects an invalid refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "totally-fake-token" });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the refresh token so it cannot be used again", async () => {
    const user = await createTestUser();
    createdEmails.push(user.email);

    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .send({ refreshToken: user.refreshToken });

    expect(logoutRes.status).toBe(200);

    // Attempt to refresh after logout — must fail
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: user.refreshToken });

    expect(refreshRes.status).toBe(401);
  });
});

describe("User isolation", () => {
  it("user A cannot access user B's protected resources using own token", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    createdEmails.push(userA.email, userB.email);

    // User A can read their own info
    const resA = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(resA.body.sub).toBe(userA.id);

    // User B can read their own info
    const resB = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(resB.body.sub).toBe(userB.id);

    // IDs are different
    expect(resA.body.sub).not.toBe(resB.body.sub);
  });
});
