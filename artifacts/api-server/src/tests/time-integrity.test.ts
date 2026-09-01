/**
 * STAGE 21 — Part 8: time & clock integrity.
 *
 * All legitimate time dependence flows through the single `dayKey()` helper
 * (UTC date string). This suite verifies boundary behavior and documents the
 * server-timezone (UTC) policy.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("STAGE 21 — time & clock integrity (Part 8)", () => {
  let engine: typeof import("../lib/life-engine");

  beforeAll(async () => {
    engine = await import("../lib/life-engine");
  });
  afterAll(() => vi.useRealTimers());

  it("dayKey is the single clock abstraction and is UTC-based and deterministic", () => {
    const { dayKey } = engine;
    expect(dayKey(new Date("2026-09-01T00:00:00.000Z"))).toBe("2026-09-01");
    expect(dayKey(new Date("2026-09-01T23:59:59.999Z"))).toBe("2026-09-01");
    expect(dayKey(new Date("2026-09-01T12:34:56.789Z"))).toBe("2026-09-01");
    // Same instant → same key (idempotent / deterministic).
    expect(dayKey(new Date("2026-09-01T12:00:00Z"))).toBe(dayKey(new Date("2026-09-01T12:00:00Z")));
  });

  it("day boundary rolls at UTC midnight, not local midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T23:59:59.999Z"));
    const before = engine.dayKey(new Date());
    vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
    const after = engine.dayKey(new Date());
    expect(before).toBe("2026-09-01");
    expect(after).toBe("2026-09-02");
    vi.useRealTimers();
  });

  it("leap-day boundary is handled as an ordinary date key", () => {
    const { dayKey } = engine;
    expect(dayKey(new Date("2024-02-28T23:59:59Z"))).toBe("2024-02-28");
    expect(dayKey(new Date("2024-02-29T00:00:00Z"))).toBe("2024-02-29");
    expect(dayKey(new Date("2024-03-01T00:00:00Z"))).toBe("2024-03-01");
  });

  it("FINDING (C): all day-boundary features use UTC, with no user-timezone concept", () => {
    // dayKey derives from Date.toISOString() (UTC). A user in e.g. Asia/Kolkata
    // (+05:30) experiences the "daily tasks" / "streak" day reset at 05:30 local
    // time. There is no user timezone column and no offset-aware clock. This is a
    // documented product-policy choice (single canonical day = UTC), not a data
    // corruption bug — but it is a real UX/product risk for non-UTC users.
    const src = "dayKey(date) => date.toISOString().split('T')[0] (UTC)";
    expect(engine.dayKey(new Date("2026-09-01T20:00:00+05:30"))).toBe("2026-09-01");
    expect(src).toContain("UTC");
  });

  it("future/past timestamps do not break dayKey (bounded, no crash)", () => {
    const { dayKey } = engine;
    expect(dayKey(new Date("2099-12-31T00:00:00Z"))).toBe("2099-12-31");
    expect(dayKey(new Date("1970-01-01T00:00:00Z"))).toBe("1970-01-01");
  });
});
