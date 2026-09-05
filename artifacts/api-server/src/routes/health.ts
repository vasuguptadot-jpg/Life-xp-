import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

/**
 * Liveness — "is the process alive?"
 * Never depends on external services: if this responds, the event loop is
 * running. Used by orchestrators to decide whether to restart the container.
 */
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Readiness — "can this instance actually serve requests?"
 * Checks the critical dependency (PostgreSQL) with a bounded SELECT 1.
 * Optional services (Groq/AI, object storage) are deliberately NOT checked:
 * a missing GROQ_API_KEY or storage sidecar must not take the instance offline
 * when deterministic (non-AI) functionality still works.
 */
router.get("/readyz", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", database: "up" });
  } catch (err) {
    logger.error(
      {
        event: "readiness.failed",
        category: "database",
        err: err instanceof Error ? err : new Error(String(err)),
      },
      "Readiness check failed — database unavailable",
    );
    res.status(503).json({ status: "unavailable", database: "down" });
  }
});

export default router;
