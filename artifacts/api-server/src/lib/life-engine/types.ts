import type { Attribute } from "@workspace/db/schema";

export type { Attribute };

/**
 * Life Engine — shared types.
 *
 * The Life Engine is the AUTHORITATIVE source of daily intelligence. It consumes
 * real user state and produces deterministic, reproducible decisions. AI (Groq)
 * is a NON-AUTHORITATIVE enhancement layer that may only reword presentation.
 */

export interface EngineUserState {
  userId: string;
  /** Current level (from user_levels.currentLevel). */
  level: number;
  /** Total accumulated XP (from user_levels.totalXp). */
  totalXp: number;
  /** Human rank name derived from level. */
  rank: string;
  /** Free-text goals the user typed into the AI coach (ai_user_goals.goals). */
  goalsText: string;
  /** Structured goal keys selected during onboarding (user_goals.goalKey). */
  goalKeys: string[];
  /** Current value of each of the 7 life attributes. Missing → 0. */
  attributes: Record<Attribute, number>;
  /** The attribute with the lowest trained value, or null when no signal. */
  weakestAttribute: Attribute | null;
  /** Archetype focus areas (archetypes.focusAreas), or [] when unset. */
  archetypeFocusAreas: Attribute[];
  /** Categories with activity in the last 3 days (for freshness). */
  recentCategories: Attribute[];
  /** Task texts completed in the last 7 days (for repetition avoidance). */
  recentTaskTexts: Set<string>;
  /** Consecutive active days ending today or yesterday. */
  streak: number;
  /** Days since the last XP activity (0 = active today). */
  inactiveDays: number;
  /** Completion trend: recent 7-day completions minus prior 7-day completions, or null if insufficient data. */
  completionTrend: number | null;
}

export interface TaskCandidate {
  /** Stable, deterministic id used for tie-breaking. */
  id: string;
  category: Attribute;
  /** Fixed task text (may later be reworded by optional AI enhancement). */
  text: string;
  xpReward: number;
  tier: "intro" | "standard" | "advanced";
  keywords: string[];
}

export interface ScoredCandidate extends TaskCandidate {
  /** Weighted, normalized score in [0, 1]. Higher is better. */
  score: number;
}

export type TipRuleKey =
  | "inactivity"
  | "streak_protection"
  | "consistency"
  | "progression"
  | "weakness"
  | "general";

export type IntentKey =
  | "level"
  | "xp"
  | "quests"
  | "streak"
  | "completed_today";
