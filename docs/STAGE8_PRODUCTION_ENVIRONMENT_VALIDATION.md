# Stage 8 — Production Environment Validation & Release Gate

**Branch:** `arena/01a05271-life-xp`
**HEAD:** `92d3d5b` (clean working tree)
**Recorded:** 2026-08-30
**Verdict:** 🟡 **YELLOW** — **CONDITIONAL GO**

> The purpose of Stage 8 is to prove the *deployed system*, not merely that the
> repository builds. Where production infrastructure or credentials are absent,
> the result is reported BLOCKED/UNVERIFIED — never fabricated as PASS.

---

## 0. Environment Reset (detected and resolved)

On entry, the local repository was found **reset to a fresh clone** at
`25cbdf2` (2422 tracked files, pre-minimization) — not the expected Stage 7
HEAD `c38fb68`. This was detected immediately (reflog showed `clone` →
`checkout`; `git ls-remote` confirmed the real branch still existed on the
remote at `c38fb68`). After user confirmation, the branch was recovered with
`git reset --hard c38fb68`. **Nothing was lost** — all Stage 3–7 work was
committed to the remote. Baseline re-verified clean (139 files at the time,
now 141 after the Stage 8 fix).

The reset also removed `node_modules` and the isolated PGlite harness; both were
recreated (pnpm pinned to 10.34.5; PGlite socket harness rebuilt).

---

## 1. Environment Inventory (names only — no secret values printed)

| Variable | Status |
|----------|--------|
| `DATABASE_URL` | MISSING |
| `SESSION_SECRET` | MISSING |
| `PORT` | MISSING |
| `BASE_PATH` | NOT APPLICABLE (deployment harness does not require it) |
| `GROQ_API_KEY` | MISSING |
| `CORS_ORIGINS` | MISSING |
| Object-storage credentials | MISSING |
| Isolated PGlite harness | RECREATED (in-memory, 127.0.0.1:5433, maxConnections=10) |

No `.env` file present anywhere; no secrets were invented.

---

## 2. Clean-Checkout Reproduction

| Command | Result |
|---------|--------|
| `pnpm install --frozen-lockfile` | ✅ PASS (exit 0) |
| `pnpm typecheck` | ✅ PASS (libs, web, api, scripts) |
| `pnpm test` (no DB) | ✅ 7 passed / 17 skipped |
| `pnpm test` (with isolated DB) | ✅ 24 passed / 0 failed |
| `PORT=5173 BASE_PATH=/ pnpm build` | ✅ PASS (web + api) |

**Tooling note (not an app defect):** the sandbox default `pnpm 11.24.0` fails
`--frozen-lockfile` with `ERR_PNPM_IGNORED_BUILDS` and injects a placeholder
`allowBuilds` block into `pnpm-workspace.yaml`. Pinning to `pnpm 10.34.5` (which
the lockfile was generated with) resolves it. The injected workspace change was
reverted; it is not part of the release candidate.

---

## 3. Database Validation

- **Live production/staging DB:** **BLOCKED** — no `DATABASE_URL` is available;
  the sandbox cannot reach a real PostgreSQL cluster.
- **Isolated reproduction (PGlite, applied from zero):**
  - 23 tables created from the two committed migrations (62 statements), no
    manual SQL.
  - **Schema contract match: PASS** — all 154 columns across 23 tables match
    `docs/DATABASE_CONTRACT.json` exactly (0 missing, 0 extra).
  - 20 primary keys, 25 foreign keys, 16 unique constraints present.
  - AI tables (`ai_user_goals`, `ai_daily_tasks`, `ai_chat_messages`,
    `ai_daily_tips`), social (`posts`, `post_likes`, `follows`), messaging
    (`conversations`, `conversation_members`, `messages`), profile
    (`user_profiles.avatar_url/bio/age`), and goals (`user_goals.text`) all
    present with correct columns.
  - **Seed idempotency: PASS** — `seed-archetypes` run 1 creates 7, run 2
    skips all 7 (0 duplicates).

**Migration safety:** migrations apply from zero with no destructive
operations; no staging/production migration test was possible (no staging DB).

---

## 4. Real Backend Startup Matrix

| Condition | Result |
|-----------|--------|
| All required env present | ✅ server starts, DB verified, `/api/healthz` → 200 |
| `DATABASE_URL` missing | ✅ fail fast: "DATABASE_URL must be set" (exit 1) |
| `SESSION_SECRET` missing | ✅ fail fast: "SESSION_SECRET env var is required" (exit 1) |
| `PORT` missing | ✅ fail fast: "PORT environment variable is required" (exit 1) |
| `GROQ_API_KEY` absent | ✅ server operational; AI degrades, non-AI works |
| Object storage unavailable | ✅ non-storage features remain operational |

No secrets are printed in logs (pino serializers redact request bodies; only
method/url/status logged).

---

## 5. AI Validation

**`AI_LIVE_VALIDATION = BLOCKED`** — no legitimate test/staging `GROQ_API_KEY`
exists. A fake key is not a production validation.

