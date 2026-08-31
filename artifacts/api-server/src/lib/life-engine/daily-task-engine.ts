import { and, eq } from "drizzle-orm";
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

  const existing = await db
    .select()
    .from(aiDailyTasksTable)
    .where(and(eq(aiDailyTasksTable.userId, userId), eq(aiDailyTasksTable.date, today)));

  if (existing.length > 0) {
    return existing.map((t) => ({
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

  const state = await buildEngineState(userId);
  const chosen = selectTasks(state, DAILY_TASK_COUNT);

  const rows = await db
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
