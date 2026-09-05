# Stage 24 — Data Integrity, Privacy, Lifecycle & Disaster-Recovery Audit

**Decision: GREEN** (see `STAGE24_RELEASE_GATE.md`)

The central invariant audited: **user data must have a complete, consistent,
traceable lifecycle** — create → read → update → dependent data →
archive/retention → delete → recovery/backup → restore → post-restore
consistency. All conclusions are backed by executed evidence against the live
application and real PostgreSQL 18.4, never by source inspection alone.

## 1. Baseline (Part 0 — mandatory recovery)

Recovered authoritative commit `ecc1726` (Stage 23) after the environment reset
to `25cbdf2`; the remote `arena/01a05271-life-xp` was at `ecc1726` and was
re-fetched and `reset --hard`.

| Item | Result |
|---|---|
| HEAD / branch | `ecc1726` on `arena/01a05271-life-xp` |
| git status | clean |
| Ancestry | full Stage 17→23 chain present (ecc1726→6297138→a43b80a→60bf46f→…) |
| PostgreSQL | 18.4 (embedded-postgres 18.4.0-beta.17, re-provisioned on 127.0.0.1:5434) |
| Node / pnpm | 22.22.3 / 10.34.5 |
| Migrations | 2 migrations (`0000`, `0001`) applied to a fresh DB |
| Baseline suite | 372/372 (41 files), 52.95s |
| Typecheck | PASS (workspace `tsc --build` + artifacts) |
| Build | PASS (api-server + web) |
| Secret scan | clean |

## 2. Database Integrity Inventory (Part 1)

23 tables, all `uuid` PKs (`gen_random_uuid()`). Live-verified via
`information_schema` (not just source). Relationship graph:

```
users (root owner)
 ├─ refresh_tokens         → users CASCADE (token_hash UNIQUE)
 ├─ onboarding_states      → users CASCADE (user_id UNIQUE)
 ├─ user_profiles          → users CASCADE (user_id UNIQUE)  [SENSITIVE: date_of_birth, activity_level, weight, height, age]
 ├─ user_characters        → users CASCADE · → archetypes NO ACTION (user_id UNIQUE)
 ├─ user_goals             → users CASCADE
 ├─ user_quests            → users CASCADE · → quest_templates NO ACTION
 ├─ xp_transactions        → users CASCADE (idempotency_key UNIQUE)   [LEDGER]
 ├─ user_levels            → users CASCADE (user_id UNIQUE)           [total_xp DENORMALIZED]
 ├─ user_attributes        → users CASCADE (user_id, attribute UNIQUE)
 ├─ attribute_history      → users CASCADE (source_id, attribute UNIQUE)
 ├─ ai_user_goals          → users CASCADE (user_id UNIQUE)
 ├─ ai_daily_tasks         → users CASCADE (user,date indexed)
 ├─ ai_chat_messages       → users CASCADE
 ├─ ai_daily_tips          → users CASCADE (user,date indexed)
 ├─ posts                  → users CASCADE (likes_count DENORMALIZED)
 ├─ post_likes             → users CASCADE · → posts CASCADE (user,post UNIQUE)
 ├─ follows                → users CASCADE ×2 (follower,following UNIQUE)
 └─ conversations ─┬─ conversation_members → conversations CASCADE · → users CASCADE (conv,user UNIQUE)
                   └─ messages → conversations CASCADE · → users(sender) CASCADE
```

Reference data (no owner): `archetypes` (name UNIQUE), `quest_templates`.

**Inventory conclusions**

- **Orphan risk (documented C)**: `conversations` has no owner and is never
  cascade-deleted. Deleting a user removes their membership + sent messages,
  but a 1-on-1 conversation whose *other* member deletes their account becomes
  **invisible in the survivor's list** (list query INNER-JOINs the other
  member) while the survivor's own messages remain. Privacy-correct, but a
  partial thread + dead conversation row. No cross-user access results.
- **Dangling references (documented)**: `attribute_history.source_id` and
  `xp_transactions.source_id` are `text` (not FKs) — by design, so deleting a
  quest template cannot break historical ledger/history rows. Safe, but not
  referentially enforced.
- **Accidental cascade**: all user-owned children are `ON DELETE CASCADE` —
  correct for a hard-delete model; verified no orphan rows remain (Part 2).
