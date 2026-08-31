# LifeXP Release Checklist

Use this before any production release. The current state (Stage 7 audit,
HEAD `d38b3ea`) is **YELLOW** — ship-ready with documented verification gaps.
Complete the open items before declaring a fully GREEN release.

## Blocking / release-gate checks (must all be ✅)

- [x] Working tree clean, branch `arena/01a05271-life-xp`, 136 tracked files
- [x] `pnpm install --frozen-lockfile` succeeds (lockfile intact, no removed workspace refs)
- [x] `pnpm typecheck` passes (libs, web, api)
- [x] `pnpm test` passes (14 tests with `TEST_DATABASE_URL`; 7 without)
- [x] `PORT=5173 BASE_PATH=/ pnpm build` passes (web + api)
- [x] Migrations apply from zero → 23 tables; schema ↔ migration ↔ SQL consistent
- [x] CRUD works across all domains with post-mutation DB-state checks
- [x] BUG-1..5 independently re-verified (delete, like, GROQ lazy, UUID, hashtags)
- [x] Authorization boundaries enforced (no cross-user IDOR)
- [x] No secrets in source or git history; error responses leak nothing
- [x] Production startup: fail-fast on missing `DATABASE_URL`/`SESSION_SECRET`;
      graceful degrade on missing `GROQ_API_KEY`/object storage
- [x] SSE real-time messaging authenticated and membership-enforced

## Open items to close before GREEN (environment-dependent)

- [ ] **Live AI (open-ended chat only)** — verify open-ended `POST /api/ai/chat`
      against a real `GROQ_API_KEY` (sandbox has none). Assert a non-empty AI
      response and no key leakage. (Stage 16: daily-tasks, life-tip, and all
      Life Engine endpoints are deterministic and no longer require a key.)
- [ ] **Live object storage** — authenticated upload, unauthenticated fetch (403/404),
      cross-user fetch (404) against a real Replit sidecar.
- [ ] **Live production DB** — run the schema audit against the real cluster.
- [ ] **Browser E2E** — Playwright flow: register → onboard → complete a quest →
      post to feed → like → message another user (real-time).
- [ ] **`/api/progression/summary`** — confirm 200 against `pg.Pool`
      (single-connection harness cannot execute its concurrent queries).

## Non-blocking (documented, optional)

- [ ] `GET /api/social/posts/personalized` honor `?type=` (LOW-1)
- [ ] Remove unused `cookie-parser`; drop direct `google-auth-library` (LOW-2)
- [ ] Move rate limiter to a distributed store if scaling beyond one instance (INFO-1)
- [ ] Return a clean 403 (vs 500) for disallowed CORS origins (INFO-2)

## Release-gate definitions

- **CRITICAL/HIGH exploitable vulnerability** → block release.
- **Any check in the blocking list failing** → block release.
- **Only LOW/INFORMATIONAL findings open** → release-able as YELLOW.
- **All environment checks closed** → GREEN.
