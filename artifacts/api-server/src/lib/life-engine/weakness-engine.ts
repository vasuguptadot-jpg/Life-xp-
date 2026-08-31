import { ATTRIBUTES } from "@workspace/db/schema";
import type { AnalyticsState, Attribute, WeaknessResult } from "./types";

/**
 * Weakness Engine — behavioral/product analytics only. Identifies life
 * attributes where the user is consistently underperforming, using observable
 * signals (attribute value, task completion, quest outcomes, recent XP).
 * It draws NO psychological or medical conclusions.
 */
export function detectWeaknesses(state: AnalyticsState): WeaknessResult[] {
  const maxAttr = Math.max(...ATTRIBUTES.map((a) => state.attributes[a]));

  // Category completion + abandonment from daily tasks and quests.
  const categoryStats = new Map<Attribute, { completed: number; total: number; abandoned: number; xp: number }>();
  for (const a of ATTRIBUTES) {
    categoryStats.set(a, { completed: 0, total: 0, abandoned: 0, xp: 0 });
  }

  const now = Date.now();
  const since30d = now - 30 * 24 * 60 * 60 * 1000;

  for (const t of state.dailyTasks) {
    const cat = t.category as Attribute;
    if (!categoryStats.has(cat)) continue;
    const s = categoryStats.get(cat)!;
    s.total++;
    if (t.isCompleted) s.completed++;
  }
  for (const q of state.quests) {
    const cat = q.category as Attribute;
    if (!categoryStats.has(cat)) continue;
    const s = categoryStats.get(cat)!;
    if (q.status === "ABANDONED") s.abandoned++;
  }
  for (const e of state.xpEvents) {
    if (e.createdAt.getTime() < since30d) continue;
    const cat = e.category as Attribute | null;
    if (cat && categoryStats.has(cat)) categoryStats.get(cat)!.xp += e.amount;
  }

  const results: WeaknessResult[] = [];
  for (const a of ATTRIBUTES) {
    const s = categoryStats.get(a)!;
    const evidence: string[] = [];
    let score = 0;

    // 1. Low trained attribute value relative to the strongest area.
    //    Only meaningful once the user has trained SOMETHING (maxAttr > 0);
    //    a brand-new user with all-zero attributes has no weakness signal.
    if (maxAttr > 0) {
      const attrGap = 1 - state.attributes[a] / maxAttr;
      if (attrGap > 0.2) {
        score += attrGap * 40;
        evidence.push(`Trained ${a.toLowerCase()} value (${state.attributes[a]}) is well below your strongest area`);
      }
    }

    // 2. Low completion rate in this category (with enough data).
    if (s.total >= 3) {
      const rate = s.completed / s.total;
      if (rate < 0.5) {
        score += (0.5 - rate) * 60;
        evidence.push(`Low completion rate (${Math.round(rate * 100)}%) on ${a.toLowerCase()} tasks`);
      }
    }

    // 3. Abandoned quests in this category.
    if (s.abandoned >= 1) {
      score += Math.min(30, s.abandoned * 15);
      evidence.push(`${s.abandoned} abandoned ${a.toLowerCase()} quest${s.abandoned === 1 ? "" : "s"}`);
    }

    // 4. Low recent XP generation in this category (relative to attributes).
    const avgXp = Math.max(1, state.totalXp / ATTRIBUTES.length);
    if (state.totalXp > 0 && s.xp < avgXp * 0.5) {
      score += 15;
      evidence.push(`Low recent XP (${s.xp}) from ${a.toLowerCase()} activity`);
    }

    score = Math.round(Math.min(100, score));
    if (score < 25) continue; // no meaningful weakness signal

    const confidence = Math.min(1, evidence.length / 3);
    results.push({
      area: a,
      score,
      confidence: Math.round(confidence * 100) / 100,
      evidence,
      recommendedAction: `Add one small ${a.toLowerCase()} action this week to close the gap.`,
    });
  }

  results.sort((x, y) => y.score - x.score || x.area.localeCompare(y.area));
  return results;
}
