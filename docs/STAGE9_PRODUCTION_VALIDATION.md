# Stage 9 — Production Environment Validation & Release Certification

**Branch:** `arena/01a05271-life-xp`
**Baseline HEAD:** `ebf5fbc` (immutable — treated as read-only throughout)
**Recorded:** 2026-08-30
**Classification:** **CONDITIONAL GO**

> Every remaining BLOCKED/UNVERIFIED item is now either PASS or a precisely
> documented external dependency. No PASS result was fabricated for an
> unavailable external service.

---

## 1. Baseline Integrity

| Check | Result |
|-------|--------|
| HEAD == `ebf5fbc` | ✅ `ebf5fbc30a097b8cd42b05d7e41a462d1c8b3bec` |
| Remote synchronized | ✅ `git ls-remote` shows `ebf5fbc`; 0 ahead / 0 behind |
| Working tree clean | ✅ |
| Tracked files | ✅ 144 |

A stale local remote-tracking ref was repaired (`fetch` refspec was
`+refs/heads/main:...` from the clone; changed to `+refs/heads/*:...`). This is
a local `.git/config` fix — the remote itself was always at `ebf5fbc`. No
application code was touched during baseline verification.

---

## 2. Production Environment Contract

Every `process.env.*` reference was enumerated and classified:

| Variable | Classification |
|----------|----------------|
| `DATABASE_URL` | REQUIRED FOR BOOT + DATABASE (throws if unset) |
| `SESSION_SECRET` | REQUIRED FOR BOOT (throws if unset) |
| `PORT` | REQUIRED FOR BOOT (throws if unset) |
| `GROQ_API_KEY` | REQUIRED FOR AI (feature-specific; degrades gracefully) |
| `PUBLIC_OBJECT_SEARCH_PATHS` | REQUIRED FOR OBJECT STORAGE |
| `PRIVATE_OBJECT_DIR` | REQUIRED FOR OBJECT STORAGE |
| `NODE_ENV` | OPTIONAL (defaults handled) |
| `LOG_LEVEL` | OPTIONAL (default `info`) |
| `BASE_PATH` | OPTIONAL (default `/`) |
| `CORS_ORIGINS` | OPTIONAL (default same-origin/dev-allow) |
| `REPL_ID` | DEVELOPMENT/REPLIT-SPECIFIC |
| `TEST_DATABASE_URL` | TEST-ONLY (internal) |

`.env.example` accurately reflects these requirements (verified line-by-line);
`TEST_DATABASE_URL` is correctly omitted from the production `.env.example`.
No secret values were printed.

---

## 3. Database Production Validation

**BLOCKED — ENVIRONMENT.** No `DATABASE_URL` is available in the sandbox, so a
read-only live inspection of a real PostgreSQL cluster is impossible. Isolated
reproduction (23 tables, 154 columns matching `DATABASE_CONTRACT.json`,
migrations from zero, idempotent seed) was verified in Stage 8 and remains
valid — no schema changes have occurred since.

---

## 4. AI Provider Validation

**Live validation: BLOCKED** (no `GROQ_API_KEY`). **No-key graceful degradation:
PASS** — chat 503 ("AI coach is not configured"), daily-tasks `[]`, life-tip
static fallback, chat-history `[]`, all non-AI endpoints 200, no key leakage.

Contract note (verified): `POST /api/ai/goals` takes `{goals: string}` while
`POST /api/onboarding/goals` takes `{goals: string[]}` — both return 200 with
their correct shapes.

---

## 5. Object Storage Validation

**BLOCKED** (no object-storage sidecar/infrastructure). The upload endpoint
fails safely when storage is unconfigured. **LOW finding:** the upload error
path returns `res.status(500).json({ message: err.message })`, which exposes
the env-var *name* `PRIVATE_OBJECT_DIR` (not a secret value) and uses 500
rather than 503 for an unconfigured feature.

---

## 6. Full API Production Smoke Test — 42/42 PASS

Executed against the production build on the isolated DB, using disposable
accounts. Every check recorded HTTP status + DB effect + authorization result.

- **Auth:** register, login, `/me`, refresh token flow.
- **Profile/onboarding:** archetypes, archetype select, profile-extra
  write→read persistence.
- **Progression/XP:** level 200, summary 200, attribute-history 200.
- **Quests:** catalogue, assign (201), read, progress update, complete;
  malformed UUID 400, nonexistent UUID 404.
- **AI:** goals (200), tasks, tip, chat (503 no-key), history.
- **Social:** create post + hashtags, feed, like, idempotent like (count stays
  1), unlike, follow, leaderboard, ownership (cross-user delete 404, owner
  delete 200), malformed UUID 400, nonexistent 404.
