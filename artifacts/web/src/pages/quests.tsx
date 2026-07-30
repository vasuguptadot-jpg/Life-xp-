import AppLayout from "@/components/layout";
import {
  useGetMyQuests,
  useGetQuestCatalogue,
  useGetRecommendedQuests,
  useAssignQuest,
  useUpdateQuestProgress,
  useCompleteQuest,
  QuestTemplate,
  UserQuestWithTemplate
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, Plus, CheckCircle2, Target, Clock,
  Star, Zap, Trophy, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Quests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: myQuests,   isLoading: loadingMine } = useGetMyQuests({ query: { queryKey: ["/api/quests/my"] } });
  const { data: catalogue,  isLoading: loadingCat  } = useGetQuestCatalogue({ query: { queryKey: ["/api/quests/catalogue"] } });
  const { data: recommended, isLoading: loadingRec } = useGetRecommendedQuests({ limit: 5 }, { query: { queryKey: ["/api/quests/recommended"] } });

  const assignMutation   = useAssignQuest();
  const progressMutation = useUpdateQuestProgress();
  const completeMutation = useCompleteQuest();

  const handleAssign = (templateId: string) => {
    assignMutation.mutate({ templateId }, {
      onSuccess: () => {
        toast({ title: "Quest Accepted", description: "Added to your active log." });
        queryClient.invalidateQueries({ queryKey: ["/api/quests/my"] });
      }
    });
  };

  const handleProgress = (userQuestId: string, currentVal: number, maxVal: number) => {
    const nextVal = currentVal + 1;
    progressMutation.mutate({ id: userQuestId, data: { progress: nextVal } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/quests/my"] });
        if (nextVal >= maxVal) handleComplete(userQuestId);
      }
    });
  };

  const handleComplete = (userQuestId: string) => {
    completeMutation.mutate({ id: userQuestId }, {
      onSuccess: (res) => {
        toast({
          title: res.xp?.leveledUp ? "⚡ LEVEL UP!" : "Quest Complete!",
          description: `+${res.xp?.xpAwarded} XP earned`,
          className: res.xp?.leveledUp ? "bg-primary text-primary-foreground border-primary" : undefined,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/quests/my"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/me/progression"] });
      }
    });
  };

  const activeQuests    = myQuests?.filter(q => q.user_quests.status !== "COMPLETED") || [];
  const completedQuests = myQuests?.filter(q => q.user_quests.status === "COMPLETED") || [];

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">

        <header className="mb-6 animate-slide-up-fade">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Objectives</p>
          <h1 className="text-3xl font-bold tracking-tight">Quest Log</h1>
        </header>

        <Tabs defaultValue="active" className="space-y-5">
          <TabsList className="bg-surface border border-border p-1 rounded-xl h-auto gap-1">
            <TabsTrigger value="active" className="rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              Active {activeQuests.length > 0 && <span className="ml-1.5 bg-primary text-primary-foreground rounded-full text-[10px] px-1.5 py-0.5">{activeQuests.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="discover" className="rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              Discover
            </TabsTrigger>
            <TabsTrigger value="completed" className="rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">
              History {completedQuests.length > 0 && <span className="ml-1.5 text-muted-foreground">({completedQuests.length})</span>}
            </TabsTrigger>
          </TabsList>

          {/* Active Quests */}
          <TabsContent value="active" className="animate-slide-up-fade outline-none">
            {loadingMine ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : activeQuests.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-border rounded-2xl bg-card/30">
                <Target className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <h3 className="text-lg font-bold mb-2">No Active Quests</h3>
                <p className="text-sm text-muted-foreground mb-6">Browse the catalogue to find your next challenge.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {activeQuests.map((uq, idx) => (
                  <ActiveQuestCard
                    key={uq.user_quests.id}
                    uq={uq}
                    idx={idx}
                    onProgress={() => handleProgress(uq.user_quests.id, Number(uq.user_quests.progressValue), Number(uq.user_quests.targetValue))}
                    onComplete={() => handleComplete(uq.user_quests.id)}
                    isCompleting={completeMutation.isPending && completeMutation.variables?.id === uq.user_quests.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Discover */}
          <TabsContent value="discover" className="outline-none space-y-8 animate-slide-up-fade">
            {loadingRec || loadingCat ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {recommended && recommended.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Recommended for You</h3>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {recommended.map(template => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          highlighted
                          onAssign={() => handleAssign(template.id)}
                          isAssigning={assignMutation.isPending && assignMutation.variables?.templateId === template.id}
                        />
                      ))}
                    </div>
                  </section>
                )}

                <section>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">All Quests</h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {catalogue?.map(template => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onAssign={() => handleAssign(template.id)}
                        isAssigning={assignMutation.isPending && assignMutation.variables?.templateId === template.id}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}
          </TabsContent>

          {/* Completed */}
          <TabsContent value="completed" className="outline-none animate-slide-up-fade">
            {completedQuests.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No completed quests yet.</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {completedQuests.map((uq) => (
                  <div key={uq.user_quests.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/50 opacity-60">
                    <div>
                      <Badge variant="outline" className="mb-1 text-[10px]">{uq.quest_templates?.category}</Badge>
                      <p className="text-sm font-medium line-through text-muted-foreground">{uq.quest_templates?.title}</p>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0 ml-3" />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function ActiveQuestCard({ uq, idx, onProgress, onComplete, isCompleting }: {
  uq: UserQuestWithTemplate;
  idx: number;
  onProgress: () => void;
  onComplete: () => void;
  isCompleting: boolean;
}) {
  const q    = uq.quest_templates;
  const curr = Number(uq.user_quests.progressValue);
  const target = Number(uq.user_quests.targetValue);
  const pct  = Math.min(100, target > 0 ? (curr / target) * 100 : 0);
  const isReady = curr >= target;

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-300",
      isReady
        ? "border-primary/40 bg-gradient-to-br from-card to-primary/5"
        : "hover:border-border/80",
      `stagger-${(idx % 5) + 1} animate-slide-up-fade`
    )}>
      {isReady && (
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="outline" className="text-[10px] shrink-0">{q?.category}</Badge>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />{q?.questType}
          </div>
        </div>
        <CardTitle className="text-base mt-2">{q?.title}</CardTitle>
      </CardHeader>

      <CardContent className="pb-4">
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{q?.description}</p>
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-muted-foreground">Progress</span>
            <span className={isReady ? "text-primary" : "text-foreground"}>{curr} / {target}</span>
          </div>
          <Progress
            value={pct}
            className="h-2"
            indicatorClassName={isReady
              ? "bg-gradient-to-r from-primary/70 to-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
              : undefined}
          />
        </div>

        {q?.xpReward && (
          <div className="mt-3">
            <Badge variant="xp" className="text-[11px]">
              <Zap className="w-3 h-3 mr-1" />
              +{q.xpReward} XP reward
            </Badge>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0 border-t border-border/40 p-4">
        {!isReady ? (
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={onProgress}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Log Progress
          </Button>
        ) : (
          <Button size="sm" className="w-full text-xs font-bold" onClick={onComplete} disabled={isCompleting}>
            {isCompleting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Claim Reward</>}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function TemplateCard({ template, onAssign, isAssigning, highlighted }: {
  template: QuestTemplate;
  onAssign: () => void;
  isAssigning: boolean;
  highlighted?: boolean;
}) {
  return (
    <Card className={cn(
      "flex flex-col hover:border-border/80 transition-colors",
      highlighted && "border-primary/20 bg-gradient-to-br from-card to-primary/5"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-2">
          <Badge variant={highlighted ? "xp" : "outline"} className="text-[10px]">{template.category}</Badge>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{template.questType}</span>
        </div>
        <CardTitle className="text-base leading-snug">{template.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        <p className="text-sm text-muted-foreground line-clamp-3">{template.description}</p>
        {template.xpReward && (
          <Badge variant="xp" className="mt-3 text-[11px]">
            <Zap className="w-3 h-3 mr-1" />+{template.xpReward} XP
          </Badge>
        )}
      </CardContent>
      <CardFooter className="pt-0 p-4">
        <Button
          variant={highlighted ? "default" : "secondary"}
          size="sm"
          className="w-full text-xs"
          onClick={onAssign}
          disabled={isAssigning}
        >
          {isAssigning ? <Loader2 className="w-4 h-4 animate-spin" /> : "Accept Quest"}
        </Button>
      </CardFooter>
    </Card>
  );
}
