import type { Attribute } from "@workspace/db/schema";

export type { Attribute };

/**
 * Life Engine — shared types.
 *
 * The Life Engine is the AUTHORITATIVE source of daily intelligence. It consumes
 * real user state and produces deterministic, reproducible decisions. AI (Groq)
 * is a NON-AUTHORITATIVE enhancement layer that may only reword presentation.
 */

// ── Core user state (daily task / tip engine) ────────────────────────────────

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

// ── Task templates ───────────────────────────────────────────────────────────

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

// ── Analytics state (richer, for the analysis engines) ───────────────────────

export type DifficultyLevel = "EASY" | "MEDIUM" | "HARD";

export interface XpEvent {
  amount: number;
  createdAt: Date;
  sourceType: string;
  category: string | null;
}

export type QuestStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED";

export interface QuestRecord {
  id: string;
  templateId: string;
  status: QuestStatus;
  category: string;
  difficulty: string;
  assignedAt: Date;
  completedAt: Date | null;
}

export interface QuestTemplate {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  primaryAttributes: Attribute[];
  compatibleGoals: string[];
}

export interface DailyTaskRecord {
  date: string;
  category: string;
  isCompleted: boolean;
  completedAt: Date | null;
  xpReward: number;
}

export type ComebackStatus = "none" | "re_entry" | "comeback" | "restart";

export interface AnalyticsState {
  userId: string;
  level: number;
  totalXp: number;
  rank: string;
  goalsText: string;
  goalKeys: string[];
  attributes: Record<Attribute, number>;
  weakestAttribute: Attribute | null;
  archetypeFocusAreas: Attribute[];
  /** XP events within the bounded window (newest first). */
  xpEvents: XpEvent[];
  /** Day keys (YYYY-MM-DD) with any XP activity within the window. */
  activeDays: Set<string>;
  currentStreak: number;
  longestStreak: number;
  /** Days since last activity (0 = active today). */
  inactiveDays: number;
  /** Active days missed in the last 30 days (days with no activity). */
  missedDays: number;
  comebackStatus: ComebackStatus;
  /** User's quest records within the bounded window. */
  quests: QuestRecord[];
  /** Daily task rows within the bounded window. */
  dailyTasks: DailyTaskRecord[];
  /** Completion trend (7d vs prior 7d), or null when insufficient data. */
  completionTrend: number | null;
}

// ── Engine results ───────────────────────────────────────────────────────────

export interface StreakAnalysis {
  currentStreak: number;
  longestStreak: number;
  streakRisk: "none" | "low" | "high";
  missedDays: number;
  comebackStatus: ComebackStatus;
}

export interface MomentumFactor {
  name: string;
  /** 0–100 contribution of this factor to the overall score. */
  value: number;
  weight: number;
}

export interface MomentumResult {
  score: number;
  direction: "rising" | "stable" | "falling";
  factors: MomentumFactor[];
}

export interface WeaknessResult {
  area: Attribute;
  /** 0–100, higher = weaker. */
  score: number;
  /** 0–1 confidence based on the amount of evidence. */
  confidence: number;
  evidence: string[];
  recommendedAction: string;
}

export interface RecoveryMode {
  active: boolean;
  reason: string | null;
  /** Intensity of recovery: light (gentle) or full (low-pressure restart). */
  level: "none" | "light" | "full";
  suggestedDailyTasks: number;
  suggestedDifficulty: DifficultyLevel;
  priority: "consistency" | "recovery" | "low_pressure";
}

export interface DifficultyRecommendation {
  recommended: DifficultyLevel;
  xpReward: number;
  suggestedQuestType: Attribute;
  previousLevel: DifficultyLevel;
  adjustment: "increase" | "maintain" | "decrease";
  reason: string;
}

export type RecommendationReasonCode =
  | "GOAL_RELEVANT"
  | "WEAK_AREA"
  | "APPROPRIATE_DIFFICULTY"
  | "STREAK_PRESERVING"
  | "NOVEL"
  | "ARCHETYPE_ALIGNED";

export interface Recommendation<T = string> {
  id: string;
  /** Human label (task text or quest title). */
  label: string;
  category: string;
  /** 0–100 transparent score. */
  score: number;
  reasonCodes: RecommendationReasonCode[];
}

export interface GoalMilestone {
  title: string;
  weeklyObjectives: string[];
}

export interface DecomposedGoal {
  key: string;
  goal: string;
  milestones: GoalMilestone[];
}

export interface DailyPlan {
  date: string;
  priority: string;
  tasks: Array<{ id: string; taskText: string; category: string; xpReward: number }>;
  recommendedDifficulty: DifficultyLevel;
  estimatedEffort: "low" | "moderate" | "high";
  focusArea: Attribute | null;
  recoveryMode: boolean;
  reason: string;
}

export interface WeeklyReview {
  startDate: string;
  endDate: string;
  xpEarned: number;
  questsCompleted: number;
  completionRate: number | null;
  streakPerformance: number;
  strongestArea: Attribute | null;
  weakestArea: Attribute | null;
  momentumTrend: MomentumResult["direction"];
  recommendedFocus: string;
  milestoneProgress: { level: number; totalXp: number; xpToNextLevel: number };
}

export interface MilestoneForecast {
  /** e.g. "Level 6" */
  milestone: string;
  xpNeeded: number;
  /** Estimated days at current pace, or null if no recent activity. */
  daysEstimated: number | null;
  estimatedDate: string | null;
  /** Forecasts are always estimates — never guaranteed outcomes. */
  isEstimate: true;
  basis: string;
}

export interface BehaviorPattern {
  pattern: string;
  evidence: string;
  confidence: number;
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
  | "completed_today"
  | "progress"
  | "daily_plan"
  | "weekly_review"
  | "weaknesses"
  | "recommendations"
  | "goals"
  | "momentum";
