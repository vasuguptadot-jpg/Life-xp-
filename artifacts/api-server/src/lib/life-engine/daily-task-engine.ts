import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { aiDailyTasksTable } from "@workspace/db/schema";
import { DAILY_TASK_COUNT, MAX_TASK_XP, MIN_TASK_XP } from "./templates";
import { selectTasks } from "./scoring";
import { buildEngineState, dayKey } from "./state";

export interface GeneratedDailyTask {
  id: string;
  date: string;
  taskText: string;
  category: string;
  xpReward: number;
  isCompleted: boolean;
  completedAt: Date | null;
  createdAt: Date;
}

/**
 * Deterministic Daily Task Engine.
 *
 * Generates the day's tasks from real user state using a template library and
 * weighted scoring. No LLM is involved in selection. Returns cached tasks when
 * they already exist for the day, and always produces a valid result without
 * Groq.
 */
export async function generateDailyTasks(userId: string): Promise<GeneratedDailyTask[]> {
  const today = dayKey(new Date());

  // The SELECT-then-INSERT below is NOT safe under concurrency: two requests at
  // the first call of a day would both observe "no tasks yet" and each insert
  // the full 5-task set — doubling the daily task count (and doubling the daily
  // XP a user can earn). A plain unique index on (user_id, date) cannot fix it
  // because all 5 tasks legitimately share the same (user_id, date). Serialize
  // generation with a Postgres advisory lock scoped to (user, date) instead.
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`task:${userId}:${today}`}))`);

    const existing = await tx
      .select()
      .from(aiDailyTasksTable)
      .where(and(eq(aiDailyTasksTable.userId, userId), eq(aiDailyTasksTable.date, today)));

    if (existing.length > 0) return existing;

    const state = await buildEngineState(userId);
    const chosen = selectTasks(state, DAILY_TASK_COUNT);

    return tx
      .insert(aiDailyTasksTable)
      .values(
        chosen.map((c) => ({
          userId,
          date: today,
          taskText: c.text,
          category: c.category,
          xpReward: Math.min(MAX_TASK_XP, Math.max(MIN_TASK_XP, c.xpReward)),
        })),
      )
      .returning();
  });

  return rows.map((t) => ({
    id: t.id,
    date: t.date,
    taskText: t.taskText,
    category: t.category,
    xpReward: t.xpReward,
    isCompleted: t.isCompleted,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
  }));
}
