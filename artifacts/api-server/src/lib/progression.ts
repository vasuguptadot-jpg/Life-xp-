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

  // Sanitize inputs: only positive XP on a known attribute is a valid award.
  // Negative/zero/unknown attribute deltas would otherwise decrement
  // user_attributes.currentValue (breaking monotonicity) and pollute history.
  const safeAttributes = attributes.filter(
    (a) => isValidAttribute(a.attribute) && a.xp > 0 && Number.isFinite(a.xp),
  );

  // 1. Record XP transaction (positive finite only; negative/NaN/Infinity are
  //    ignored rather than awarded — see sanitization note above).
  let transaction = null;
  if (xp > 0 && Number.isFinite(xp)) {
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
  if (xp > 0 && Number.isFinite(xp)) {
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
  for (const attr of safeAttributes) {
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
 * True if the error (or its cause chain) is a PostgreSQL unique-constraint
 * violation with the given constraint name.
 */
function isUniqueViolation(err: unknown, constraint: string): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const e = cur as { code?: string; message?: string; constraint?: string; cause?: unknown };
    if (e.code === "23505" && (e.constraint === constraint || (e.message ?? "").includes(constraint))) {
      return true;
    }
    cur = e.cause;
  }
  return false;
}

/**
 * Award XP inside an ALREADY-OPEN transaction owned by the caller.
 *
 * This is the atomicity primitive: a caller can put the business mutation that
 * *earns* the reward (e.g. marking a quest COMPLETED) in the SAME transaction
 * as the reward itself, so a failure can never leave a half-applied state such
 * as "quest complete but XP missing". Performs the idempotency check inside the
 * transaction so replays are still safe.
 */
export async function awardXpInTransaction(tx: DbOrTx, params: AwardXpParams): Promise<AwardXpResult> {
  const { idempotencyKey } = params;
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

  try {
    return await db.transaction(async (tx) => awardXpInTransaction(tx, params));
  } catch (err) {
    // Under high concurrency two transactions can both pass the inner re-check
    // (READ COMMITTED) and both attempt the INSERT; the unique constraint on
    // idempotency_key is the final safety net. Treat that race as "already
    // awarded" rather than surfacing a 500. Best-effort re-query for the
    // winning transaction (it may not be committed yet); the unique constraint
    // guarantees the award happened exactly once regardless.
    if (idempotencyKey && isUniqueViolation(err, "xp_transactions_idempotency_key_unique")) {
      try {
        const [existing] = await db
          .select()
          .from(xpTransactionsTable)
          .where(eq(xpTransactionsTable.idempotencyKey, idempotencyKey))
          .limit(1);
        return { transaction: existing ?? null, levelRow: null, attributeResults: [], alreadyAwarded: true };
      } catch {
        return { transaction: null, levelRow: null, attributeResults: [], alreadyAwarded: true };
      }
    }
    throw err;
  }
}
