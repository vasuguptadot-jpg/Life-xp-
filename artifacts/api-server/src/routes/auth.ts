import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { requireAuth, signToken } from "../lib/auth";

const router = Router();

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
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
    .where(or(eq(usersTable.email, email), eq(usersTable.username, username)))
    .limit(1);

  if (existing.length > 0) {
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

// POST /api/auth/signin
router.post("/signin", async (req, res) => {
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

  const payload = { sub: user.id, email: user.email };
  const accessToken = signToken(payload, "1d");
  const refreshToken = signToken(payload, "7d");

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, username: user.username },
  });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

export default router;
