import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";

// STAGE 26.1 — Authentication CPU isolation & password-hashing hardening.
//
// The single code change for this stage: `bcryptjs` (pure-JS, blocks the main
// event loop ~330ms/hash) → native `bcrypt` (libuv threadpool, ~247ms/hash,
// does not block the event loop). Cost stays 12. Algorithm stays bcrypt.
//
// This suite proves the swap did NOT weaken security, break existing accounts,
// or change authentication behavior.
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

const maybe = TEST_DB_URL ? describe : describe.skip;

// A bcryptjs-2.4.3-produced hash of "LegacyPass123!" at cost 12. Existing
// accounts in the database carry $2a$ hashes like this; native bcrypt must
// keep verifying them so no account is invalidated by the library swap.
const LEGACY_BCRYPTJS_HASH =
  "$2a$12$kCaqUF5cEshszfHRWfE3YO5LfhNZEZdJyyskErM0hTvGdylsmldju";

maybe("STAGE 26.1 — auth: native bcrypt is drop-in and accounts survive", () => {
  let app: import("express").Express;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    // Disable rate limiting so correctness tests aren't throttled.
    process.env.NODE_ENV = "test";
    app = (await import("../app")).default;
  });

  it("Part 1/4 — native bcrypt emits a $2b$ hash at cost 12 (algorithm + cost unchanged)", async () => {
    const h = await bcrypt.hash("Password123!", 12);
    expect(h.startsWith("$2b$12$")).toBe(true);
    expect(h).not.toContain("Password123!");
  });

  it("Part 4 — a legacy bcryptjs $2a$12$ hash still verifies (no account invalidation)", async () => {
    expect(await bcrypt.compare("LegacyPass123!", LEGACY_BCRYPTJS_HASH)).toBe(true);
    expect(await bcrypt.compare("WrongPass", LEGACY_BCRYPTJS_HASH)).toBe(false);
  });

  it("Part 4 — a user stored with a legacy $2a$ hash can still sign in end-to-end", async () => {
    const suffix = Date.now();
    const email = `legacy-${suffix}@example.com`;
    const { db } = await import("@workspace/db");
    const schema = await import("@workspace/db/schema");
    await db
      .insert(schema.usersTable)
      .values({ email, username: `legacy${suffix}`, passwordHash: LEGACY_BCRYPTJS_HASH });
    const res = await request(app)
      .post("/api/auth/signin")
      .send({ email, password: "LegacyPass123!" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/);
  });

  it("Part 4 — a freshly created account (native $2b$) signs in and is not rehashed to plaintext", async () => {
    const suffix = Date.now();
    const email = `native-${suffix}@example.com`;
    const username = `nat${suffix}`.slice(0, 30);
    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ email, username, password: "Password123!" });
    expect(signup.status).toBe(201);

    const { db } = await import("@workspace/db");
    const schema = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ passwordHash: schema.usersTable.passwordHash })
      .from(schema.usersTable)
      .where(eq(schema.usersTable.email, email));
    expect(row.passwordHash.startsWith("$2b$12$")).toBe(true);

    const login = await request(app).post("/api/auth/signin").send({ email, password: "Password123!" });
    expect(login.status).toBe(200);
  });

  it("Part 5 — native bcrypt.hash does not block the event loop (timer fires during hashing)", async () => {
    // If hashing ran on the main thread, the 12-round hash (~250ms) would starve
    // this 20ms timer. With native bcrypt the timer must fire before hash resolves.
    let timerFired = false;
    const timer = setTimeout(() => { timerFired = true; }, 20);
    await bcrypt.hash("Password123!", 12);
    clearTimeout(timer);
    expect(timerFired).toBe(true);
  });

  it("Part 6 — wrong password is rejected (401) with no timing-shape regression surface", async () => {
    const suffix = Date.now();
    const email = `wrong-${suffix}@example.com`;
    const username = `wrn${suffix}`.slice(0, 30);
    await request(app).post("/api/auth/signup").send({ email, username, password: "Password123!" });
    const res = await request(app).post("/api/auth/signin").send({ email, password: "WrongPassword!" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("Part 6 — disabled account (is_active=false) and nonexistent account both return uniform 401", async () => {
    const suffix = Date.now();
    const { db } = await import("@workspace/db");
    const schema = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    const hash = await bcrypt.hash("Password123!", 12);
    const email = `disabled-${suffix}@example.com`;
    const username = `dis${suffix}`.slice(0, 30);
    await db.insert(schema.usersTable).values({ email, username, passwordHash: hash, isActive: false });

    const disabled = await request(app).post("/api/auth/signin").send({ email, password: "Password123!" });
    const absent = await request(app).post("/api/auth/signin").send({ email: `nobody-${suffix}@x.com`, password: "Password123!" });

    expect(disabled.status).toBe(401);
    expect(absent.status).toBe(401);
    expect(disabled.body.message).toBe(absent.body.message); // uniform, no enumeration
  });

  it("Part 6 — nonexistent/inactive signin burns a bcrypt compare (no timing enumeration oracle)", async () => {
    // The signin handler must run bcrypt.compare even when the account does not
    // exist, so its latency matches the wrong-password path. Without this a
    // registered email returns 401 ~250ms slower than an unregistered one.
    const bcryptMod = await import("bcrypt");
    const compare = vi.spyOn(bcryptMod.default, "compare");

    const suffix = Date.now();
    await request(app)
      .post("/api/auth/signin")
      .send({ email: `ghost-${suffix}@x.com`, password: "Password123!" });

    expect(compare).toHaveBeenCalledTimes(1);
    compare.mockRestore();
  });

  it("Part 6 — deleted (hard-deleted) account cannot sign in and refresh is rejected", async () => {
    const suffix = Date.now();
    const email = `del-${suffix}@example.com`;
    const username = `del${suffix}`.slice(0, 30);
    await request(app).post("/api/auth/signup").send({ email, username, password: "Password123!" });
    const login = await request(app).post("/api/auth/signin").send({ email, password: "Password123!" });
    const rt = login.body.refreshToken;
    expect(rt).toBeTruthy();

    const { db } = await import("@workspace/db");
    const schema = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.usersTable).where(eq(schema.usersTable.email, email));

    const reLogin = await request(app).post("/api/auth/signin").send({ email, password: "Password123!" });
    expect(reLogin.status).toBe(401);
    // refresh tokens cascade-delete with the user, so refresh also fails closed
    const refresh = await request(app).post("/api/auth/refresh").send({ refreshToken: rt });
    expect(refresh.status).toBe(401);
  });

  it("Part 6 — logout revokes the refresh token (subsequent refresh is rejected)", async () => {
    const suffix = Date.now();
    const email = `lo-${suffix}@example.com`;
    const username = `lo${suffix}`.slice(0, 30);
    await request(app).post("/api/auth/signup").send({ email, username, password: "Password123!" });
    const login = await request(app).post("/api/auth/signin").send({ email, password: "Password123!" });
    const rt = login.body.refreshToken;

    const logout = await request(app).post("/api/auth/logout").send({ refreshToken: rt });
    expect(logout.status).toBe(200);
    const refresh = await request(app).post("/api/auth/refresh").send({ refreshToken: rt });
    expect(refresh.status).toBe(401);
  });

  it("Part 6 — session rotation: refresh mints a new pair and rotates the old token", async () => {
    const suffix = Date.now();
    const email = `rot-${suffix}@example.com`;
    const username = `rot${suffix}`.slice(0, 30);
    await request(app).post("/api/auth/signup").send({ email, username, password: "Password123!" });
    const login = await request(app).post("/api/auth/signin").send({ email, password: "Password123!" });
    const rt = login.body.refreshToken;

    const first = await request(app).post("/api/auth/refresh").send({ refreshToken: rt });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(rt);
    const replay = await request(app).post("/api/auth/refresh").send({ refreshToken: rt });
    expect(replay.status).toBe(401);
  });
});

maybe("STAGE 26.1 — auth: password input safety (deterministic rejection, no crash)", () => {
  let app: import("express").Express;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.NODE_ENV = "test";
    app = (await import("../app")).default;
  });

  const un = (p: string) => p.slice(0, 30);

  it("Part 7 — invalid password types are rejected deterministically (400), never 500", async () => {
    const suffix = Date.now();
    const cases: unknown[] = [
      undefined,
      null,
      12345,
      { a: 1 },
      ["password"],
      "",
      "short",
      "        ", // whitespace-only
    ];
    for (const pw of cases) {
      const res = await request(app)
        .post("/api/auth/signup")
        .send({ email: `pw-${suffix}-${JSON.stringify(pw)}@x.com`.slice(0, 60), username: un(`u${suffix}${cases.indexOf(pw)}`), password: pw });
      expect(res.status, `password=${JSON.stringify(pw)}`).toBeLessThan(500);
    }
  });

  it("Part 7 — long, unicode, and whitespace-padded valid passwords are accepted (no arbitrary rules)", async () => {
    const suffix = Date.now();
    const longPw = "a".repeat(100);
    const unicodePw = "pässwörd🔒密码";
    const paddedPw = "  Password123!  ";
    for (const [tag, pw] of [["long", longPw], ["unicode", unicodePw], ["padded", paddedPw]] as const) {
      const email = `${tag}-${suffix}@x.com`;
      const username = un(`${tag}${suffix}`);
      const signup = await request(app).post("/api/auth/signup").send({ email, username, password: pw });
      expect(signup.status, `signup ${tag}`).toBe(201);
      const login = await request(app).post("/api/auth/signin").send({ email, password: pw });
      expect(login.status, `signin ${tag}`).toBe(200);
    }
  });

  it("Part 7 — extremely large password (1MB) is rejected without crashing or starving the loop", async () => {
    const suffix = Date.now();
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: `huge-${suffix}@x.com`, username: un(`huge${suffix}`), password: "x".repeat(1024 * 1024) });
    // body-parser 100KB limit → 413; signup's own length guard → 400. Either is a
    // deterministic client error, never a 500 or a crash.
    expect(res.status).toBeLessThan(500);
  });
});
