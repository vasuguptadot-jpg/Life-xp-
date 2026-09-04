import { pgTable, text, integer, timestamp, uuid, unique, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

// ── Social feed posts ────────────────────────────────────────────────────────
// Accessed via raw SQL in artifacts/api-server/src/routes/social.ts:
//   - SELECT ... FROM posts p JOIN users u ... (p.id, p.caption, p.image_url,
//     p.video_url, p.hashtags, p.likes_count, p.created_at, p.post_type, p.user_id)
//   - INSERT INTO posts (user_id, caption, image_url, video_url, hashtags, post_type)
//   - UPDATE posts SET likes_count = ...
export const postsTable = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    caption: text("caption"),
    imageUrl: text("image_url"),
    videoUrl: text("video_url"),
    hashtags: text("hashtags").array().notNull().default(sql`'{}'::text[]`),
    likesCount: integer("likes_count").default(0).notNull(),
    postType: text("post_type").default("post").notNull(), // 'post' | 'clip'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("posts_user_id_idx").on(t.userId),
    // Feed query orders by created_at DESC LIMIT n; without this the planner
    // must seq-scan + sort every row (O(n log n)). Measured: 20.2ms → 0.34ms
    // at 20k posts (Stage 26 P7/P23).
    index("posts_created_at_idx").on(t.createdAt),
  ],
);

// ── Post likes ───────────────────────────────────────────────────────────────
// Raw SQL: INSERT INTO post_likes (user_id, post_id) ... ON CONFLICT DO NOTHING
//          DELETE FROM post_likes WHERE user_id = ... AND post_id = ...
//          EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ...)
export const postLikesTable = pgTable(
  "post_likes",
  {
    userId: uuid("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    postId: uuid("post_id")
      .references(() => postsTable.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("post_likes_user_post_unique").on(t.userId, t.postId)],
);

// ── Follows ──────────────────────────────────────────────────────────────────
// Raw SQL: INSERT INTO follows (follower_id, following_id) ... ON CONFLICT DO NOTHING
//          DELETE FROM follows WHERE follower_id = ... AND following_id = ...
//          SELECT COUNT(*) FROM follows WHERE following_id = ...
export const followsTable = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    followingId: uuid("following_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("follows_follower_following_unique").on(t.followerId, t.followingId)],
);

export type Post = typeof postsTable.$inferSelect;
export type PostLike = typeof postLikesTable.$inferSelect;
export type Follow = typeof followsTable.$inferSelect;