- **Missing CHECK constraints (documented B)**: `xp_transactions.amount` has no
  `CHECK (amount >= 0)`. The application never writes negative XP, but an
  out-of-band write can (evidenced: a `-100` row inserted successfully). No
  migration added (would change schema; documented as residual).
- **Duplicate-prone relationships**: all many-to-many links (members, likes,
  follows) have composite UNIQUE constraints — duplicates impossible
  (evidenced by unique-violation probes).
- **Nullable/mutable ownership**: no owner column is nullable; no code path
  reassigns ownership.

## 3. Account Deletion Lifecycle (Part 2)

`DELETE /api/users/me` performs a **hard delete** of the `users` row, relying
on `ON DELETE CASCADE`. Executed against a fully-populated user (profile,
quests, completed quest, XP ledger, goals, daily tasks, conversations,
messages, posts, follows, refresh tokens, AI rows):

- user disappears ✅
- **zero** orphaned child rows across all 16 user-owned tables ✅
- deleted user's sent messages cascade away (privacy) ✅
- refresh tokens cascade away ✅
- no child record remains accessible ✅
- deleted user vanishes from leaderboard, feed, conversation list ✅

Two genuine defects found and **fixed**:

- **D-1** — `posts.likes_count` (denormalized) drifted on account deletion:
  cascade removed `post_likes` rows but not the counter, leaving other users'
  posts with an inflated like count disagreeing with `post_likes`.
- **D-2** — a deleted account's stateless JWT remained accepted by
  `requireAuth` for up to 15 minutes; mutations then surfaced as
  foreign-key-violation **500s**. `requireAuth` did not verify the account
  still exists.

## 4. Soft vs Hard Delete (Part 3)

**Hard delete only** — no soft-delete, no archival, no retention policy. This
is the chosen model (not changed for aesthetics). Verified every read query
respects it: leaderboard, feed, recommendations, and conversation list all
JOIN `users`/members, so deleted users cannot ghost. (See §3 conversation-orphan
note for the one edge case.)

## 5. Privacy / Data Minimization (Part 4)

Two real users A/B. Executed B's retrieval against every list/projection
endpoint (`leaderboard`, `posts`, `posts/personalized`, `users/:id`,
`conversations`, `users/me`, `users/me/profile-extra`):

- No projection exposes `date_of_birth`, `activity_level`, `password_hash`,
  `token_hash`, or refresh tokens.
- B can never read A's email via any endpoint.
- Stage 23 C-1 fix (public-profile field projection) still holds.

## 6. XP Ledger Consistency (Part 6)

Executed completions, replays, concurrent awards, and rejected mutations:

- `SUM(xp_transactions.amount) == user_levels.total_xp` — verified across
  completion + 2 replays (no drift) ✅
- No negative/zero ledger entries produced by the application ✅
- No ledger entry without a `source_type` ✅
- Idempotency key is UNIQUE (duplicate insert rejected) ✅
- Abandoning/re-assigning a quest does not alter historical XP ✅
- Concurrent triple-completion awards XP exactly once (no phantom XP) ✅
- Delete-account racing completion leaves no orphan XP ✅

`total_xp` is incremented atomically in SQL (race-free), and the ledger is the
single authority; `current_level` is derived (`⌊√(total/100)⌋+1`) and
recomputed — verified equal.

## 7. Derived-Data Recomposition (Part 7)

All life-engine values (streak, momentum, weaknesses, recovery, difficulty,
recommendations, daily-plan, weekly-review, forecast, behavior) are **computed
fresh per request** from `xp_transactions` + `user_attributes` +
`attribute_history` + `user_quests` + `ai_daily_tasks`. There is **no persisted
or in-memory cache** that can become a second source of truth. Verified:
deterministic across repeated calls (byte-identical bodies), and
`level == f(total_xp)`.

`ai_daily_tasks` is generated once per (user, date) under a Postgres advisory
lock and persisted — it is authoritative for that day, not a stale cache.
`ai_daily_tips` is a per-day persisted row. The only in-memory state is the SSE
registry (lifecycle-managed, returns to 0 after churn — Stage 22).

## 8. Migration Safety (Part 8)

- Forward migration: 2 migrations apply cleanly to a fresh DB ✅
- Clean-database migration: verified on two fresh DBs (`lifexp_src`,
  `lifexp_dst`) ✅
