# Stage 8 — Release Matrix

| Category | Result | Evidence | Blocker? | Notes |
|----------|--------|----------|----------|-------|
| Git integrity | PASS | clean tree, HEAD `92d3d5b`, branch `arena/01a05271-life-xp` | No | recovered from environment reset; 141 tracked files |
| Clean checkout | PASS | `pnpm install --frozen-lockfile` exit 0 (pnpm 10.34.5) | No | pnpm 11 default fails; pin 10.34.5 |
| Install | PASS | 670 packages, lockfile valid | No | |
| Typecheck | PASS | libs + web + api + scripts, exit 0 | No | |
| Tests | PASS | 24/24 with DB; 7 passed/17 skipped without | No | DB-gated tests skip cleanly |
| Web build | PASS | vite build exit 0 | No | >500kB chunk warning only |
| API build | PASS | tsup/tsc build exit 0 | No | |
| Fresh DB | PASS | 23 tables from zero | No | |
| Migration | PASS | applies from zero, no manual SQL, no destructive ops | No | |
| Seed | PASS | idempotent (7 created, then 7 skipped) | No | |
| Live DB | BLOCKED | no DATABASE_URL | No | production test documented |
| Auth | PASS | register/login/refresh/rotation/replay/logout all correct | No | |
| Onboarding | PASS | archetypes + archetype select 200 | No | |
| Profile | PASS | profile-extra persisted (bio/age/avatar) | No | |
| XP | PASS | level 200, progression summary 200 (PGlite maxConn=10) | No | |
| Quests | PASS | catalogue/my/recommended + malformed-id 400 | No | |
| AI | BLOCKED | no GROQ_API_KEY | No | graceful degrade verified (503/[]/fallback) |
| Social | PASS | create/like/unlike/follow/delete; BUG-1/4/5 regression | No | |
| Messaging | PASS | conversation/message/membership 403 | No | |
| SSE | PASS | ?token= 200 event-stream; non-member 403; invalid 401 | No | |
| Object storage | BLOCKED | no sidecar | No | IDOR/path-normalization unverified |
| Browser E2E | BLOCKED | no browser automation | No | build-level only |
| Security | PASS | no CRITICAL/HIGH/MEDIUM; 1 LOW fixed (malformed UUID 500→400) | No | |
| CORS | PASS | allow-list enforced (allowed ACAO present, denied absent) | No | cosmetic 500 for denied (no ACAO emitted) |
| Error handling | PASS | 400/401/403/404/503 correct; no stack/secret leak | No | |
| Secrets | PASS | none in source/history/logs/responses | No | |
| Documentation | PASS | .env.example REQUIRED/FEATURE-SPECIFIC/OPTIONAL correct | No | |
| Performance sanity | PASS | pagination caps, SSE cleanup, upload cap | No | conversations list unpaginated (LOW) |

**Legend:** PASS / FAIL / BLOCKED / UNVERIFIED / NOT APPLICABLE

**Blockers:** 0 (no critical/high defects; BLOCKED items are environmental, not defects)
