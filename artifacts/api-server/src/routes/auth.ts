import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import { usersTable, refreshTokensTable } from "@workspace/db/schema";
import { requireAuth, signToken } from "../lib/auth";

const router = Router();

// ── Rate limiting ──────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later" },
  // Skip in test environment so tests aren't blocked
  skip: () => process.env.NODE_ENV === "test",
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many token refresh requests, please try again later" },
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

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
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
    .values({ email, username, passwordHash })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      createdAt: usersTable.createdAt,
    });

  res.status(201).json({ user, message: "Account created successfully" });
});

// ── POST /api/auth/signin ──────────────────────────────────────────────────────
router.post("/signin", authLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ message: "email and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user || !user.isActive) {
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

  const [stored] = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.tokenHash, hash),
        isNull(refreshTokensTable.revokedAt),
        gt(refreshTokensTable.expiresAt, now),
      ),
    )
    .limit(1);

  if (!stored) {
    res.status(401).json({ message: "Invalid or expired refresh token" });
    return;
  }

  // Revoke the old token (rotation)
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: now })
    .where(eq(refreshTokensTable.id, stored.id));

  // Fetch user to include in new access token
  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.id, stored.userId))
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
