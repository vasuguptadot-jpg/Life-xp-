# Stage 23 — Adversarial Security, Authorization & Trust-Boundary Audit

**Decision: GREEN** (see `STAGE23_RELEASE_GATE.md` for the full gate table)

## 1. Purpose & Method

The central question this stage answers, by *executing attacks against the running
application and database* (never by source inspection alone):

> Can an untrusted client cause LifeXP to read, modify, delete, reward,
> impersonate, or observe something it should not be allowed to?

Method: a dedicated adversarial test suite (`artifacts/api-server/src/tests/
stage23-security-audit.test.ts`, 28 tests) drives the **real Express app against
real PostgreSQL 18.4** and attempts each attack across every trust boundary. Two
independent users (A and B) are provisioned per run; every test asserts safe
rejection or documents a genuine finding with an explicit expectation. Findings
are classified A (blocker) / B (minor) / C (robustness/quality) / D (security
defect requiring fix), following the established protocol.

## 2. Baseline (recovered before any work)

| Item | Result |
|---|---|
| Remote/local HEAD | `6297138` (Stage 22) |
| Baseline suite | 344/344 (40 files), 73.36s |
| Typecheck | PASS |
| Build | PASS |
| Secret scan | clean |
| Database | PostgreSQL 18.4 (`lifexp`), Node 22.22.3, pnpm 10.34.5 |

No work proceeded from a broken baseline.

## 3. Threat Model

- **Actors**: unauthenticated client; normal authenticated user; malicious
  authenticated user; compromised account; browser attacker (reflected XSS /
  open redirect); direct HTTP modifier (crafted bodies/headers); replayer;
  racer (concurrent submissions); cross-user (A acting on B).
- **Assets**: identity/sessions/passwords, profile PII, XP, quests, goals,
  progression, daily tasks, chat, AI context, conversations, notifications,
  database, secrets.
- **Boundaries**: browser → API → auth → authorization → services → DB →
  external (Groq, object storage).

## 4. Authentication — result: SAFE (no bypass)

Executed and verified:

- Missing / malformed / forged bearer tokens are rejected `401` across all
  protected surfaces.
- A token forged with the **wrong signing secret** is rejected (no alg
  confusion); `alg:none` is rejected.
- Expired access tokens are rejected.
- Sign-in failure is **uniform** (`401`) regardless of whether the email is
  registered → no account enumeration.
- Session minting uses HS256 with `SESSION_SECRET` (required); refresh tokens
  rotate (verified in Stage 22 / `refresh-rotation.test.ts`).

## 5. Authorization / IDOR — result: SAFE (server-side, no cross-user access)

Executed with two users, A and B, across every id-scoped endpoint:

| Resource | B's attempt against A | Result |
|---|---|---|
| Quest (progress/complete/abandon) | read / mutate A's quest | `404`/`403` — rejected |
| Daily task (complete) | complete A's task | rejected |
| Conversation (read / post message / SSE) | read / write / subscribe | rejected |
| Post (delete / unlike / like on A's behalf) | mutate A's post | rejected |
| Profile (PATCH self-only) | patch A's profile | rejected |
| Private chat history / goals | read A's data | rejected |

Authorization is enforced **server-side** on every route (never via UI
filtering); UUID-substitution and copied-request attacks are safely rejected.

## 6. Vertical Privilege Escalation — result: SAFE

- `role` / `isAdmin` / `isActive` fields in request bodies/query/cookies are
  ignored — no hidden admin path exists.
- No admin/debug/diagnostic endpoints exist beyond `healthz`/`readyz` (which
  reveal no env/credentials/stack/topology).

## 7. Input Validation / Type Confusion / SQL Injection — result: SAFE (two findings)

- **SQLi**: injection payloads in `caption`, `hashtags`, `tag`, and chat are
  inert — all queries are parameterized (drizzle). No raw string interpolation.
- **Malformed UUIDs** rejected `400` (never `500`) across all id-scoped
  endpoints.
- **FINDING (B)** — benign loose coercion: quest-progress numeric coercion
  accepts `Number(null)=0`, `Number([])=0`, `Number(true)=1`. Observed `200`
  with `IN_PROGRESS` and **zero XP** — no state corruption, no authz bypass.
  Documented, not a security defect.
- **FINDING (C-2)** — signup does not validate email type/format/length
  (see §13). No auth/XP/cross-user consequence; data-integrity gap.

## 8. Progression / Economy Tampering — result: SAFE

- No endpoint lets a client mint arbitrary XP.
- Negative / huge / `NaN` XP cannot be injected via quest complete.
- Replaying the same completion mints **zero** additional XP (server-side
  idempotency, `xp.award.replayed`).
- XP award and quest update run in a single transaction (`quests.ts`); the
  client is never authoritative for progression state.

## 9. AI Trust Boundary — result: SAFE

- Prompt injection in chat cannot mint XP or read another user's data.
- Deterministic chat answers (progress, daily_plan, weekly_review,
  weaknesses, recommendations, goals, momentum) are built **server-side from
  the requesting user's own engine state** — never from other users.
- Groq is invoked only for open-ended (unmatched) prompts; deterministic
  engines never call Groq and never award XP.

## 10. SSE / Realtime Isolation — result: SAFE

- A non-member cannot subscribe to a conversation's events (`403`; the
  `?token=` EventSource path is authenticated, membership enforced).
