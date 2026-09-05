/**
 * STAGE 22 — DB pool resilience regression (D-class fix).
 *
 * Root cause fixed in @workspace/db: `new Pool(...)` had NO 'error' listener.
 * When PostgreSQL terminates a connection (restart, pg_terminate_backend, or an
 * in-flight query error), node-postgres re-emits the client error on the Pool.
 * With zero listeners, Node treats the emitted 'error' as an unhandled exception
 * and CRASHES the whole API process — so a single PostgreSQL restart would take
 * the server down. The fix attaches a handler that only logs (structured), which
 * keeps the failure observable and lets the pool reconnect.
 *
 * These tests prove the *behavior*, not source presence:
 *  1. A pool 'error' event is handled (does not throw) — the exact code path
 *     that crashed pre-fix.
 *  2. Terminating a REAL backend connection mid-query does not crash the process,
 *     and the pool remains usable afterwards (recovery).
 */
import { beforeAll, describe, expect, it } from "vitest";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 22 — DB pool resilience (pool error handling)", () => {
  let pool: import("pg").Pool;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    pool = (await import("@workspace/db")).pool;
  });

  it("a pool 'error' event is handled and does not throw (pre-fix: unhandled 'error' → process crash)", () => {
    // Emitting 'error' on an EventEmitter with zero listeners throws
    // synchronously ("Unhandled 'error' event"). A handler must be present.
    expect(() => {
      pool.emit("error", new Error("simulated pool error — must be handled"));
    }).not.toThrow();

    // And the pool still accepts queries afterwards.
    return pool.query("SELECT 1").then((r) => {
      expect(r.rows[0]).toEqual({ "?column?": 1 });
    });
  });

  it("terminating a real backend connection mid-query does not crash and the pool recovers", async () => {
    // Check out a dedicated client and learn its backend PID.
    const victim = await pool.connect();
    const pidRes = await victim.query("SELECT pg_backend_pid() AS pid");
    const victimPid: number = pidRes.rows[0].pid;

    // A separate connection kills the victim's backend — a real connection
    // termination, equivalent to a PostgreSQL restart dropping a live client.
    const killer = await pool.connect();
    await killer.query("SELECT pg_terminate_backend($1)", [victimPid]);
    killer.release();

    // The victim's next query fails with a terminated-connection error, which
    // surfaces on the pool. Pre-fix this propagated as an unhandled 'error'
    // event and crashed the process; post-fix it is logged and discarded.
    await expect(victim.query("SELECT 1")).rejects.toThrow();
    victim.release(true); // destroy the dead client

    // Recovery: after the error is handled, the pool must serve new queries.
    // (Give the pool a moment to reap the destroyed client if needed.)
    const fresh = await pool.query("SELECT 42 AS answer");
    expect(fresh.rows[0].answer).toBe(42);
  });

  it("pool remains healthy for ordinary read traffic after the fault", async () => {
    const r = await pool.query("SELECT count(*)::int AS n FROM information_schema.tables");
    expect(typeof r.rows[0].n).toBe("number");
  });
});
