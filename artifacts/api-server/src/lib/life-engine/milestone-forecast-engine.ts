import type { AnalyticsState, MilestoneForecast } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Milestone Forecast Engine — estimates when the next level is reached at the
 * current pace, using actual historical progression. Forecasts are always
 * labelled as estimates and never presented as guaranteed outcomes.
 */
export function forecastNextMilestone(state: AnalyticsState): MilestoneForecast {
  const xpToNext = Math.max(0, 100 * state.level * state.level - state.totalXp);

  // Average daily XP over the last 7 days (or over available history).
  const since7d = Date.now() - 7 * DAY_MS;
  let recentXp = 0;
  let recentDays = 0;
  const daySums = new Map<string, number>();
  for (const e of state.xpEvents) {
    if (e.createdAt.getTime() < since7d) continue;
    const key = e.createdAt.toISOString().split("T")[0];
    daySums.set(key, (daySums.get(key) ?? 0) + e.amount);
  }
  for (const v of daySums.values()) {
    recentXp += v;
    recentDays++;
  }
  const dailyRate = recentDays > 0 ? recentXp / recentDays : 0;

  let daysEstimated: number | null = null;
  let estimatedDate: string | null = null;
  if (dailyRate > 0 && xpToNext > 0) {
    daysEstimated = Math.ceil(xpToNext / dailyRate);
    estimatedDate = new Date(Date.now() + daysEstimated * DAY_MS).toISOString().split("T")[0];
  }

  return {
    milestone: `Level ${state.level + 1}`,
    xpNeeded: xpToNext,
    daysEstimated,
    estimatedDate,
    isEstimate: true,
    basis:
      dailyRate > 0
        ? `Based on your average of ${Math.round(dailyRate)} XP/day over the last ${recentDays} active day(s).`
        : "No recent activity — unable to estimate a date.",
  };
}
