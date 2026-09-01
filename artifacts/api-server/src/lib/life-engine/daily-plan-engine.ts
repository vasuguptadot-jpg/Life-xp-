import type { GeneratedDailyTask } from "./daily-task-engine";
import type {
  AnalyticsState,
  DifficultyRecommendation,
  DailyPlan,
  MomentumResult,
  RecoveryMode,
} from "./types";
import { dayKey } from "./state";

/**
 * Daily Plan Engine — composes the day's deterministic tasks with difficulty,
 * recovery, momentum, and a single focus area. Every field has an explainable
 * reason.
 */
export function buildDailyPlan(
  state: AnalyticsState,
  tasks: GeneratedDailyTask[],
  difficulty: DifficultyRecommendation,
  recovery: RecoveryMode,
  momentum: MomentumResult,
): DailyPlan {
  const focusArea = state.weakestAttribute ?? state.archetypeFocusAreas[0] ?? null;

  // In recovery mode, reduce the daily workload to the count the Recovery
  // Engine recommends — otherwise the plan would claim "small, achievable"
  // while still listing the full task set.
  const plannedTasks = recovery.active ? tasks.slice(0, recovery.suggestedDailyTasks) : tasks;

  const totalXp = plannedTasks.reduce((sum, t) => sum + t.xpReward, 0);
  const estimatedEffort: DailyPlan["estimatedEffort"] =
    totalXp >= 150 ? "high" : totalXp >= 90 ? "moderate" : "low";

  const priority = recovery.active
    ? "Recover consistency with a small, achievable plan"
    : momentum.direction === "falling"
      ? "Stabilize momentum before pushing harder"
      : focusArea
        ? `Focus on ${focusArea.toLowerCase()} to close your biggest gap`
        : "Maintain balanced progress across attributes";

  const reasons: string[] = [];
  reasons.push(difficulty.reason);
  if (recovery.active && recovery.reason) reasons.push(recovery.reason);
  if (focusArea) reasons.push(`Focus area: ${focusArea.toLowerCase()} (your weakest trained area)`);

  return {
    date: dayKey(new Date()),
    priority,
    tasks: plannedTasks.map((t) => ({
      id: t.id,
      taskText: t.taskText,
      category: t.category,
      xpReward: t.xpReward,
    })),
    recommendedDifficulty: recovery.active ? recovery.suggestedDifficulty : difficulty.recommended,
    estimatedEffort,
    focusArea,
    recoveryMode: recovery.active,
    reason: reasons.join(" "),
  };
}
