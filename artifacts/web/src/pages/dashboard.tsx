import { useState } from "react";
import AppLayout from "@/components/layout";
import { useGetProgressionSummary, useGetAttributeHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Zap, TrendingUp, ArrowUp, Dumbbell, Flame, Target, Heart, Shield, Star, Brain,
  ChevronUp, ChevronDown, CheckCircle2, Circle, Lightbulb, Activity, Trophy, Palette,
} from "lucide-react";
import { formatXp, getAttributeColorClass, cn } from "@/lib/utils";
import { useMemo } from "react";
import { DashboardSkeleton } from "@/components/app-skeleton";
import {
  useAiGoals, useDailyTasks, useCompleteTask, useLifeTip,
  type DailyTask,
} from "@/hooks/use-ai";
import GoalSetupModal from "@/components/goal-setup-modal";
import AiCoachPanel, { AiCoachButton } from "@/components/ai-coach-panel";
import DietPlanCard from "@/components/diet-plan-card";
import ThemePicker from "@/components/theme-picker";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLevelProgress(totalXp: number, level: number) {
  const prev = level > 1 ? (level - 1) * 1000 : 0;
  const req  = level * 1000;
  const xpIn = Math.max(0, totalXp - prev);
  return { xpIn, req, pct: Math.min(100, (xpIn / req) * 100) };
}

function getRank(level: number) {
  if (level < 5)  return "Initiate";
  if (level < 10) return "Adventurer";
  if (level < 20) return "Champion";
  if (level < 35) return "Hero";
  return "Legend";
}

function getPhysiqueRank(score: number) {
  if (score === 0)  return { label: "Unranked", tier: 0 };
  if (score < 10)  return { label: "Novice",   tier: 1 };
  if (score < 25)  return { label: "Trainee",  tier: 2 };
  if (score < 50)  return { label: "Athlete",  tier: 3 };
  if (score < 80)  return { label: "Champion", tier: 4 };
  return             { label: "Elite",     tier: 5 };
}

function fmtSourceType(s: string) {
  return s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const ATTR_ICONS: Record<string, React.ElementType> = {
  STRENGTH: Dumbbell, ENDURANCE: Flame, MOBILITY: Target,
  NUTRITION: Heart,   RECOVERY: Shield, DISCIPLINE: Star, KNOWLEDGE: Brain,
};

const CATEGORY_COLORS: Record<string, string> = {
  STRENGTH:   "text-red-400",
  ENDURANCE:  "text-orange-400",
  MOBILITY:   "text-yellow-400",
  NUTRITION:  "text-green-400",
  RECOVERY:   "text-blue-400",
  DISCIPLINE: "text-purple-400",
  KNOWLEDGE:  "text-cyan-400",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function DailyTaskItem({ task, onComplete }: { task: DailyTask; onComplete: (id: string) => void }) {
  const Icon = ATTR_ICONS[task.category] || Zap;
  const color = CATEGORY_COLORS[task.category] || "text-white/50";
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors group",
        task.isCompleted && "opacity-50",
      )}
    >
      <button
        onClick={() => !task.isCompleted && onComplete(task.id)}
        className="mt-0.5 shrink-0 transition-transform group-hover:scale-110"
        disabled={task.isCompleted}
      >
        {task.isCompleted
          ? <CheckCircle2 className="w-4.5 h-4.5 text-white/60" />
          : <Circle className="w-4.5 h-4.5 text-white/20 hover:text-white/50 transition-colors" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug", task.isCompleted && "line-through")}>{task.taskText}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Icon className={cn("w-3 h-3", color)} />
          <span className={cn("text-[10px] font-semibold uppercase tracking-wide", color)}>
            {task.category}
          </span>
        </div>
      </div>
      <Badge variant="xp" className="text-[11px] tabular-nums shrink-0">+{task.xpReward}</Badge>
    </div>
  );
}

