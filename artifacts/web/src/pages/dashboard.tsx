import AppLayout from "@/components/layout";
import { useGetProgressionSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, TrendingUp, Trophy, ArrowUp } from "lucide-react";
import { formatXp, getAttributeColorClass, cn } from "@/lib/utils";

// Helper to determine XP required for next level (simple exponential curve for UI display)
function getXpForNextLevel(currentLevel: number) {
  return currentLevel * 1000; 
}

function getLevelProgress(totalXp: number, currentLevel: number) {
  // Let's pretend previous level required (currentLevel-1)*1000 total XP
  const previousTierXp = currentLevel > 1 ? ((currentLevel - 1) * 1000) : 0;
  const currentTierRequired = getXpForNextLevel(currentLevel);
  const xpInTier = Math.max(0, totalXp - previousTierXp);
  const percentage = Math.min(100, Math.max(0, (xpInTier / currentTierRequired) * 100));
  return { xpInTier, currentTierRequired, percentage };
}

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

  // Group attributes to display them nicely
  const sortedAttributes = [...attributes].sort((a, b) => b.currentValue - a.currentValue);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        
        <header className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tighter text-glow mb-1">Status Report</h1>
            <p className="text-muted-foreground font-mono text-sm">System synchronized. All metrics live.</p>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          
          {/* Main Level Card */}
          <Card className="md:col-span-2 relative overflow-hidden border-primary/20 bg-card/80 backdrop-blur-xl animate-slide-up-fade stagger-1">
            <div className="absolute top-0 right-0 p-32 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
            <CardContent className="p-8">
              <div className="flex items-center gap-6">
                <div className="relative">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle cx="64" cy="64" r="60" className="stroke-muted fill-none" strokeWidth="8" />
                    <circle 
                      cx="64" cy="64" r="60" 
                      className="stroke-primary fill-none animate-dash" 
                      strokeWidth="8" 
                      strokeDasharray="377" 
                      strokeDashoffset={377 - (377 * percentage) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Lvl</span>
                    <span className="text-4xl font-black text-glow tracking-tighter leading-none">{level.currentLevel}</span>
                  </div>
                </div>
                
                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <h2 className="text-xl font-bold tracking-tight uppercase">Experience</h2>
                      <span className="font-mono text-sm text-muted-foreground">
                        <span className="text-foreground">{formatXp(xpInTier)}</span> / {formatXp(currentTierRequired)} XP
                      </span>
                    </div>
                    <Progress value={percentage} className="h-3 bg-background" indicatorClassName="bg-gradient-to-r from-primary/50 to-primary" />
                  </div>
                  <div className="flex gap-4">
                    <Badge variant="outline" className="font-mono bg-background text-xs py-1">
                      <Trophy className="w-3 h-3 mr-2 text-primary" />
                      Rank: Initiate
                    </Badge>
                    <Badge variant="outline" className="font-mono bg-background text-xs py-1">
                      <TrendingUp className="w-3 h-3 mr-2 text-accent" />
                      Total: {formatXp(level.totalXp)}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Radar/Summary Box (Visual placeholder for stats balance) */}
          <Card className="animate-slide-up-fade stagger-2 bg-card/80 backdrop-blur-xl border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Vitals Output
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 pt-2">
                {sortedAttributes.slice(0, 4).map(attr => (
                  <div key={attr.id} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-mono">
                      <span className={cn(getAttributeColorClass(attr.attribute), "text-attr font-bold")}>{attr.attribute}</span>
                      <span className="text-foreground">{attr.currentValue}</span>
                    </div>
                    <Progress value={Math.min(100, attr.currentValue)} className="h-1.5" indicatorClassName={cn(getAttributeColorClass(attr.attribute), "bg-attr")} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          
          {/* Full Attributes List */}
          <Card className="animate-slide-up-fade stagger-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Core Attributes
              </CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              {sortedAttributes.map(attr => (
                <div key={attr.id} className="flex items-center p-3 rounded-lg border border-border bg-background/50 hover:bg-card transition-colors">
                  <div className={cn(
                    "w-10 h-10 rounded flex items-center justify-center text-lg font-bold mr-3 border bg-background",
                    getAttributeColorClass(attr.attribute),
                    "border-attr text-attr shadow-attr"
                  )}>
                    {attr.attribute.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-mono text-muted-foreground">{attr.attribute}</div>
                    <div className="font-bold text-lg leading-none">{attr.currentValue}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent Activity Log */}
          <Card className="animate-slide-up-fade stagger-4 flex flex-col">
            <CardHeader className="border-b border-border bg-card/50">
              <CardTitle className="text-lg">Recent XP Feed</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto max-h-[300px]">
              {recentTransactions.length > 0 ? (
                <div className="divide-y divide-border">
                  {recentTransactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/30">
                          <ArrowUp className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-medium text-sm">{tx.sourceType}</div>
                          <div className="text-xs font-mono text-muted-foreground">{new Date(tx.createdAt || "").toLocaleDateString()}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-mono">
                        +{tx.amount} XP
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground font-mono text-sm">
                  No recent activity logged.
                  <br />Time to complete some quests.
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </AppLayout>
  );
}

// simple icon mapping missing component above
function Activity(props: any) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>;
}
