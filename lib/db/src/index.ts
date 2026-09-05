import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { hostname } from "node:os";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// A database outage/restart terminates idle pool connections, which then emit
// 'error' events. Without a listener, Node treats an unhandled 'error' event as
// a fatal exception and CRASHES the whole process — a single PostgreSQL restart
// would take the API server down. Attaching a handler (and only logging) makes
// the failure observable and lets the pool reconnect once PostgreSQL returns.
//
// The @workspace/db package has no logger dependency, so we emit a single JSON
// line shaped like pino's default key set (level/time/pid/hostname) so log
// aggregators treat it uniformly with the API server's structured logs.
pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      level: 50, // error
      time: Date.now(),
      pid: process.pid,
      hostname: hostname(),
      event: "database.pool.error",
      category: "database",
      message: err?.message ?? String(err),
    }),
  );
});

export const db = drizzle(pool, { schema });

export * from "./schema";
