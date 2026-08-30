# Stage 4 — Live Database Snapshot

## Status: LIVE_DATABASE_UNAVAILABLE

A live PostgreSQL database could not be inspected during Stage 4.

**Evidence:**

- `DATABASE_URL` is not set in the execution environment.
- No `PG*` environment variables are present.
- No PostgreSQL client/server binaries (`psql`, `pg_ctl`, `postgres`, `initdb`) are installed.
- The Debian package repositories (`deb.debian.org`) are unreachable from this
  sandbox, so a PostgreSQL server could not be installed for a local live check.
- Only the npm registry (`registry.npmjs.org`) is reachable.

**Consequence:**

The authoritative "live schema" could not be captured from a running database.
Per Stage 4 rules, the live-schema portion was **not** guessed or invented.

**Source of truth used instead:**

Because the live database was unavailable, the intended production database
contract was derived from the application's own code, which is a first-class
part of the contract:

1. `lib/db/src/schema/*` — Drizzle schema (source of truth for schema).
2. `lib/db/migrations/*` — committed migration history.
3. `artifacts/api-server/src/routes/*` — raw SQL (`db.execute(sql\`...\`)`) that
   production code executes against the database.

Every table/column referenced by production raw SQL was reconciled into the
schema and migration (see `STAGE4_DATABASE_RECONCILIATION.md`).

**Fresh-database validation** was performed against an embedded PostgreSQL 16
(PGlite) instead — see `STAGE4_FRESH_DATABASE_VALIDATION.md`.
