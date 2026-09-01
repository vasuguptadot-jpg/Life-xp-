/**
 * Internal progression service — NOT exposed as a public API.
 *
 * XP can only be awarded through this service, which is called by verified
 * server-side events (quest completion, etc.). Clients have no direct path
 * to award themselves arbitrary XP.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  xpTransactionsTable,
  userLevelsTable,
  userAttributesTable,
  attributeHistoryTable,
  ATTRIBUTES,
  type Attribute,
} from "@workspace/db/schema";

function calculateLevel(totalXp: number): number {
  return Math.floor(Math.sqrt(totalXp / 100)) + 1;
}

export function isValidAttribute(attr: string): attr is Attribute {
  return (ATTRIBUTES as readonly string[]).includes(attr);
}

export interface AttributeAward {
  attribute: Attribute;
  xp: number;
}

export interface AwardXpParams {
  userId: string;
  sourceType: string;
  sourceId?: string;
  idempotencyKey?: string;
  xp?: number;
  category?: string;
  description?: string;
  attributes?: AttributeAward[];
}

export interface AwardXpResult {
  transaction: typeof xpTransactionsTable.$inferSelect | null;
  levelRow: (typeof userLevelsTable.$inferSelect & { levelUp: boolean }) | null;
  attributeResults: { attribute: string; newValue: number }[];
  alreadyAwarded: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbOrTx = any;

/**
 * Core XP award logic — can run inside an existing transaction or standalone.
 * Does NOT perform an outer idempotency check; callers must handle that if needed.
 */
async function _awardXpCore(tx: DbOrTx, params: AwardXpParams): Promise<AwardXpResult> {
  const {
    userId,
    sourceType,
    sourceId,
    idempotencyKey,
    xp = 0,
    category,
    description,
    attributes = [],
  } = params;

  // 1. Record XP transaction
  let transaction = null;
  if (xp > 0) {
    [transaction] = await tx
      .insert(xpTransactionsTable)
      .values({ userId, amount: xp, sourceType, sourceId, idempotencyKey, category, description })
      .returning();
  }

  // 2. Upsert user level — atomically increment totalXp. A plain
  //    read-modify-write (SELECT totalXp → compute → UPDATE) loses concurrent
  //    awards under READ COMMITTED; the SQL increment is race-free, matching
  //    the attribute upsert below. Level is recomputed from the returned
  //    totalXp in a follow-up write (worst case it lags one increment under
  //    extreme concurrency, but XP is never lost).
  let levelRow = null;
  let levelUp = false;
  if (xp > 0) {
    [levelRow] = await tx
      .insert(userLevelsTable)
      .values({ userId, totalXp: xp, currentLevel: 1 })
      .onConflictDoUpdate({
        target: userLevelsTable.userId,
        set: {
          totalXp: sql`${userLevelsTable.totalXp} + ${xp}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    const prevLevel = levelRow.currentLevel;
    const newLevel = calculateLevel(levelRow.totalXp);
    levelUp = newLevel > prevLevel;
    if (levelUp) {
      [levelRow] = await tx
        .update(userLevelsTable)
        .set({ currentLevel: newLevel, updatedAt: new Date() })
        .where(eq(userLevelsTable.userId, userId))
        .returning();
    }
  }

  // 3. Award attribute XP — dedup by (sourceId, attribute) pair
  const attributeResults: { attribute: string; newValue: number }[] = [];
  for (const attr of attributes) {
    if (sourceId) {
      const [dup] = await tx
        .select({ id: attributeHistoryTable.id })
        .from(attributeHistoryTable)
        .where(
          and(
            eq(attributeHistoryTable.sourceId, sourceId),
            eq(attributeHistoryTable.attribute, attr.attribute),
          ),
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

  return { transaction, levelRow: levelRow ? { ...levelRow, levelUp } : null, attributeResults, alreadyAwarded: false };
}

/**
 * Award XP as a standalone operation (creates its own transaction).
 * Performs idempotency check before proceeding.
 */
export async function awardXp(params: AwardXpParams): Promise<AwardXpResult> {
  const { idempotencyKey } = params;

  // Fast outer idempotency check (before acquiring transaction)
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(xpTransactionsTable)
      .where(eq(xpTransactionsTable.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) {
      return { transaction: existing, levelRow: null, attributeResults: [], alreadyAwarded: true };
    }
  }

  return db.transaction(async (tx) => {
    // Re-check inside transaction to prevent races
    if (idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(xpTransactionsTable)
        .where(eq(xpTransactionsTable.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing) {
        return { transaction: existing, levelRow: null, attributeResults: [], alreadyAwarded: true };
      }
    }
    return _awardXpCore(tx, params);
  });
}
