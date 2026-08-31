import { TASK_TEMPLATES, levelDifficulty } from "./templates";
import { scoreCandidateFactors } from "./scoring";
import type {
  AnalyticsState,
  Attribute,
  EngineUserState,
  QuestTemplate,
  Recommendation,
  RecommendationReasonCode,
} from "./types";

/**
 * Recommendation Engine — transparent weighted scoring with human-readable
 * reason codes. Extends the daily-task scoring pattern to both task templates
 * and quest templates. Every score is explainable.
 */

interface Factors {
  goalRelevance: number;
  difficultyFit: number;
  weakness: number;
  freshness: number;
  streak: number;
  archetype: number;
}

function reasonCodes(
  f: Factors,
  category: Attribute,
  state: EngineUserState,
  difficultyMatch: boolean,
): RecommendationReasonCode[] {
  const codes: RecommendationReasonCode[] = [];
  if (f.goalRelevance >= 0.7) codes.push("GOAL_RELEVANT");
  if (f.weakness >= 0.7) codes.push("WEAK_AREA");
  if (difficultyMatch || f.difficultyFit >= 0.7) codes.push("APPROPRIATE_DIFFICULTY");
  if (f.streak >= 0.7) codes.push("STREAK_PRESERVING");
  if (f.freshness >= 0.6) codes.push("NOVEL");
  if (state.archetypeFocusAreas.includes(category)) codes.push("ARCHETYPE_ALIGNED");
  return codes;
}

/** Adapt an AnalyticsState to the shape the scoring functions expect. */
function asEngineState(state: AnalyticsState): EngineUserState {
  return {
    userId: state.userId,
    level: state.level,
    totalXp: state.totalXp,
    rank: state.rank,
    goalsText: state.goalsText,
    goalKeys: state.goalKeys,
    attributes: state.attributes,
    weakestAttribute: state.weakestAttribute,
    archetypeFocusAreas: state.archetypeFocusAreas,
    recentCategories: [],
    recentTaskTexts: new Set(),
    streak: state.currentStreak,
    inactiveDays: state.inactiveDays,
    completionTrend: state.completionTrend,
  };
}

/** Scored task-template recommendations (0–100) with reason codes. */
export function recommendTasks(state: AnalyticsState): Recommendation[] {
  const es = asEngineState(state);
  const scored: Recommendation[] = TASK_TEMPLATES.map((c) => {
    const f = scoreCandidateFactors(c, es);
    return {
      id: c.id,
      label: c.text,
      category: c.category,
      score: Math.round(f.total * 100),
      reasonCodes: reasonCodes(f, c.category, es, false),
    };
  });
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored;
}

/** Scored quest-template recommendations with reason codes. */
export function recommendQuests(state: AnalyticsState, templates: QuestTemplate[]): Recommendation[] {
  const es = asEngineState(state);
  const recommendedLevel = levelDifficulty(state.level);

  const scored: Recommendation[] = templates.map((t) => {
    const category = t.category as Attribute;
    const f: Factors = {
      goalRelevance: t.compatibleGoals.some((g) => state.goalKeys.includes(g)) ? 1 : 0.4,
      difficultyFit: t.difficulty === recommendedLevel ? 1 : 0.5,
      weakness:
        state.weakestAttribute !== null && t.primaryAttributes.includes(state.weakestAttribute)
          ? 1
          : 0.4,
      freshness: 0.7,
      streak: category === "DISCIPLINE" && state.currentStreak >= 1 ? 1 : 0.5,
      archetype: t.primaryAttributes.some((a) => state.archetypeFocusAreas.includes(a)) ? 1 : 0.4,
    };
    const total =
      0.25 * f.goalRelevance +
      0.2 * f.difficultyFit +
      0.2 * f.weakness +
      0.15 * f.freshness +
      0.1 * f.streak +
      0.1 * f.archetype;
    return {
      id: t.id,
      label: t.title,
      category: t.category,
      score: Math.round(total * 100),
      reasonCodes: reasonCodes(f, category, es, t.difficulty === recommendedLevel),
    };
  });
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored;
}
