import { Router } from "express";
import { and, desc, eq, sql, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, userLevelsTable, userProfilesTable } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
router.use(requireAuth);

const storage = new ObjectStorageService();

// ── Leaderboard ──────────────────────────────────────────────────────────────
// GET /api/social/leaderboard
router.get("/leaderboard", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const rows = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      totalXp: userLevelsTable.totalXp,
      currentLevel: userLevelsTable.currentLevel,
      avatarUrl: userProfilesTable.avatarUrl,
    })
    .from(usersTable)
    .leftJoin(userLevelsTable, eq(userLevelsTable.userId, usersTable.id))
    .leftJoin(userProfilesTable, eq(userProfilesTable.userId, usersTable.id))
    .orderBy(desc(sql`COALESCE(${userLevelsTable.totalXp}, 0)`))
    .limit(limit);

  res.json(rows.map((r, i) => ({ ...r, rank: i + 1, totalXp: r.totalXp ?? 0, currentLevel: r.currentLevel ?? 1 })));
});

// ── Public user profile ──────────────────────────────────────────────────────
// GET /api/social/users/:id
router.get("/users/:id", async (req, res) => {
  const { id } = req.params;
  const viewerId = req.user!.sub;

  const [user] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);

  if (!user) { res.status(404).json({ message: "User not found" }); return; }

  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, id))
    .limit(1);

  const [levelRow] = await db
    .select()
    .from(userLevelsTable)
    .where(eq(userLevelsTable.userId, id))
    .limit(1);

  // follower/following counts
  const [[followerCount], [followingCount]] = await Promise.all([
    db.execute(sql`SELECT COUNT(*) FROM follows WHERE following_id = ${id}`),
    db.execute(sql`SELECT COUNT(*) FROM follows WHERE follower_id = ${id}`),
  ]);

  // is current user following this user?
  const [followRow] = await db.execute(
    sql`SELECT 1 FROM follows WHERE follower_id = ${viewerId} AND following_id = ${id} LIMIT 1`
  );

  res.json({
    ...user,
    profile: profile ?? null,
    level: levelRow?.currentLevel ?? 1,
    totalXp: levelRow?.totalXp ?? 0,
    followerCount: Number((followerCount as any).count ?? 0),
    followingCount: Number((followingCount as any).count ?? 0),
    isFollowing: !!(followRow as any),
  });
});

// ── Follow / Unfollow ────────────────────────────────────────────────────────
// POST /api/social/users/:id/follow
router.post("/users/:id/follow", async (req, res) => {
  const followerId = req.user!.sub;
  const followingId = req.params.id;
  if (followerId === followingId) { res.status(400).json({ message: "Cannot follow yourself" }); return; }
  await db.execute(
    sql`INSERT INTO follows (follower_id, following_id) VALUES (${followerId}, ${followingId}) ON CONFLICT DO NOTHING`
  );
  res.json({ following: true });
});

// DELETE /api/social/users/:id/follow
router.delete("/users/:id/follow", async (req, res) => {
  const followerId = req.user!.sub;
  const followingId = req.params.id;
  await db.execute(
    sql`DELETE FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId}`
  );
  res.json({ following: false });
});

// ── Posts ────────────────────────────────────────────────────────────────────
// GET /api/social/posts  (feed: all posts or by hashtag)
router.get("/posts", async (req, res) => {
  const tag = req.query.tag as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const offset = Number(req.query.offset ?? 0);

  let rows;
  if (tag) {
    rows = await db.execute(sql`
      SELECT p.id, p.caption, p.image_url, p.hashtags, p.likes_count, p.created_at,
             u.id as user_id, u.username, u.display_name,
             up.avatar_url,
             EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${req.user!.sub}) as liked_by_me
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN user_profiles up ON up.user_id = p.user_id
      WHERE ${tag} = ANY(p.hashtags)
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
  } else {
    rows = await db.execute(sql`
      SELECT p.id, p.caption, p.image_url, p.hashtags, p.likes_count, p.created_at,
             u.id as user_id, u.username, u.display_name,
             up.avatar_url,
             EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${req.user!.sub}) as liked_by_me
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN user_profiles up ON up.user_id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
  }
  res.json(rows.rows ?? rows);
});

// POST /api/social/posts
router.post("/posts", async (req, res) => {
  const userId = req.user!.sub;
  const { caption, imageUrl, hashtags } = req.body ?? {};
  if (!caption && !imageUrl) {
    res.status(400).json({ message: "Post must have a caption or image" });
    return;
  }
  const tags: string[] = Array.isArray(hashtags) ? hashtags.map((t: string) => t.toLowerCase().replace(/^#/, "")) : [];
  const [row] = await db.execute(sql`
    INSERT INTO posts (user_id, caption, image_url, hashtags)
    VALUES (${userId}, ${caption ?? null}, ${imageUrl ?? null}, ${JSON.stringify(tags)}::text[])
    RETURNING *
  `);
  res.status(201).json((row as any).rows?.[0] ?? row);
});

// DELETE /api/social/posts/:id
router.delete("/posts/:id", async (req, res) => {
  const userId = req.user!.sub;
  await db.execute(sql`DELETE FROM posts WHERE id = ${req.params.id} AND user_id = ${userId}`);
  res.json({ deleted: true });
});

// POST /api/social/posts/:id/like
router.post("/posts/:id/like", async (req, res) => {
  const userId = req.user!.sub;
  const postId = req.params.id;
  await db.execute(sql`
    INSERT INTO post_likes (user_id, post_id) VALUES (${userId}, ${postId}) ON CONFLICT DO NOTHING;
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = ${postId}
  `);
  res.json({ liked: true });
});

// DELETE /api/social/posts/:id/like
router.delete("/posts/:id/like", async (req, res) => {
  const userId = req.user!.sub;
  const postId = req.params.id;
  await db.execute(sql`
    DELETE FROM post_likes WHERE user_id = ${userId} AND post_id = ${postId};
    UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ${postId}
  `);
  res.json({ liked: false });
});

// ── Upload presigned URL ─────────────────────────────────────────────────────
// POST /api/social/uploads/request-url
router.post("/uploads/request-url", async (req, res) => {
  const { contentType } = req.body ?? {};
  if (!contentType?.startsWith("image/")) {
    res.status(400).json({ message: "Only image uploads are supported" });
    return;
  }
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  res.json({ uploadURL, objectPath });
});

// GET /api/social/objects/**  – serve uploaded images (use `use` for wildcard in Express 5)
router.use("/objects", async (req, res, next) => {
  if (req.method !== "GET") return next();
  const rawPath = req.path;
  try {
    const file = await storage.getObjectEntityFile(rawPath);
    const response = await storage.downloadObject(file);
    res.setHeader("Content-Type", response.headers.get("Content-Type") ?? "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    const buf = await response.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch {
    res.status(404).json({ message: "Not found" });
  }
});

export default router;
