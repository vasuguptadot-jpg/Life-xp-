import AppLayout from "@/components/layout";
import { useGetProgressionSummary, useGetAttributeHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, TrendingUp, ArrowUp, Dumbbell, Flame, Target, Heart, Shield, Star, Brain, ChevronUp, ChevronDown } from "lucide-react";
import { formatXp, getAttributeColorClass, cn } from "@/lib/utils";
import { useMemo } from "react";

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

function fmtSourceType(s: string) {
  return s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const ATTR_ICONS: Record<string, React.ElementType> = {
  STRENGTH: Dumbbell, ENDURANCE: Flame, MOBILITY: Target,
  NUTRITION: Heart,   RECOVERY: Shield, DISCIPLINE: Star, KNOWLEDGE: Brain,
};

export default function Dashboard() {
  const { data: prog, isLoading } = useGetProgressionSummary({ query: { queryKey: ["/api/users/me/progression"] } });
  const { data: attrHistory }     = useGetAttributeHistory({ limit: 100 }, { query: { queryKey: ["/api/progression/attribute-history"] } });

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
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-white/40" />
        </div>
      </AppLayout>
    );
  }

  const { level, attributes, recentTransactions } = prog;
  const { xpIn, req, pct } = getLevelProgress(level.totalXp, level.currentLevel);
  const sorted = [...attributes].sort((a, b) => b.currentValue - a.currentValue);
  const R = 52, C = 2 * Math.PI * R;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <header className="animate-slide-up-fade">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Overview</p>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        </header>

        {/* ── Hero: Level + XP ───────────────────────────────── */}
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

        {/* ── Attribute Cards ─────────────────────────────────── */}
        <div className="animate-slide-up-fade stagger-2">
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

        {/* ── Bottom row ──────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2 animate-slide-up-fade stagger-3">

          {/* Attribute Progress Bars */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" /> Skill Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {sorted.map(attr => (
                <div key={attr.id} className={cn("space-y-1", getAttributeColorClass(attr.attribute))}>
                  <div className="flex justify-between text-xs">
                    <span className="text-attr font-medium">{attr.attribute}</span>
                    <span className="text-white/40 tabular-nums">{attr.currentValue}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-attr transition-all duration-700" style={{ width: `${Math.min(100, attr.currentValue)}%` }} />
                  </div>
                </div>
              ))}
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
                  <p className="text-xs text-white/20 mt-1">Complete quests to earn XP.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Attribute History ────────────────────────────────── */}
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
    </AppLayout>
  );
}
