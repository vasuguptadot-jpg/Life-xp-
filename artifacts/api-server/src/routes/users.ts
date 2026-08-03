import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, userLevelsTable, userProfilesTable } from "@workspace/db/schema";
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

  if (!user) { res.status(404).json({ message: "User not found" }); return; }
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

// GET /api/users/me/level
router.get("/me/level", async (req, res) => {
  const [row] = await db.select().from(userLevelsTable).where(eq(userLevelsTable.userId, req.user!.sub)).limit(1);
  res.json({ currentLevel: row?.currentLevel ?? 1, totalXp: row?.totalXp ?? 0 });
});

// GET /api/users/me/profile-extra
router.get("/me/profile-extra", async (req, res) => {
  const userId = req.user!.sub;
  const rows = await db.execute(
    sql`SELECT avatar_url, bio, age, weight_kg, height_cm FROM user_profiles WHERE user_id = ${userId} LIMIT 1`
  );
  const row = (rows.rows ?? rows)[0] as any;
  res.json({
    avatarUrl: row?.avatar_url ?? null,
    bio:       row?.bio ?? null,
    age:       row?.age ?? null,
    weightKg:  row?.weight_kg ?? null,
    heightCm:  row?.height_cm ?? null,
  });
});

// PATCH /api/users/me/profile-extra
router.patch("/me/profile-extra", async (req, res) => {
  const userId = req.user!.sub;
  const { bio, age, weightKg, heightCm, avatarUrl } = req.body ?? {};

  await db.execute(sql`
    INSERT INTO user_profiles (user_id, bio, age, weight_kg, height_cm, avatar_url, created_at, updated_at)
    VALUES (
      ${userId},
      ${bio ?? null},
      ${age !== undefined ? Number(age) : null},
      ${weightKg !== undefined ? String(weightKg) : null},
      ${heightCm !== undefined ? Number(heightCm) : null},
      ${avatarUrl ?? null},
      NOW(), NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      bio       = COALESCE(EXCLUDED.bio,      user_profiles.bio),
      age       = COALESCE(EXCLUDED.age,      user_profiles.age),
      weight_kg = COALESCE(EXCLUDED.weight_kg, user_profiles.weight_kg),
      height_cm = COALESCE(EXCLUDED.height_cm, user_profiles.height_cm),
      avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
      updated_at = NOW()
  `);

  res.json({ success: true });
});

// DELETE /api/users/me
router.delete("/me", async (req, res) => {
  const userId = req.user!.sub;
  const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, userId)).returning({ id: usersTable.id });
  if (!deleted) { res.status(404).json({ message: "User not found" }); return; }
  res.json({ success: true, message: "Account deleted" });
});

export default router;
