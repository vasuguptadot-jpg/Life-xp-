import { DAILY_TASK_COUNT } from "./templates";
import type { AnalyticsState, MomentumResult, RecoveryMode } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function recentAbandoned(state: AnalyticsState): number {
  const since30d = Date.now() - 30 * DAY_MS;
  return state.quests.filter((q) => q.status === "ABANDONED" && q.assignedAt.getTime() >= since30d).length;
}

/**
 * Recovery Engine — reduces pressure when the system detects repeated failure,
 * a broken streak, declining activity, or unusually low recent XP. It never
 * resets progress; it only lowers the near-term workload and difficulty.
 */
export function detectRecoveryMode(
  state: AnalyticsState,
  momentum: MomentumResult,
): RecoveryMode {
  const abandoned = recentAbandoned(state);

  // Broken streak after previously building one.
  if (state.currentStreak === 0 && state.longestStreak >= 3 && state.inactiveDays >= 1) {
    return {
      active: true,
      reason: `Streak of ${state.longestStreak} days was broken after ${state.inactiveDays} inactive day(s).`,
      level: "full",
      suggestedDailyTasks: 3,
      suggestedDifficulty: "EASY",
      priority: "low_pressure",
    };
  }

  // Repeated quest abandonment (failure signal).
  if (abandoned >= 2) {
    return {
      active: true,
      reason: `${abandoned} abandoned quests recently — easing workload to rebuild consistency.`,
      level: "full",
      suggestedDailyTasks: 3,
      suggestedDifficulty: "EASY",
      priority: "recovery",
    };
  }

  // Declining activity / unusually low recent XP (vs prior period).
  if (momentum.score < 35 && momentum.direction === "falling") {
    return {
      active: true,
      reason: "Recent activity is declining — lowering pressure to protect consistency.",
      level: "light",
      suggestedDailyTasks: 4,
      suggestedDifficulty: "EASY",
      priority: "consistency",
    };
  }

  return {
    active: false,
    reason: null,
    level: "none",
    suggestedDailyTasks: DAILY_TASK_COUNT,
    suggestedDifficulty: "MEDIUM",
    priority: "consistency",
  };
}
