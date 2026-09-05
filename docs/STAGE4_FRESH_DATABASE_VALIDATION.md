# Stage 4 — Fresh Database Validation

## Objective

Prove that an **empty database + all migrations** reproduces the intended
production database contract (the definition of production readiness for Stage 4).

## Method

A live PostgreSQL server was unavailable in the sandbox (see
`STAGE4_LIVE_DATABASE_SNAPSHOT.md`), so the migration chain was executed against
an **embedded PostgreSQL 16** (`@electric-sql/pglite`, a WebAssembly build of
PostgreSQL 16) in an isolated directory outside the repository.

The migration files were split on drizzle-kit's `--> statement-breakpoint`
separator and executed in order.

## Result: PASS

| Check | Result |
|---|---|
| `0000_tired_excalibur.sql` applied | ✅ 30 statements |
| `0001_puzzling_the_santerians.sql` applied | ✅ 32 statements |
| Total tables after migration | **23 / 23 expected** |
| Missing tables | **0** |
| Extra tables | 0 |
| `user_profiles.avatar_url / bio / age` present | ✅ |
| `user_goals.text` present | ✅ |
| `posts.hashtags` type | ✅ `text[]` (`_text`) |
| `posts.likes_count / post_type` present | ✅ |
| `messages.content / sender_id` present | ✅ |
| `conversation_members.conversation_id` present | ✅ |
| `follows.follower_id / following_id` present | ✅ |
| `ai_user_goals.goals` present | ✅ |
| `ai_daily_tasks.task_text` present | ✅ |
| Raw social-feed query executes | ✅ |
| Raw messaging query executes | ✅ |

## Expected table list (23)

`refresh_tokens`, `users`, `archetypes`, `onboarding_states`, `user_characters`,
`user_goals`, `user_profiles`, `attribute_history`, `user_attributes`,
`user_levels`, `xp_transactions`, `quest_templates`, `user_quests`,
`ai_user_goals`, `ai_daily_tasks`, `ai_chat_messages`, `ai_daily_tips`,
`posts`, `post_likes`, `follows`, `conversations`, `conversation_members`,
`messages`.

## Caveats

- The validation used embedded PostgreSQL 16 (PGlite), not a live Replit-managed
  PostgreSQL server. The SQL dialect and DDL are PostgreSQL-compatible and
  execute identically; a real-server run is still recommended as a final
  deployment gate.
- External services (Groq AI, object storage) were not exercised — they are
  `CONFIGURATION BLOCKED`, not `DATABASE FAILURE`.

## Final result: PASS

## Initialization sequence (fresh database)

Correct order to bring up a fresh environment:

1. **Migrate** — apply the full migration chain:
   ```bash
   pnpm --filter @workspace/db run migrate
   ```
2. **Seed archetypes** — idempotent (re-runnable, no duplicates; each name is
   checked before insert and `archetypes.name` has a UNIQUE constraint):
   ```bash
   pnpm --filter @workspace/scripts run seed-archetypes
   ```
3. **Start the API server** (requires `DATABASE_URL`, `SESSION_SECRET`;
   `GROQ_API_KEY`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` are needed
   only for AI/storage features — the server boots without them for schema-level
   flows, which is `CONFIGURATION BLOCKED`, not `DATABASE FAILURE`).

`seed-archetypes` is the only seed script; onboarding/quests/progression data is
created lazily by the application as users act.
