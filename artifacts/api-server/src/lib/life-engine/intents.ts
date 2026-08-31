import type { EngineUserState, IntentKey } from "./types";

/**
 * Deterministic chat pre-processing layer.
 *
 * A small set of explicit, safe intent patterns are answered directly from the
 * Life Engine (no Groq call). Anything open-ended falls through to Groq.
 *
 * This is intentionally NOT an NLP model — only conservative keyword matching.
 */

const INTENT_PATTERNS: Array<{ key: IntentKey; words: string[] }> = [
  { key: "completed_today", words: ["completed today", "complete today", "done today", "finished today", "completed so far", "today's tasks"] },
  { key: "streak", words: ["streak"] },
  { key: "quests", words: ["quest"] },
  { key: "xp", words: ["xp", "experience"] },
  { key: "level", words: ["level", "rank"] },
];

export function detectIntent(message: string): IntentKey | null {
  const text = message.toLowerCase().trim();
  if (text.length === 0 || text.length > 200) return null;
  for (const { key, words } of INTENT_PATTERNS) {
    if (words.some((w) => text.includes(w))) return key;
  }
  return null;
}

/** XP required to advance from `level` to `level + 1` (matches calculateLevel). */
export function xpToNextLevel(level: number): number {
  return level * level * 100;
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
      const need = Math.max(0, xpToNextLevel(state.level) - state.totalXp);
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