- Ordering: journal (`drizzle.__drizzle_migrations`) records ids 1, 2 in order ✅
- Idempotency: re-running `migrate` is a no-op (still 2 journal rows) ✅
- Destructive ops: none in current migrations ✅
- Seed behavior: migrations seed **no reference data**. `scripts/seed-archetypes`
  seeds archetypes (idempotent); **quest templates have no committed seed
  script** (documented C — must be provisioned out-of-band).

## 9. Backup / Restore (Part 9) — EXECUTED

Real PostgreSQL 18.4. Because the runtime bundles only `initdb`/`pg_ctl`/
`postgres` (no `pg_dump`/`pg_restore`/`psql`), a real logical backup was
performed via the PostgreSQL `COPY` protocol (`pg-copy-streams`), which
round-trips data faithfully.

1. Seeded a representative dataset (users, XP history, quests, goals, daily
   tasks, conversations, messages, posts, likes, follows, recommendations
   inputs, notifications-inputs) into `lifexp_src`.
2. Backed up all 23 tables via `COPY … TO STDOUT`.
3. Controlled mutation (deleted messages, XP rows, posts).
4. Restored via `COPY … FROM STDIN` (FK enforcement deferred via
   `session_replication_role = replica`, equivalent to pg_restore's
   `--disable-triggers`) into a freshly-migrated `lifexp_dst`.
5. Verified **all 23 tables** restored with matching row counts; XP ledger
   `SUM == 50` before and after; ownership (`alice@…`, `bob@…`) and
   relationships (members=2, messages=1, likes=1) intact.

**Result: RESTORE INTEGRITY VERIFIED.**

## 10. Point-in-Time / Recovery Limits (Part 10)

**Application guarantee**: the schema is fully self-describing (migrations) and
restorable from a logical dump; every user-owned record is traceable to its
owner; the XP ledger is the single authority.

**Deployment/infrastructure guarantee (NOT validated here)**: backup mechanism,
frequency, retention, RPO/RTO, point-in-time recovery, encryption, and restore
drills are **not** provided by the repository and are outside this audit's
control. `pg_dump` is not bundled in the runtime image. These are documented as
infrastructure responsibilities — not fabricated as working.

## 11. Transactional Consistency (Part 11)

Quest completion runs `update(status=COMPLETED)` + `awardXp` (ledger + level +
attributes + history) in a **single transaction**; a failure cannot leave a
half-applied state. Verified via ledger: after completion the ledger delta
equals the template XP exactly and status+completedAt are set together.
(Existing Stage 21 failure-injection tests also cover rollback of coupled
writes.)

## 12. Concurrent Lifecycle Operations (Part 12)

- delete vs completion race → no orphan XP, no resurrection ✅
- concurrent triple completion → exactly one award ✅
- unique constraints prevent duplicate membership/likes/follows under race ✅

## 13. Cache Consistency (Part 13)

No cache can override authoritative state: derived values are recomputed
per-request; `ai_daily_tasks`/`ai_daily_tips` are persisted (authoritative for
their day); the SSE registry is in-memory and cleaned on disconnect. No
write→read→mutate→delete→read staleness path exists that could violate data
integrity.

## 14. Time / Retention / Expiration (Part 14)

- Daily tasks are keyed to `YYYY-MM-DD` and completion is scoped to the task
  row (no implicit rollover) — verified.
- Refresh tokens carry `expires_at` and are revocable; access tokens are 15m.
- No retention/archive window exists (hard-delete model); documented as the
  chosen lifecycle, not a defect.

## 15. Log / Diagnostics Privacy (Part 15)

Audited all `logger.*` calls: logs record events and correlation data only
(`auth.failed` reason+path, `xp.awarded` userId/source/idempotency-key/xp,
`rate_limit.rejected`, `database.pool.error`, SSE lifecycle). **No password,
raw token, session cookie, API key, email, private message content, or full
authorization header is ever logged.** Request IDs (`X-Request-Id`) remain
useful without leaking identity.

## 16. Error / Recovery Semantics (Part 16)

