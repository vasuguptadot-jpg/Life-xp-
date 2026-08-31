import type { Attribute, EngineUserState, ScoredCandidate, TaskCandidate, TipRuleKey } from "./types";
import { GOAL_KEY_ATTRIBUTES, TASK_TEMPLATES, TIER_LEVEL, isAttribute } from "./templates";

/**
 * Deterministic scoring and rule-matching. Pure functions — no DB, no I/O, no
 * randomness. Identical inputs always produce identical outputs.
 */

// ── Daily task scoring ──────────────────────────────────────────────────────

const WEIGHTS = {
  goalRelevance: 0.25,
  difficultyFit: 0.2,
  weakness: 0.2,
  freshness: 0.15,
  streak: 0.1,
  archetype: 0.1,
} as const;

/** Attributes the user cares about, derived from structured goal keys. */
function goalAttributes(state: EngineUserState): Set<Attribute> {
  const out = new Set<Attribute>();
  for (const key of state.goalKeys) {
    for (const attr of GOAL_KEY_ATTRIBUTES[key] ?? []) out.add(attr);
  }
  return out;
}

function goalRelevanceScore(c: TaskCandidate, state: EngineUserState, goalAttrs: Set<Attribute>): number {
  if (state.goalsText.trim().length === 0 && state.goalKeys.length === 0) {
    // No goals set — neutral relevance for every category.
    return 0.5;
  }
  if (goalAttrs.has(c.category)) return 1;
  const goals = state.goalsText.toLowerCase();
  const kwMatch = c.keywords.some((kw) => goals.includes(kw));
  if (kwMatch) return 0.7;
  return 0.2;
}

function difficultyFitScore(c: TaskCandidate, state: EngineUserState): number {
  const rep = TIER_LEVEL[c.tier];
  return Math.max(0, 1 - Math.abs(state.level - rep) / 15);
}

function weaknessScore(c: TaskCandidate, state: EngineUserState): number {
  if (state.weakestAttribute === null) return 0.5;
  return c.category === state.weakestAttribute ? 1 : 0.3;
}

function freshnessScore(c: TaskCandidate, state: EngineUserState): number {
  // Never immediately repeat an identical completed task.
  if (state.recentTaskTexts.has(c.text)) return 0;
  if (state.recentCategories.includes(c.category)) return 0.4;
  return 1;
}

function streakScore(c: TaskCandidate, state: EngineUserState): number {
  // When a streak is live, habit (DISCIPLINE) tasks gain value as protection.
  if (c.category === "DISCIPLINE") return state.streak >= 1 ? 1 : 0.5;
  return 0.5;
}

function archetypeScore(c: TaskCandidate, state: EngineUserState): number {
  if (state.archetypeFocusAreas.length === 0) return 0.5;
  return state.archetypeFocusAreas.includes(c.category) ? 1 : 0.4;
}

export function scoreCandidate(c: TaskCandidate, state: EngineUserState): number {
  const goalAttrs = goalAttributes(state);
  return (
    WEIGHTS.goalRelevance * goalRelevanceScore(c, state, goalAttrs) +
    WEIGHTS.difficultyFit * difficultyFitScore(c, state) +
    WEIGHTS.weakness * weaknessScore(c, state) +
    WEIGHTS.freshness * freshnessScore(c, state) +
    WEIGHTS.streak * streakScore(c, state) +
    WEIGHTS.archetype * archetypeScore(c, state)
  );
}

/** Rank all templates for a user, deterministic tie-break by template id. */
export function rankCandidates(state: EngineUserState): ScoredCandidate[] {
  const scored: ScoredCandidate[] = TASK_TEMPLATES.map((c) => ({
    ...c,
    score: scoreCandidate(c, state),
  }));
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored;
}

/** Select the top-N tasks for a user, guaranteeing category diversity where possible. */
export function selectTasks(state: EngineUserState, count: number): TaskCandidate[] {
  const ranked = rankCandidates(state);
  const chosen: TaskCandidate[] = [];
  const usedCategories = new Set<Attribute>();

  // First pass: pick the highest-scoring task of each distinct category.
  for (const c of ranked) {
    if (chosen.length >= count) break;
    if (!usedCategories.has(c.category)) {
      chosen.push(c);
      usedCategories.add(c.category);
    }
  }
  // Second pass: fill remaining slots with highest remaining scores.
  for (const c of ranked) {
    if (chosen.length >= count) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  return chosen.slice(0, count);
}

// ── Life tip rule matching ──────────────────────────────────────────────────

export function detectTipRule(state: EngineUserState): TipRuleKey {
  if (state.inactiveDays >= 3) return "inactivity";
  if (state.inactiveDays === 1 && state.streak >= 2) return "streak_protection";
  if (state.completionTrend !== null && state.completionTrend <= -2) return "consistency";
  if (state.completionTrend !== null && state.completionTrend >= 2) return "progression";
  if (state.weakestAttribute !== null) return "weakness";
  return "general";
}

// ── Deterministic daily rotation (date-hash, not random) ────────────────────

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministically pick an index into `items` for a given user+date. */
export function pickByHash<T>(items: readonly T[], userId: string, date: string): number {
  if (items.length === 0) return 0;
  return hashString(`${userId}:${date}`) % items.length;
}

export { isAttribute };
