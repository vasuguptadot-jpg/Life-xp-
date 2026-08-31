import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { aiDailyTipsTable } from "@workspace/db/schema";
import { TIP_LIBRARY } from "./templates";
import { detectTipRule, pickByHash } from "./scoring";
import { buildEngineState, dayKey } from "./state";

export interface GeneratedLifeTip {
  id: string;
  date: string;
  tip: string;
  category: string;
  createdAt: Date;
}

/**
 * Deterministic Life Tip Engine.
 *
 * Selects a rule-matched tip from a curated library based on real user state
 * (inactivity, streak, completion trend, weakness). Always produces a valid
 * result without Groq. The rule is deterministic; the concrete tip is chosen by
 * a date-hash rotation so it varies day-to-day yet stays reproducible.
 */
export async function generateDailyTip(userId: string): Promise<GeneratedLifeTip> {
  const today = dayKey(new Date());

  const [existing] = await db
    .select()
    .from(aiDailyTipsTable)
    .where(and(eq(aiDailyTipsTable.userId, userId), eq(aiDailyTipsTable.date, today)))
    .limit(1);

  if (existing) {
    return {
      id: existing.id,
      date: existing.date,
      tip: existing.tip,
      category: existing.category,
      createdAt: existing.createdAt,
    };
  }

  const state = await buildEngineState(userId);
  const rule = detectTipRule(state);
  const entries = TIP_LIBRARY[rule];
  const entry = entries[pickByHash(entries, userId, today)] ?? entries[0];

  const [row] = await db
    .insert(aiDailyTipsTable)
    .values({ userId, date: today, tip: entry.tip, category: entry.category })
    .returning();

  return {
    id: row.id,
    date: row.date,
    tip: row.tip,
    category: row.category,
    createdAt: row.createdAt,
  };
}
