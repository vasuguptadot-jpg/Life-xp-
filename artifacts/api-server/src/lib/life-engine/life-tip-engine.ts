import { and, eq, sql } from "drizzle-orm";
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

  // Same concurrency hazard as daily-task generation: serialize the
  // check-then-insert per (user, date) with an advisory lock so two concurrent
  // first-calls cannot mint duplicate tip rows.
  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tip:${userId}:${today}`}))`);

    const [existing] = await tx
      .select()
      .from(aiDailyTipsTable)
      .where(and(eq(aiDailyTipsTable.userId, userId), eq(aiDailyTipsTable.date, today)))
      .limit(1);

    if (existing) return existing;

    const state = await buildEngineState(userId);
    const rule = detectTipRule(state);
    const entries = TIP_LIBRARY[rule];
    const entry = entries[pickByHash(entries, userId, today)] ?? entries[0];

    const [inserted] = await tx
      .insert(aiDailyTipsTable)
      .values({ userId, date: today, tip: entry.tip, category: entry.category })
      .returning();

    return inserted;
  });

  return {
    id: row.id,
    date: row.date,
    tip: row.tip,
    category: row.category,
    createdAt: row.createdAt,
  };
}
