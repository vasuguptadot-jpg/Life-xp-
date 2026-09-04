# Stage 25 — Database Invariants, XP Economy Hardening & Authoritative State Audit

**Decision: GREEN** (see `STAGE25_RELEASE_GATE.md`)

Central question: **does the database itself enforce the application's most
important invariants?** The database is the final authority; application
validation is necessary but not sufficient. Every conclusion below is backed
by executed evidence against the live application and real PostgreSQL 18.4.

## 1. Baseline (Part 0)

| Item | Result |
|---|---|
| HEAD / branch | `553039e` on `arena/01a05271-life-xp` |
| git status | clean |
| PostgreSQL | 18.4 (embedded-postgres 18.4.0-beta.17, re-provisioned on 127.0.0.1:5434) |
| Node / pnpm | 22.22.3 / 10.34.5 |
| Migrations | 2 applied (0000, 0001) |
| Baseline suite | 393/393 (42 files), ~84s |
| Typecheck / Build / Secret scan | PASS / PASS / clean |

## 2. Authoritative XP Invariant (Part 1) — D FOUND & FIXED

`xp_transactions.amount` is `integer NOT NULL` (numeric precision 32), no
default, **no CHECK constraint** at baseline.

Direct-database insertion (real user, real PG, superuser role):

| Input | Before fix | After fix |
|---|---|---|
| -1 | **ACCEPTED** | REJECTED (23514 `xp_transactions_amount_nonnegative`) |
| -50 | **ACCEPTED** | REJECTED |
| -999999999 | **ACCEPTED** | REJECTED |
| 0 | accepted | accepted (zero cannot corrupt SUM) |
| 42 | accepted | accepted |
| 2147483647 | accepted | accepted (max int) |
| 2147483648 | rejected (22003, out of range) | rejected |

**Classification: D** (Stage 24 residual B, now a reproducible integrity
defect). The application sanitizes (`xp > 0 && Number.isFinite`), but an
out-of-band write could mint negative XP and corrupt the ledger SUM.

**Fix (minimal):** `CHECK (amount >= 0)` via a schema change + migration
`0002_majestic_exiles.sql`. **Re-attack:** negative values now rejected by
PostgreSQL itself (error 23514), positive/zero still accepted.

## 3. Total XP Consistency (Part 2)

`users.total_xp` (in `user_levels`) is a **denormalized aggregate** of the
authoritative ledger `xp_transactions`. Formally established and verified:

`SUM(valid xp_transactions.amount) == user_levels.total_xp`

across: first award, multiple awards, replay, concurrent triple-completion,
rollback of failed completion, quest completion, daily-task completion, and
account deletion. No operation can create ledger-only or total-only XP:
- a completion against a nonexistent quest → 404, ledger unchanged;
- a rolled-back completion leaves both unchanged together (single transaction);
- concurrent completion awards exactly once (advisory idempotency + unique
  idempotency key + `SUM == total` re-checked).

## 4. XP Boundary / Numeric Safety (Part 3)

- `0`, positive integers: accepted.
- `NaN`, `Infinity`, negative: ignored by `awardXp` (no transaction written) —
  verified the ledger is unchanged.
- Decimal `1.5`: **rejected** by PostgreSQL (`22P02 invalid input syntax for
  type integer`) — **no silent truncation**.
- String `"abc"`, boolean `true`: rejected (`22P02`).
- Integer overflow `2147483648`: rejected (`22003 out of range`) — **no
  overflow wrap**.
- **No client endpoint accepts an XP amount**: quest/daily-task completion take
  only an id; a body `{xp: 999999}` is ignored (reward stays server-derived,
  template/task-scoped).

No floating-point XP, no silent coercion, no overflow, no truncation.

## 5. XP Source Integrity (Part 4)

Legitimate sources (both server-side, transactional, idempotent):

| Source | Validation | Idempotency key | Transaction | Reward |
|---|---|---|---|---|
| `QUEST_COMPLETION` | ownership + status check | `quest_complete_{user}_{template}` | yes (with status update) | template `progressionConfig.xp` |
| `DAILY_TASK` | ownership + `isCompleted=false` | `daily_task_{taskId}` | yes (with completion update) | task `xp_reward` |

Attack results (all fail safely):
- arbitrary/fabricated quest id → 404;
- another user's quest id → 404;
- fabricated task id → 404;
- another user's task id → 404;
- duplicated idempotency key → UNIQUE violation (one ledger row);
- modified reward amount via body → ignored (reward is DB-derived).

