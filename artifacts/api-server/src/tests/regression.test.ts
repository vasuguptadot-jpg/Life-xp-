import { describe, it, expect, beforeAll } from "vitest";
import bcrypt from "bcryptjs";

// SESSION_SECRET is provided by vitest.config.ts `env`. lib/auth reads it at
// import time, so import it lazily inside the tests (after env is set).
let auth: typeof import("../lib/auth");

describe("auth — JWT + password", () => {
  beforeAll(async () => {
    auth = await import("../lib/auth");
  });

  it("signs a token that verifies back to the same payload", () => {
    const payload = { sub: "user-123", email: "a@example.com" };
    const token = auth.signToken(payload, "5m");
    const decoded = auth.verifyToken(token);
    expect(decoded.sub).toBe("user-123");
    expect(decoded.email).toBe("a@example.com");
  });

  it("rejects a tampered token", () => {
    const token = auth.signToken({ sub: "user-123", email: "a@example.com" }, "5m");
    const tampered = token.slice(0, -4) + "AAAA";
    expect(() => auth.verifyToken(tampered)).toThrow();
  });

  it("rejects an expired token", () => {
    const token = auth.signToken({ sub: "user-123", email: "a@example.com" }, "-1s");
    expect(() => auth.verifyToken(token)).toThrow();
  });

  it("hashes and verifies a password without storing it in plaintext", async () => {
    const hash = await bcrypt.hash("Password123!", 10);
    expect(hash).not.toContain("Password123!");
    expect(await bcrypt.compare("Password123!", hash)).toBe(true);
    expect(await bcrypt.compare("WrongPass", hash)).toBe(false);
  });
});

describe("startup — optional AI provider (BUG-3 regression)", () => {
  it("imports the social route without GROQ_API_KEY set (no module-load crash)", async () => {
    // GROQ_API_KEY is intentionally UNSET here. Before the fix, social.ts
    // instantiated `new Groq(...)` at module load and this import would throw.
    expect(process.env.GROQ_API_KEY).toBeUndefined();
    await expect(import("../routes/social")).resolves.toBeTruthy();
  });

  it("imports the full app without GROQ_API_KEY set", async () => {
    await expect(import("../app")).resolves.toBeTruthy();
  });
});
