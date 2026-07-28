/**
 * Progression routes — read-only for clients.
 *
 * The public POST /progression/award endpoint has been REMOVED.
 * XP is awarded exclusively through verified server-side events
 * (e.g. quest completion) via the internal awardXp() service.
 */
import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  xpTransactionsTable,
  userLevelsTable,
  userAttributesTable,
} from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

// GET /api/progression/summary
router.get("/summary", async (req, res) => {
  const userId = req.user!.sub;

  const [levelRows, attributes, recentTx] = await Promise.all([
    db.select().from(userLevelsTable).where(eq(userLevelsTable.userId, userId)).limit(1),
    db.select().from(userAttributesTable).where(eq(userAttributesTable.userId, userId)),
    db
      .select()
      .from(xpTransactionsTable)
      .where(eq(xpTransactionsTable.userId, userId))
      .orderBy(desc(xpTransactionsTable.createdAt))
      .limit(10),
  ]);

  const level = levelRows[0] ?? { currentLevel: 1, totalXp: 0 };
  res.json({ level, attributes, recentTransactions: recentTx });
});

export default router;
