import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetOnboarding,
  useUpdateOnboardingStep,
  useUpdateOnboardingProfile,
  useSetGoals,
  useSelectArchetype,
  useCompleteOnboarding,
  useGetArchetypes
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, ArrowRight, Activity, Target as TargetIcon,
  Zap, Dumbbell, Brain, Heart, Flame, Trophy, Check
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ACTIVITY_LEVELS = [
  { id: "sedentary",   label: "Sedentary",   desc: "Little to no exercise" },
  { id: "light",       label: "Light",        desc: "1–3 days / week" },
  { id: "moderate",    label: "Moderate",     desc: "3–5 days / week" },
  { id: "active",      label: "Active",       desc: "6–7 days / week" },
  { id: "very_active", label: "Very Active",  desc: "Hard exercise daily" },
] as const;

const GOAL_OPTIONS = [
  { id: "strength",   label: "Build Strength",    icon: Dumbbell, color: "attr-strength" },
  { id: "endurance",  label: "Increase Endurance", icon: Flame,    color: "attr-endurance" },
  { id: "mind",       label: "Mental Clarity",     icon: Brain,    color: "attr-knowledge" },
  { id: "discipline", label: "Build Routine",      icon: TargetIcon, color: "attr-discipline" },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast }       = useToast();
  const queryClient     = useQueryClient();

  const { data: state, isLoading: isLoadingState } = useGetOnboarding({
    query: { queryKey: ["/api/onboarding"], retry: false }
  });
  const { data: archetypes } = useGetArchetypes({ query: { queryKey: ["/api/archetypes"] } });

  const stepMutation      = useUpdateOnboardingStep();
  const profileMutation   = useUpdateOnboardingProfile();
  const goalsMutation     = useSetGoals();
  const archetypeMutation = useSelectArchetype();
  const completeMutation  = useCompleteOnboarding();

  const [height, setHeight]         = useState("");
  const [weight, setWeight]         = useState("");
  const [activity, setActivity]     = useState<any>(null);
  const [goals, setLocalGoals]      = useState<string[]>([]);
  const [archetypeId, setArchetypeId] = useState("");

  useEffect(() => {
    if (state?.state?.isCompleted) setLocation("/dashboard");
  }, [state, setLocation]);

  if (isLoadingState || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentStep = state.state.currentStep || 1;
  const totalSteps  = 5;

  const handleNextStep = (nextStep: number) =>
    stepMutation.mutate({ data: { currentStep: nextStep } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] })
    });

  const handleProfile = () =>
    profileMutation.mutate({
      data: {
        heightCm:      height   ? Number(height)   : undefined,
        weightKg:      weight   ? Number(weight)   : undefined,
        activityLevel: activity ?? undefined,
      }
    }, { onSuccess: () => handleNextStep(3) });

  const handleGoals = () => {
    if (goals.length === 0) {
      toast({ title: "Pick at least one goal", variant: "destructive" });
      return;
    }
    goalsMutation.mutate({ data: { goals, primaryGoal: goals[0] } }, {
      onSuccess: () => handleNextStep(4)
    });
  };

  const handleArchetype = () => {
    if (!archetypeId) {
      toast({ title: "Select a class", variant: "destructive" });
      return;
    }
    archetypeMutation.mutate({ data: { archetypeId } }, {
      onSuccess: () => handleNextStep(5)
    });
  };

  const handleComplete = () =>
    completeMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Setup complete!", description: "Your adventure begins now." });
        setLocation("/dashboard");
      }
    });

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      {/* Ambient */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Progress bar */}
      <div className="h-1 w-full bg-surface">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>

      {/* Step dots */}
      <div className="flex justify-center gap-2 pt-5 pb-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i + 1 <= currentStep ? "bg-primary w-6" : "bg-surface w-3"
            )}
          />
        ))}
      </div>

      <div className="flex-1 flex items-center justify-center p-5">
        <div className="w-full max-w-lg">

          {/* ── Step 1: Welcome ── */}
          {currentStep === 1 && (
            <div className="space-y-8 text-center animate-slide-up-fade">
              <div className="w-20 h-20 bg-primary rounded-3xl flex items-center justify-center mx-auto shadow-[0_0_48px_hsl(var(--primary)/0.4)]">
                <Zap className="w-10 h-10 text-primary-foreground" fill="currentColor" />
              </div>
              <div className="space-y-3">
                <h1 className="text-4xl font-black tracking-tight text-glow">Welcome to LifeXP</h1>
                <p className="text-muted-foreground leading-relaxed max-w-sm mx-auto">
                  Turn your real-world habits, workouts, and goals into XP and character progression. Every action counts.
                </p>
              </div>
              <div className="flex justify-center pt-2">
                <Button onClick={() => handleNextStep(2)} size="lg" className="min-w-[200px] h-13 text-base font-bold group">
                  Let's Begin
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Profile ── */}
          {currentStep === 2 && (
            <div className="space-y-7 animate-slide-up-fade">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Step 2 of {totalSteps}</p>
                <h2 className="text-2xl font-bold tracking-tight">Your Baseline</h2>
                <p className="text-sm text-muted-foreground mt-1">Used to personalize your fitness progression.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Height (cm)</Label>
                  <Input type="number" value={height} onChange={e => setHeight(e.target.value)}
                    placeholder="175" className="h-12 bg-surface border-border rounded-xl text-lg font-semibold" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weight (kg)</Label>
                  <Input type="number" value={weight} onChange={e => setWeight(e.target.value)}
                    placeholder="70" className="h-12 bg-surface border-border rounded-xl text-lg font-semibold" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity Level</Label>
                <div className="grid gap-2">
                  {ACTIVITY_LEVELS.map(lvl => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setActivity(lvl.id)}
                      className={cn(
                        "w-full p-4 rounded-xl border text-left transition-all duration-200 flex items-center justify-between",
                        activity === lvl.id
                          ? "bg-primary/10 border-primary/50 text-primary"
                          : "bg-surface border-border hover:border-border/80 text-foreground"
                      )}
                    >
                      <div>
                        <div className="font-semibold text-sm">{lvl.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{lvl.desc}</div>
                      </div>
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                        activity === lvl.id ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}>
                        {activity === lvl.id && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => handleNextStep(1)}>Back</Button>
                <Button onClick={handleProfile} disabled={profileMutation.isPending}>
                  {profileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Goals ── */}
          {currentStep === 3 && (
            <div className="space-y-7 animate-slide-up-fade">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Step 3 of {totalSteps}</p>
                <h2 className="text-2xl font-bold tracking-tight">Your Focus Areas</h2>
                <p className="text-sm text-muted-foreground mt-1">Select what you want to improve. Choose multiple.</p>
              </div>

              <div className="grid gap-3">
                {GOAL_OPTIONS.map(goal => {
                  const isSelected = goals.includes(goal.id);
                  const Icon = goal.icon;
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => isSelected
                        ? setLocalGoals(goals.filter(g => g !== goal.id))
                        : setLocalGoals([...goals, goal.id])}
                      className={cn(
                        "w-full p-4 rounded-xl border text-left transition-all duration-200 flex items-center gap-4",
                        isSelected
                          ? "bg-primary/10 border-primary/50"
                          : "bg-surface border-border hover:border-border/80"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0",
                        isSelected ? "bg-primary/15 border-primary/40" : "bg-background border-border"
                      )}>
                        <Icon className={cn("w-5 h-5", isSelected ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <span className="font-semibold text-sm flex-1">{goal.label}</span>
                      <div className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                        isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                      )}>
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="ghost" onClick={() => handleNextStep(2)}>Back</Button>
                <Button onClick={handleGoals} disabled={goalsMutation.isPending}>
                  {goalsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 4: Archetype ── */}
          {currentStep === 4 && (
            <div className="space-y-7 animate-slide-up-fade">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Step 4 of {totalSteps}</p>
                <h2 className="text-2xl font-bold tracking-tight">Choose Your Class</h2>
                <p className="text-sm text-muted-foreground mt-1">Your archetype shapes your starting stat multipliers.</p>
              </div>

              {archetypes && archetypes.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {archetypes.map((arch) => (
                    <button
                      key={arch.id}
                      type="button"
                      onClick={() => setArchetypeId(arch.id)}
                      className={cn(
                        "p-5 rounded-2xl border text-left transition-all duration-200 relative overflow-hidden",
                        archetypeId === arch.id
                          ? "bg-primary/10 border-primary/50 shadow-[0_0_20px_hsl(var(--primary)/0.15)]"
                          : "bg-surface border-border hover:border-border/80"
                      )}
                    >
                      {archetypeId === arch.id && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                      <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center mb-3">
                        <Zap className={cn("w-5 h-5", archetypeId === arch.id ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <h3 className="font-bold text-base mb-1">{arch.name}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{arch.description}</p>
                      {arch.focusAreas && arch.focusAreas.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {arch.focusAreas.map(area => (
                            <span key={area} className="text-[10px] px-2 py-0.5 bg-background rounded-full border border-border text-muted-foreground">
                              {area}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No archetypes available yet.</p>
                  <p className="text-xs mt-1">Ask your admin to seed the database.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => handleNextStep(5)}>
                    Skip for now
                  </Button>
                </div>
              )}

              {archetypes && archetypes.length > 0 && (
                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => handleNextStep(3)}>Back</Button>
                  <Button onClick={handleArchetype} disabled={archetypeMutation.isPending}>
                    {archetypeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Class"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Complete ── */}
          {currentStep >= 5 && (
            <div className="space-y-8 text-center animate-slide-up-fade py-8">
              <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center mx-auto shadow-[0_0_60px_hsl(var(--primary)/0.5)]">
                <Trophy className="w-12 h-12 text-primary-foreground" fill="currentColor" />
              </div>
              <div className="space-y-3">
                <h2 className="text-3xl font-black tracking-tight text-glow">You're All Set!</h2>
                <p className="text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  Your character is ready. Head to the dashboard to start earning XP.
                </p>
              </div>
              <div className="pt-2 flex justify-center">
                <Button onClick={handleComplete} disabled={completeMutation.isPending} size="lg" className="min-w-[200px] h-13 text-base font-bold group">
                  {completeMutation.isPending
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <>Enter Dashboard <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-0.5 transition-transform" /></>}
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
