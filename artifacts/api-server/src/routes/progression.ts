import { Router } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  xpTransactionsTable,
  userLevelsTable,
  userAttributesTable,
  attributeHistoryTable,
  ATTRIBUTES,
  type Attribute,
} from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

function calculateLevel(totalXp: number): number {
  return Math.floor(Math.sqrt(totalXp / 100)) + 1;
}

function isValidAttribute(attr: string): attr is Attribute {
  return (ATTRIBUTES as readonly string[]).includes(attr);
}

// POST /api/progression/award
router.post("/award", async (req, res) => {
  const userId = req.user!.sub;
  const {
    sourceType,
    sourceId,
    idempotencyKey,
    xp = 0,
    category,
    attributes = [],
    description,
  } = req.body ?? {};

  if (!sourceType) {
    res.status(400).json({ message: "sourceType is required" });
    return;
  }
  if (xp < 0) {
    res.status(400).json({ message: "Global XP cannot be negative" });
    return;
  }
  for (const a of attributes) {
    if (a.xp <= 0) {
      res.status(400).json({ message: "Attribute XP must be positive" });
      return;
    }
    if (!isValidAttribute(a.attribute)) {
      res.status(400).json({ message: `Invalid attribute: ${a.attribute}` });
      return;
    }
  }

  // Idempotency check
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(xpTransactionsTable)
      .where(eq(xpTransactionsTable.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) {
      res.json({ success: true, message: "Duplicate event – XP already awarded", transaction: existing });
      return;
    }
  }

  const result = await db.transaction(async (tx) => {
    // 1. Record XP transaction
    let transaction = null;
    if (xp > 0) {
      [transaction] = await tx
        .insert(xpTransactionsTable)
        .values({ userId, amount: xp, sourceType, sourceId, idempotencyKey, category, description })
        .returning();
    }

    // 2. Upsert user level with incremented XP
    let levelRow = null;
    let levelUp = false;
    if (xp > 0) {
      const [existing] = await tx
        .select()
        .from(userLevelsTable)
        .where(eq(userLevelsTable.userId, userId))
        .limit(1);

      const prevLevel = existing?.currentLevel ?? 1;
      const newTotalXp = (existing?.totalXp ?? 0) + xp;
      const newLevel = calculateLevel(newTotalXp);

      if (existing) {
        [levelRow] = await tx
          .update(userLevelsTable)
          .set({ totalXp: newTotalXp, currentLevel: newLevel, updatedAt: new Date() })
          .where(eq(userLevelsTable.userId, userId))
          .returning();
      } else {
        [levelRow] = await tx
          .insert(userLevelsTable)
          .values({ userId, totalXp: newTotalXp, currentLevel: newLevel })
          .returning();
      }

      levelUp = newLevel > prevLevel;
    }

    // 3. Award attribute XP (skip duplicates by sourceId)
    const attributeResults: { attribute: string; newValue: number }[] = [];
    for (const attr of attributes as { attribute: Attribute; xp: number }[]) {
      if (sourceId) {
        const [dup] = await tx
          .select({ id: attributeHistoryTable.id })
          .from(attributeHistoryTable)
          .where(
            eq(attributeHistoryTable.sourceId, sourceId),
          )
          .limit(1);
        if (dup) continue;
      }

      const [attrRow] = await tx
        .insert(userAttributesTable)
        .values({ userId, attribute: attr.attribute, currentValue: attr.xp })
        .onConflictDoUpdate({
          target: [userAttributesTable.userId, userAttributesTable.attribute],
          set: {
            currentValue: sql`${userAttributesTable.currentValue} + ${attr.xp}`,
            updatedAt: new Date(),
          },
        })
        .returning();

      await tx.insert(attributeHistoryTable).values({
        userId,
        attribute: attr.attribute,
        delta: attr.xp,
        sourceType,
        sourceId,
      });

      attributeResults.push({ attribute: attr.attribute, newValue: attrRow.currentValue });
    }

    return { transaction, levelRow: levelRow ? { ...levelRow, levelUp } : null, attributeResults };
  });

  res.json({ success: true, ...result });
});

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
