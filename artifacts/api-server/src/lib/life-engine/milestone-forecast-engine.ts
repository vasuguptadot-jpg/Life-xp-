import type { AnalyticsState, MilestoneForecast } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Milestone Forecast Engine — estimates when the next level is reached at the
 * current pace, using actual historical progression. Forecasts are always
 * labelled as estimates and never presented as guaranteed outcomes.
 */
export function forecastNextMilestone(state: AnalyticsState): MilestoneForecast {
  const xpToNext = Math.max(0, 100 * state.level * state.level - state.totalXp);

  // Average daily XP over the last 7 CALENDAR days. Dividing by calendar days
  // (not active days) keeps the "days from now" estimate honest: a user active
  // 3 of 7 days who earns 300 XP is really pacing at ~43 XP/day, not 100.
  const since7d = Date.now() - 7 * DAY_MS;
  let recentXp = 0;
  for (const e of state.xpEvents) {
    if (e.createdAt.getTime() >= since7d) recentXp += e.amount;
  }
  const dailyRate = recentXp / 7;

  let daysEstimated: number | null = null;
  let estimatedDate: string | null = null;
  if (recentXp > 0 && xpToNext > 0) {
    // Exact integer arithmetic avoids floating-point ceil instability
    // (e.g. 300 / (300/7) drifting above 7.0).
    daysEstimated = Math.ceil((xpToNext * 7) / recentXp);
    estimatedDate = new Date(Date.now() + daysEstimated * DAY_MS).toISOString().split("T")[0];
  }

  return {
    milestone: `Level ${state.level + 1}`,
    xpNeeded: xpToNext,
    daysEstimated,
    estimatedDate,
    isEstimate: true,
    basis:
      recentXp > 0
        ? `Based on your average of ${Math.round(dailyRate)} XP/day over the last 7 days.`
        : "No recent activity — unable to estimate a date.",
  };
}