function DailyProgressRing({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? (completed / total) * 100 : 0;
  const R = 28, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <circle
            cx="36" cy="36" r={R} fill="none" stroke="rgba(255,255,255,0.75)"
            strokeWidth="5" strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease", filter: "drop-shadow(0 0 5px rgba(255,255,255,0.3))" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-black">{completed}</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold">{completed}/{total} done</p>
        <p className="text-xs text-white/40 mt-0.5">
          {pct === 100 ? "🎉 All complete!" : pct >= 60 ? "Almost there!" : pct > 0 ? "Keep going!" : "Start your day!"}
        </p>
        <div className="mt-1.5 h-1 w-24 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-white/70"
            style={{ width: `${pct}%`, transition: "width 0.6s ease" }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [coachOpen, setCoachOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalModalDismissed, setGoalModalDismissed] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);

  const { data: prog, isLoading } = useGetProgressionSummary({ query: { queryKey: ["/api/users/me/progression"] } });
  const { data: attrHistory }     = useGetAttributeHistory({ limit: 100 }, { query: { queryKey: ["/api/progression/attribute-history"] } });
  const { data: aiGoals }         = useAiGoals();
  const { data: dailyTasks = [] } = useDailyTasks();
  const { data: lifeTip }         = useLifeTip();
  const completeTask              = useCompleteTask();

  // Show goal modal if goals haven't been set (after initial load)
  const goalsLoaded = aiGoals !== undefined;
  const noGoals = goalsLoaded && aiGoals.goals === null;

  // Net attribute gains from history
  const attrGains = useMemo(() => {
    if (!attrHistory) return {} as Record<string, number>;
    return attrHistory.reduce<Record<string, number>>((acc, e) => {
      acc[e.attribute] = (acc[e.attribute] || 0) + e.delta;
      return acc;
    }, {});
  }, [attrHistory]);

  if (isLoading || !prog) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  const { level, attributes, recentTransactions } = prog;
  const { xpIn, req, pct } = getLevelProgress(level.totalXp, level.currentLevel);
  const sorted = [...attributes].sort((a, b) => b.currentValue - a.currentValue);
  const R = 52, C = 2 * Math.PI * R;

  // Physique rank (STRENGTH + ENDURANCE + MOBILITY average)
  const physAttrs = attributes.filter(a => ["STRENGTH","ENDURANCE","MOBILITY"].includes(a.attribute));
  const physiqueScore = physAttrs.length > 0
    ? Math.round(physAttrs.reduce((s, a) => s + a.currentValue, 0) / physAttrs.length)
    : 0;
  const { label: physiqueLabel, tier: physiqueTier } = getPhysiqueRank(physiqueScore);

  // Daily tasks summary
  const completedCount = dailyTasks.filter(t => t.isCompleted).length;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-5 pb-24">

        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="animate-slide-up-fade flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Overview</p>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          </div>
          <button
            onClick={() => setThemePickerOpen(true)}
            className="mt-1 w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.08] transition-colors"
            title="Change theme"
          >
            <Palette className="w-4 h-4 text-white/40" />
          </button>
        </header>

        {/* ── Hero: Level + XP ───────────────────────────────────── */}
        <Card className="animate-slide-up-fade stagger-1 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_80%_50%,rgba(255,255,255,0.02),transparent)] pointer-events-none" />
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              {/* Ring */}
              <div className="relative shrink-0">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                  <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.85)"
                    strokeWidth="8" strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100}
                    strokeLinecap="round" className="animate-dash"
                    style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.4))" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Lv</span>
                  <span className="text-4xl font-black leading-none">{level.currentLevel}</span>
                </div>
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <Badge variant="xp" className="text-[10px] mb-2">{getRank(level.currentLevel)}</Badge>
                  <p className="text-sm text-white/50">
                    <span className="text-white font-semibold">{formatXp(xpIn)}</span> / {formatXp(req)} XP to next level
                  </p>
                </div>
                <Progress value={pct} className="h-1.5" indicatorClassName="bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                <p className="text-xs text-white/30">
                  Total earned: <span className="text-white/60 font-semibold">{formatXp(level.totalXp)} XP</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Daily Progress + Physique Rank ─────────────────────── */}
        <div className="grid grid-cols-2 gap-4 animate-slide-up-fade stagger-2">

          {/* Daily Progress */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.02),transparent)] pointer-events-none" />
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Daily Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {dailyTasks.length > 0 ? (
                <DailyProgressRing completed={completedCount} total={dailyTasks.length} />
              ) : (
                <p className="text-xs text-white/30 py-3">Tasks loading…</p>
              )}
            </CardContent>
          </Card>

          {/* Physique Rank */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.02),transparent)] pointer-events-none" />
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5" /> Physique Rank
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-1.5 rounded-full transition-all",
                        i < physiqueTier ? "bg-white/80 h-6" : "bg-white/[0.08] h-3 self-end",
                      )}
                    />
                  ))}
                </div>
                <div>
                  <p className="text-lg font-black leading-none">{physiqueLabel}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {physiqueScore > 0 ? `Avg score: ${physiqueScore}` : "Train STR · END · MOB"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Life Tip ───────────────────────────────────────────── */}
        {lifeTip && (
          <Card className="animate-slide-up-fade stagger-2 relative overflow-hidden border-white/[0.08]">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_100%_at_0%_50%,rgba(255,255,255,0.025),transparent)] pointer-events-none" />
            <CardContent className="p-4">
              <div className="flex gap-3.5">
                <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                  <Lightbulb className="w-4 h-4 text-yellow-400/70" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">Today's Tip</span>
                    {lifeTip.category && (
                      <span className={cn("text-[10px] font-bold uppercase tracking-wide", CATEGORY_COLORS[lifeTip.category] || "text-white/30")}>
                        · {lifeTip.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white/80 leading-relaxed">{lifeTip.tip}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Diet Plan ──────────────────────────────────────────── */}
        <DietPlanCard />

        {/* ── Attribute Cards ─────────────────────────────────────── */}
        <div className="animate-slide-up-fade stagger-3">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Attributes</h2>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {sorted.map(attr => {
              const Icon  = ATTR_ICONS[attr.attribute] || Zap;
              const gain  = attrGains[attr.attribute] || 0;
              return (
                <Card key={attr.id} className={cn("p-3 flex flex-col items-center gap-1.5 hover:bg-white/[0.07] transition-colors cursor-default", getAttributeColorClass(attr.attribute))}>
                  <div className="w-8 h-8 rounded-lg border border-white/[0.08] bg-white/[0.04] flex items-center justify-center">
                    <Icon className="w-4 h-4 text-attr" />
                  </div>
                  <span className="text-2xl font-black leading-none text-attr">{attr.currentValue}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-white/30">{attr.attribute.slice(0, 3)}</span>
                  {gain !== 0 && (
                    <span className={cn("text-[9px] font-bold flex items-center gap-0.5", gain > 0 ? "text-white/60" : "text-white/30")}>
                      {gain > 0 ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                      {Math.abs(gain)}
                    </span>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {/* ── Daily Tasks ─────────────────────────────────────────── */}
        <Card className="animate-slide-up-fade stagger-3">
          <CardHeader className="pb-3 border-b border-white/[0.06]">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Today's Tasks
              </CardTitle>
              {noGoals && (
                <button
                  onClick={() => setGoalModalOpen(true)}
                  className="text-[10px] font-semibold text-white/40 hover:text-white/70 border border-white/[0.08] rounded-lg px-2.5 py-1 hover:bg-white/[0.04] transition-all"
                >
                  Set goals →
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {dailyTasks.length > 0 ? (
              <div className="divide-y divide-white/[0.04]">
                {dailyTasks.map(task => (
                  <DailyTaskItem
                    key={task.id}
                    task={task}
                    onComplete={(id) => completeTask.mutate(id)}
                  />
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">Loading your daily tasks…</p>
                <p className="text-xs text-white/20 mt-1">AI-powered tasks based on your goals</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Bottom row ──────────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2 animate-slide-up-fade stagger-4">

          {/* Attribute Progress Bars */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" /> Skill Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {sorted.length > 0 ? sorted.map(attr => (
                <div key={attr.id} className={cn("space-y-1", getAttributeColorClass(attr.attribute))}>
                  <div className="flex justify-between text-xs">
                    <span className="text-attr font-medium">{attr.attribute}</span>
                    <span className="text-white/40 tabular-nums">{attr.currentValue}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-attr transition-all duration-700" style={{ width: `${Math.min(100, attr.currentValue)}%` }} />
                  </div>
                </div>
              )) : (
                <p className="text-xs text-white/20 py-2">Complete quests to build attributes</p>
              )}
            </CardContent>
          </Card>

          {/* XP Feed */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3 border-b border-white/[0.06]">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
                <ArrowUp className="w-3.5 h-3.5" /> XP Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto max-h-[280px]">
              {recentTransactions.length > 0 ? (
                <div className="divide-y divide-white/[0.04]">
                  {recentTransactions.map(tx => (
                    <div key={tx.id} className="flex items-start justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                          <ArrowUp className="w-3 h-3 text-white/60" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {tx.description || fmtSourceType(tx.sourceType)}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {tx.category && (
                              <span className="text-[10px] text-white/30 font-medium">{tx.category}</span>
                            )}
                            <span className="text-[10px] text-white/25">{new Date(tx.createdAt || "").toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <Badge variant="xp" className="text-[11px] tabular-nums shrink-0 ml-2">+{tx.amount}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Zap className="w-8 h-8 text-white/10 mx-auto mb-3" />
                  <p className="text-sm text-white/30">No activity yet.</p>
                  <p className="text-xs text-white/20 mt-1">Complete quests or daily tasks to earn XP.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Attribute History ────────────────────────────────────── */}
        {attrHistory && attrHistory.length > 0 && (
          <Card className="animate-slide-up-fade stagger-4">
            <CardHeader className="pb-3 border-b border-white/[0.06]">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-white/40">Recent Attribute Changes</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[240px] overflow-y-auto">
              <div className="divide-y divide-white/[0.04]">
                {attrHistory.slice(0, 20).map(entry => (
                  <div key={entry.id} className={cn("flex items-center justify-between px-5 py-3 hover:bg-white/[0.02]", getAttributeColorClass(entry.attribute))}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-attr w-20">{entry.attribute}</span>
                      <span className="text-xs text-white/30">{fmtSourceType(entry.sourceType)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/25">{new Date(entry.createdAt).toLocaleDateString()}</span>
                      <span className={cn("text-sm font-bold tabular-nums", entry.delta > 0 ? "text-white/80" : "text-white/30")}>
                        {entry.delta > 0 ? "+" : ""}{entry.delta}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── AI Coach floating button + panel ─────────────────────── */}
      <AiCoachButton onClick={() => setCoachOpen(true)} />
      <AiCoachPanel open={coachOpen} onClose={() => setCoachOpen(false)} />

      {/* ── Theme Picker ──────────────────────────────────────────── */}
      {themePickerOpen && <ThemePicker onClose={() => setThemePickerOpen(false)} />}

      {/* ── Goal Setup Modal (shown if no goals set) ──────────────── */}
      {goalModalOpen && (
        <GoalSetupModal onClose={() => setGoalModalOpen(false)} />
      )}

      {/* Auto-prompt goal modal once after load */}
      {noGoals && !goalModalDismissed && !goalModalOpen && (
        <GoalSetupModal onClose={() => setGoalModalDismissed(true)} />
      )}
    </AppLayout>
  );
}