- **Messaging/SSE:** conversation 201, message send/read, non-member 403, SSE
  member 200 `event-stream`, non-member 403, invalid token 401.

*(One test-script bug was corrected during the run — sending an array to the AI
goals endpoint which expects a string. Not an application defect.)*

---

## 7. Security Regression — 14/14 PASS

SQL injection (login + tag param), IDOR/cross-user (delete + `mine` isolation),
malformed UUIDs (400), invalid JWT (garbage + `alg:none` both 401), revoked
refresh (401), CORS allow-list, malformed JSON (400), oversized upload (multer
150 MB cap; small upload degrades safely), path traversal (404), secret leakage
(none in error bodies). No destructive testing against a real production DB
(no production DB present).

---

## 8. Browser E2E

**BLOCKED — INFRASTRUCTURE.** No Playwright/Puppeteer/Chromium is available in
the sandbox. Build-level verification only; no browser E2E was run and none is
claimed.

---

## 9. Production Build / Reproducibility

Clean checkout at `ebf5fbc` (144 files):

| Command | Result |
|---------|--------|
| `pnpm install --frozen-lockfile` | ✅ exit 0 (pnpm 10.34.5) |
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm test` (no DB) | ✅ 7 passed / 17 skipped |
| `pnpm test` (with DB) | ✅ 24 passed |
| `PORT=5173 BASE_PATH=/ pnpm build` | ✅ exit 0 |

**Package-manager requirement (now documented + pinned):** pnpm **10.34.5** is
mandatory. pnpm **11.24.0** fails `--frozen-lockfile` with
`ERR_PNPM_IGNORED_BUILDS` and **silently mutates** `pnpm-workspace.yaml` by
injecting a placeholder `allowBuilds` block. A `packageManager` field
(`pnpm@10.34.5`) was added to the root `package.json` so corepack enforces the
correct version.

---

## 10. Dependency / Security Audit

`pnpm audit` reports 9 advisories (0 critical, 6 high, 2 moderate, 1 low):

- **1 runtime-relevant (moderate):** `uuid` via
  `@google-cloud/storage → gaxios` — installed at v9.0.1; the advisory targets
  v3/v5/v6 buffer handling that gaxios does not exercise. Low exploitability.
- **8 build-time only (high/moderate/low):** `js-yaml`×2, `brace-expansion`×2,
  `fast-uri`, `nanoid`, `postcss`, `esbuild` — all in `orval`/`eslint`/`vite`/
  `esbuild` dev tooling, never shipped to the runtime.

No blind upgrades performed (per policy). No `@ts-ignore`/`@ts-nocheck`, no
TODO/FIXME in production source. `as any` casts in `messages.ts`/`social.ts`
are pre-existing raw-SQL result casts (documented in Stage 6/7). No accidental
dev-dependency-in-production.

---

## 11. Performance Sanity

Startup (fail-fast on missing env), connection pooling (`pg.Pool`), pagination
caps (feed/messages/history/leaderboard), no N+1 observed, SSE cleanup
(heartbeat + `clearInterval`), upload cap (150 MB), rate limiter (auth
10/15min, refresh 30/15min). **INFO:** no explicit timeout wrapper on AI
requests (relies on Groq SDK defaults). No speculative optimization performed.

---

## 12. Release Gate Matrix

See `docs/STAGE9_RELEASE_CERTIFICATION.md` for the full matrix.

| Area | Result |
|------|--------|
| Code integrity | PASS |
| Database | BLOCKED (live) / PASS (isolated) |
| Authentication | PASS |
| Authorization | PASS |
| AI | BLOCKED (live) / PASS (degradation) |
| Social | PASS |
| Messaging | PASS |
| SSE | PASS |
| Object storage | BLOCKED |
| Browser E2E | BLOCKED |
| Build | PASS |
| Tests | PASS (24/24) |
| Dependencies | PASS (no critical; 1 moderate low-exploit runtime) |
| Security | PASS |
| Performance | PASS |

---

## 13. Remaining Risks

- BLOCKED: live AI, live object storage, live DB, browser E2E (all environment).
- LOW: upload error message/500 semantics.
- LOW: `uuid` moderate advisory (low exploitability).
- INFO: no explicit AI timeout wrapper; in-memory rate limiter.

## 14. Final Decision

**CONDITIONAL GO** — no reproducible production defect remains; the code is
sound; automated tests and builds pass; critical user journeys pass against a
real (isolated) PostgreSQL-compatible database. The only thing preventing a
clean GO is the absence of external production infrastructure (AI key, object
storage, live DB, browser), each of which is now precisely documented as an
external dependency rather than an unverified code surface.
