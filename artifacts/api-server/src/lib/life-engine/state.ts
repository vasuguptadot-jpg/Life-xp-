import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  aiDailyTasksTable,
  aiUserGoalsTable,
  archetypesTable,
  attributeHistoryTable,
  userAttributesTable,
  userCharactersTable,
  userGoalsTable,
  userLevelsTable,
  userQuestsTable,
  xpTransactionsTable,
  ATTRIBUTES,
} from "@workspace/db/schema";
import type { Attribute, EngineUserState } from "./types";
import { isAttribute } from "./templates";

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function getRankName(level: number): string {
  if (level < 5) return "Initiate";
  if (level < 10) return "Adventurer";
  if (level < 20) return "Champion";
  if (level < 35) return "Hero";
  return "Legend";
}

function emptyAttributes(): Record<Attribute, number> {
  const out = {} as Record<Attribute, number>;
  for (const a of ATTRIBUTES) out[a] = 0;
  return out;
}

/**
 * Build the authoritative engine state for a user from real database rows.
 * All signals are derived from existing tables — no fabricated data.
 */
export async function buildEngineState(userId: string): Promise<EngineUserState> {
  const [levelRows, goalsRows, goalKeyRows, attrRows, charRows, txRows] = await Promise.all([
    db.select().from(userLevelsTable).where(eq(userLevelsTable.userId, userId)).limit(1),
    db.select().from(aiUserGoalsTable).where(eq(aiUserGoalsTable.userId, userId)).limit(1),
    db.select().from(userGoalsTable).where(eq(userGoalsTable.userId, userId)),
    db.select().from(userAttributesTable).where(eq(userAttributesTable.userId, userId)),
    db.select({ archetypeId: userCharactersTable.archetypeId })
      .from(userCharactersTable).where(eq(userCharactersTable.userId, userId)).limit(1),
    db.select({ createdAt: xpTransactionsTable.createdAt })
      .from(xpTransactionsTable).where(eq(xpTransactionsTable.userId, userId))
      .orderBy(desc(xpTransactionsTable.createdAt)).limit(400),
  ]);

  const level = levelRows[0]?.currentLevel ?? 1;
  const totalXp = levelRows[0]?.totalXp ?? 0;

  // Attributes map + weakest.
  const attributes = emptyAttributes();
  for (const a of attrRows) {
    if (isAttribute(a.attribute)) attributes[a.attribute] = a.currentValue;
  }
  let weakestAttribute: Attribute | null = null;
  let weakestValue = Number.POSITIVE_INFINITY;
  for (const a of ATTRIBUTES) {
    if (attributes[a] < weakestValue) {
      weakestValue = attributes[a];
      weakestAttribute = a;
    }
  }
  // No meaningful signal if every attribute is untrained (all zero).
  const allZero = ATTRIBUTES.every((a) => attributes[a] === 0);
  if (allZero) weakestAttribute = null;

  // Archetype focus areas.
  let archetypeFocusAreas: Attribute[] = [];
  const char = charRows[0];
  if (char) {
    const [arch] = await db
      .select({ focusAreas: archetypesTable.focusAreas })
      .from(archetypesTable).where(eq(archetypesTable.id, char.archetypeId)).limit(1);
    if (arch && Array.isArray(arch.focusAreas)) {
      archetypeFocusAreas = arch.focusAreas.filter(isAttribute);
    }
  }

  // Streak + inactivity from XP transaction timestamps.
  const txDates = txRows.map((t) => dayKey(t.createdAt));
  const activeDays = new Set(txDates);
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - DAY_MS));

  let streak = 0;
  const cursor = activeDays.has(today) ? today : yesterday;
  if (activeDays.has(cursor)) {
    let d = new Date(`${cursor}T00:00:00Z`);
    while (activeDays.has(dayKey(d))) {
      streak++;
      d = new Date(d.getTime() - DAY_MS);
    }
  }

  let inactiveDays = 0;
  if (txRows.length > 0) {
    const last = txRows[0].createdAt.getTime();
    inactiveDays = Math.max(0, Math.floor((now.getTime() - last) / DAY_MS));
  }

  // Recent categories (last 3 days) for freshness.
  const since3d = new Date(now.getTime() - 3 * DAY_MS);
  const recentAttrRows = await db
    .select({ attribute: attributeHistoryTable.attribute, createdAt: attributeHistoryTable.createdAt })
    .from(attributeHistoryTable)
    .where(and(eq(attributeHistoryTable.userId, userId), gte(attributeHistoryTable.createdAt, since3d)));
  const recentCategories: Attribute[] = [];
  for (const r of recentAttrRows) {
    if (isAttribute(r.attribute) && !recentCategories.includes(r.attribute)) {
      recentCategories.push(r.attribute);
    }
  }

  // Recently completed task texts (last 7 days) for repetition avoidance.
  const since7d = new Date(now.getTime() - 7 * DAY_MS);
  const recentTaskRows = await db
    .select({ taskText: aiDailyTasksTable.taskText })
    .from(aiDailyTasksTable)
    .where(
      and(
        eq(aiDailyTasksTable.userId, userId),
        eq(aiDailyTasksTable.isCompleted, true),
        gte(aiDailyTasksTable.completedAt, since7d),
      ),
    );
  const recentTaskTexts = new Set(recentTaskRows.map((t) => t.taskText));

  // Completion trend: recent 7 days vs prior 7 days.
  const completedRows = await db
    .select({ completedAt: aiDailyTasksTable.completedAt })
    .from(aiDailyTasksTable)
    .where(and(eq(aiDailyTasksTable.userId, userId), eq(aiDailyTasksTable.isCompleted, true)));
  const since7dMs = since7d.getTime();
  const since14dMs = now.getTime() - 14 * DAY_MS;
  let recentCompletions = 0;
  let priorCompletions = 0;
  for (const c of completedRows) {
    const t = c.completedAt?.getTime();
    if (!t) continue;
    if (t >= since7dMs) recentCompletions++;
    else if (t >= since14dMs) priorCompletions++;
  }
  const completionTrend: number | null =
    recentCompletions + priorCompletions >= 4 ? recentCompletions - priorCompletions : null;

  return {
    userId,
    level,
    totalXp,
    rank: getRankName(level),
    goalsText: goalsRows[0]?.goals ?? "",
    goalKeys: goalKeyRows.map((g) => g.goalKey),
    attributes,
    weakestAttribute,
    archetypeFocusAreas,
    recentCategories,
    recentTaskTexts,
    streak,
    inactiveDays,
    completionTrend,
  };
}

/** Number of the user's currently-active quests (for intent responses). */
export async function countActiveQuests(userId: string): Promise<number> {
  const rows = await db
    .select({ id: userQuestsTable.id })
    .from(userQuestsTable)
    .where(
      and(
        eq(userQuestsTable.userId, userId),
        eq(userQuestsTable.status, "IN_PROGRESS"),
      ),
    );
  return rows.length;
}

/** Number of daily tasks completed today (for intent responses). */
export async function countCompletedToday(userId: string): Promise<number> {
  const today = dayKey(new Date());
  const rows = await db
    .select({ id: aiDailyTasksTable.id })
    .from(aiDailyTasksTable)
    .where(
      and(
        eq(aiDailyTasksTable.userId, userId),
        eq(aiDailyTasksTable.date, today),
        eq(aiDailyTasksTable.isCompleted, true),
      ),
    );
  return rows.length;
}
