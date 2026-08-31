import { ATTRIBUTES } from "@workspace/db/schema";
import type { Attribute, TaskCandidate, TipRuleKey } from "./types";

/**
 * Deterministic content libraries for the Life Engine.
 *
 * These are static data (not code paths). The task template library provides
 * bounded, level-tiered actions across the 7 life attributes. The tip library
 * provides rule-matched coaching content. Neither requires an LLM.
 */

export const GOAL_KEY_ATTRIBUTES: Record<string, Attribute[]> = {
  strength: ["STRENGTH"],
  endurance: ["ENDURANCE", "MOBILITY"],
  mind: ["KNOWLEDGE", "RECOVERY"],
  discipline: ["DISCIPLINE"],
};

/** Representative level for each tier, used to compute difficulty fit. */
export const TIER_LEVEL: Record<TaskCandidate["tier"], number> = {
  intro: 2,
  standard: 8,
  advanced: 20,
};

/**
 * Task template library.
 *
 * `keywords` drive goal-relevance scoring against the user's free-text goals.
 * Text is fixed so that engine output is reproducible for identical state.
 */
export const TASK_TEMPLATES: TaskCandidate[] = [
  // ── STRENGTH ──────────────────────────────────────────────────────────────
  { id: "s1", category: "STRENGTH", tier: "intro", text: "Do 3 sets of 10 push-ups", xpReward: 25, keywords: ["strength", "push", "muscle", "gym", "weights"] },
  { id: "s2", category: "STRENGTH", tier: "intro", text: "Complete 2 sets of 10 bodyweight squats", xpReward: 25, keywords: ["strength", "squat", "muscle", "legs"] },
  { id: "s3", category: "STRENGTH", tier: "standard", text: "Do 3 sets of 8 weighted squats", xpReward: 30, keywords: ["strength", "weights", "squat", "gym", "muscle"] },
  { id: "s4", category: "STRENGTH", tier: "advanced", text: "Complete a 5x5 barbell strength session", xpReward: 40, keywords: ["strength", "barbell", "gym", "weights", "muscle", "power"] },

  // ── ENDURANCE ─────────────────────────────────────────────────────────────
  { id: "e1", category: "ENDURANCE", tier: "intro", text: "Walk briskly for 20 minutes", xpReward: 20, keywords: ["endurance", "walk", "cardio", "run"] },
  { id: "e2", category: "ENDURANCE", tier: "intro", text: "Jog lightly for 15 minutes", xpReward: 25, keywords: ["endurance", "jog", "cardio", "run"] },
  { id: "e3", category: "ENDURANCE", tier: "standard", text: "Run 5km at an easy pace", xpReward: 35, keywords: ["endurance", "run", "cardio", "5k"] },
  { id: "e4", category: "ENDURANCE", tier: "advanced", text: "Complete 30 minutes of interval training", xpReward: 40, keywords: ["endurance", "interval", "cardio", "run", "hiit"] },

  // ── MOBILITY ──────────────────────────────────────────────────────────────
  { id: "m1", category: "MOBILITY", tier: "intro", text: "Stretch for 10 minutes", xpReward: 15, keywords: ["mobility", "stretch", "flexibility", "yoga"] },
  { id: "m2", category: "MOBILITY", tier: "intro", text: "Do 5 minutes of neck and shoulder mobility", xpReward: 15, keywords: ["mobility", "stretch", "shoulder", "flexibility"] },
  { id: "m3", category: "MOBILITY", tier: "standard", text: "Complete a 20-minute yoga flow", xpReward: 30, keywords: ["mobility", "yoga", "stretch", "flexibility"] },
  { id: "m4", category: "MOBILITY", tier: "advanced", text: "Hold a 60-second deep squat and a 2-minute hip stretch", xpReward: 35, keywords: ["mobility", "stretch", "flexibility", "hip"] },

  // ── NUTRITION ─────────────────────────────────────────────────────────────
  { id: "n1", category: "NUTRITION", tier: "intro", text: "Drink 8 glasses of water today", xpReward: 20, keywords: ["nutrition", "water", "diet", "food", "healthy"] },
  { id: "n2", category: "NUTRITION", tier: "intro", text: "Eat a vegetable with every meal", xpReward: 20, keywords: ["nutrition", "vegetable", "diet", "food", "healthy"] },
  { id: "n3", category: "NUTRITION", tier: "standard", text: "Log your meals and hit a protein target", xpReward: 25, keywords: ["nutrition", "protein", "meal", "diet", "food"] },
  { id: "n4", category: "NUTRITION", tier: "advanced", text: "Meal-prep 3 balanced meals for tomorrow", xpReward: 35, keywords: ["nutrition", "meal", "prep", "diet", "food"] },

  // ── RECOVERY ──────────────────────────────────────────────────────────────
  { id: "r1", category: "RECOVERY", tier: "intro", text: "Get 7+ hours of sleep tonight", xpReward: 20, keywords: ["recovery", "sleep", "rest", "stress"] },
  { id: "r2", category: "RECOVERY", tier: "intro", text: "Take a 10-minute mindful breathing break", xpReward: 15, keywords: ["recovery", "breathe", "stress", "rest", "mind"] },
  { id: "r3", category: "RECOVERY", tier: "standard", text: "Stretch and foam-roll for 15 minutes before bed", xpReward: 25, keywords: ["recovery", "stretch", "foam", "rest", "sleep"] },
  { id: "r4", category: "RECOVERY", tier: "advanced", text: "Do a full evening wind-down routine (no screens 1h before bed)", xpReward: 30, keywords: ["recovery", "sleep", "wind", "rest", "stress"] },

  // ── DISCIPLINE ────────────────────────────────────────────────────────────
  { id: "d1", category: "DISCIPLINE", tier: "intro", text: "Make your bed and plan 3 tasks for tomorrow", xpReward: 15, keywords: ["discipline", "habit", "routine", "productivity", "plan"] },
  { id: "d2", category: "DISCIPLINE", tier: "intro", text: "Complete a 25-minute focused work block", xpReward: 20, keywords: ["discipline", "focus", "work", "habit", "productivity"] },
  { id: "d3", category: "DISCIPLINE", tier: "standard", text: "Follow your morning routine without skipping a step", xpReward: 25, keywords: ["discipline", "routine", "habit", "morning"] },
  { id: "d4", category: "DISCIPLINE", tier: "advanced", text: "Complete 3 focused 50-minute deep-work blocks", xpReward: 35, keywords: ["discipline", "focus", "deep", "work", "productivity"] },

  // ── KNOWLEDGE ─────────────────────────────────────────────────────────────
  { id: "k1", category: "KNOWLEDGE", tier: "intro", text: "Read 10 pages of a book", xpReward: 20, keywords: ["knowledge", "read", "book", "learn", "study"] },
  { id: "k2", category: "KNOWLEDGE", tier: "intro", text: "Watch one educational video and take notes", xpReward: 15, keywords: ["knowledge", "learn", "video", "study", "notes"] },
  { id: "k3", category: "KNOWLEDGE", tier: "standard", text: "Read 20 pages and summarize key points", xpReward: 25, keywords: ["knowledge", "read", "book", "learn", "study"] },
  { id: "k4", category: "KNOWLEDGE", tier: "advanced", text: "Complete a full study session with notes and review", xpReward: 35, keywords: ["knowledge", "study", "learn", "notes", "review"] },
];

