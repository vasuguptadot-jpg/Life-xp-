import AppLayout from "@/components/layout";
import { useGetProgressionSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Zap, TrendingUp, Trophy, ArrowUp,
  Flame, Target, Dumbbell, Brain, Heart,
  BookOpen, Shield, Star
} from "lucide-react";
import { formatXp, getAttributeColorClass, cn } from "@/lib/utils";

function getXpForNextLevel(currentLevel: number) {
  return currentLevel * 1000;
}

function getLevelProgress(totalXp: number, currentLevel: number) {
  const previousTierXp = currentLevel > 1 ? ((currentLevel - 1) * 1000) : 0;
  const currentTierRequired = getXpForNextLevel(currentLevel);
  const xpInTier = Math.max(0, totalXp - previousTierXp);
  const percentage = Math.min(100, Math.max(0, (xpInTier / currentTierRequired) * 100));
  return { xpInTier, currentTierRequired, percentage };
}

function getRankTitle(level: number) {
  if (level < 5)  return "Initiate";
  if (level < 10) return "Adventurer";
  if (level < 20) return "Champion";
  if (level < 35) return "Hero";
  return "Legend";
}

const ATTR_ICONS: Record<string, React.ElementType> = {
  STRENGTH: Dumbbell,
  ENDURANCE: Flame,
  MOBILITY: Target,
  NUTRITION: Heart,
  RECOVERY: Shield,
  DISCIPLINE: Star,
  KNOWLEDGE: Brain,
};

export default function Dashboard() {
  const { data: progression, isLoading } = useGetProgressionSummary({
    query: { queryKey: ["/api/users/me/progression"] }
  });

  if (isLoading || !progression) {
    return (
      <AppLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const { level, attributes, recentTransactions } = progression;
  const { xpInTier, currentTierRequired, percentage } = getLevelProgress(level.totalXp, level.currentLevel);
  const rank = getRankTitle(level.currentLevel);
  const sortedAttributes = [...attributes].sort((a, b) => b.currentValue - a.currentValue);

  // SVG ring constants
  const R = 56, CIRCUMFERENCE = 2 * Math.PI * R;
  const dashOffset = CIRCUMFERENCE - (CIRCUMFERENCE * percentage) / 100;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Page header */}
        <header className="animate-slide-up-fade">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Today</p>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        </header>

        {/* ── Hero: XP + Level Card ─────────────────────────────── */}
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 animate-slide-up-fade stagger-1">
          {/* Background glow orb */}
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-primary/8 rounded-full blur-3xl pointer-events-none" />

          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              {/* XP Ring */}
              <div className="relative shrink-0">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 128 128">
                  {/* Track */}
                  <circle cx="64" cy="64" r={R} fill="none"
                    stroke="hsl(var(--surface))" strokeWidth="9" />
                  {/* Progress */}
                  <circle cx="64" cy="64" r={R} fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="9"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    className="animate-dash drop-shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Level</span>
                  <span className="text-4xl font-black leading-none text-glow">{level.currentLevel}</span>
                </div>
              </div>

              {/* XP Info */}
              <div className="flex-1 min-w-0 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge variant="xp" className="text-[10px]">
                      <Trophy className="w-3 h-3 mr-1" />
                      {rank}
                    </Badge>
                  </div>
                  <h2 className="text-xl font-bold mt-2">Experience Points</h2>
                  <p className="text-sm text-muted-foreground">
                    <span className="text-foreground font-semibold">{formatXp(xpInTier)}</span>
                    {" "}/{" "}{formatXp(currentTierRequired)} XP to next level
                  </p>
                </div>

                <Progress
                  value={percentage}
                  className="h-2.5"
                  indicatorClassName="bg-gradient-to-r from-primary/70 to-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
                />

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                    <span>Total: <span className="text-foreground font-semibold">{formatXp(level.totalXp)} XP</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Flame className="w-3.5 h-3.5 text-achievement" />
                    <span><span className="text-foreground font-semibold">0</span> day streak</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Attributes Grid ───────────────────────────────────── */}
        <div className="animate-slide-up-fade stagger-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Attributes</h2>
            <span className="text-xs text-muted-foreground">{attributes.length} stats tracked</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {sortedAttributes.map((attr) => {
              const Icon = ATTR_ICONS[attr.attribute] || Zap;
              return (
                <Card
                  key={attr.id}
                  className={cn(
                    "p-3 flex flex-col items-center gap-2 border hover:scale-[1.03] transition-transform duration-200 cursor-default",
                    getAttributeColorClass(attr.attribute)
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center border bg-background/40",
                    "border-attr shadow-attr"
                  )}>
                    <Icon className="w-4.5 h-4.5 text-attr" />
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-black leading-none text-attr">{attr.currentValue}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mt-0.5">
                      {attr.attribute.slice(0, 3)}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* ── Bottom Row ────────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2 animate-slide-up-fade stagger-3">

          {/* Attribute Progress Bars */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-accent" />
                Skill Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortedAttributes.slice(0, 5).map((attr) => (
                <div key={attr.id} className={cn("space-y-1.5", getAttributeColorClass(attr.attribute))}>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-attr">{attr.attribute}</span>
                    <span className="text-foreground tabular-nums">{attr.currentValue}</span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full bg-attr shadow-attr transition-all duration-700"
                      style={{ width: `${Math.min(100, attr.currentValue)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent XP Feed */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowUp className="w-4 h-4 text-primary" />
                XP Feed
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto max-h-[260px]">
              {recentTransactions.length > 0 ? (
                <div className="divide-y divide-border">
                  {recentTransactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-sm font-medium capitalize">{tx.sourceType.toLowerCase().replace("_", " ")}</div>
                          <div className="text-xs text-muted-foreground">{new Date(tx.createdAt || "").toLocaleDateString()}</div>
                        </div>
                      </div>
                      <Badge variant="xp" className="text-[11px] tabular-nums">+{tx.amount} XP</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Complete quests to earn XP.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
