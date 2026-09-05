import { recommendQuests } from "./recommendation-engine";
import { dayKey } from "./state";
import type { AnalyticsState, QuestTemplate, Recommendation } from "./types";

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Quest Engine — smart, deterministic quest rotation.
 *
 * - Excludes quests the user already has active.
 * - De-prioritizes (removes) quests recently completed, so the same quest is
 *   not re-recommended immediately.
 * - Balances categories (top pick per distinct category first).
 * - Rotates tie-breaks by a deterministic (userId + date) hash, so the same
 *   user sees stable-but-varied recommendations day to day without randomness.
 */
export function rotateQuests(
  state: AnalyticsState,
  templates: QuestTemplate[],
  count = 3,
): Recommendation[] {
  const activeIds = new Set(
    state.quests
      .filter((q) => q.status === "ASSIGNED" || q.status === "IN_PROGRESS")
      .map((q) => q.templateId),
  );
  const completedIds = new Set(
    state.quests.filter((q) => q.status === "COMPLETED").map((q) => q.templateId),
  );

  const pool = templates.filter((t) => !activeIds.has(t.id) && !completedIds.has(t.id));

  const scored = recommendQuests(state, pool);
  const date = dayKey(new Date());

  // Deterministic daily rotation: break ties by a user+date+id hash.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return hashString(`${state.userId}:${date}:${a.id}`) - hashString(`${state.userId}:${date}:${b.id}`);
  });

  // Category-balance first pass, then fill by score.
  const chosen: Recommendation[] = [];
  const usedCategories = new Set<string>();
  for (const r of scored) {
    if (chosen.length >= count) break;
    if (!usedCategories.has(r.category)) {
      chosen.push(r);
      usedCategories.add(r.category);
    }
  }
  for (const r of scored) {
    if (chosen.length >= count) break;
    if (!chosen.includes(r)) chosen.push(r);
  }
  return chosen.slice(0, count);
}
