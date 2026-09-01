import { DIFFICULTY_LADDER, DIFFICULTY_XP, levelDifficulty } from "./templates";
import type { AnalyticsState, DifficultyLevel, DifficultyRecommendation } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Difficulty Engine — deterministic adaptive difficulty.
 *
 * Policy (bounded, never punishes failure):
 *   - high completion rate (>= 70%)  → increase difficulty
 *   - medium completion (40–70%)     → maintain
 *   - repeated failure (< 40%)       → decrease / recovery quest
 *
 * Adjustments move at most one step on the EASY→MEDIUM→HARD ladder.
 */
export function recommendDifficulty(state: AnalyticsState): DifficultyRecommendation {
  const since30d = Date.now() - 30 * DAY_MS;
  const resolved = state.quests.filter(
    (q) =>
      (q.status === "COMPLETED" || q.status === "ABANDONED") &&
      q.assignedAt.getTime() >= since30d,
  );
  const completed = resolved.filter((q) => q.status === "COMPLETED").length;

  const base = levelDifficulty(state.level);
  let adjustment: DifficultyRecommendation["adjustment"] = "maintain";
  let reason = "Not enough quest history yet — using level-based difficulty.";

  if (resolved.length >= 3) {
    const rate = completed / resolved.length;
    if (rate >= 0.7 && state.inactiveDays < 1) {
      adjustment = "increase";
      reason = `High completion rate (${Math.round(rate * 100)}%) — ready for a harder challenge.`;
    } else if (rate < 0.4) {
      adjustment = "decrease";
      reason = `Recent failures (${Math.round(rate * 100)}% completion) — easing difficulty to rebuild confidence.`;
    } else if (rate >= 0.7) {
      // High completion but not active today: the rate is stale relative to a
      // current gap in activity. Never escalate a user who is not active today.
      reason = `High completion rate (${Math.round(rate * 100)}%) but not active today — maintaining difficulty.`;
    } else {
      reason = `Stable completion rate (${Math.round(rate * 100)}%) — maintaining difficulty.`;
    }
  }

  const idx = DIFFICULTY_LADDER.indexOf(base);
  const nextIdx =
    adjustment === "increase"
      ? Math.min(DIFFICULTY_LADDER.length - 1, idx + 1)
      : adjustment === "decrease"
        ? Math.max(0, idx - 1)
        : idx;
  const recommended = DIFFICULTY_LADDER[nextIdx];

  return {
    recommended,
    xpReward: DIFFICULTY_XP[recommended],
    suggestedQuestType: state.weakestAttribute ?? state.archetypeFocusAreas[0] ?? "DISCIPLINE",
    previousLevel: base as DifficultyLevel,
    adjustment,
    reason,
  };
}
