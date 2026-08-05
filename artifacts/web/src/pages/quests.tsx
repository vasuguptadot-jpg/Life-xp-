import { useState } from "react";
import AppLayout from "@/components/layout";
import {
  useGetMyQuests, useGetQuestCatalogue, useGetRecommendedQuests,
  useAssignQuest, useUpdateQuestProgress, useCompleteQuest, useAbandonQuest,
  QuestTemplate, UserQuestWithTemplate
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import {
  Loader2, Plus, CheckCircle2, Target, Clock, Zap,
  BookOpen, AlertCircle, ChevronRight, Info, X, Brain,
  Dumbbell, Flame, Heart, Shield, Star, Route, Edit3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiGoals, useSaveAiGoals, useDailyTasks, useCompleteTask, DailyTask } from "@/hooks/use-ai";

// ── Helpers ──────────────────────────────────────────────────────────────────

function difficultyLabel(d: string | null | undefined) {
  return d?.charAt(0) + (d?.slice(1).toLowerCase() || "") || "Medium";
}

function difficultyClass(d: string | null | undefined) {
  const map: Record<string, string> = {
    EASY: "bg-white/[0.06] text-white/50", MEDIUM: "bg-white/[0.09] text-white/60",
    HARD: "bg-white/[0.12] text-white/70", EXPERT: "bg-white/[0.18] text-white/90",
  };
  return map[d || "MEDIUM"] || map.MEDIUM;
}

function parseProgConfig(cfg: unknown): { xp: number; attrs: Array<{ attribute: string; xp: number }> } {
  const c = (cfg ?? {}) as Record<string, unknown>;
  return {
    xp:    Number(c.xp   ?? 50),
    attrs: Array.isArray(c.attributes) ? c.attributes as any[] : [],
  };
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const ATTR_ICONS: Record<string, React.ElementType> = {
  STRENGTH: Dumbbell, ENDURANCE: Flame, MOBILITY: Target,
  NUTRITION: Heart, RECOVERY: Shield, DISCIPLINE: Star, KNOWLEDGE: Brain,
};

const ATTR_COLORS: Record<string, string> = {
  STRENGTH: "text-white/90", ENDURANCE: "text-white/80", MOBILITY: "text-white/70",
  NUTRITION: "text-white/65", RECOVERY: "text-white/60", DISCIPLINE: "text-white/55", KNOWLEDGE: "text-white/50",
};

// ── Quest Detail Dialog ───────────────────────────────────────────────────────

interface DetailDialogProps {
  uq: UserQuestWithTemplate | null;
  open: boolean;
  onClose: () => void;
  onProgress: () => void;
  onComplete: () => void;
  onAbandon: () => void;
  isCompleting: boolean;
  isAbandoning: boolean;
}

function QuestDetailDialog({ uq, open, onClose, onProgress, onComplete, onAbandon, isCompleting, isAbandoning }: DetailDialogProps) {
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  if (!uq) return null;
  const q    = uq.quest_templates;
  const curr = Number(uq.user_quests.progressValue);
  const tgt  = Number(uq.user_quests.targetValue);
  const pct  = Math.min(100, tgt > 0 ? (curr / tgt) * 100 : 0);
  const isReady = curr >= tgt;
  const pc   = parseProgConfig(q?.progressionConfig);

  return (
    <Dialog open={open} onOpenChange={() => { setConfirmAbandon(false); onClose(); }}>
      <DialogContent className="glass-heavy border-white/[0.1] rounded-2xl max-w-lg p-6">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              {q?.difficulty && (
                <span className={cn("inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full", difficultyClass(q.difficulty))}>
                  {difficultyLabel(q.difficulty)}
                </span>
              )}
              <DialogTitle className="text-lg font-bold leading-snug">{q?.title}</DialogTitle>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="ghost" className="text-[10px]">{q?.category}</Badge>
                <Badge variant="ghost" className="text-[10px] flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />{q?.questType}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {q?.description && (
            <p className="text-sm text-white/60 leading-relaxed">{q.description}</p>
          )}

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-white/40">
              <span>Progress</span>
              <span>{curr} / {tgt}</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>

          <div className="flex items-center gap-2 text-xs text-white/40">
            <Zap className="w-3.5 h-3.5 text-white/60" />
            <span className="font-semibold text-white/70">+{pc.xp} XP on completion</span>
          </div>

          <div className="flex gap-2 flex-wrap pt-2">
            {!isReady ? (
              <Button size="sm" onClick={onProgress} className="flex-1">
                <ChevronRight className="w-3.5 h-3.5 mr-1" /> Log Progress
              </Button>
            ) : (
              <Button size="sm" onClick={onComplete} disabled={isCompleting} className="flex-1">
                {isCompleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Complete Quest</>}
              </Button>
            )}
            {!confirmAbandon ? (
              <Button size="sm" variant="ghost" className="text-white/30 hover:text-white/80" onClick={() => setConfirmAbandon(true)}>
                Abandon
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={onAbandon} disabled={isAbandoning}>
                {isAbandoning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm Abandon"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Goals Manager ─────────────────────────────────────────────────────────────

function GoalsManager() {
  const { data: aiGoals, isLoading } = useAiGoals();
  const saveGoals = useSaveAiGoals();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const hasGoals = aiGoals?.goals && aiGoals.goals.trim().length > 0;

  const handleSave = () => {
    if (draft.trim().length < 5) { toast({ title: "Please describe your goals" }); return; }
    saveGoals.mutate(draft, {
      onSuccess: () => { toast({ title: "Goals updated! AI tasks will refresh." }); setEditing(false); },
      onError: (e) => toast({ title: "Failed to save", description: e.message }),
    });
  };

  if (isLoading) return null;

  if (!hasGoals || editing) {
    return (
      <div className="glass-heavy border border-white/[0.1] rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Route className="w-4 h-4 text-white/50" />
              {hasGoals ? "Update Your Goals" : "Set Your Goals"}
            </h3>
            <p className="text-xs text-white/40 mt-0.5">
              Describe what you want to achieve — the AI coach will build a personalized roadmap of daily tasks.
            </p>
          </div>
          {editing && hasGoals && (
            <button onClick={() => setEditing(false)} className="text-white/30 hover:text-white/60 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <textarea
          value={draft || (editing ? draft : aiGoals?.goals ?? "")}
          onChange={e => setDraft(e.target.value)}
          onFocus={() => !draft && setDraft(aiGoals?.goals ?? "")}
          placeholder="e.g. I want to lose 10kg, build muscle, and improve my focus for work. I can exercise 3x per week and have 30 mins daily for reading."
          rows={4}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-white/20 transition-colors"
        />
        <Button onClick={handleSave} disabled={saveGoals.isPending || !draft.trim()} size="sm" className="w-full">
          {saveGoals.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
          {hasGoals ? "Update Roadmap" : "Generate My Roadmap"}
        </Button>
      </div>
    );
  }

  return (
    <div className="glass-heavy border border-white/[0.08] rounded-2xl p-4 flex items-start gap-3">
      <Route className="w-4 h-4 text-white/50 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-1">Your Goal Roadmap</p>
        <p className="text-sm text-white/70 leading-relaxed line-clamp-3">{aiGoals.goals}</p>
        {aiGoals.updatedAt && (
          <p className="text-[10px] text-white/25 mt-1.5">Updated {fmtDate(aiGoals.updatedAt)}</p>
        )}
      </div>
      <button onClick={() => { setDraft(aiGoals.goals ?? ""); setEditing(true); }}
        className="shrink-0 text-white/30 hover:text-white/60 transition-colors p-1">
        <Edit3 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── AI Daily Tasks Section ────────────────────────────────────────────────────

function AiTasksSection() {
  const { data: tasks = [], isLoading } = useDailyTasks();
  const { data: aiGoals } = useAiGoals();
  const completeTask = useCompleteTask();
  const { toast } = useToast();

  const hasGoals = aiGoals?.goals && aiGoals.goals.trim().length > 0;
  const completed = tasks.filter(t => t.isCompleted).length;

  if (!hasGoals) return null;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-2">Today's AI Tasks</div>
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-white/30" /></div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-white/30">Today's AI Tasks</div>
        <div className="text-center py-8 rounded-2xl border border-dashed border-white/[0.07]">
          <Zap className="w-8 h-8 text-white/10 mx-auto mb-2" />
          <p className="text-sm text-white/40">AI tasks are generating...</p>
          <p className="text-xs text-white/25 mt-1">Check back in a moment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white/30">Today's AI Tasks</span>
        <span className="text-[10px] text-white/30">{completed}/{tasks.length} done</span>
      </div>
      <div className="glass-heavy border border-white/[0.08] rounded-2xl overflow-hidden divide-y divide-white/[0.04]">
        {tasks.map(task => {
          const Icon = ATTR_ICONS[task.category] || Zap;
          const color = ATTR_COLORS[task.category] || "text-white/50";
          return (
            <div key={task.id} className={cn("flex items-start gap-3 p-4 transition-colors", task.isCompleted && "opacity-50")}>
              <button
                onClick={() => !task.isCompleted && completeTask.mutate(task.id, {
                  onSuccess: () => toast({ title: "Task done!", description: `+${task.xpReward} XP` }),
                })}
                className={cn("mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                  task.isCompleted
                    ? "bg-white/20 border-white/30"
                    : "border-white/20 hover:border-white/50"
                )}
              >
                {task.isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-white/60" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm leading-snug", task.isCompleted && "line-through")}>{task.taskText}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Icon className={cn("w-3 h-3", color)} />
                  <span className={cn("text-[10px] font-semibold uppercase tracking-wider", color)}>{task.category}</span>
                  <span className="text-[10px] text-white/30">· +{task.xpReward} XP</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Quests Page ──────────────────────────────────────────────────────────

export default function Quests() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [detailUq, setDetailUq] = useState<UserQuestWithTemplate | null>(null);

  const { data: myQuests,   isLoading: loadingMine } = useGetMyQuests({ query: { queryKey: ["/api/quests/my"] } });
  const { data: catalogue,   isLoading: loadingCat  } = useGetQuestCatalogue({ query: { queryKey: ["/api/quests/catalogue"] } });
  const { data: recommended, isLoading: loadingRec  } = useGetRecommendedQuests({ limit: 6 }, { query: { queryKey: ["/api/quests/recommended"] } });

  const assignMutation   = useAssignQuest();
  const progressMutation = useUpdateQuestProgress();
  const completeMutation = useCompleteQuest();
  const abandonMutation  = useAbandonQuest();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/quests/my"] });
    qc.invalidateQueries({ queryKey: ["/api/users/me/progression"] });
  };

  const handleAssign = (templateId: string) => {
    assignMutation.mutate({ templateId }, {
      onSuccess: () => { toast({ title: "Quest Accepted" }); invalidate(); }
    });
  };

  const handleProgress = (uq: UserQuestWithTemplate) => {
    const curr = Number(uq.user_quests.progressValue);
    const tgt  = Number(uq.user_quests.targetValue);
    const next = curr + 1;
    progressMutation.mutate({ id: uq.user_quests.id, data: { progress: next } }, {
      onSuccess: () => { invalidate(); if (next >= tgt) handleComplete(uq.user_quests.id); }
    });
  };

  const handleComplete = (id: string) => {
    completeMutation.mutate({ id }, {
      onSuccess: (res) => {
        toast({
          title: res.xp?.leveledUp ? "⚡ Level Up!" : "Quest Complete!",
          description: `+${res.xp?.xpAwarded} XP earned`,
        });
        setDetailUq(null);
        invalidate();
      }
    });
  };

  const handleAbandon = (id: string) => {
    abandonMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "Quest abandoned" }); setDetailUq(null); invalidate(); }
    });
  };

  const active    = myQuests?.filter(q => q.user_quests.status !== "COMPLETED" && q.user_quests.status !== "ABANDONED") || [];
  const completed = myQuests?.filter(q => q.user_quests.status === "COMPLETED") || [];
  const abandoned = myQuests?.filter(q => q.user_quests.status === "ABANDONED") || [];

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">

        <header className="mb-5 animate-slide-up-fade">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Objectives</p>
          <h1 className="text-2xl font-bold tracking-tight">Quest Log</h1>
        </header>

        <Tabs defaultValue="active" className="space-y-4">
          <TabsList className="bg-white/[0.04] border border-white/[0.06] p-1 rounded-xl h-auto gap-0.5 flex-wrap">
            {[
              { value: "active",   label: "Active Tasks",       count: active.length },
              { value: "roadmap",  label: "Explore Roadmap",    count: null },
              { value: "completed", label: "Completed Tasks",   count: completed.length },
            ].map(t => (
              <TabsTrigger key={t.value} value={t.value}
                className="rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white/40 data-[state=active]:bg-white/[0.08] data-[state=active]:text-white data-[state=active]:shadow-none">
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span className="ml-1.5 text-[9px] bg-white/10 rounded-full px-1.5 py-0.5">{t.count}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Active Tasks ── */}
          <TabsContent value="active" className="animate-slide-up-fade outline-none space-y-6">
            {/* AI daily tasks */}
            <AiTasksSection />

            {/* Quest section */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-3">Active Quests</h3>
              {loadingMine ? <Spinner /> : active.length === 0 ? (
                <EmptyState icon={Target} text="No active quests" sub='Browse "Explore Roadmap" to start one.' />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {active.map((uq, idx) => (
                    <ActiveCard key={uq.user_quests.id} uq={uq} idx={idx}
                      onOpen={() => setDetailUq(uq)}
                      onProgress={() => handleProgress(uq)}
                      onComplete={() => handleComplete(uq.user_quests.id)}
                      isCompleting={completeMutation.isPending && completeMutation.variables?.id === uq.user_quests.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Explore Roadmap ── */}
          <TabsContent value="roadmap" className="outline-none space-y-6 animate-slide-up-fade">
            <GoalsManager />

            {loadingRec || loadingCat ? <Spinner /> : (
              <>
                {recommended && recommended.length > 0 && (
                  <section>
                    <SectionLabel>Recommended for You</SectionLabel>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {recommended.map(t => (
                        <TemplateCard key={t.id} template={t} highlighted
                          onAssign={() => handleAssign(t.id)}
                          isAssigning={assignMutation.isPending && (assignMutation.variables as any)?.templateId === t.id} />
                      ))}
                    </div>
                  </section>
                )}
                <section>
                  <SectionLabel>All Quests</SectionLabel>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {catalogue?.map(t => (
                      <TemplateCard key={t.id} template={t}
                        onAssign={() => handleAssign(t.id)}
                        isAssigning={assignMutation.isPending && (assignMutation.variables as any)?.templateId === t.id} />
                    ))}
                  </div>
                </section>
              </>
            )}
          </TabsContent>

          {/* ── Completed Tasks ── */}
          <TabsContent value="completed" className="outline-none animate-slide-up-fade">
            {completed.length + abandoned.length === 0 ? (
              <EmptyState icon={CheckCircle2} text="No completed quests yet" sub="Complete quests to build your history." />
            ) : (
              <div className="space-y-4">
                {completed.length > 0 && (
                  <section>
                    <SectionLabel>Completed ({completed.length})</SectionLabel>
                    <div className="grid gap-2 md:grid-cols-2">
                      {completed.map(uq => <HistoryCard key={uq.user_quests.id} uq={uq} variant="completed" />)}
                    </div>
                  </section>
                )}
                {abandoned.length > 0 && (
                  <section>
                    <SectionLabel>Abandoned ({abandoned.length})</SectionLabel>
                    <div className="grid gap-2 md:grid-cols-2">
                      {abandoned.map(uq => <HistoryCard key={uq.user_quests.id} uq={uq} variant="abandoned" />)}
                    </div>
                  </section>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Detail dialog */}
        <QuestDetailDialog
          uq={detailUq}
          open={!!detailUq}
          onClose={() => setDetailUq(null)}
          onProgress={() => detailUq && handleProgress(detailUq)}
          onComplete={() => detailUq && handleComplete(detailUq.user_quests.id)}
          onAbandon={() => detailUq && handleAbandon(detailUq.user_quests.id)}
          isCompleting={completeMutation.isPending}
          isAbandoning={abandonMutation.isPending}
        />
      </div>
    </AppLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-white/30" /></div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-3">{children}</h3>;
}

function EmptyState({ icon: Icon, text, sub }: { icon: React.ElementType; text: string; sub: string }) {
  return (
    <div className="text-center py-20 rounded-2xl border border-dashed border-white/[0.07]">
      <Icon className="w-10 h-10 text-white/10 mx-auto mb-3" />
      <p className="text-sm font-semibold text-white/40">{text}</p>
      <p className="text-xs text-white/25 mt-1">{sub}</p>
    </div>
  );
}

function ActiveCard({ uq, idx, onOpen, onProgress, onComplete, isCompleting }: {
  uq: UserQuestWithTemplate; idx: number;
  onOpen: () => void; onProgress: () => void; onComplete: () => void; isCompleting: boolean;
}) {
  const q      = uq.quest_templates;
  const curr   = Number(uq.user_quests.progressValue);
  const tgt    = Number(uq.user_quests.targetValue);
  const pct    = Math.min(100, tgt > 0 ? (curr / tgt) * 100 : 0);
  const isReady = curr >= tgt;
  const pc     = parseProgConfig(q?.progressionConfig);

  return (
    <Card className="group cursor-pointer hover:border-white/[0.12] transition-all" onClick={onOpen}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            {q?.difficulty && (
              <span className={cn("inline-block text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full", difficultyClass(q.difficulty))}>
                {difficultyLabel(q.difficulty)}
              </span>
            )}
            <CardTitle className="text-sm leading-snug">{q?.title}</CardTitle>
          </div>
          <Badge variant="xp" className="shrink-0 text-[10px]">+{pc.xp} XP</Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] text-white/30">
            <span>{curr} / {tgt} {q?.targetUnit || "steps"}</span>
            <span>{Math.round(pct)}%</span>
          </div>
          <Progress value={pct} className="h-1" />
        </div>
        <div className="flex gap-1.5 flex-wrap mt-2">
          <Badge variant="ghost" className="text-[10px]">{q?.category}</Badge>
          <Badge variant="ghost" className="text-[10px]">{q?.questType}</Badge>
        </div>
      </CardContent>
      <CardFooter className="pt-0 p-4">
        {isReady ? (
          <Button size="sm" className="w-full text-xs" onClick={e => { e.stopPropagation(); onComplete(); }} disabled={isCompleting}>
            {isCompleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Complete</>}
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="w-full text-xs" onClick={e => { e.stopPropagation(); onProgress(); }}>
            <ChevronRight className="w-3.5 h-3.5 mr-1" /> Log Progress
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function TemplateCard({ template, highlighted = false, onAssign, isAssigning }: {
  template: QuestTemplate; highlighted?: boolean; onAssign: () => void; isAssigning: boolean;
}) {
  const pc = parseProgConfig(template.progressionConfig);
  return (
    <Card className={cn("flex flex-col", highlighted && "border-white/[0.12] bg-white/[0.03]")}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            {template.difficulty && (
              <span className={cn("inline-block text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full", difficultyClass(template.difficulty))}>
                {difficultyLabel(template.difficulty)}
              </span>
            )}
          </div>
          {highlighted && <Badge variant="ghost" className="text-[9px] border-white/10">Recommended</Badge>}
        </div>
        <CardTitle className="text-sm leading-snug">{template.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pb-3">
        <p className="text-xs text-white/40 line-clamp-3 leading-relaxed">{template.description}</p>
        {template.targetUnit && (
          <p className="text-[10px] text-white/25 mt-2">Target: {template.targetValue} {template.targetUnit}</p>
        )}
        <Badge variant="xp" className="mt-3 text-[10px]">+{pc.xp} XP</Badge>
      </CardContent>
      <CardFooter className="pt-0 p-4">
        <Button size="sm" variant={highlighted ? "default" : "outline"} className="w-full text-xs" onClick={onAssign} disabled={isAssigning}>
          {isAssigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Accept Quest"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function HistoryCard({ uq, variant }: { uq: UserQuestWithTemplate; variant: "completed" | "abandoned" }) {
  const q  = uq.quest_templates;
  const pc = parseProgConfig(q?.progressionConfig);
  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-2xl border",
      variant === "completed"
        ? "border-white/[0.07] bg-white/[0.02]"
        : "border-white/[0.04] bg-white/[0.01] opacity-50"
    )}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="ghost" className="text-[10px]">{q?.category}</Badge>
          {variant === "completed" && (
            <span className="text-[10px] text-white/30">+{pc.xp} XP</span>
          )}
        </div>
        <p className={cn("text-sm font-medium truncate", variant === "completed" ? "" : "line-through text-white/40")}>
          {q?.title}
        </p>
        <div className="flex gap-3 mt-1 text-[10px] text-white/25">
          {uq.user_quests.assignedAt && <span>Started {fmtDate(uq.user_quests.assignedAt)}</span>}
          {uq.user_quests.completedAt && <span>· Done {fmtDate(uq.user_quests.completedAt)}</span>}
        </div>
      </div>
      {variant === "completed"
        ? <CheckCircle2 className="w-4 h-4 text-white/40 shrink-0 ml-3" />
        : <AlertCircle   className="w-4 h-4 text-white/20 shrink-0 ml-3" />}
    </div>
  );
}
