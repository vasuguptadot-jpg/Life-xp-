import { buildAnalyticsState } from "./analytics";
import { generateDailyTasks } from "./daily-task-engine";
import { buildDailyPlan } from "./daily-plan-engine";
import { detectRecoveryMode } from "./recovery-engine";
import { computeMomentum } from "./momentum-engine";
import { recommendDifficulty } from "./difficulty-engine";
import type { DailyPlan } from "./types";

/**
 * Orchestrates the multi-engine composition for a single user. Each engine
 * stays a pure, deterministic function; this module wires them together over
 * one bounded state snapshot.
 */
export async function composeDailyPlan(userId: string): Promise<DailyPlan> {
  const state = await buildAnalyticsState(userId);
  const tasks = await generateDailyTasks(userId);
  const difficulty = recommendDifficulty(state);
  const momentum = computeMomentum(state);
  const recovery = detectRecoveryMode(state, momentum);
  return buildDailyPlan(state, tasks, difficulty, recovery, momentum);
}
