import { ATTRIBUTES } from "@workspace/db/schema";
import type { AnalyticsState, MomentumResult, WeeklyReview } from "./types";
import { dayKey } from "./state";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Weekly Review Engine — deterministic 7-day summary. Pure computation over
 * bounded history; no AI.
 */
export function buildWeeklyReview(state: AnalyticsState, momentum: MomentumResult): WeeklyReview {
  const now = new Date();
  const since7d = now.getTime() - 7 * DAY_MS;

  let xpEarned = 0;
  for (const e of state.xpEvents) {
    if (e.createdAt.getTime() >= since7d) xpEarned += e.amount;
  }

  let questsCompleted = 0;
  for (const q of state.quests) {
    if (q.status === "COMPLETED" && q.completedAt && q.completedAt.getTime() >= since7d) {
      questsCompleted++;
    }
  }

  let completed = 0;
  let total = 0;
  for (const t of state.dailyTasks) {
    const created = Date.parse(`${t.date}T00:00:00Z`);
    if (created < since7d) continue;
    total++;
    if (t.isCompleted) completed++;
  }
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : null;

  // Strongest / weakest attribute by trained value.
  let strongest: (typeof ATTRIBUTES)[number] | null = null;
  let weakest: (typeof ATTRIBUTES)[number] | null = null;
  let maxVal = -1;
  let minVal = Number.POSITIVE_INFINITY;
  for (const a of ATTRIBUTES) {
    const v = state.attributes[a];
    if (v > maxVal) { maxVal = v; strongest = a; }
    if (v < minVal) { minVal = v; weakest = a; }
  }
  const allZero = ATTRIBUTES.every((a) => state.attributes[a] === 0);

  const recommendedFocus = allZero
    ? "Establish a baseline: complete at least one task daily this week."
    : weakest
      ? `Train ${weakest.toLowerCase()} — your least-developed area this week.`
      : "Keep a balanced split across attributes.";

  return {
    startDate: dayKey(new Date(now.getTime() - 6 * DAY_MS)),
    endDate: dayKey(now),
    xpEarned,
    questsCompleted,
    completionRate,
    streakPerformance: state.currentStreak,
    strongestArea: allZero ? null : strongest,
    weakestArea: allZero ? null : weakest,
    momentumTrend: momentum.direction,
    recommendedFocus,
    milestoneProgress: {
      level: state.level,
      totalXp: state.totalXp,
      xpToNextLevel: Math.max(0, 100 * state.level * state.level - state.totalXp),
    },
  };
}
