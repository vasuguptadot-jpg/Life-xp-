import type { AnalyticsState, StreakAnalysis } from "./types";

/**
 * Streak Engine — deterministic streak analysis derived entirely from existing
 * activity data. No new tables, no randomness.
 */
export function analyzeStreak(state: AnalyticsState): StreakAnalysis {
  let streakRisk: StreakAnalysis["streakRisk"] = "none";
  if (state.currentStreak >= 1) {
    // An active streak that has not been extended today will break if today
    // passes with no activity.
    streakRisk = state.inactiveDays === 1 ? "high" : "low";
  }

  return {
    currentStreak: state.currentStreak,
    longestStreak: state.longestStreak,
    streakRisk,
    missedDays: state.missedDays,
    comebackStatus: state.comebackStatus,
  };
}
