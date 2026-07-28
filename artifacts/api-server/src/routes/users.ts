import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

// GET /api/users/me
router.get("/me", async (req, res) => {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      displayName: usersTable.displayName,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.sub))
    .limit(1);

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  res.json(user);
});

// PATCH /api/users/me
router.patch("/me", async (req, res) => {
  const { displayName, username } = req.body ?? {};

  if (username !== undefined) {
    if (!/^[a-zA-Z0-9_]+$/.test(username) || username.length < 3 || username.length > 30) {
      res.status(400).json({ message: "Username must be 3-30 alphanumeric/underscore characters" });
      return;
    }
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      ...(displayName !== undefined && { displayName }),
      ...(username !== undefined && { username }),
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, req.user!.sub))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      displayName: usersTable.displayName,
      updatedAt: usersTable.updatedAt,
    });

  res.json(updated);
});

// DELETE /api/users/me — permanent account deletion
// ON DELETE CASCADE on all FK references to users.id handles orphan cleanup.
router.delete("/me", async (req, res) => {
  const userId = req.user!.sub;

  const [deleted] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id });

  if (!deleted) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  res.json({ success: true, message: "Account deleted" });
});

export default router;
