import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, userLevelsTable, userProfilesTable } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import multer from "multer";
import Groq from "groq-sdk";

const router = Router();
router.use(requireAuth);

const storage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 150 * 1024 * 1024 } });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Leaderboard ──────────────────────────────────────────────────────────────
router.get("/leaderboard", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const rows = await db.execute(sql`
    SELECT u.id, u.username, u.display_name as "displayName",
           COALESCE(ul.total_xp, 0) as "totalXp",
           COALESCE(ul.current_level, 1) as "currentLevel",
           up.avatar_url as "avatarUrl"
    FROM users u
    LEFT JOIN user_levels ul ON ul.user_id = u.id
    LEFT JOIN user_profiles up ON up.user_id = u.id
    ORDER BY COALESCE(ul.total_xp, 0) DESC
    LIMIT ${limit}
  `);
  const data = (rows.rows ?? rows) as any[];
  res.json(data.map((r, i) => ({ ...r, rank: i + 1 })));
});

// ── Public user profile ──────────────────────────────────────────────────────
router.get("/users/:id", async (req, res) => {
  const { id } = req.params;
  const viewerId = req.user!.sub;

  const [user] = await db.select({
    id: usersTable.id, username: usersTable.username,
    displayName: usersTable.displayName, createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, id)).limit(1);

  if (!user) { res.status(404).json({ message: "User not found" }); return; }

  const [[profile], [levelRow]] = await Promise.all([
    db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, id)).limit(1),
    db.select().from(userLevelsTable).where(eq(userLevelsTable.userId, id)).limit(1),
  ]);

  const [[followerCount], [followingCount], [followRow]] = await Promise.all([
    db.execute(sql`SELECT COUNT(*) FROM follows WHERE following_id = ${id}`),
    db.execute(sql`SELECT COUNT(*) FROM follows WHERE follower_id = ${id}`),
    db.execute(sql`SELECT 1 FROM follows WHERE follower_id = ${viewerId} AND following_id = ${id} LIMIT 1`),
  ]);

  res.json({
    ...user, profile: profile ?? null,
    level: levelRow?.currentLevel ?? 1, totalXp: levelRow?.totalXp ?? 0,
    followerCount: Number((followerCount as any).count ?? 0),
    followingCount: Number((followingCount as any).count ?? 0),
    isFollowing: !!(followRow as any),
  });
});

// ── Follow / Unfollow ────────────────────────────────────────────────────────
router.post("/users/:id/follow", async (req, res) => {
  const followerId = req.user!.sub;
  const followingId = req.params.id;
  if (followerId === followingId) { res.status(400).json({ message: "Cannot follow yourself" }); return; }
  await db.execute(sql`INSERT INTO follows (follower_id, following_id) VALUES (${followerId}, ${followingId}) ON CONFLICT DO NOTHING`);
  res.json({ following: true });
});

router.delete("/users/:id/follow", async (req, res) => {
  const followerId = req.user!.sub;
  const followingId = req.params.id;
  await db.execute(sql`DELETE FROM follows WHERE follower_id = ${followerId} AND following_id = ${followingId}`);
  res.json({ following: false });
});