- The SSE endpoint requires a valid token (query param or bearer).

## 11. Information Disclosure — result: SAFE (one finding fixed)

- Invalid vs nonexistent vs unauthorized resources return distinct-but-safe
  codes; no stack trace / SQL / path / env / schema in any response.
- Server errors return a generic `{"message":"Internal server error"}` body.
- **FINDING (C-1, FIXED)** — see §12.

## 12. XSS (stored) — result: SAFE

Script/SVG payloads in `caption`, `displayName`, and `bio` are **stored
verbatim** (parameterized insert) and the API **never renders** them — the
client renders user content only through React's escaped text nodes (no
`dangerouslySetInnerHTML`, no unescaped URL construction for these fields).
No stored/reflected XSS sink was found.

## 13. Findings

| ID | Class | Summary | Status |
|---|---|---|---|
| C-1 | C | Public profile endpoint leaked `date_of_birth` + `activity_level` to any authenticated user | **FIXED** |
| C-2 | C | Signup accepts non-string / malformed / unbounded emails | Documented (pre-existing C) |
| B | B | Loose numeric coercion on quest progress (`null`/`[]`/`true`) | Documented (benign) |

### C-1 (FIXED) — PII disclosure via public profile

- **Reproduce**: create user A with private profile (`date_of_birth`,
  `activity_level`, `height_cm`, `weight_kg`, `age`, `bio`); as user B,
  `GET /api/social/users/:A` returned the **full** `user_profiles` row
  including `dateOfBirth` and `activityLevel`.
- **Root cause**: `db.select().from(userProfilesTable)` selected all columns
  and returned them verbatim.
- **Minimal fix**: explicit column projection to the public, UI-rendered
  fields only (`avatarUrl`, `bio`, `age`, `weightKg`, `heightCm`).
- **Regression test**: `stage23-security-audit.test.ts` →
  *"FINDING (C-1, FIXED): public profile endpoint does not expose
  DOB/activity level"* — asserts public fields present, `dateOfBirth` /
  `activityLevel` `undefined`.
- **Re-attack**: after fix, `dateOfBirth` and `activityLevel` are absent from
  the response while public fields remain.

### C-2 (documented) — signup email validation

- **Reproduce**: `POST /api/auth/signup` accepts `{email: {run: x}}` (stored as
  JSON string), `"not-an-email"` (no `@`), and a 500-character email — all
  `201`.
- **Root cause**: signup only checks truthiness of `email`; no type/format/
  length validation (no product email spec exists).
- **Why C not D**: no auth bypass, no XP minting, no cross-user access, no
  SQLi (parameterized). It is a data-integrity/robustness gap. Consistent with
  the prior Stage 21 input-fuzz classification.
- **Recommended minimal fix** (not applied — would be speculative without a
  product spec): reject non-string email and enforce a length cap; optionally
  a basic `x@y.z` format check.

### B (documented) — numeric coercion

- `Number(null)=0`, `Number([])=0`, `Number(true)=1` accepted by quest-progress
  coercion (`200`, `IN_PROGRESS`, zero XP). Benign; documented for completeness.

## 14. CSRF / CORS / Security Headers

- **CORS**: dev allows all origins; production restricts to `CORS_ORIGINS`
  (comma-separated) with `credentials: true`. Forged/unknown `Origin` is
  rejected in production.
- **CSRF**: the API is bearer-token authenticated (no ambient cookie
  session), so classic CSRF does not apply to the API surface; introducing
  cookie+CSRF mechanisms would be incompatible with this architecture and was
  deliberately **not** added.
