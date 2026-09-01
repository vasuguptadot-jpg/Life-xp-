import type {
  DailyPlan,
  DecomposedGoal,
  IntentKey,
  MomentumResult,
  Recommendation,
  StreakAnalysis,
  WeeklyReview,
  WeaknessResult,
} from "./types";

/**
 * Deterministic chat pre-processing layer.
 *
 * A small set of explicit, safe intent patterns are answered directly from the
 * Life Engine (no Groq call). Anything open-ended falls through to Groq.
 *
 * This is intentionally NOT an NLP model — only conservative keyword matching.
 */

const INTENT_PATTERNS: Array<{ key: IntentKey; words: string[] }> = [
  { key: "daily_plan", words: ["daily plan", "what should i do today", "today's plan", "plan for today", "what do i do today"] },
  { key: "weekly_review", words: ["weekly review", "this week", "week review", "how was my week", "week in review"] },
  { key: "completed_today", words: ["completed today", "complete today", "done today", "finished today", "completed so far", "today's tasks"] },
  { key: "momentum", words: ["momentum", "on a roll", "losing steam"] },
  { key: "progress", words: ["my progress", "progress", "how am i doing", "how am i performing", "am i improving"] },
  { key: "weaknesses", words: ["weakness", "weaknesses", "weak area", "weakest", "struggling", "underperforming", "what am i bad at", "falling behind"] },
  { key: "recommendations", words: ["recommend", "recommendation", "recommendations", "what should i do", "suggestion", "suggestions", "what should i work on"] },
  { key: "goals", words: ["my goals", "goal", "goals", "milestone", "milestones", "break down"] },
  { key: "streak", words: ["streak", "streaks"] },
  { key: "level", words: ["level", "levels", "rank", "ranks"] },
  { key: "xp", words: ["xp"] },
  { key: "quests", words: ["quest", "quests"] },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a single token on whole-word boundaries so that short tokens like
 * "xp" (→ "explain", "experience", "expect") and "quest" (→ "question",
 * "request") do not hijack unrelated messages. Multi-word phrases keep
 * substring semantics because they are already unambiguous.
 */
function tokenMatches(text: string, word: string): boolean {
  if (word.includes(" ")) return text.includes(word);
  return new RegExp(`\\b${escapeRegex(word)}\\b`).test(text);
}

export function detectIntent(message: string): IntentKey | null {
  const text = message.toLowerCase().trim();
  if (text.length === 0 || text.length > 200) return null;
  for (const { key, words } of INTENT_PATTERNS) {
    if (words.some((w) => tokenMatches(text, w))) return key;
  }
  return null;
}

/** XP required to advance from `level` to `level + 1` (matches calculateLevel). */
export function xpToNextLevel(level: number): number {
  return Math.max(0, level * level * 100);
}

export interface IntentStateView {
  level: number;
  totalXp: number;
  rank: string;
  streak: number;
  activeQuests: number;
  completedToday: number;
}

export function buildIntentResponse(intent: IntentKey, state: IntentStateView): string {
  switch (intent) {
    case "level":
      return `You are level ${state.level} (${state.rank}) with ${state.totalXp} total XP.`;
    case "xp": {
      const need = xpToNextLevel(state.level) - state.totalXp;
      return `You have ${state.totalXp} total XP. You need ${need} more XP to reach level ${state.level + 1}.`;
    }
    case "quests":
      return state.activeQuests > 0
        ? `You have ${state.activeQuests} active quest${state.activeQuests === 1 ? "" : "s"}. Check the Quests tab to keep progressing.`
        : `You have no active quests right now. Browse the quest catalogue to pick one up.`;
    case "streak":
      return state.streak >= 1
        ? `Your current streak is ${state.streak} day${state.streak === 1 ? "" : "s"}. Keep it alive today!`
        : `You don't have an active streak yet. Complete a task today to start one.`;
    case "completed_today":
      return state.completedToday > 0
        ? `You completed ${state.completedToday} task${state.completedToday === 1 ? "" : "s"} today. Nice work.`
        : `You haven't completed any tasks yet today. Pick one from your daily list to get started.`;
    default:
      return "";
  }
}

// ── Engine-driven intent responses (deterministic, no Groq) ─────────────────

export function buildProgressResponse(state: IntentStateView, momentum: MomentumResult): string {
  return `You're level ${state.level} (${state.rank}) with ${state.totalXp} XP. Your momentum score is ${momentum.score}/100 and ${momentum.direction}.`;
}

export function buildDailyPlanResponse(plan: DailyPlan): string {
  const focus = plan.focusArea ? ` Focus area: ${plan.focusArea.toLowerCase()}.` : "";
  const taskList = plan.tasks.map((t) => t.taskText).join("; ");
  return `${plan.priority}.${focus} Today: ${taskList}.`;
}

export function buildWeeklyReviewResponse(review: WeeklyReview): string {
  const rate = review.completionRate === null ? "no tracked completions" : `${review.completionRate}% completion rate`;
  return `This week you earned ${review.xpEarned} XP and completed ${review.questsCompleted} quest(s) (${rate}). ${review.recommendedFocus}`;
}

export function buildWeaknessesResponse(weaknesses: WeaknessResult[]): string {
  if (weaknesses.length === 0) {
    return "No clear weak areas detected yet — keep training all attributes and a signal will emerge.";
  }
  const top = weaknesses[0];
  return `Your biggest gap is ${top.area.toLowerCase()} (weakness score ${top.score}/100). ${top.recommendedAction}`;
}

export function buildRecommendationsResponse(recs: Recommendation[]): string {
  if (recs.length === 0) return "No recommendations available right now.";
  const top = recs.slice(0, 3).map((r) => r.label).join("; ");
  return `Top recommendations: ${top}.`;
}

export function buildGoalsResponse(goals: DecomposedGoal[]): string {
  const g = goals[0];
  const next = g.milestones[0];
  return `Your goal "${g.goal}" breaks into milestones like "${next.title}". This week: ${next.weeklyObjectives[0]}.`;
}

export function buildMomentumResponse(momentum: MomentumResult): string {
  return `Your momentum is ${momentum.score}/100 and ${momentum.direction}.`;
}

export function buildStreakAnalysisResponse(streak: StreakAnalysis): string {
  const risk =
    streak.streakRisk === "high"
      ? " Your streak is at risk today — complete a task to protect it."
      : streak.streakRisk === "low"
        ? " Keep it going today."
        : "";
  return `Current streak: ${streak.currentStreak} day(s), longest: ${streak.longestStreak} day(s).${risk}`;
}
