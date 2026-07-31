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
  BookOpen, AlertCircle, ChevronRight, Info, X
} from "lucide-react";
import { cn } from "@/lib/utils";

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

        <div className="space-y-4 mt-1">
          <DialogDescription className="text-sm text-white/60 leading-relaxed">{q?.description}</DialogDescription>

          {/* Instructions */}
          {q?.instructions && (
            <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen className="w-3.5 h-3.5 text-white/40" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Instructions</span>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">{q.instructions}</p>
            </div>
          )}

          {/* Verification */}
          {q?.verificationRequirement && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <Info className="w-3.5 h-3.5 text-white/40 mt-0.5 shrink-0" />
              <p className="text-xs text-white/50 leading-relaxed">{q.verificationRequirement}</p>
            </div>
          )}

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-white/40">Progress</span>
              <span className={isReady ? "text-white" : "text-white/60"}>
                {curr} / {tgt} {q?.targetUnit || ""}
              </span>
            </div>
            <Progress value={pct} className="h-2" indicatorClassName={isReady ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]" : undefined} />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="text-[10px] uppercase tracking-wide text-white/30 mb-0.5">Assigned</div>
              <div className="text-white/60 font-medium">{fmtDate(uq.user_quests.assignedAt)}</div>
            </div>
            {uq.user_quests.completedAt && (
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <div className="text-[10px] uppercase tracking-wide text-white/30 mb-0.5">Completed</div>
                <div className="text-white/60 font-medium">{fmtDate(uq.user_quests.completedAt)}</div>
              </div>
            )}
          </div>

          {/* XP Reward */}
          <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-white/40" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Reward</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="xp" className="text-sm font-bold px-3 py-1">+{pc.xp} XP</Badge>
              {pc.attrs.map(a => (
                <span key={a.attribute} className="text-xs text-white/50 font-medium">
                  +{a.xp} {a.attribute}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {uq.user_quests.status !== "COMPLETED" && (
              <>
                {!isReady ? (
                  <Button size="sm" variant="outline" className="flex-1" onClick={onProgress}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />Log Progress
                  </Button>
                ) : (
                  <Button size="sm" className="flex-1" onClick={onComplete} disabled={isCompleting}>
                    {isCompleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Claim Reward</>}
                  </Button>
                )}

                {!confirmAbandon ? (
                  <Button size="sm" variant="ghost" className="text-white/30 hover:text-white/60 shrink-0"
                    onClick={() => setConfirmAbandon(true)}>
                    <X className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" className="shrink-0" onClick={onAbandon} disabled={isAbandoning}>
                    {isAbandoning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Abandon?"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Quests() {
  const { toast }   = useToast();
  const qc          = useQueryClient();
  const [detailUq, setDetailUq] = useState<UserQuestWithTemplate | null>(null);

  const { data: myQuests,    isLoading: loadingMine } = useGetMyQuests({ query: { queryKey: ["/api/quests/my"] } });
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
          <TabsList className="bg-white/[0.04] border border-white/[0.06] p-1 rounded-xl h-auto gap-0.5">
            {[
              { value: "active",    label: "Active",   count: active.length },
              { value: "discover",  label: "Discover", count: null },
              { value: "completed", label: "History",  count: completed.length + abandoned.length },
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

          {/* ── Active ── */}
          <TabsContent value="active" className="animate-slide-up-fade outline-none">
            {loadingMine ? <Spinner /> : active.length === 0 ? (
              <EmptyState icon={Target} text="No active quests" sub="Browse Discover to start one." />
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
          </TabsContent>

          {/* ── Discover ── */}
          <TabsContent value="discover" className="outline-none space-y-6 animate-slide-up-fade">
            {loadingRec || loadingCat ? <Spinner /> : (
              <>
                {recommended && recommended.length > 0 && (
                  <section>
                    <SectionLabel>Recommended</SectionLabel>
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

          {/* ── History ── */}
          <TabsContent value="completed" className="outline-none animate-slide-up-fade">
            {completed.length + abandoned.length === 0 ? (
              <EmptyState icon={CheckCircle2} text="No history yet" sub="Completed and abandoned quests appear here." />
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
    <Card className={cn("transition-all duration-200 cursor-pointer hover:bg-white/[0.06]", isReady && "border-white/[0.14]", `stagger-${(idx%5)+1} animate-slide-up-fade`)}>
      <CardHeader className="pb-3" onClick={onOpen}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="ghost" className="text-[10px]">{q?.category}</Badge>
            {q?.difficulty && (
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", difficultyClass(q.difficulty))}>
                {difficultyLabel(q.difficulty)}
              </span>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-white/20 shrink-0 mt-0.5" />
        </div>
        <CardTitle className="text-sm mt-2">{q?.title}</CardTitle>
        <p className="text-xs text-white/40 line-clamp-2 mt-1">{q?.description}</p>
      </CardHeader>
      <CardContent className="pb-3" onClick={onOpen}>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-semibold">
            <span className="text-white/30">Progress</span>
            <span className={isReady ? "text-white" : "text-white/50"}>
              {curr} / {tgt}{q?.targetUnit ? ` ${q.targetUnit}` : ""}
            </span>
          </div>
          <Progress value={pct} className="h-1.5" indicatorClassName={isReady ? "bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)]" : undefined} />
        </div>
        <Badge variant="xp" className="mt-2.5 text-[10px]">+{pc.xp} XP</Badge>
      </CardContent>
      <CardFooter className="pt-0 p-4 gap-2">
        {!isReady ? (
          <Button size="sm" variant="outline" className="w-full text-xs" onClick={e => { e.stopPropagation(); onProgress(); }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />Log Progress
          </Button>
        ) : (
          <Button size="sm" className="w-full text-xs font-bold" onClick={e => { e.stopPropagation(); onComplete(); }} disabled={isCompleting}>
            {isCompleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Claim Reward</>}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function TemplateCard({ template, onAssign, isAssigning, highlighted }: {
  template: QuestTemplate; onAssign: () => void; isAssigning: boolean; highlighted?: boolean;
}) {
  const pc = parseProgConfig(template.progressionConfig);
  return (
    <Card className={cn("flex flex-col hover:bg-white/[0.06] transition-colors", highlighted && "border-white/[0.12]")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-2">
          <Badge variant="ghost" className="text-[10px]">{template.category}</Badge>
          {template.difficulty && (
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", difficultyClass(template.difficulty))}>
              {difficultyLabel(template.difficulty)}
            </span>
          )}
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
