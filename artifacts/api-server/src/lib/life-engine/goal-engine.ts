import { GENERIC_GOAL, GOAL_LIBRARY, type GoalTemplate } from "./templates";
import type { AnalyticsState, DecomposedGoal } from "./types";

/**
 * Goal Decomposition Engine — converts broad goals into deterministic,
 * predefined milestone → weekly-objective → daily-quest structures. No LLM.
 *
 * A goal is matched by its structured key first, then by free-text keywords,
 * then falls back to a generic decomposition.
 */
export function decomposeGoals(state: AnalyticsState): DecomposedGoal[] {
  // Structured goal keys take precedence.
  const goals: DecomposedGoal[] = [];
  const seen = new Set<string>();

  for (const key of state.goalKeys) {
    const template = GOAL_LIBRARY.find((g) => g.key === key);
    if (template && !seen.has(template.key)) {
      goals.push(toDecomposed(template));
      seen.add(template.key);
    }
  }

  // Free-text goal: keyword match to a library category (fallback to generic).
  if (state.goalsText.trim().length > 0) {
    const text = state.goalsText.toLowerCase();
    let matched: GoalTemplate | undefined;
    for (const t of GOAL_LIBRARY) {
      if (t.keywords.some((kw) => text.includes(kw))) {
        matched = t;
        break;
      }
    }
    if (matched && !seen.has(matched.key)) {
      goals.push(toDecomposed(matched));
      seen.add(matched.key);
    }
  }

  if (goals.length === 0) {
    goals.push(toDecomposed(GENERIC_GOAL));
  }

  return goals;
}

function toDecomposed(t: GoalTemplate): DecomposedGoal {
  return {
    key: t.key,
    goal: t.goal,
    milestones: t.milestones.map((m) => ({
      title: m.title,
      weeklyObjectives: [...m.weeklyObjectives],
    })),
  };
}
