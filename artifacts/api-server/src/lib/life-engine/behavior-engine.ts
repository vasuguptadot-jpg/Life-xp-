import type { AnalyticsState, BehaviorPattern } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Behavior Pattern Engine — descriptive, behavioral observations only (no
 * psychological or medical claims). Patterns are derived from XP-event and
 * daily-task timestamps.
 */
export function analyzeBehavior(state: AnalyticsState): BehaviorPattern[] {
  const patterns: BehaviorPattern[] = [];
  const now = Date.now();
  const since30d = now - 30 * DAY_MS;

  // ── Weekday vs weekend ─────────────────────────────────────────────────────
  const weekday = { active: 0, total: 0 };
  const weekend = { active: 0, total: 0 };
  const activeDaySet = new Set(state.activeDays);
  for (let i = 0; i < 28; i++) {
    const d = new Date(now - i * DAY_MS);
    const key = d.toISOString().split("T")[0];
    const dow = d.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const bucket = isWeekend ? weekend : weekday;
    bucket.total++;
    if (activeDaySet.has(key)) bucket.active++;
  }

  if (weekday.total > 0 && weekend.total > 0) {
    const weekdayRate = weekday.active / weekday.total;
    const weekendRate = weekend.active / weekend.total;
    if (weekdayRate >= 0.5 && weekendRate < 0.25) {
      patterns.push({
        pattern: "weekday_momentum",
        evidence: `Active ${Math.round(weekdayRate * 100)}% of weekdays vs ${Math.round(weekendRate * 100)}% of weekends over the last 4 weeks.`,
        confidence: 0.8,
      });
    } else if (weekendRate >= 0.5 && weekdayRate < 0.25) {
      patterns.push({
        pattern: "weekend_warrior",
        evidence: `Active ${Math.round(weekendRate * 100)}% of weekends vs ${Math.round(weekdayRate * 100)}% of weekdays over the last 4 weeks.`,
        confidence: 0.8,
      });
    }
  }

  // ── Morning vs evening consistency ─────────────────────────────────────────
  const morning = { active: 0, total: 0 };
  const evening = { active: 0, total: 0 };
  for (const e of state.xpEvents) {
    if (e.createdAt.getTime() < since30d) continue;
    const h = e.createdAt.getUTCHours();
    if (h >= 5 && h < 11) morning.active++;
    else if (h >= 17 && h < 23) evening.active++;
  }
  const timed = morning.active + evening.active;
  if (timed >= 5) {
    const morningShare = morning.active / timed;
    if (morningShare >= 0.6) {
      patterns.push({
        pattern: "morning_consistency",
        evidence: `${Math.round(morningShare * 100)}% of activity falls in morning hours (05:00–11:00).`,
        confidence: 0.7,
      });
    } else if (morningShare <= 0.4) {
      patterns.push({
        pattern: "evening_consistency",
        evidence: `${Math.round((1 - morningShare) * 100)}% of activity falls in evening hours (17:00–23:00).`,
        confidence: 0.7,
      });
    }
  }

  // ── Repeated abandonment ───────────────────────────────────────────────────
  const abandoned = state.quests.filter(
    (q) => q.status === "ABANDONED" && q.assignedAt.getTime() >= since30d,
  ).length;
  if (abandoned >= 2) {
    patterns.push({
      pattern: "task_abandonment",
      evidence: `${abandoned} quests abandoned in the last 30 days.`,
      confidence: 0.6,
    });
  }

  // ── Improving / declining consistency ──────────────────────────────────────
  if (state.completionTrend !== null) {
    if (state.completionTrend >= 2) {
      patterns.push({
        pattern: "improving_consistency",
        evidence: `Completion trend is up (${state.completionTrend} more completions this week vs last).`,
        confidence: 0.7,
      });
    } else if (state.completionTrend <= -2) {
      patterns.push({
        pattern: "declining_consistency",
        evidence: `Completion trend is down (${state.completionTrend} fewer completions this week vs last).`,
        confidence: 0.7,
      });
    }
  }

  return patterns;
}