No client can manufacture a legitimate source identifier or reward amount.

## 6. Quest State Machine (Part 5)

States: ASSIGNED → IN_PROGRESS → COMPLETED (plus ABANDONED). Verified:
- progress on a COMPLETED quest → 400 (no regression to IN_PROGRESS);
- progress endpoint **never** transitions to COMPLETED and **never** awards XP;
- COMPLETED → COMPLETED replay → idempotent (`alreadyAwarded=true`, 0 XP);
- abandoned quest → complete → 400;
- concurrent completion → exactly one award.

## 7. Daily Task State Machine (Part 6)

- repeated completion → `alreadyCompleted=true`, 0 additional XP;
- concurrent completion → exactly one award;
- another user's task id → 404;
- generation is advisory-lock serialized per (user, date) (Stage 22/24).

## 8. Goal State Integrity (Part 7)

Goals (`user_goals`, `ai_user_goals`) are scoped to the authenticated user
(`userId = req.user.sub`); no cross-user update/complete path exists. Verified:
A's goals never reach B's response (`GET /api/ai/goals` returns `null` for B).

## 9. Denormalized Counters (Part 8)

The **only** denormalized counter is `posts.likes_count` (source table
`post_likes`). Verified `likes_count == COUNT(post_likes)` across like, unlike,
duplicate-like no-op, over-unlike (GREATEST guard), and account-deletion
(Stage 24 D-1 reconciliation). `user_levels.total_xp` is the aggregate of the
ledger (see §3), kept consistent by the award transaction. Other "counts"
(unread_count, follower/following count) are computed live, not stored.

## 10. Database Constraint Hardening (Part 9/17)

Added exactly the CHECK constraints that map to the **monotonic XP/attribute**
domain invariant (each justified, each regression-tested):

| Table | Constraint | Invariant |
|---|---|---|
| xp_transactions | `amount >= 0` | XP never negative (D fix) |
| user_levels | `total_xp >= 0` | aggregate non-negative |
| user_levels | `current_level >= 1` | level ≥ 1 |
| user_attributes | `current_value >= 0` | attribute XP monotonic |
| attribute_history | `delta >= 0` | history records only awards |

No redundant/decoration-only constraints were added.

## 11. Foreign Key / Cascade Audit (Part 10)

Re-audited all 25 FKs (live `information_schema`): every user-owned child is
`ON DELETE CASCADE`; reference data (`quest_templates`, `archetypes`) is
`NO ACTION` so historical ledger/history rows (`source_id` is `text`, not FK)
are never broken by template deletion. No accidental cascade, no orphaned
authoritative data (verified: child row referencing a nonexistent user →
rejected; account deletion → 0 orphans).

## 12. Unique Constraint Audit (Part 11)

Race-sensitive uniqueness is database-backed (not app-only): `post_likes
(user_id, post_id)`, `follows (follower, following)`, `conversation_members
(conv, user)`, `xp_transactions.idempotency_key`, `user_levels.user_id`,
`user_attributes (user, attribute)`, `attribute_history (source_id, attribute)`.
Concurrent duplicate like/follow → exactly one row (verified). Daily-task
generation uses a Postgres advisory lock (a plain unique index cannot model
"exactly one 5-task set per user per day").

## 13. NULL / Default Semantics (Part 12)

Authoritative fields (`amount`, `source_type`, `user_id`, `delta`,
`current_value`, `total_xp`) are `NOT NULL` with sane defaults. Nullable fields
(`source_id`, `idempotency_key`, `category`, `description`, `expires_at`,
`completed_at`, `revoked_at`) are genuinely optional and correctly `NULL` vs
omitted. No broad NOT NULL changes introduced (no evidence required them).

## 14. Timestamp Integrity (Part 13)

`created_at`/`completed_at`/`updated_at` are server-controlled (`defaultNow()` /
`new Date()` in handlers); clients cannot forge them. Verified: a post body
with `createdAt: "1999-01-01"` is ignored — the stored timestamp is current.

## 15. Database Role / Permission Review (Part 14)

Local test infra (embedded-postgres) connects as the **`postgres` superuser**
(`rolsuper`, `rolcreatedb`, `rolcreaterole`, `rolreplication` all true) — a
test-infrastructure artifact, not the production posture. Production connects
via `DATABASE_URL` as a dedicated application role (`.env.example`:
`postgresql://user:password@host:5432/dbname`), which is **not** superuser and
has no CREATEDB/CREATEROLE/replication. This distinction is documented, not
hidden; functionality was not weakened to satisfy an idealized model.

