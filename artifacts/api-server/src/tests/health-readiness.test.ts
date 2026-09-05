/**
 * STAGE 22 — liveness vs readiness separation.
 *
 * Liveness  (/api/healthz) must never depend on PostgreSQL — it reports whether
 * the process is alive. Readiness (/api/readyz) reports whether the instance
 * can actually serve requests, and must reflect the critical dependency
 * (PostgreSQL) WITHOUT depending on optional services (Groq/AI, storage).
 *
 * The "database down → 503 → restored → 200" recovery is exercised separately
 * by the recovery harness (see docs/STAGE22_OBSERVABILITY_AUDIT.md) because it
 * requires controlling the PostgreSQL process lifecycle.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 22 — health/readiness (live server)", () => {
  let app: import("express").Express;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    app = (await import("../app")).default;
  });

  it("liveness /healthz returns 200 and a stable shape", async () => {
    const r = await request(app).get("/api/healthz");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: "ok" });
  });

  it("readiness /readyz returns 200 when PostgreSQL is up", async () => {
    const r = await request(app).get("/api/readyz");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: "ok", database: "up" });
  });

  it("readiness does NOT depend on optional services (no GROQ_API_KEY required)", async () => {
    // The readyz check only probes PostgreSQL; it must succeed even when the
    // optional AI provider is unconfigured (which is the norm in this sandbox).
    delete process.env.GROQ_API_KEY;
    const r = await request(app).get("/api/readyz");
    expect(r.status).toBe(200);
  });

  it("healthz/readyz do not leak topology, env, or credentials", async () => {
    for (const path of ["/api/healthz", "/api/readyz"]) {
      const r = await request(app).get(path);
      const text = JSON.stringify(r.body);
      expect(text).not.toMatch(/DATABASE_URL|SESSION_SECRET|GROQ|postgres:|password|127\.0\.0\.1/i);
    }
  });
});