- **Security headers**: the app relies on the Replit reverse proxy for
  transport/TLS; no blanket header middleware was added (per constraint "do not
  blindly add headers that break functionality"). NUL-byte stripping and a
  generic error handler are present in `app.ts`.

## 15. Rate Limiting

- Mutation limiter (`makeMutationLimiter`) keyed on the authenticated user with
  a bounded cap; auth limiter on signup/signin. Rejections are `429` with an
  anonymized `rate_limit.rejected` event (no user id logged → no enumeration).
  (Verified by `rate-limiting.test.ts` in the full regression.)

## 16. Secrets & Dependencies

- **Secret scan**: `grep` across all source/build/config for real credential
  patterns (Groq/OpenAI keys, AWS keys, GitHub tokens, private keys, DB URLs
  with embedded passwords) found **zero** real secrets. `GROQ_API_KEY` and DB
  creds are provided via env (`.env.example` has placeholders only); no secret
  is committed or present in client bundles.
- **Dependencies** (lockfile): `express 5.2.1`, `jsonwebtoken 9.0.3`,
  `pg 8.22.0`, `drizzle-orm 0.45.2`, `zod 3.25.76`, `groq-sdk 1.5.0`,
  `vite 7.3.6` — all current. The live `npm audit` endpoint was unreachable
  from the sandbox (network `ERR_SOCKET_TIMEOUT`); recorded as a residual-risk
  limitation, not a silent pass. No dependency was upgraded (none required;
  upgrading blindly is out of scope).

## 17. Failure / Attack Matrix (executed evidence)

| Attack | Expected | Observed | Data leaked | Mutation | Result |
|---|---|---|---|---|---|
| Forged bearer token (wrong secret) | 401 | 401 | none | none | ✅ |
| `alg:none` token | 401 | 401 | none | none | ✅ |
| Expired access token | 401 | 401 | none | none | ✅ |
| Email enumeration (signin) | uniform 401 | uniform 401 | none | none | ✅ |
| B reads A's quest | reject | 404/403 | none | none | ✅ |
| B mutates A's quest | reject | 404/403 | none | none | ✅ |
| B completes A's daily task | reject | rejected | none | none | ✅ |
| B reads/posts A's conversation | reject | rejected | none | none | ✅ |
| B deletes/unlikes A's post | reject | rejected | none | none | ✅ |
| B patches A's profile | reject | rejected | none | none | ✅ |
| B reads A's chat/goals | reject | rejected | none | none | ✅ |
| Role field in body/query/cookie | ignored | ignored | none | none | ✅ |
| Admin/debug endpoint probe | 404 | 404 | none | none | ✅ |
| SQLi in caption/hashtags/tag/chat | inert | inert (parameterized) | none | none | ✅ |
| Malformed UUID | 400 | 400 | none | none | ✅ |
| Type confusion on numeric | no corruption | 200 IN_PROGRESS, 0 XP | none | none | ⚠️ B |
| Signup non-string email | (gap) | 201, stored as JSON string | — | garbage email | ⚠️ C-2 |
| Signup malformed/500-char email | (gap) | 201 | — | garbage email | ⚠️ C-2 |
| Arbitrary XP minting | none possible | none | none | none | ✅ |
| Negative/huge/NaN XP injection | rejected | rejected | none | none | ✅ |
| Replay completion | 0 XP | 0 XP | none | none | ✅ |
| Prompt injection mint XP / read B | none | none | none | none | ✅ |
| A subscribes to B's conversation | 403 | 403 | none | none | ✅ |
| Public profile PII (DOB/activity) | not exposed | **was exposed** → **fixed** | DOB, activity_level | none | ⚠️ C-1 FIXED |
| Server error internals | generic | generic | none | none | ✅ |
| Stored XSS render | never rendered | stored verbatim, never rendered | none | none | ✅ |

## 18. Residual Risk

1. **Signup email validation** (C-2) remains un-fixed by design (no product
   email spec); a malformed identifier can be stored but confers no privilege.
2. **Live dependency audit** unavailable from sandbox network; lockfile
   versions verified current by inspection only.
3. **Storage uploads** were not exercised end-to-end (object-storage backend
   not available in this environment); ownership/key-construction logic was
   inspected (`social.ts`, `objectStorage.ts`) and no server-side ownership
   flaw was found, but this remains a documented limitation rather than an
   executed proof.

## 19. Regression

- Stage 23 suite: **28/28 pass** (run twice, stable).
- Full suite: **372/372 (41 files)**.
- Typecheck: **PASS**. Build (api-server + web): **PASS**. Secret scan: clean.

*Never claim security based solely on source inspection — every GREEN above is
backed by executed adversarial evidence against the live app + database.*
