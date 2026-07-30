import { useState } from "react";
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
import { Loader2, Plus, CheckCircle2, ChevronRight, Target, Clock, Star, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Quests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries
  const { data: myQuests, isLoading: loadingMine } = useGetMyQuests({ query: { queryKey: ["/api/quests/my"] } });
  const { data: catalogue, isLoading: loadingCat } = useGetQuestCatalogue({ query: { queryKey: ["/api/quests/catalogue"] } });
  const { data: recommended, isLoading: loadingRec } = useGetRecommendedQuests({ limit: 5 }, { query: { queryKey: ["/api/quests/recommended"] } });

  // Mutations
  const assignMutation = useAssignQuest();
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
        if (nextVal >= maxVal) {
           // auto complete if hit target
           handleComplete(userQuestId);
        }
      }
    });
  };

  const handleComplete = (userQuestId: string) => {
    completeMutation.mutate({ id: userQuestId }, {
      onSuccess: (res) => {
        toast({ 
          title: "Quest Completed", 
          description: `Gained ${res.xp?.xpAwarded} XP! ${res.xp?.leveledUp ? "LEVEL UP!" : ""}`,
          className: "bg-primary text-primary-foreground border-primary"
        });
        queryClient.invalidateQueries({ queryKey: ["/api/quests/my"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/me/progression"] });
      }
    });
  };

  const activeQuests = myQuests?.filter(q => q.user_quests.status !== "COMPLETED") || [];
  const completedQuests = myQuests?.filter(q => q.user_quests.status === "COMPLETED") || [];

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tighter text-glow mb-1">Quest Log</h1>
          <p className="text-muted-foreground font-mono text-sm">Track active assignments and discover new objectives.</p>
        </header>

        <Tabs defaultValue="active" className="space-y-6">
          <TabsList className="bg-background border border-border p-1">
            <TabsTrigger value="active" className="data-[state=active]:bg-card data-[state=active]:border-border font-mono uppercase tracking-wider text-xs">Active ({activeQuests.length})</TabsTrigger>
            <TabsTrigger value="discover" className="data-[state=active]:bg-card data-[state=active]:border-border font-mono uppercase tracking-wider text-xs">Discover</TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:bg-card data-[state=active]:border-border font-mono uppercase tracking-wider text-xs">History ({completedQuests.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="animate-slide-up-fade outline-none">
            {loadingMine ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : activeQuests.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-border rounded-xl bg-card/30">
                <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-bold mb-2">No Active Quests</h3>
                <p className="text-muted-foreground font-mono text-sm mb-6">Your log is empty. Visit Discover to accept new assignments.</p>
                <Button variant="outline" onClick={() => document.querySelector('[data-value="discover"]')?.dispatchEvent(new MouseEvent('click', {bubbles: true}))}>
                  Browse Catalogue
                </Button>
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

          <TabsContent value="discover" className="outline-none space-y-8 animate-slide-up-fade">
            {loadingRec || loadingCat ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : (
              <>
                {recommended && recommended.length > 0 && (
                  <section>
                    <h3 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2 text-accent">
                      <Star className="w-5 h-5" fill="currentColor" />
                      Priority Directives
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {recommended.map(template => (
                        <TemplateCard 
                          key={template.id} 
                          template={template} 
                          onAssign={() => handleAssign(template.id)}
                          isAssigning={assignMutation.isPending && assignMutation.variables?.templateId === template.id}
                        />
                      ))}
                    </div>
                  </section>
                )}

                <section>
                  <h3 className="text-lg font-bold tracking-tight mb-4 text-glow">Full Catalogue</h3>
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

          <TabsContent value="completed" className="outline-none animate-slide-up-fade">
             <div className="grid gap-4 md:grid-cols-2">
                {completedQuests.map((uq) => (
                  <Card key={uq.user_quests.id} className="opacity-70 border-muted">
                    <CardHeader className="py-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <Badge variant="outline" className="mb-2 bg-background font-mono text-[10px]">{uq.quest_templates?.category}</Badge>
                          <CardTitle className="text-base line-through">{uq.quest_templates?.title}</CardTitle>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
          </TabsContent>

        </Tabs>
      </div>
    </AppLayout>
  );
}

// Subcomponents

function ActiveQuestCard({ uq, idx, onProgress, onComplete, isCompleting }: { uq: UserQuestWithTemplate, idx: number, onProgress: ()=>void, onComplete: ()=>void, isCompleting: boolean }) {
  const q = uq.quest_templates;
  const curr = Number(uq.user_quests.progressValue);
  const target = Number(uq.user_quests.targetValue);
  const pct = Math.min(100, (curr / target) * 100) || 0;
  
  const isReady = curr >= target;

  return (
    <Card className={cn(
      "border-l-4 transition-all duration-300 relative overflow-hidden",
      isReady ? "border-l-primary bg-primary/5" : "border-l-border hover:border-l-muted-foreground",
      `stagger-${(idx%5)+1}`
    )}>
      {isReady && <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none animate-pulse" />}
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <Badge variant="outline" className="bg-background text-[10px] font-mono border-border/50 uppercase">{q?.category}</Badge>
          <Badge variant="secondary" className="text-[10px] font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" /> {q?.questType}
          </Badge>
        </div>
        <CardTitle className="text-xl mt-2">{q?.title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{q?.description}</p>
        
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-muted-foreground">PROGRESS</span>
            <span className={cn(isReady && "text-primary font-bold")}>{curr} / {target}</span>
          </div>
          <Progress value={pct} className="h-2 bg-background border" indicatorClassName={isReady ? "bg-primary shadow-[0_0_10px_hsl(var(--primary))]" : "bg-foreground"} />
        </div>
      </CardContent>
      <CardFooter className="pt-0 justify-end gap-2 border-t border-border/50 bg-muted/20 p-4">
        {!isReady ? (
          <Button variant="outline" size="sm" className="w-full font-mono text-xs hover:bg-primary/20 hover:text-primary hover:border-primary" onClick={onProgress}>
            <Plus className="w-4 h-4 mr-2" /> LOG PROGRESS
          </Button>
        ) : (
          <Button size="sm" className="w-full font-bold tracking-widest bg-glow animate-in zoom-in" onClick={onComplete} disabled={isCompleting}>
            {isCompleting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <span className="flex items-center">CLAIM REWARD <CheckCircle2 className="w-4 h-4 ml-2" /></span>
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function TemplateCard({ template, onAssign, isAssigning }: { template: QuestTemplate, onAssign: ()=>void, isAssigning: boolean }) {
  return (
    <Card className="flex flex-col border-border/50 hover:border-primary/50 transition-colors bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex justify-between mb-2">
          <Badge variant="outline" className="bg-background text-[10px] font-mono border-border/50 uppercase">{template.category}</Badge>
          <span className="text-xs font-mono text-muted-foreground uppercase">{template.questType}</span>
        </div>
        <CardTitle className="text-lg leading-tight">{template.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        <p className="text-sm text-muted-foreground line-clamp-3">{template.description}</p>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button variant="secondary" className="w-full text-xs font-mono group" onClick={onAssign} disabled={isAssigning}>
          {isAssigning ? <Loader2 className="w-4 h-4 animate-spin" /> : (
            <>
              ACCEPT QUEST <ExternalLink className="w-3 h-3 ml-2 opacity-50 group-hover:opacity-100 transition-opacity" />
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
