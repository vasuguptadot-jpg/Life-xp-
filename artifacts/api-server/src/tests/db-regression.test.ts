import { describe, it, expect, beforeAll } from "vitest";

// DB integration regression tests for the Stage 6 SQL fixes.
// These require an isolated PostgreSQL-compatible database via TEST_DATABASE_URL
// (e.g. the PGlite socket). They skip when no database is available so that
// `pnpm test` still passes in CI without a database.
const TEST_DB_URL = process.env.TEST_DATABASE_URL;

const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("database — hashtag array + conversation UUID (BUG-1/BUG-2 regression)", () => {
  let db: typeof import("@workspace/db")["db"];
  let schema: typeof import("@workspace/db/schema");
  let userIds: string[];

  beforeAll(async () => {
    // Point the db singleton at the isolated test database before importing it.
    process.env.DATABASE_URL = TEST_DB_URL;
    const dbModule = await import("@workspace/db");
    db = dbModule.db;
    schema = await import("@workspace/db/schema");

    // Seed two users so FK constraints on posts/conversation_members resolve.
    const suffix = Date.now();
    const inserted = await db
      .insert(schema.usersTable)
      .values([
        { email: `r1-${suffix}@example.com`, username: `r1-${suffix}`, passwordHash: "x" },
        { email: `r2-${suffix}@example.com`, username: `r2-${suffix}`, passwordHash: "x" },
      ])
      .returning();
    userIds = inserted.map((u) => u.id);
  });

  it("inserts a post with an empty hashtags array", async () => {
    const [row] = await db
      .insert(schema.postsTable)
      .values({ userId: userIds[0], caption: "no tags", hashtags: [] })
      .returning();
    expect(row.hashtags).toEqual([]);
  });

  it("inserts a post with multiple hashtags including special characters", async () => {
    const [row] = await db
      .insert(schema.postsTable)
      .values({
        userId: userIds[0],
        caption: "tags",
        hashtags: ["fitness", "health", "with space", "café"],
      })
      .returning();
    expect(row.hashtags).toEqual(["fitness", "health", "with space", "café"]);
  });

  it("creates a conversation with two UUID members", async () => {
    const [conv] = await db
      .insert(schema.conversationsTable)
      .values({})
      .returning();
    const inserted = await db
      .insert(schema.conversationMembersTable)
      .values(userIds.map((userId) => ({ conversationId: conv.id, userId })))
      .returning();
    expect(inserted).toHaveLength(2);
    expect(inserted.map((m) => m.userId).sort()).toEqual([...userIds].sort());
  });
});