**Graceful degradation without a key (verified live):**
- `POST /api/ai/chat` → 503 "AI coach is not configured. Add GROQ_API_KEY to enable."
- `GET /api/ai/daily-tasks` → 200 `[]`
- `GET /api/ai/life-tip` → 200 static fallback tip
- `GET /api/ai/chat/history` → 200 `[]`
- Non-AI endpoints (`/api/healthz`, `/api/users/me/level`) → 200
- No key material leaks in any response.

---

## 6. Object Storage Validation

**BLOCKED** — no object-storage sidecar/infrastructure. The previously
documented object-IDOR / path-normalization concerns could not be exercised
against a live store. Production test that would close this: authenticated
upload, unauthenticated fetch (expect 403/404), cross-user fetch (expect 404),
malformed/path-traversal object key (expect fail-safe), against the real
Replit object-storage sidecar.

---

## 7. Auth / User Journey (27 checks, all PASS)

Register → login → refresh → onboarding → profile → goals → XP/level →
leaderboard → logout → login again. DB state verified after mutations.
Negative cases: wrong password (401), duplicate email (409), duplicate username
(409), no/invalid token (401), refresh rotation (new token issued), replay of
old refresh token (401), refresh after logout (401), unauthorized (401).

---

## 8. Social E2E (two users, all PASS)

Create post (201) → hashtags persisted (array) → cross-user feed read → like →
duplicate-like idempotent (counter stays 1) → unlike → cross-user delete (404) →
follow → view profile → nonexistent delete (404) → owner delete (200).
**BUG-1 and BUG-4/5 regression-tested and passing.**

---

## 9. Messaging + SSE (two users, all PASS)

Create conversation (201) → send message → retrieve → SSE with `?token=`
(200 `text/event-stream`) → non-member read/send (403) → SSE non-member (403) →
SSE invalid token (401) → SSE no token (401). **Stage 7 SSE fix and BUG-2
regression-tested and passing.** (SSE exercised over the deployed HTTP listener;
the sandbox has no reverse proxy for the true network path — noted, not a code
issue.)

---

## 10. API / Frontend Contract

Re-verified against Stage 7: generated client paths match backend routes;
hand-written fetch paths (AI, social, messages, profile-extra, progression
summary) match their endpoints. No endpoint returns mocked/fake data. The one
contract-relevant change this stage is the malformed-UUID fix (400 instead of
500) — a contract *improvement*, not a break.

---

## 11. Security Release Check

**One defect found and fixed (LOW → FIXED):** 10 routes in `social.ts` and
`quests.ts` passed unvalidated `:id` params to PostgreSQL, which threw
`invalid input syntax for type uuid` → HTTP 500. This is the same defect class
as BUG-4 (previously fixed only for the conversation route). Fixed with a shared
`isValidUuid()` helper (`lib/uuid.ts`); malformed ids now return 400 while
well-formed-but-nonexistent ids still return 404. Regression test:
`uuid-validation.test.ts` (10 cases).

**Passing checks:** SQL injection (parameterized), IDOR/cross-user access,
refresh-token replay, password never returned (bcrypt), no secret leakage,
CORS allow-list enforcement, path traversal (404), malformed JSON (400), rate
limiting (auth 10/15min, refresh 30/15min), no user enumeration.

No CRITICAL/HIGH/MEDIUM exploitable vulnerabilities remain.

---

## 12. Failure / Resilience

Invalid JSON (400), invalid UUID (400), nonexistent resource (404), expired
token (401), unauthorized (401), no stack traces, no secrets in logs, server
remains alive, failures isolated to the affected feature. All PASS.

---

## 13. Performance Sanity

- Feed, message list, chat history, and leaderboard all have capped limits.
- SSE has heartbeat + `clearInterval` cleanup on `close`.
- Uploads capped at 150 MB (explicit multer limit).
- **LOW:** the conversations list has no pagination (a user's own conversations,
  naturally small — non-blocking).
- No unbounded queries or N+1 patterns observed.

---

## 14. Remaining Risks & Blocked/Unverified Items

| Item | Status |
|------|--------|
| Live AI (real key) | BLOCKED |
| Live object storage | BLOCKED |
| Live production/staging DB schema | BLOCKED |
| Browser E2E | BLOCKED/UNVERIFIED |
| `/api/progression/summary` on real Postgres | UNVERIFIED (200 verified on PGlite with maxConnections=10; earlier 500 proven to be the single-connection harness, not the app) |
| Conversations list pagination | LOW (non-blocking) |
| CORS disallowed-origin 500 (cosmetic; no ACAO header) | LOW |
| In-memory rate limiter (single instance) | INFO |

---

## 15. Release Decision

**CONDITIONAL GO.** The repository, clean checkout, isolated DB, migrations,
seeds, startup matrix, auth journey, social, messaging/SSE, security, and
resilience all pass. The only thing preventing a GREEN is the set of
environment-dependent validations that cannot be performed in this sandbox
(live AI, live storage, live DB, browser E2E). None of the BLOCKED/UNVERIFIED
items indicate a defect — they indicate missing infrastructure. If the
deployment is confirmed local-only (as this sandbox is), GREEN criteria are
met; otherwise complete the production-environment checks before a full
production rollout.

---

## Commits This Stage

```
92d3d5b fix: return 400 (not 500) for malformed UUIDs in :id route params
```

(Fix policy followed: reproduce → root cause → minimal fix → regression test →
full suite re-run → commit separately.)