/** Number of daily tasks to produce. */
export const DAILY_TASK_COUNT = 5;

/** Minimum / maximum XP reward for a generated task (authoritative clamp). */
export const MIN_TASK_XP = 10;
export const MAX_TASK_XP = 50;

export interface TipEntry {
  tip: string;
  category: Attribute;
}

export const TIP_LIBRARY: Record<TipRuleKey, TipEntry[]> = {
  inactivity: [
    { tip: "You've been away for a few days. Re-entry is easier than you think — start with one 10-minute task today, not a full plan.", category: "DISCIPLINE" },
    { tip: "Coming back is a skill. Pick the single smallest action from your routine and do only that today.", category: "DISCIPLINE" },
  ],
  streak_protection: [
    { tip: "Your streak is on the line today. Do one small task now to keep the chain alive — momentum matters more than size.", category: "DISCIPLINE" },
    { tip: "A one-minute action saves a multi-day streak. Protect it with the smallest possible completion today.", category: "DISCIPLINE" },
  ],
  consistency: [
    { tip: "Your completion rate has dipped recently. Consistency beats intensity — aim for smaller, repeatable wins over big sessions.", category: "DISCIPLINE" },
    { tip: "Progress stalls when effort is inconsistent. Lock in one tiny daily action rather than chasing a perfect day.", category: "DISCIPLINE" },
  ],
  progression: [
    { tip: "Your recent effort is trending up. Lock in the habit by repeating what worked this week.", category: "DISCIPLINE" },
    { tip: "Momentum is building. Ride it — schedule tomorrow's hardest task for your highest-energy window.", category: "DISCIPLINE" },
  ],
  weakness: [
    { tip: "Your lowest attribute is holding back the rest. Train it directly today — even 10 minutes compounds.", category: "DISCIPLINE" },
    { tip: "Balance wins long-term. Give your weakest area a small, focused effort today.", category: "DISCIPLINE" },
  ],
  general: [
    { tip: "Small consistent actions compound into extraordinary results. Pick one thing to improve today.", category: "DISCIPLINE" },
    { tip: "The best plan is the one you actually do. Keep today's target small and finish it.", category: "DISCIPLINE" },
    { tip: "Progress is rarely dramatic. Trust the daily repetition — it's working even when it feels slow.", category: "DISCIPLINE" },
  ],
};

export function isAttribute(value: unknown): value is Attribute {
  return typeof value === "string" && (ATTRIBUTES as readonly string[]).includes(value);
}
