import type { AnalyticsState, MomentumFactor, MomentumResult } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Momentum Engine — a transparent 0–100 score built from four explainable
 * factors. There is no black box; every factor is documented and weighted.
 *
 *   recent_xp      (40%) — XP earned in the last 7 days (200 XP/week = full).
 *   completion     (30%) — completion rate of daily tasks in the last 7 days.
 *   streak         (20%) — active streak (5 days = full).
 *   xp_trend       (10%) — 7-day XP vs prior 7-day XP (50 = flat baseline).
 *
 * direction compares recent (7d) vs prior (8–14d) XP with a 10% band.
 */
export function computeMomentum(state: AnalyticsState): MomentumResult {
  const now = Date.now();
  const since7d = now - 7 * DAY_MS;
  const since14d = now - 14 * DAY_MS;

  let recentXp = 0;
  let priorXp = 0;
  for (const e of state.xpEvents) {
    const t = e.createdAt.getTime();
    if (t >= since7d) recentXp += e.amount;
    else if (t >= since14d) priorXp += e.amount;
  }

  let completed = 0;
  let total = 0;
  for (const t of state.dailyTasks) {
    const ts = t.completedAt?.getTime();
    const created = Date.parse(`${t.date}T00:00:00Z`);
    if (created < since7d) continue;
    total++;
    if (t.isCompleted && ts) completed++;
  }
  const completionRate = total > 0 ? completed / total : 0;

  const recentXpScore = clamp((recentXp / 200) * 100);
  const completionScore = clamp(completionRate * 100);
  const streakScore = clamp(state.currentStreak * 20);
  // Trend factor: baseline 50, ±50 for ±200 XP/week delta. When there is no
  // activity in either window, there is no trend signal — contribute 0 rather
  // than a phantom "neutral 50".
  const xpTrendScore =
    recentXp === 0 && priorXp === 0 ? 0 : clamp(50 + ((recentXp - priorXp) / 200) * 50);

  const score = Math.round(
    0.4 * recentXpScore + 0.3 * completionScore + 0.2 * streakScore + 0.1 * xpTrendScore,
  );

  let direction: MomentumResult["direction"] = "stable";
  if (recentXp > priorXp * 1.1) direction = "rising";
  else if (recentXp < priorXp * 0.9 && priorXp > 0) direction = "falling";

  const factors: MomentumFactor[] = [
    { name: "recent_xp", value: Math.round(recentXpScore), weight: 0.4 },
    { name: "completion", value: Math.round(completionScore), weight: 0.3 },
    { name: "streak", value: Math.round(streakScore), weight: 0.2 },
    { name: "xp_trend", value: Math.round(xpTrendScore), weight: 0.1 },
  ];

  return { score, direction, factors };
}
