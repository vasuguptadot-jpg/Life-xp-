# Stage 10 — Final Findings & Risk Register

**Baseline:** `c18576a` → **Final HEAD:** `639f943`
**Recorded:** 2026-08-31

Independent findings from the final adversarial production audit. Each fixed
defect includes reproduction, expected/actual, root cause, and regression
coverage. No prior-stage findings are duplicated here unless re-verified.

---

## Fixed Defects (this stage)

### BUG-10a — Valid-UUID-but-nonexistent targets returned 500
- **Severity:** MEDIUM · **Location:** `routes/social.ts` (follow/like) + `routes/messages.ts` (conversation create)
- **Reproduction:** `POST /api/social/users/<valid-nonexistent-uuid>/follow` with a valid token → HTTP 500 (FK abort on `follows.following_id`).
- **Expected:** 404 (target does not exist). **Actual:** 500.
- **Root cause:** no existence check before FK insert.
- **Fix:** existence check → 404. **Commit:** `7533e65`. **Regression:** `nonexistent-target.test.ts` (3 cases).

### BUG-10b — Malformed conversation `:id` returned 500
- **Severity:** MEDIUM · **Location:** `routes/messages.ts` (GET/POST messages, SSE events)
- **Reproduction:** `GET /api/messages/conversations/not-a-uuid/messages` → 500 (PG `uuid` cast).
- **Expected:** 400. **Actual:** 500.
- **Fix:** `UUID_RE.test(convId)` → 400. **Commit:** `7366c87`. **Regression:** `uuid-validation.test.ts`.

### BUG-10c — Malformed quest template / daily-task id returned 500
- **Severity:** MEDIUM · **Location:** `routes/quests.ts` (`assign/:templateId`), `routes/ai.ts` (`daily-tasks/:id/complete`)
- **Reproduction:** `POST /api/quests/assign/not-a-uuid` → 500; `POST /api/ai/daily-tasks/not-a-uuid/complete` → 500.
- **Expected:** 400. **Actual:** 500.
- **Fix:** `isValidUuid` guard → 400. **Commit:** `6f4b4e8`. **Regression:** `uuid-validation.test.ts`.

### BUG-10d — Non-string hashtags returned 500
- **Severity:** MEDIUM · **Location:** `routes/social.ts` (create post)
- **Reproduction:** `POST /api/social/posts` with `hashtags:[null,123,{}]` → 500 (`.toLowerCase()` on non-string).
- **Expected:** 400 or filtered. **Actual:** 500.
- **Fix:** type-filter array items before `.toLowerCase()`. **Commit:** `639f943`. **Regression:** `input-validation.test.ts`.

### BUG-10e — Non-string goals returned 500
- **Severity:** MEDIUM · **Location:** `routes/onboarding.ts` (set goals)
- **Reproduction:** `POST /api/onboarding/goals` with `goals:[123,null,{}]` → 500 (non-string key on insert).
- **Expected:** 400. **Actual:** 500.
- **Fix:** validate array items are non-empty strings → 400. **Commit:** `639f943`. **Regression:** `input-validation.test.ts`.

### BUG-10f — Non-numeric profile fields returned 500
- **Severity:** MEDIUM · **Location:** `routes/users.ts` (profile-extra)
- **Reproduction:** `PATCH /api/users/me/profile-extra` with `age:"notnum"` → 500 (`Number("notnum")` → `NaN`; PG integer cast).
- **Expected:** 400. **Actual:** 500.
- **Fix:** validate `age`/`heightCm`/`weightKg` are finite numbers → 400. **Commit:** `639f943`. **Regression:** `input-validation.test.ts`.

### BUG-10g — NUL byte in text field returned 500
- **Severity:** MEDIUM · **Location:** `app.ts` (global, any free-text field)
- **Reproduction:** `POST /api/social/posts` with `caption:"…\u0000"` → 500 (PG `invalid byte sequence for encoding UTF8`).
- **Expected:** 400 or sanitized. **Actual:** 500.
- **Fix:** global JSON-body middleware strips U+0000 (meaningless in JSON). **Commit:** `639f943`. **Regression:** `input-validation.test.ts`.

---

## Open Findings (documented, not fixed)

### FIND-10-1 — Transitive `uuid` advisory (prod)
- **Severity:** MEDIUM · **Location:** `@google-cloud/storage → gaxios → uuid <11.1.1`
- **Advisory:** GHSA-w5hq-g745-h8pq (buffer bounds check in v3/v5/v6 with explicit buffer).
- **Impact:** low exploitability — the app never calls `uuid` v3/v5/v6 with a user buffer; used internally by gaxios.
- **Status:** documented. No blind upgrade (any upgrade → typecheck+tests+build+smoke).

### FIND-10-2 — Unbounded `limit` on quest recommendations
- **Severity:** LOW · **Location:** `routes/quests.ts` `GET /recommended` (`Number(req.query.limit) || 5`).
- **Impact:** `limit=-1`/huge returns the full — small, shared, public — quest catalogue. No security impact.
- **Status:** documented as hardening recommendation.

### FIND-10-3 — HTML 404 for unknown route
- **Severity:** LOW · **Location:** `app.ts` (no JSON 404 catch-all).
- **Impact:** cosmetic inconsistency (`/api/nonexistent` → Express HTML 404). No information disclosure.
- **Status:** documented.

### FIND-10-4 — Web bundle exceeds 500 KB
- **Severity:** LOW · **Location:** `artifacts/web` Vite build (605 KB minified JS).
- **Impact:** first-load performance; code-splitting recommended.
- **Status:** documented.

### FIND-10-5 — Dev/tooling advisories (non-production)
- **Severity:** LOW (not shipped) · **Location:** build/lint/codegen tooling.
- **Details:** 6 HIGH + 2 MODERATE + 1 LOW across `orval`(js-yaml ×2, fast-uri),
  `@typescript-eslint`(brace-expansion ×2), `vite`(nanoid, postcss), `esbuild`
  (Windows dev-server only). None are production runtime dependencies.
- **Status:** documented; no blind upgrades.

---

## Environment Blockers (not defects)

| Blocker | Reason | Degradation |
|---------|--------|-------------|
| Live AI | no `GROQ_API_KEY` | chat 503, tasks `[]`, tip fallback ✅ |
| Live object storage | no sidecar | uploads unverifiable (static review only) |
| Live production DB | no `DATABASE_URL` | reproduced on isolated PGlite/PostgreSQL |
| Browser E2E | no automation | build verification only |

---

## Verified-Negative Results (attacked, no defect)

- SQL injection / JSON injection / string-concat SQL — none (all parameterized).
- IDOR across posts, messages, conversations, quests, SSE — none (403/404 everywhere).
- JWT forgery / expiry / refresh reuse — rejected (401).
- Double-counting / lost updates under 6-way concurrency — none.
- Secret leakage in responses / history / `.env` — none.
- Stack/DB/path disclosure in errors — none.
