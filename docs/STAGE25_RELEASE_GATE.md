# Stage 25 — Release Gate

## Decision: GREEN

| Gate | Result |
|---|---|
| XP cannot be negative through normal app DB credentials | ✅ YES — `CHECK (amount >= 0)`, verified 23514 |
| XP ledger and total XP remain consistent | ✅ YES — `SUM == total_xp` across all operations |
| XP rewards remain exactly-once | ✅ YES — quest + daily-task replay/concurrency |
| Quest state transitions valid | ✅ YES — illegal transitions blocked (400) |
| Daily-task state transitions valid | ✅ YES — idempotent + exactly-once |
| Denormalized counters synchronized | ✅ YES — `likes_count == COUNT(post_likes)`; total_xp == ledger SUM |
| Important uniqueness races database-protected | ✅ YES — composite UNIQUE + advisory lock |
| Foreign keys prevent orphaned authoritative data | ✅ YES — 25 FKs, cascade + no-action verified |
| Critical numeric/state invariants enforced | ✅ YES — 5 CHECK constraints (non-negative XP/level/attribute/delta) |
| Timestamps not maliciously forgeable | ✅ YES — server-controlled, forged createdAt ignored |
| Transactional failure leaves no partial state | ✅ YES — single-transaction completion + award |
| Concurrency soak clean | ✅ YES — 10 rounds, 0 duplicates/violations/flakes |
| Stage 23/24 guarantees intact | ✅ YES — re-verified |
| Full regression passes | ✅ YES — 426/426 (43 files) |

## Baseline

| Item | Result |
|---|---|
| Recovered HEAD | `553039e` (reset --hard after env reset to 25cbdf2) |
| PostgreSQL | 18.4 |
| Baseline suite | 393/393 (42 files) |
| Typecheck / Build / Secret scan | PASS / PASS / clean |

## Findings

| ID | Class | Summary | Status |
|---|---|---|---|
| D-1 | D | `xp_transactions.amount` no non-negative CHECK (negative XP insertable) | FIXED |
| B-fixed | B | Same invariant missing on `total_xp` / `current_value` / `delta` / `current_level` | FIXED |
| C-1 | C | Local test infra uses superuser role (production uses dedicated app role) | Documented |

## D Fix Protocol (executed)

1. **Reproduce** — direct insert `-1/-50/-999999999` → ACCEPTED.
2. **Root cause** — schema `integer("amount").notNull()` with no `check()`.
3. **Minimal fix** — `check("xp_transactions_amount_nonnegative", amount >= 0)`
   + 4 sibling CHECKs; migration `0002_majestic_exiles.sql`.
4. **Regression** — `stage25-db-invariants.test.ts` (33 tests).
5. **Full regression** — 426/426.
6. **Re-attack** — negative → 23514; positive/zero accepted; XP paths work.

## Failure / Attack Matrix (executed)

| Attack | Expected | Observed | Result |
|---|---|---|---|
| Insert negative XP (direct) | reject | 23514 CHECK | ✅ (was accepted — D fixed) |
| Insert negative total_xp | reject | 23514 | ✅ |
| Insert current_level 0 | reject | 23514 | ✅ |
| Insert negative attribute value | reject | 23514 | ✅ |
| Insert negative history delta | reject | 23514 | ✅ |
| Decimal amount 1.5 | reject (no truncation) | 22P02 | ✅ |
| String/boolean amount | reject | 22P02 | ✅ |
| Integer overflow 2147483648 | reject | 22003 | ✅ |
| NaN/Infinity/negative via awardXp | ignored (no txn) | ledger unchanged | ✅ |
| Body XP injection (complete) | ignored | reward server-derived | ✅ |
| Fabricated/foreign quest id | 404 | 404 | ✅ |
| Duplicate idempotency key | reject | UNIQUE | ✅ |
| COMPLETED → progress | 400 | 400 | ✅ |
| Progress → COMPLETED / award | never | never | ✅ |
| Replay completion | 0 XP | alreadyAwarded | ✅ |
| Concurrent completion ×3 | once | +1 award | ✅ |
| Concurrent like/follow | once | 1 row | ✅ |
| Orphan child (missing user) | reject | FK | ✅ |
| Forged createdAt | ignored | current time | ✅ |

## Guarantee Boundaries

- **Application** — sanitization + state machines + server-derived rewards.
- **Database** — CHECK/FK/UNIQUE for app role and superuser.
- **Privileged admin** — a DBA can `ALTER TABLE … DROP CONSTRAINT` (inherent).
- **Infrastructure** — backup/PITR/RPO/RTO outside repo (Stage 24).

## Regression

- Stage 25 suite: 33/33
- Full suite: 426/426 (43 files)
- Typecheck: PASS · Build: PASS · Secret scan: clean
- Migration: 3 journal entries, idempotent, zero pre-existing violations
- Stage 21/21.1/22/23/24 all GREEN

## Residual (non-blocking)

- C-1: local test infra connects as superuser (embedded-postgres); production
  uses a dedicated non-superuser app role via DATABASE_URL.
