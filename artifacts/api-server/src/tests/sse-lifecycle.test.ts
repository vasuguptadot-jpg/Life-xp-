/**
 * STAGE 22 — SSE connection lifecycle: no leak / orphan accumulation.
 *
 * Verifies BEHAVIOR of the realtime registry: a connect → disconnect →
 * reconnect cycle must never accumulate server-side connection state. Each
 * disconnect frees its slot; the registry returns to zero when all clients
 * leave.
 */
import { describe, expect, it } from "vitest";
import {
  registerClient,
  unregisterClient,
  getClientCount,
  getConversationCount,
} from "../lib/sse-registry";

describe("STAGE 22 — SSE connection lifecycle (no leak)", () => {
  const resA = { write: () => true };
  const resB = { write: () => true };

  it("starts empty", () => {
    expect(getClientCount()).toBe(0);
    expect(getConversationCount()).toBe(0);
  });

  it("connect 1 client → count 1, disconnect → count 0", () => {
    registerClient("conv-1", "user-1", resA);
    expect(getClientCount()).toBe(1);
    unregisterClient("conv-1", "user-1", resA);
    expect(getClientCount()).toBe(0);
    expect(getConversationCount()).toBe(0);
  });

  it("connect → disconnect → reconnect ×N does not accumulate", () => {
    for (let i = 0; i < 100; i++) {
      registerClient("conv-loop", "user-loop", resA);
      unregisterClient("conv-loop", "user-loop", resA);
    }
    expect(getClientCount()).toBe(0);
    expect(getConversationCount()).toBe(0);
  });

  it("two clients on one conversation are tracked independently and both freed", () => {
    registerClient("conv-2", "user-1", resA);
    registerClient("conv-2", "user-2", resB);
    expect(getClientCount()).toBe(2);
    expect(getConversationCount()).toBe(1);

    unregisterClient("conv-2", "user-1", resA);
    expect(getClientCount()).toBe(1);
    expect(getConversationCount()).toBe(1);

    unregisterClient("conv-2", "user-2", resB);
    expect(getClientCount()).toBe(0);
    expect(getConversationCount()).toBe(0);
  });

  it("unregister of a client that was never registered is a no-op (no negative state)", () => {
    unregisterClient("conv-none", "ghost", resA);
    expect(getClientCount()).toBe(0);
  });
});
