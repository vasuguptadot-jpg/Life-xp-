import pg from "pg";
import app from "./app";
import { logger } from "./lib/logger";

// Verify database connectivity at startup
async function checkDb(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    logger.warn("DATABASE_URL not set — skipping DB connectivity check");
    return;
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("SELECT 1");
  await client.end();
  logger.info("Database connectivity verified");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

checkDb()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Database connectivity check failed — server will not start");
    process.exit(1);
  });
