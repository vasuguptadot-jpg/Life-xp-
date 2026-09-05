---
name: LifeXP project overview
description: Full-stack summary of the LifeXP app — auth, DB schema, API routes, web pages, mobile status, design system, and key architectural decisions.
---

## Stack
- **API**: Express 5 + Drizzle ORM + PostgreSQL + Groq AI (`artifacts/api-server`)
- **Web**: React 19 + Vite + Tailwind CSS v4 (`artifacts/web`)
- **Shared DB schema**: `lib/db/src/schema/` — Drizzle tables (the source of truth). Some routes still query via `db.execute(sql\`...\`)` raw SQL (social, messages) even though the backing tables now exist in the schema.
- **API client**: orval-generated hooks in `lib/api-client-react`

## DB Tables (Stage 4 reconciled)
Drizzle schema: users, refresh_tokens, onboarding_states, user_profiles (incl. avatar_url, bio, age), archetypes, user_characters, user_goals (incl. text), user_levels, user_attributes, attribute_history, xp_transactions, quest_templates, user_quests, ai_user_goals, ai_daily_tasks, ai_chat_messages, ai_daily_tips, posts, post_likes, follows, conversations, conversation_members, messages.

The social/messaging tables are queried via raw `db.execute(sql\`...\`)` in `routes/social.ts` and `routes/messages.ts`, but are now defined in `schema/social.ts` and `schema/messaging.ts` and created by migration `0001_*`.

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
- Leaderboard and social/messaging queries use raw SQL (`db.execute`). The backing tables (`posts`, `post_likes`, `follows`, `conversations`, `conversation_members`, `messages`) and `user_profiles.avatar_url/bio/age` are now in the Drizzle schema (Stage 4), so a fresh migration reproduces them.
- AI feed: score by recency × 0.5 + likes × 0.2 + goal-keyword overlap × 0.4 (no Groq needed for ranking, deterministic).