// ── Posts ────────────────────────────────────────────────────────────────────
router.get("/posts", async (req, res) => {
  const tag = req.query.tag as string | undefined;
  const postType = req.query.type as string | undefined; // 'post' | 'clip'
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const offset = Number(req.query.offset ?? 0);
  const userId = req.user!.sub;

  let whereClause = sql`1=1`;
  if (tag) whereClause = sql`${whereClause} AND ${tag} = ANY(p.hashtags)`;
  if (postType) whereClause = sql`${whereClause} AND p.post_type = ${postType}`;

  const rows = await db.execute(sql`
    SELECT p.id, p.caption, p.image_url, p.video_url, p.hashtags, p.likes_count,
           p.created_at, p.post_type,
           u.id as user_id, u.username, u.display_name,
           up.avatar_url,
           EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${userId}) as liked_by_me
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN user_profiles up ON up.user_id = p.user_id
    WHERE ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  res.json(rows.rows ?? rows);
});

// AI-personalized feed
router.get("/posts/personalized", async (req, res) => {
  const userId = req.user!.sub;
  const limit = Math.min(Number(req.query.limit ?? 30), 50);

  // Get user's active quests/goals for context
  const userGoals = await db.execute(sql`
    SELECT g.text FROM user_goals g WHERE g.user_id = ${userId} LIMIT 5
  `).catch(() => ({ rows: [] }));

  const allPosts = await db.execute(sql`
    SELECT p.id, p.caption, p.image_url, p.video_url, p.hashtags, p.likes_count,
           p.created_at, p.post_type,
           u.id as user_id, u.username, u.display_name,
           up.avatar_url,
           EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${userId}) as liked_by_me
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN user_profiles up ON up.user_id = p.user_id
    ORDER BY p.created_at DESC
    LIMIT 60
  `);

  const posts = (allPosts.rows ?? allPosts) as any[];
  if (posts.length === 0) { res.json([]); return; }

  // Score posts by recency + likes + goal relevance
  const goalTexts = ((userGoals as any).rows ?? userGoals).map((g: any) => g.text).join(", ");

  let scored = posts.map((p: any) => {
    const recencyScore = Math.max(0, 1 - (Date.now() - new Date(p.created_at).getTime()) / (7 * 24 * 3600 * 1000));
    const likeScore = Math.min(p.likes_count / 20, 1);
    let goalScore = 0;
    if (goalTexts && p.hashtags) {
      const tags: string[] = Array.isArray(p.hashtags) ? p.hashtags : [];
      const caption = (p.caption || "").toLowerCase();
      const goals = goalTexts.toLowerCase();
      goalScore = tags.some(t => goals.includes(t)) || goals.split(" ").some((w: string) => w.length > 4 && caption.includes(w)) ? 0.4 : 0;
    }
    return { ...p, _score: recencyScore * 0.5 + likeScore * 0.2 + goalScore };
  });

  scored.sort((a: any, b: any) => b._score - a._score);
  res.json(scored.slice(0, limit).map(({ _score, ...p }: any) => p));
});

// Get user's own posts
router.get("/posts/mine", async (req, res) => {
  const userId = req.user!.sub;
  const rows = await db.execute(sql`
    SELECT p.id, p.caption, p.image_url, p.video_url, p.hashtags, p.likes_count, p.created_at, p.post_type
    FROM posts p WHERE p.user_id = ${userId} ORDER BY p.created_at DESC LIMIT 30
  `);
  res.json(rows.rows ?? rows);
});

router.post("/posts", async (req, res) => {
  const userId = req.user!.sub;
  const { caption, imageUrl, videoUrl, hashtags, postType } = req.body ?? {};
  if (!caption && !imageUrl && !videoUrl) {
    res.status(400).json({ message: "Post must have content" }); return;
  }
  const tags: string[] = Array.isArray(hashtags) ? hashtags.map((t: string) => t.toLowerCase().replace(/^#/, "")) : [];
  const type = postType === "clip" ? "clip" : "post";
  const rows = await db.execute(sql`
    INSERT INTO posts (user_id, caption, image_url, video_url, hashtags, post_type)
    VALUES (${userId}, ${caption ?? null}, ${imageUrl ?? null}, ${videoUrl ?? null}, ${JSON.stringify(tags)}::text[], ${type})
    RETURNING *
  `);
  res.status(201).json((rows as any).rows?.[0] ?? (rows as any)[0] ?? rows);
});

router.delete("/posts/:id", async (req, res) => {
  const userId = req.user!.sub;
  await db.execute(sql`DELETE FROM posts WHERE id = ${req.params.id} AND user_id = ${userId}`);
  res.json({ deleted: true });
});

router.post("/posts/:id/like", async (req, res) => {
  const userId = req.user!.sub;
  const postId = req.params.id;
  await db.execute(sql`
    INSERT INTO post_likes (user_id, post_id) VALUES (${userId}, ${postId}) ON CONFLICT DO NOTHING;
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = ${postId}
  `);
  res.json({ liked: true });
});

router.delete("/posts/:id/like", async (req, res) => {
  const userId = req.user!.sub;
  const postId = req.params.id;
  await db.execute(sql`
    DELETE FROM post_likes WHERE user_id = ${userId} AND post_id = ${postId};
    UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ${postId}
  `);
  res.json({ liked: false });
});

// ── Uploads (server-side, no CORS issues) ───────────────────────────────────
router.post("/uploads", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) { res.status(400).json({ message: "No file uploaded" }); return; }

  const isImage = file.mimetype.startsWith("image/");
  const isVideo = file.mimetype.startsWith("video/");
  if (!isImage && !isVideo) {
    res.status(400).json({ message: "Only images and videos are supported" }); return;
  }

  try {
    const rawExt = file.mimetype.split("/")[1] ?? "bin";
    const ext = rawExt === "jpeg" ? "jpg" : rawExt === "quicktime" ? "mov" : rawExt;
    const objectPath = await storage.uploadBufferAsEntity(file.buffer, file.mimetype, ext);
    res.json({ objectPath, type: isImage ? "image" : "video" });
  } catch (err: any) {
    console.error("Upload error:", err);
    res.status(500).json({ message: err.message ?? "Upload failed" });
  }
});

// Keep legacy presigned-url endpoint for compatibility
router.post("/uploads/request-url", async (req, res) => {
  const { contentType } = req.body ?? {};
  if (!contentType?.startsWith("image/") && !contentType?.startsWith("video/")) {
    res.status(400).json({ message: "Only image/video uploads are supported" }); return;
  }
  try {
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ── Object serving ───────────────────────────────────────────────────────────
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