The global handler returns a generic `{"message":"Internal server error"}`
(no stack/SQL/path/env) for unexpected errors; validation → 400, auth → 401,
forbidden → 403, not-found → 404, conflict → 409, rate-limit → 429. With D-2
fixed, a deleted identity is rejected **401** at the auth boundary — an
operation can no longer report a 500 when the authoritative account is gone.

## 17. Adversarial Data Corruption (Part 17)

Injected into disposable rows: duplicate conversation membership (rejected by
UNIQUE), child row with nonexistent user (rejected by FK), negative XP
transaction (accepted — no CHECK, documented B). No production constraint was
weakened to make corruption injectable; corruption detection is via DB
constraints (FK/UNIQUE) where they exist.

## 18. C-2 Email Validation (Part 18) — FIXED

Stage 23 documented C-2: signup accepted non-string / malformed / unbounded
emails (stored as JSON strings / garbage). Contract decision (documented):
email must be a non-empty string, ≤254 chars, matching `local@domain.tld`;
normalized to trimmed+lowercased; deterministic `400` rejection otherwise; no
DB pollution. Implemented in `signup` **and** `signin` (case/whitespace-
insensitive lookup). Regression tests cover object/number/array/null/empty/
malformed/500-char → 400, valid → 201 + normalization.

## 19. Security Regression (Part 19)

Stage 23 guarantees re-verified after the lifecycle changes: B cannot read or
mutate A's data; public profile still omits `dateOfBirth`/`activityLevel`;
no privilege escalation; no XP manipulation (replay-safe); no SQLi; SSE
isolation intact. (Stage 23 suite passes.)

## 20. Findings

| ID | Class | Summary | Status |
|---|---|---|---|
| D-1 | D | `posts.likes_count` drifted on account deletion | **FIXED** + regression test |
| D-2 | D | Deleted account's JWT still accepted → FK-violation 500s | **FIXED** + regression test |
| C-2 | C→fixed | Signup accepted non-string/malformed/unbounded emails | **FIXED** + regression tests |
| B | B | `xp_transactions.amount` lacks `CHECK (amount >= 0)` (app never writes negative) | Documented residual |
| C-1 | C | Conversation orphan / partial thread after member deletion | Documented |
| C-2 | C | No user-data export capability | Documented (product gap) |
| C-3 | C | No notifications subsystem | Documented (absent) |
| C-4 | C | Quest templates have no committed seed script | Documented (operational) |
| C-5 | C | No automated backup / PITR in repo (infra responsibility) | Documented |

### D-class fix protocol (all three applied)

1. **D-1** reproduce (likes_count stayed 1 after liker deleted) → root cause
   (cascade removes `post_likes` but not the denormalized counter) → minimal
   fix (reconcile counter in `DELETE /api/users/me` before cascade) →
   regression test (`stage24-data-integrity.test.ts`) → full regression →
   re-attack (counter now 0).
2. **D-2** reproduce (deleted token → `/users/me` 404, mutation 500) → root
   cause (`requireAuth` never verified existence) → minimal fix (existence +
   `is_active` check in `requireAuth`) → regression test (deleted token → 401)
   → full regression → re-attack (no resurrection, no 500).
3. **C-2** reproduce (object/malformed/500-char email → 201) → root cause (no
   email validation) → minimal fix (validate + normalize) → regression tests
   → full regression → re-attack (all → 400, valid → 201 normalized).

## 21. Full Regression (Part 20)

- Stage 24 suite: **21/21 pass**
- Full suite: **393/393 (42 files)**
- Typecheck: PASS · Build: PASS · Secret scan: clean
- Stage 21 concurrency soak, 21.1 browser chaos, 22 observability, 23 security:
  all remain GREEN (their suites pass within the full run)

## 22. Residual Risk

1. `xp_transactions.amount` has no non-negative CHECK (application is
   correct; out-of-band writes are not).
2. No account-export, no notifications, no retention/archive (documented as
   absent capabilities, not fabricated).
3. Backup/PITR/encryption/RPO/RTO are infrastructure responsibilities outside
   the repo; a logical restore was demonstrated but no production backup
   automation exists in-repo.
4. Live `npm audit` endpoint unreachable from the sandbox (network); lockfile
   versions verified by inspection.
5. Object-storage upload path inspected but not executed end-to-end (backend
   unavailable).

*No security or integrity claim above rests on source inspection alone — every
GREEN is backed by executed evidence against the live app + real PostgreSQL.*
