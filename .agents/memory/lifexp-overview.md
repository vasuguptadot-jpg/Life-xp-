---
name: LifeXP project overview
description: Tech stack, auth pattern, key conventions for the LifeXP gamified life-tracking app
---

## Stack
- pnpm monorepo, Node 24, TypeScript 5.9
- API: Express 5, PostgreSQL + Drizzle ORM, Zod v4 (`zod/v4`), JWT (access 15m / refresh 7d), esbuild
- Web: React + Vite, Tailwind v4, shadcn/radix, wouter router, TanStack Query, framer-motion
- Mobile: Expo (SDK 54), expo-router, TanStack Query
- Shared API client: `@workspace/api-client-react` (orval-generated hooks + custom-fetch)

## Auth
- JWT access/refresh tokens stored in `localStorage` (web) and `@react-native-async-storage/async-storage` (mobile)
- `setBaseUrl` called at module level; `setAuthTokenGetter` set with async AsyncStorage reader (mobile) or localStorage reader (web)
- Both imported from `@workspace/api-client-react`

## Key conventions
- Web BASE_URL: `import.meta.env.BASE_URL` (wouter router uses it as base)
- Mobile: `setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`)` at module level in _layout.tsx
- Codegen: `pnpm --filter @workspace/api-spec run codegen` — post-codegen script rewrites `from 'zod'` → `from 'zod/v4'`
- Level formula: `floor(sqrt(totalXp / 100)) + 1`
- 7 attributes: STRENGTH, ENDURANCE, MOBILITY, NUTRITION, RECOVERY, DISCIPLINE, KNOWLEDGE

## Routes
- API server artifact: port 8080
- Web artifact: preview path `/`
- Mobile artifact: preview path `/mobile/`