Note: the new CHECK constraints are enforced for **all** roles (including
superuser) — only a privileged DBA who can `ALTER TABLE … DROP CONSTRAINT`
could bypass them.

## 16. Transaction / Failure Injection (Part 15)

Quest completion and daily-task completion run the state mutation **and** the
XP award in a single transaction (existing failure-injection + Stage 24 tests
re-verified with the new constraints). No partial authoritative state.

## 17. Concurrency Soak (Part 16)

10 rounds of concurrent triple-completion: each awards exactly once
(`total_xp` +10 per round, `SUM == total` re-checked every round). Zero
duplicates, zero invariant violations, zero flakes.

## 18. Direct-Database Adversarial Test (Part 17)

Using the application role (and confirmed identical for superuser), attempted
to violate every invariant directly:

| Attempt | Result |
|---|---|
| negative XP | rejected (CHECK) |
| negative total_xp | rejected (CHECK) |
| current_level < 1 | rejected (CHECK) |
| negative attribute value | rejected (CHECK) |
| negative history delta | rejected (CHECK) |
| orphan child (missing user) | rejected (FK) |
| duplicate singleton (membership/like/follow) | rejected (UNIQUE) |
| decimal/string/boolean amount | rejected (type) |
| integer overflow | rejected (range) |

**Only a privileged DBA** (who can `ALTER TABLE … DROP CONSTRAINT`) can violate
these — that is the documented privileged-admin boundary, not an application
gap.

## 19. Stage 23/24 Regression (Part 18)

Stage 23 (security) and Stage 24 (lifecycle) guarantees re-verified after the
new constraints: IDOR intact, no PII leakage, deleted-token 401, account
deletion leaves no orphan XP, XP replay-safe, SSE isolation intact. One Stage 24
test (the "no CHECK" residual) was updated to assert the now-fixed behavior.

## 20. Findings

| ID | Class | Summary | Status |
|---|---|---|---|
| D-1 | D | `xp_transactions.amount` lacked a non-negative CHECK (negative XP insertable) | **FIXED** + migration + regression |
| — | B→fixed | Same root invariant on `total_xp` / `current_value` / `delta` / `current_level` | **FIXED** (CHECKs) |
| C-1 | C | Local test infra uses superuser role (production uses dedicated app role) | Documented |

### D-class fix protocol (applied)

1. **Reproduce** — direct insert of `-1/-50/-999999999` accepted (no CHECK).
2. **Root cause** — schema declared `integer("amount").notNull()` with no
   `check()`; application-only sanitization is bypassable out-of-band.
3. **Minimal fix** — `check("xp_transactions_amount_nonnegative", sql`amount >= 0`)`
   (plus the four justified sibling CHECKs on the same invariant).
4. **Regression test** — `stage25-db-invariants.test.ts` asserts DB rejection
   of negative XP and the constraint's existence.
5. **Full regression** — 426/426.
6. **Re-attack** — negative values now rejected (23514); positive/zero still
   accepted; all XP paths still work.

## 21. Guarantee Boundaries

- **APPLICATION GUARANTEE** — `awardXp` sanitizes (`xp > 0`, finite); state
  machines block illegal transitions; rewards are server-derived.
- **DATABASE GUARANTEE** — CHECK/FK/UNIQUE constraints reject negative XP,
  orphans, duplicate singletons, and invalid numeric/state values for the
  application role (and superuser).
- **PRIVILEGED-ADMIN GUARANTEE** — a DBA with `ALTER TABLE` can drop a CHECK
  constraint; nothing prevents a superuser from corrupting data. This is
  inherent to relational databases and is documented, not papered over.
- **INFRASTRUCTURE GUARANTEE** — backup/PITR/RPO/RTO remain outside the repo
  (Stage 24).

## 22. Full Regression (Part 19)

- Stage 25 suite: **33/33 pass**
- Full suite: **426/426 (43 files)**
- Typecheck: PASS · Build: PASS · Secret scan: clean
- Migration: 3 journal entries, forward + idempotent, zero pre-existing
  violations in the populated DB.
- Stage 21 soak / 21.1 browser / 22 observability / 23 security / 24 lifecycle
  all remain GREEN.

*No invariant is claimed GREEN from source inspection alone — every assertion
is backed by executed evidence against the live app + real PostgreSQL.*
