import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  aiDailyTasksTable,
  aiUserGoalsTable,
  archetypesTable,
  questTemplatesTable,
  userAttributesTable,
  userCharactersTable,
  userGoalsTable,
  userLevelsTable,
  userQuestsTable,
  xpTransactionsTable,
  ATTRIBUTES,
} from "@workspace/db/schema";
import type {
  AnalyticsState,
  Attribute,
  ComebackStatus,
  DailyTaskRecord,
  QuestRecord,
  QuestTemplate,
  XpEvent,
} from "./types";
import { isAttribute } from "./templates";
import { dayKey, emptyAttributes, getRankName, weakestOf } from "./state";

const DAY_MS = 24 * 60 * 60 * 1000;
const XP_WINDOW_DAYS = 90;
const QUEST_ROW_LIMIT = 100;
const TASK_WINDOW_DAYS = 90;

// ── Pure streak helpers (deterministic) ──────────────────────────────────────

/** Longest run of consecutive active day keys within the set. */
export function computeLongestStreak(activeDays: Set<string>): number {
  if (activeDays.size === 0) return 0;
  const sorted = [...activeDays].sort();
  let longest = 0;
  let run = 0;
  let prevMs = 0;
  for (const day of sorted) {
    const ms = Date.parse(`${day}T00:00:00Z`);
    if (prevMs !== 0 && ms - prevMs === DAY_MS) {
      run++;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prevMs = ms;
  }
  return longest;
}

/** Active days missed in the last `windowDays` (excluding today). */
export function computeMissedDays(activeDays: Set<string>, now: Date, windowDays = 30): number {
  let missed = 0;
  for (let i = 1; i <= windowDays; i++) {
    const d = dayKey(new Date(now.getTime() - i * DAY_MS));
    if (!activeDays.has(d)) missed++;
  }
  return missed;
}

/** Comeback classification from inactivity (never erases progress). */
export function comebackStatusOf(inactiveDays: number): ComebackStatus {
  if (inactiveDays >= 14) return "restart";
  if (inactiveDays >= 7) return "comeback";
  if (inactiveDays >= 3) return "re_entry";
  return "none";
}

// ── Analytics state loader (bounded, index-friendly) ─────────────────────────

export async function buildAnalyticsState(userId: string): Promise<AnalyticsState> {
  const now = new Date();
  const xpSince = new Date(now.getTime() - XP_WINDOW_DAYS * DAY_MS);
  const taskSince = new Date(now.getTime() - TASK_WINDOW_DAYS * DAY_MS);

  const [levelRows, goalsRows, goalKeyRows, attrRows, charRows, xpRows, questRows, taskRows] =
    await Promise.all([
      db.select().from(userLevelsTable).where(eq(userLevelsTable.userId, userId)).limit(1),
      db.select().from(aiUserGoalsTable).where(eq(aiUserGoalsTable.userId, userId)).limit(1),
      db.select().from(userGoalsTable).where(eq(userGoalsTable.userId, userId)),
      db.select().from(userAttributesTable).where(eq(userAttributesTable.userId, userId)),
      db.select({ archetypeId: userCharactersTable.archetypeId })
        .from(userCharactersTable).where(eq(userCharactersTable.userId, userId)).limit(1),
      db.select({
        amount: xpTransactionsTable.amount,
        createdAt: xpTransactionsTable.createdAt,
        sourceType: xpTransactionsTable.sourceType,
        category: xpTransactionsTable.category,
      })
        .from(xpTransactionsTable)
        .where(and(eq(xpTransactionsTable.userId, userId), gte(xpTransactionsTable.createdAt, xpSince)))
        .orderBy(desc(xpTransactionsTable.createdAt))
        .limit(500),
      db.select({
        id: userQuestsTable.id,
        templateId: userQuestsTable.questTemplateId,
        status: userQuestsTable.status,
        category: questTemplatesTable.category,
        difficulty: questTemplatesTable.difficulty,
        assignedAt: userQuestsTable.assignedAt,
        completedAt: userQuestsTable.completedAt,
      })
        .from(userQuestsTable)
        .leftJoin(questTemplatesTable, eq(userQuestsTable.questTemplateId, questTemplatesTable.id))
        .where(eq(userQuestsTable.userId, userId))
        .orderBy(desc(userQuestsTable.assignedAt))
        .limit(QUEST_ROW_LIMIT),
      db.select({
        date: aiDailyTasksTable.date,
        category: aiDailyTasksTable.category,
        isCompleted: aiDailyTasksTable.isCompleted,
        completedAt: aiDailyTasksTable.completedAt,
        xpReward: aiDailyTasksTable.xpReward,
      })
        .from(aiDailyTasksTable)
        .where(and(eq(aiDailyTasksTable.userId, userId), gte(aiDailyTasksTable.createdAt, taskSince)))
        .orderBy(desc(aiDailyTasksTable.createdAt))
        .limit(500),
    ]);

  const level = levelRows[0]?.currentLevel ?? 1;
  const totalXp = levelRows[0]?.totalXp ?? 0;

  const attributes = emptyAttributes();
  for (const a of attrRows) {
    if (isAttribute(a.attribute)) attributes[a.attribute] = a.currentValue;
  }

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

  // XP events + active days.
  const xpEvents: XpEvent[] = xpRows.map((r) => ({
    amount: r.amount,
    createdAt: r.createdAt,
    sourceType: r.sourceType,
    category: r.category,
  }));
  const activeDays = new Set<string>(xpEvents.map((e) => dayKey(e.createdAt)));

  // Streaks / inactivity.
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - DAY_MS));
  let currentStreak = 0;
  const cursor = activeDays.has(today) ? today : yesterday;
  if (activeDays.has(cursor)) {
    let d = new Date(`${cursor}T00:00:00Z`);
    while (activeDays.has(dayKey(d))) {
      currentStreak++;
      d = new Date(d.getTime() - DAY_MS);
    }
  }
  const longestStreak = computeLongestStreak(activeDays);

  let inactiveDays = 0;
  if (xpEvents.length > 0) {
    inactiveDays = Math.max(0, Math.floor((now.getTime() - xpEvents[0].createdAt.getTime()) / DAY_MS));
  }
  const missedDays = computeMissedDays(activeDays, now, 30);
  const comebackStatus = comebackStatusOf(inactiveDays);

  // Quests.
  const quests: QuestRecord[] = questRows.map((r) => ({
    id: r.id,
    templateId: r.templateId,
    status: r.status as QuestRecord["status"],
    category: r.category ?? "",
    difficulty: r.difficulty ?? "MEDIUM",
    assignedAt: r.assignedAt,
    completedAt: r.completedAt,
  }));

  // Daily tasks + completion trend.
  const dailyTasks: DailyTaskRecord[] = taskRows.map((t) => ({
    date: t.date,
    category: t.category,
    isCompleted: t.isCompleted,
    completedAt: t.completedAt,
    xpReward: t.xpReward,
  }));

  const since7dMs = now.getTime() - 7 * DAY_MS;
  const since14dMs = now.getTime() - 14 * DAY_MS;
  let recentCompletions = 0;
  let priorCompletions = 0;
  for (const t of dailyTasks) {
    const ts = t.completedAt?.getTime();
    if (!ts) continue;
    if (ts >= since7dMs) recentCompletions++;
    else if (ts >= since14dMs) priorCompletions++;
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
    weakestAttribute: weakestOf(attributes),
    archetypeFocusAreas,
    xpEvents,
    activeDays,
    currentStreak,
    longestStreak,
    inactiveDays,
    missedDays,
    comebackStatus,
    quests,
    dailyTasks,
    completionTrend,
  };
}

/** Active quest templates for the recommendation / rotation engines. */
export async function loadActiveQuestTemplates(): Promise<QuestTemplate[]> {
  const rows = await db
    .select()
    .from(questTemplatesTable)
    .where(eq(questTemplatesTable.status, "ACTIVE"))
    .orderBy(questTemplatesTable.createdAt);

  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    difficulty: t.difficulty,
    primaryAttributes: Array.isArray(t.primaryAttributes)
      ? (t.primaryAttributes as unknown[]).filter(isAttribute)
      : [],
    compatibleGoals: Array.isArray(t.compatibleGoals)
      ? (t.compatibleGoals as string[])
      : [],
  }));
}

export { ATTRIBUTES };
