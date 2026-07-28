/**
 * Vitest global setup — runs before every test file.
 *
 * Requires DATABASE_URL to be set. All tests that touch the DB are
 * integration tests; they create data with unique identifiers and clean up
 * after themselves to avoid cross-test pollution.
 */
import { afterAll, beforeAll } from "vitest";
import { pool } from "@workspace/db";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required to run integration tests. " +
        "Provision a database and set DATABASE_URL.",
    );
  }
  // Verify connectivity
  const client = await pool.connect();
  await client.query("SELECT 1");
  client.release();
});

afterAll(async () => {
  await pool.end();
});
