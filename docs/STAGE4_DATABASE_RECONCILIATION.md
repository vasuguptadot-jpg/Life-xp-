# Stage 4 — Database Reconciliation

Three-way comparison of the production database contract. Because the live
database was unavailable (see `STAGE4_LIVE_DATABASE_SNAPSHOT.md`), the contract
was derived from the Drizzle schema, the committed migration, and the raw SQL in
the production route code.

## Comparison summary

| Object | Drizzle schema (before) | Migration `0000` | Production code | Action |
|---|---|---|---|---|
| `ai_user_goals` | ✅ present | ❌ missing | `routes/ai.ts` (Drizzle) | added to migration `0001` |
| `ai_daily_tasks` | ✅ present | ❌ missing | `routes/ai.ts` (Drizzle) | added to migration `0001` |
| `ai_chat_messages` | ✅ present | ❌ missing | `routes/ai.ts` (Drizzle) | added to migration `0001` |
| `ai_daily_tips` | ✅ present | ❌ missing | `routes/ai.ts` (Drizzle) | added to migration `0001` |
| `posts` | ❌ missing | ❌ missing | `routes/social.ts` (raw SQL) | added to schema + migration |
| `post_likes` | ❌ missing | ❌ missing | `routes/social.ts` (raw SQL) | added to schema + migration |
| `follows` | ❌ missing | ❌ missing | `routes/social.ts` (raw SQL) | added to schema + migration |
| `conversations` | ❌ missing | ❌ missing | `routes/messages.ts` (raw SQL) | added to schema + migration |
| `conversation_members` | ❌ missing | ❌ missing | `routes/messages.ts` (raw SQL) | added to schema + migration |
| `messages` | ❌ missing | ❌ missing | `routes/messages.ts` (raw SQL) | added to schema + migration |
| `user_profiles.avatar_url` | ❌ missing | ❌ missing | `routes/users.ts`, `social.ts`, `messages.ts` | added to schema + migration |
| `user_profiles.bio` | ❌ missing | ❌ missing | `routes/users.ts` (profile-extra) | added to schema + migration |
| `user_profiles.age` | ❌ missing | ❌ missing | `routes/users.ts` (profile-extra) | added to schema + migration |
| `user_goals.text` | ❌ missing | ❌ missing | `routes/social.ts` (`SELECT g.text`) | added to schema + migration |

## New tables (schema + migration `0001`)

### Social — `lib/db/src/schema/social.ts`

| Table | Columns | Notes |
|---|---|---|
| `posts` | id (uuid PK), user_id (FK users, cascade), caption, image_url, video_url, hashtags `text[]` (default `'{}'::text[]`), likes_count (int, default 0), post_type (text, default 'post'), created_at | index on user_id |
| `post_likes` | user_id (FK users), post_id (FK posts), created_at | unique (user_id, post_id) |
| `follows` | follower_id (FK users), following_id (FK users), created_at | unique (follower_id, following_id) |

### Messaging — `lib/db/src/schema/messaging.ts`

| Table | Columns | Notes |
|---|---|---|
| `conversations` | id (uuid PK), created_at | — |
| `conversation_members` | conversation_id (FK conversations), user_id (FK users), created_at | unique (conversation_id, user_id) |
| `messages` | id (uuid PK), conversation_id (FK conversations), sender_id (FK users), content, created_at | index on conversation_id |

## Columns added to existing tables

| Table | Column | Type | Nullable | Notes |
|---|---|---|---|---|
| `user_profiles` | avatar_url | text | yes | leaderboard + conversation avatars |
| `user_profiles` | bio | text | yes | profile-extra |
| `user_profiles` | age | integer | yes | profile-extra |
| `user_goals` | text | text | yes | free-text goal, read by personalized feed |

## Notes / rationale

- **`user_goals.text`** is read by `routes/social.ts` (personalized feed) but
  written nowhere in the current code (onboarding writes `goal_key`/`is_primary`
  only). It was added as a nullable column so the personalized-feed query does
  not fail on a fresh database. This mirrors the pre-existing live schema.
- **`follows` / `post_likes` / `conversation_members`** use composite unique
  constraints (no surrogate PK) to support the `ON CONFLICT DO NOTHING` upsert
  semantics used in production raw SQL.
- **`conversation_members`** is reconciled to use `created_at` (matching the
  schema + migration), not `joined_at` (a stale name that appeared in an agent
  memory note but is not referenced by any code).
- No destructive operations, no column drops, no renames. The existing
  migration `0000_tired_excalibur.sql` was **not** modified.
