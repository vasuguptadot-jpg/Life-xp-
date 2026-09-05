/**
 * STAGE 21 — Part 14: database integrity audit.
 *
 * Inspects the LIVE schema via pg_catalog/information_schema and asserts that
 * the constraints the application relies on actually exist, while documenting
 * the (deliberate or risk) gaps as findings.
 */
import { beforeAll, describe, expect, it } from "vitest";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_DB_URL ? describe : describe.skip;

maybe("STAGE 21 — database integrity audit (Part 14)", () => {
  let db: typeof import("@workspace/db")["db"];
  let sql: typeof import("drizzle-orm")["sql"];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import("@workspace/db")).db;
    sql = (await import("drizzle-orm")).sql;
  });

  async function uniqueConstraints(table: string): Promise<{ name: string; columns: string[] }[]> {
    const rows = await db.execute(sql`
      SELECT con.conname AS name,
             array_agg(att.attname ORDER BY ord.ordinality) AS columns
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ord(colpos, ordinality) ON true
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ord.colpos
      WHERE n.nspname = 'public' AND rel.relname = ${table}
        AND con.contype = 'u'
      GROUP BY con.conname
    `);
    return (rows.rows as any[]).map((r) => {
      let cols = r.columns;
      if (Array.isArray(cols)) {
        // already an array
      } else if (typeof cols === "string") {
        // postgres array literal e.g. "{user_id,quest_template_id,assigned_at}"
        cols = cols.replace(/^\{|\}$/g, "").split(",").map((s: string) => s.trim()).filter(Boolean);
      } else {
        cols = [];
      }
      return { name: r.name, columns: cols };
    });
  }

  async function indexes(table: string): Promise<string[]> {
    const rows = await db.execute(sql`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table}
    `);
    return (rows.rows as any[]).map((r) => r.indexname);
  }

  it("constraints the application relies on actually exist", async () => {
    // user_levels: exactly one row per user
    expect((await uniqueConstraints("user_levels")).some((c) => c.columns.join(",") === "user_id")).toBe(true);
    // user_attributes: unique (user_id, attribute)
    expect((await uniqueConstraints("user_attributes")).some((c) => c.columns.join(",") === "user_id,attribute")).toBe(true);
    // post_likes: unique (user_id, post_id)
    expect((await uniqueConstraints("post_likes")).some((c) => c.columns.join(",") === "user_id,post_id")).toBe(true);
    // follows: unique (follower_id, following_id)
    expect((await uniqueConstraints("follows")).some((c) => c.columns.join(",") === "follower_id,following_id")).toBe(true);
    // conversation_members: unique (conversation_id, user_id)
    expect((await uniqueConstraints("conversation_members")).some((c) => c.columns.join(",") === "conversation_id,user_id")).toBe(true);
    // xp_transactions: unique idempotency_key
    expect((await uniqueConstraints("xp_transactions")).some((c) => c.columns.join(",") === "idempotency_key")).toBe(true);
    // users: unique email + username
    expect((await uniqueConstraints("users")).some((c) => c.columns.join(",") === "email")).toBe(true);
    expect((await uniqueConstraints("users")).some((c) => c.columns.join(",") === "username")).toBe(true);
  });

  it("FINDING (C): user_quests unique key includes assigned_at, so it cannot prevent duplicate active quests", async () => {
    // The intended "one active quest per template" invariant is enforced only at
    // the application layer (assign endpoint checks + AG-1 template-scoped XP
    // idempotency). The DB-level unique is on (user_id, quest_template_id,
    // assigned_at) — assigned_at differs per insert, so two rapid concurrent
    // assigns CAN both insert. Duplicate XP is still prevented (template-scoped
    // key), but duplicate quest ROWS are possible. Class C (data quality).
    const cs = await uniqueConstraints("user_quests");
    const tplUnique = cs.find((c) => c.columns.includes("quest_template_id"));
    expect(tplUnique?.columns).toContain("assigned_at"); // documents the gap
  });

  it("FINDING (C): ai_daily_tasks / ai_daily_tips have only a non-unique (user_id, date) index", async () => {
    // A plain unique (user_id, date) would be WRONG for ai_daily_tasks (5 tasks
    // legitimately share a date). Concurrency is instead handled by the advisory
    // lock in the generation engines. For ai_daily_tips a duplicate tip row is
    // non-XP and harmless (limit-1 read). Documented, not a defect.
    const taskIdx = await indexes("ai_daily_tasks");
    const tipIdx = await indexes("ai_daily_tips");
    expect(taskIdx.some((i) => i.includes("user_date"))).toBe(true);
    expect(tipIdx.some((i) => i.includes("user_date"))).toBe(true);
    // Neither table has a unique constraint on (user_id, date) — deliberate.
    expect((await uniqueConstraints("ai_daily_tasks")).some((c) => c.columns.join(",") === "user_id,date")).toBe(false);
    expect((await uniqueConstraints("ai_daily_tips")).some((c) => c.columns.join(",") === "user_id,date")).toBe(false);
  });

  it("FINDING (C): attribute_history dedup key allows NULL source_id to bypass dedup", async () => {
    // unique (source_id, attribute): NULLs are exempt (NULL != NULL), so awards
    // with a NULL source_id would not be deduplicated. awardXp always supplies a
    // source_id for the two real award paths, and the idempotency_key unique is
    // the primary guard — but a future caller omitting source_id could double-
    // award attributes. Documented as a latent risk.
    const cs = await uniqueConstraints("attribute_history");
    expect(cs.some((c) => c.columns.includes("source_id") && c.columns.includes("attribute"))).toBe(true);
  });

  it("FINDING (C): messages.content and posts.caption are unbounded TEXT (no length cap)", async () => {
    // A malicious client can POST an arbitrarily large message/caption body (up
    // to the body-parser default limit) that is stored verbatim. This is a
    // resource-exhaustion vector (Part 11) rather than a correctness bug. The
    // schema uses TEXT without CHECK length constraints.
    const rows = await db.execute(sql`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'messages' AND column_name = 'content')
          OR (table_name = 'posts' AND column_name = 'caption'))
    `);
    const cols = rows.rows as any[];
    expect(cols.length).toBe(2);
    for (const c of cols) {
      expect(c.character_maximum_length).toBeNull(); // unbounded — documents the gap
    }
  });
});
