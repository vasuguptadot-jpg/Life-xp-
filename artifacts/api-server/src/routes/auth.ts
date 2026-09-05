import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcrypt";
import { and, eq, gt, isNull } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import { usersTable, refreshTokensTable } from "@workspace/db/schema";
import { requireAuth, signToken } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── Rate limiting ──────────────────────────────────────────────────────────────
// Rate-limit observability: a rejection is a structured, anonymized warn event
// (method + path only — never a user id or request id, so it cannot be abused
// to enumerate accounts). This mirrors makeMutationLimiter's handler.
const rateLimitRejected = (req: import("express").Request, res: import("express").Response, message: string) => {
  logger.warn(
    {
      event: "rate_limit.rejected",
      category: "rate_limit",
      method: req.method,
      path: (req.originalUrl ?? req.path).split("?")[0],
    },
    message,
  );
  res.status(429).json({ message });
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitRejected(req, res, "Too many attempts, please try again later"),
  // Skip in test environment so tests aren't blocked
  skip: () => process.env.NODE_ENV === "test",
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitRejected(req, res, "Too many token refresh requests, please try again later"),
  skip: () => process.env.NODE_ENV === "test",
});

// ── Token helpers ──────────────────────────────────────────────────────────────
function generateOpaqueToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

const REFRESH_TOKEN_TTL_DAYS = 7;

async function createRefreshToken(userId: string): Promise<string> {
  const raw = generateOpaqueToken();
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokensTable).values({ tokenHash: hash, userId, expiresAt });

  return raw;
}

// ── POST /api/auth/signup ──────────────────────────────────────────────────────
router.post("/signup", authLimiter, async (req, res) => {
  const { email, username, password } = req.body ?? {};

  if (!email || !username || !password) {
    res.status(400).json({ message: "email, username, and password are required" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ message: "Password must be at least 8 characters" });
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username) || username.length < 3 || username.length > 30) {
    res.status(400).json({ message: "Username must be 3-30 alphanumeric/underscore characters" });
    return;
  }

  // Email contract (STAGE 24 — C-2 fix): must be a non-empty string, ≤ 254
  // chars, matching a basic `local@domain.tld` shape. Normalized to
  // lowercased-trimmed before storage so "Foo@X.com" and "foo@x.com" cannot
  // create duplicate accounts. Rejection is deterministic (400) and pollutes
  // nothing.
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    res.status(400).json({ message: "A valid email address is required" });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ message: "Email or username already exists" });
    return;
  }

  const usernameTaken = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  if (usernameTaken.length > 0) {
    res.status(409).json({ message: "Email or username already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({ email: normalizedEmail, username, passwordHash })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      createdAt: usersTable.createdAt,
    });

  res.status(201).json({ user, message: "Account created successfully" });
});

// Dummy cost-12 hash. When a signin targets an account that does not exist (or
// is inactive), we still run one bcrypt compare against this fixed hash so the
// response latency matches the wrong-password path. Without this, a
// nonexistent account returns 401 in ~2ms while an existing account takes
// ~250ms, a clear account-enumeration timing oracle.
const DUMMY_PASSWORD_HASH =
  "$2b$12$OLApatjPsiZG1ZnhojRhkeEjOTixhU.AQLwqDHKS1zOyDg4hdkxja";

// ── POST /api/auth/signin ──────────────────────────────────────────────────────
router.post("/signin", authLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ message: "email and password are required" });
    return;
  }

  // Match signup's normalization so lookup is case/whitespace-insensitive.
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (!user || !user.isActive) {
    // Equalize timing with the wrong-password path: burn one bcrypt compare so
    // signin does not reveal whether an email is registered (or active).
    if (typeof password === "string") {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    }
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const accessToken = signToken({ sub: user.id, email: user.email }, "15m");
  const refreshToken = await createRefreshToken(user.id);

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, username: user.username },
  });
});

// ── POST /api/auth/refresh ─────────────────────────────────────────────────────
router.post("/refresh", refreshLimiter, async (req, res) => {
  const { refreshToken } = req.body ?? {};

  if (!refreshToken || typeof refreshToken !== "string") {
    res.status(400).json({ message: "refreshToken is required" });
    return;
  }

  const hash = hashToken(refreshToken);
  const now = new Date();

  // Atomically claim the token: set revokedAt in the SAME statement that
  // checks it is still unrevoked and unexpired. On concurrent replays only one
  // request matches the row (the others see revokedAt already set), so a
  // rotated refresh token can never be replayed to mint a second token pair.
  const [claimed] = await db
    .update(refreshTokensTable)
    .set({ revokedAt: now })
    .where(
      and(
        eq(refreshTokensTable.tokenHash, hash),
        isNull(refreshTokensTable.revokedAt),
        gt(refreshTokensTable.expiresAt, now),
      ),
    )
    .returning({ id: refreshTokensTable.id, userId: refreshTokensTable.userId });

  if (!claimed) {
    res.status(401).json({ message: "Invalid or expired refresh token" });
    return;
  }

  // Fetch user to include in new access token
  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.id, claimed.userId))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ message: "Account not available" });
    return;
  }

  const newAccessToken = signToken({ sub: user.id, email: user.email }, "15m");
  const newRefreshToken = await createRefreshToken(user.id);

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body ?? {};

  if (!refreshToken || typeof refreshToken !== "string") {
    res.status(400).json({ message: "refreshToken is required" });
    return;
  }

  const hash = hashToken(refreshToken);

  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokensTable.tokenHash, hash), isNull(refreshTokensTable.revokedAt)),
    );

  res.json({ success: true });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

export default router;
