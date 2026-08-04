---
name: LifeXP project overview
description: Full-stack summary of the LifeXP app — auth, DB schema, API routes, web pages, mobile status, design system, and key architectural decisions.
---

## Stack
- **API**: Express 5 + Drizzle ORM + PostgreSQL + Groq AI (`artifacts/api-server`)
- **Web**: React 19 + Vite + Tailwind CSS v4 (`artifacts/web`)
- **Mobile**: Expo 54 — has a recurring ENOENT watcher crash (streamsearch_tmp) on startup; restart usually works (`artifacts/mobile`)
- **Shared DB schema**: `lib/db/src/schema/` — Drizzle tables. New tables added via raw SQL are NOT in schema files; query them with `db.execute(sql\`...\`)`.
- **API client**: orval-generated hooks in `lib/api-client-react`

## DB Tables (as of Aug 2026)
Drizzle schema: users, user_levels, user_profiles (bio, age, weight_kg, height_cm, avatar_url added via raw SQL), onboarding_progress, archetypes, quest_templates, user_quests, ai_chats, user_goals, attribute_history, ...

Raw SQL tables (not in Drizzle schema — use `db.execute(sql\`...\`)`):
- `follows (follower_id, following_id)`
- `posts (id, user_id, caption, image_url, video_url, hashtags text[], likes_count, post_type, created_at)`
- `post_likes (user_id, post_id)`
- `conversations (id, created_at)`
- `conversation_members (conversation_id, user_id, joined_at)`
- `messages (id, conversation_id, sender_id, content, created_at)`

## API Routes
- `/api/auth/*` — login, register, refresh, logout
- `/api/users/me` — GET/PATCH; `/api/users/me/level` GET; `/api/users/me/profile-extra` GET/PATCH
- `/api/social/*` — leaderboard, user profiles, follow/unfollow, posts CRUD, clips, likes, file uploads, object serving
- `/api/messages/*` — conversations, messages, SSE real-time events
- `/api/quests/*`, `/api/progression/*`, `/api/ai/*`, `/api/onboarding/*`

## Web Pages (artifacts/web/src/pages/)
- `/dashboard` — XP, attributes, AI tip, recent activity
- `/quests` — Active Tasks / Explore Roadmap (GoalsManager) / Completed Tasks tabs
- `/feed` — Posts | Clips tabs; AI-personalized; no post button (post from Profile)
- `/leaderboard` — XP rankings podium
- `/profile` — avatar upload, bio/age/weight/height, **My Content** (New Post / New Clip buttons + grid), edit form
- `/messages` — conversation list + New Message modal (search by username)
- `/messages/:id` — chat detail with SSE real-time
- `/users/:id` — public profile, follow/unfollow

## Nav (5 items)
Home | Quests | Feed | Messages | Profile

## Upload flow
Client → `POST /api/social/uploads` (multipart FormData, `file` field) → server uses multer memoryStorage → uploads buffer to GCS via `storage.uploadBufferAsEntity()` → returns `{ objectPath, type }`. Do NOT use presigned URL client-side (CORS issues). Serving: `GET /api/social/objects/*` via `router.use("/objects", ...)`.

## SSE (real-time chat)
EventSource can't set headers; pass auth token as `?token=` query param. Backend reads it via `require("../lib/auth").verifyToken(token)` (sync).

## Express 5 routing
path-to-regexp v8 does NOT support `*` or `+` suffix on params (`/:param*`, `/:param+`). Use `router.use("/prefix", ...)` for wildcard routes.

## Key decisions
- Leaderboard and any query joining `user_profiles` must use raw SQL (`db.execute`) because avatar_url etc. were added via raw SQL, not in Drizzle schema.
- AI feed: score by recency × 0.5 + likes × 0.2 + goal-keyword overlap × 0.4 (no Groq needed for ranking, deterministic).
