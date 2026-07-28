# LifeXP

A gamified life-tracking app — turn real-world habits and goals into XP, levels, and character progression.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — Drizzle ORM schema (source of truth for DB tables)
  - `users.ts` — users, refresh_tokens
  - `onboarding.ts` — onboarding_states, user_profiles, archetypes, user_characters, user_goals
  - `progression.ts` — xp_transactions, user_levels, user_attributes, attribute_history
  - `quests.ts` — quest_templates, user_quests
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/auth.ts` — JWT sign/verify + `requireAuth` middleware
- `lib/api-spec/openapi.yaml` — OpenAPI spec (run codegen after changes)

## Architecture decisions

- **Pure-JS crypto**: Uses `bcryptjs` (not `bcrypt`) and `jsonwebtoken` — no native compilation required on Replit
- **JWT auth**: Signed with `SESSION_SECRET` env var (already provisioned). Access tokens = 1d, refresh tokens = 7d
- **Drizzle + PostgreSQL**: Schema defined in `lib/db`, db connection exported as `db` and consumed by the api-server
- **Level curve**: `floor(sqrt(totalXp / 100)) + 1` — deterministic, no config table needed
- **Idempotency**: XP awards accept an `idempotencyKey` to prevent double-counting duplicate events

## Product

- **Auth**: signup, signin, JWT-based session
- **Onboarding**: 7-step flow — profile (height/weight/activity), goals, archetype selection
- **Progression**: XP ledger with automatic level calculation + 7 attributes (STRENGTH, ENDURANCE, MOBILITY, NUTRITION, RECOVERY, DISCIPLINE, KNOWLEDGE)
- **Quests**: catalogue of templates, assign to user, track progress, complete

## Attributes

`STRENGTH` · `ENDURANCE` · `MOBILITY` · `NUTRITION` · `RECOVERY` · `DISCIPLINE` · `KNOWLEDGE`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any schema change run `pnpm --filter @workspace/db run push` (dev) — production is handled by Replit Publish
- After any OpenAPI spec change run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks + Zod types
- Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` — libs must emit declarations first

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
