---
name: LifeXP AI Features
description: Architecture of the Groq-powered AI coach, daily tasks, life tip, and goal system added to LifeXP
---

# LifeXP AI Features

## New DB Tables (lib/db/src/schema/ai.ts)
- `ai_user_goals` — user's stated goals (one row per user, upserted)
- `ai_daily_tasks` — 5 AI-generated tasks per user per day (date = YYYY-MM-DD string), with xpReward and isCompleted
- `ai_chat_messages` — full chat history (role = "user"|"assistant")
- `ai_daily_tips` — one tip per user per day, cached

**Important:** After adding new tables, always run `cd lib/db && pnpm exec tsc --build` to regenerate `dist/schema/ai.d.ts`. The API server's tsconfig uses project references — esbuild bundles from source (so runtime always works), but tsc type-checks against the dist .d.ts files.

## API Routes (artifacts/api-server/src/routes/ai.ts)
All under `/api/ai`, all require auth (`requireAuth`).
- `GET /goals` / `POST /goals` — fetch/save user goals; saving invalidates today's cached tasks and tips
- `GET /daily-tasks` — returns today's tasks; generates 5 via Groq if none exist for today
- `POST /daily-tasks/:id/complete` — marks complete, calls `awardXp()` with idempotency key `daily_task_<id>`
- `GET /life-tip` — returns today's tip; generates via Groq if none exists
- `GET /chat/history` — last 30 messages
- `POST /chat` — saves user msg, calls Groq with system prompt (user stats + goals), saves reply

**Model:** `llama-3.3-70b-versatile`
**Key:** `GROQ_API_KEY` secret

## Web Hooks (artifacts/web/src/hooks/use-ai.ts)
Custom React Query hooks using direct `fetch("/api/ai/...")` (not orval-generated). Token read from `localStorage.getItem("accessToken")`.

## Web Components
- `artifacts/web/src/components/ai-coach-panel.tsx` — `AiCoachPanel` (slide-up chat drawer) + `AiCoachButton` (fixed bottom-right FAB)
- `artifacts/web/src/components/goal-setup-modal.tsx` — goal picker modal with quick-select chips + free text

## Dashboard (artifacts/web/src/pages/dashboard.tsx)
New sections added (top to bottom):
1. Level ring (existing)
2. Daily Progress ring + Physique Rank cards (2-col grid)
3. Life Tip card (full width, Groq-generated)
4. Attribute cards (existing)
5. Daily Tasks list (5 AI tasks, checkable, awards XP on complete)
6. Skill Breakdown + XP Activity (existing)
7. Attribute History (existing)
8. `AiCoachButton` (fixed FAB) + `AiCoachPanel` drawer
9. `GoalSetupModal` auto-shown on first visit (dismissed with `goalModalDismissed` state)

**Why:** `goalModalDismissed` is component-level state (not persisted). The modal re-appears on each page reload until the user saves goals. This is intentional to prompt new users.
