/**
 * STAGE 20 — Part 2: completion / mutation rate limiting (AG-2) tests.
 *
 * The limiter is keyed on the authenticated user identity. These tests
 * exercise the limiter middleware directly (deterministic, no reliance on
 * wall-clock beyond a short window) and confirm it does not interfere with
 * legitimate low-volume mutation traffic.
 */
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { makeMutationLimiter } from "../lib/rate-limit";

function makeApp(limit: number) {
  const app = express();
  // Simulate requireAuth having populated req.user.
  app.use((req, _res, next) => {
    (req as unknown as { user: { sub: string } }).user = { sub: (req.query.uid as string) || "u1" };
    next();
  });
  app.use(makeMutationLimiter({ windowMs: 60_000, max: limit }));
  app.post("/mutate", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("STAGE 20 — completion rate limiting (Part 2)", () => {
  it("allows a normal burst but blocks a flood (429)", async () => {
    const app = makeApp(3);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/mutate").query({ uid: "u1" });
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post("/mutate").query({ uid: "u1" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/slow down/i);
  });

  it("keys the limit on user identity — another user is unaffected", async () => {
    const app = makeApp(2);
    await request(app).post("/mutate").query({ uid: "u1" });
    await request(app).post("/mutate").query({ uid: "u1" });
    // u1 exhausted; u2 still has a fresh budget.
    const other = await request(app).post("/mutate").query({ uid: "u2" });
    expect(other.status).toBe(200);
    // u1 is now blocked.
    const blocked = await request(app).post("/mutate").query({ uid: "u1" });
    expect(blocked.status).toBe(429);
  });

  it("concurrent requests do not exceed the configured limit", async () => {
    const app = makeApp(5);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => request(app).post("/mutate").query({ uid: "u1" })),
    );
    const ok = results.filter((r) => r.status === 200).length;
    const limited = results.filter((r) => r.status === 429).length;
    expect(ok).toBe(5);
    expect(limited).toBe(15);
  });
});
