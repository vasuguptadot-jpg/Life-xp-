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
import { Loader2, ArrowRight, ChevronRight, Activity, Target as TargetIcon, Sword } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// 7-step flow:
// 1: Welcome
// 2: Profile (Height/Weight/Activity)
// 3: Goals
// 4: Archetype
// 5: Complete (transitions out)
// Wait, instructions say 7 steps? "7-step guided flow: welcome → profile (height/weight/activity) → goals → archetype selection → complete". That's 5 distinct sections, maybe 7 internal steps? I'll build it to handle whatever `currentStep` the API says, up to completion.

const ACTIVITY_LEVELS = [
  { id: "sedentary", label: "Sedentary", desc: "Little to no exercise" },
  { id: "light", label: "Light", desc: "1-3 days/week" },
  { id: "moderate", label: "Moderate", desc: "3-5 days/week" },
  { id: "active", label: "Active", desc: "6-7 days/week" },
  { id: "very_active", label: "Very Active", desc: "Hard exercise daily" }
] as const;

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: state, isLoading: isLoadingState } = useGetOnboarding({
    query: { queryKey: ["/api/onboarding"], retry: false }
  });

  const { data: archetypes } = useGetArchetypes({
    query: { queryKey: ["/api/archetypes"] }
  });

  const stepMutation = useUpdateOnboardingStep();
  const profileMutation = useUpdateOnboardingProfile();
  const goalsMutation = useSetGoals();
  const archetypeMutation = useSelectArchetype();
  const completeMutation = useCompleteOnboarding();

  // Local form state
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [activity, setActivity] = useState<any>(null);
  
  const [goals, setLocalGoals] = useState<string[]>([]);
  const [archetypeId, setArchetypeId] = useState("");

  useEffect(() => {
    if (state?.state?.isCompleted) {
      setLocation("/dashboard");
    }
  }, [state, setLocation]);

  if (isLoadingState || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentStep = state.state.currentStep || 1;

  const handleNextStep = (nextStep: number) => {
    stepMutation.mutate({ data: { currentStep: nextStep } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] })
    });
  };

  const handleWelcome = () => handleNextStep(2);

  const handleProfile = () => {
    profileMutation.mutate({
      data: {
        heightCm: height ? Number(height) : undefined,
        weightKg: weight ? Number(weight) : undefined,
        activityLevel: activity || undefined
      }
    }, {
      onSuccess: () => handleNextStep(3)
    });
  };

  const handleGoals = () => {
    if (goals.length === 0) {
      toast({ title: "Select a goal", description: "Choose at least one focus area.", variant: "destructive" });
      return;
    }
    goalsMutation.mutate({
      data: { goals, primaryGoal: goals[0] }
    }, {
      onSuccess: () => handleNextStep(4)
    });
  };

  const handleArchetype = () => {
    if (!archetypeId) {
      toast({ title: "Select archetype", description: "Choose your path.", variant: "destructive" });
      return;
    }
    archetypeMutation.mutate({
      data: { archetypeId }
    }, {
      onSuccess: () => handleNextStep(5) // go to final complete step
    });
  };

  const handleComplete = () => {
    completeMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Setup Complete", description: "Your journey begins now." });
        setLocation("/dashboard");
      }
    });
  };

  // Render logic based on currentStep
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      {/* HUD Accents */}
      <div className="absolute top-0 left-0 w-full h-1 bg-primary/20">
        <div 
          className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_10px_hsl(var(--primary))]"
          style={{ width: `${(currentStep / 5) * 100}%` }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-xl">
          
          {/* STEP 1: WELCOME */}
          {currentStep === 1 && (
            <div className="space-y-8 animate-slide-up-fade">
              <div className="w-20 h-20 bg-primary/10 border border-primary/50 flex items-center justify-center rounded-2xl mx-auto shadow-[0_0_40px_hsl(var(--primary)/0.2)]">
                <Activity className="w-10 h-10 text-primary" />
              </div>
              <div className="text-center space-y-4">
                <h1 className="text-4xl font-bold tracking-tighter text-glow">System Initialized</h1>
                <p className="text-muted-foreground font-mono text-sm leading-relaxed max-w-md mx-auto">
                  LifeXP tracks your physical, mental, and disciplinary progress in the real world. You are the character. Every action grants XP.
                </p>
              </div>
              <div className="pt-8 flex justify-center">
                <Button onClick={handleWelcome} size="lg" className="w-full sm:w-auto min-w-[200px] h-14 text-lg group">
                  Begin Setup
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: PROFILE */}
          {currentStep === 2 && (
            <div className="space-y-8 animate-slide-up-fade">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight text-glow">Baseline Metrics</h2>
                <p className="text-muted-foreground font-mono text-xs">Used to calibrate physical progression rates.</p>
              </div>
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-mono text-xs text-muted-foreground uppercase">Height (cm)</Label>
                    <Input 
                      type="number" 
                      value={height} 
                      onChange={(e) => setHeight(e.target.value)} 
                      placeholder="175"
                      className="h-12 font-mono text-lg bg-card/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs text-muted-foreground uppercase">Weight (kg)</Label>
                    <Input 
                      type="number" 
                      value={weight} 
                      onChange={(e) => setWeight(e.target.value)} 
                      placeholder="70"
                      className="h-12 font-mono text-lg bg-card/50"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="font-mono text-xs text-muted-foreground uppercase">Activity Level</Label>
                  <div className="grid gap-2">
                    {ACTIVITY_LEVELS.map(lvl => (
                      <div 
                        key={lvl.id}
                        onClick={() => setActivity(lvl.id as any)}
                        className={cn(
                          "p-4 border rounded-lg cursor-pointer transition-all flex items-center justify-between",
                          activity === lvl.id 
                            ? "bg-primary/10 border-primary text-primary shadow-[0_0_15px_hsl(var(--primary)/0.1)]" 
                            : "bg-card border-card-border hover:border-primary/50 text-foreground"
                        )}
                      >
                        <div>
                          <div className="font-bold tracking-tight">{lvl.label}</div>
                          <div className="text-xs font-mono text-muted-foreground mt-1">{lvl.desc}</div>
                        </div>
                        <div className={cn(
                          "w-4 h-4 rounded-full border",
                          activity === lvl.id ? "border-primary bg-primary" : "border-muted-foreground"
                        )} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleProfile} disabled={profileMutation.isPending} className="w-full sm:w-auto">
                  {profileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Metrics"}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: GOALS */}
          {currentStep === 3 && (
            <div className="space-y-8 animate-slide-up-fade">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight text-glow">Primary Directives</h2>
                <p className="text-muted-foreground font-mono text-xs">Select areas of focus for quest generation.</p>
              </div>

              <div className="grid gap-3">
                {[
                  { id: "strength", label: "Build Strength", icon: TargetIcon, color: "var(--attr-color)" },
                  { id: "endurance", label: "Increase Endurance", icon: TargetIcon },
                  { id: "mind", label: "Mental Clarity", icon: TargetIcon },
                  { id: "discipline", label: "Build Routine", icon: TargetIcon }
                ].map(goal => {
                  const isSelected = goals.includes(goal.id);
                  return (
                    <div 
                      key={goal.id}
                      onClick={() => {
                        if (isSelected) setLocalGoals(goals.filter(g => g !== goal.id));
                        else setLocalGoals([...goals, goal.id]);
                      }}
                      className={cn(
                        "p-4 border rounded-lg cursor-pointer transition-all flex items-center gap-4",
                        isSelected 
                          ? "bg-primary/10 border-primary shadow-[0_0_15px_hsl(var(--primary)/0.1)]" 
                          : "bg-card border-card-border hover:border-primary/50"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded bg-background flex items-center justify-center border",
                        isSelected ? "border-primary text-primary" : "border-border text-muted-foreground"
                      )}>
                        <goal.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 font-bold text-lg">{goal.label}</div>
                      <div className={cn(
                        "w-5 h-5 border rounded flex items-center justify-center",
                        isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"
                      )}>
                        {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3"><path d="M20 6L9 17l-5-5"/></svg>}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-between items-center">
                <Button variant="ghost" onClick={() => handleNextStep(2)}>Back</Button>
                <Button onClick={handleGoals} disabled={goalsMutation.isPending} className="w-full sm:w-auto">
                  {goalsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Directives"}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: ARCHETYPE */}
          {currentStep === 4 && (
            <div className="space-y-8 animate-slide-up-fade">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight text-glow">Select Class</h2>
                <p className="text-muted-foreground font-mono text-xs">Determines your starting stat multipliers.</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {archetypes?.map((arch) => (
                  <Card 
                    key={arch.id}
                    className={cn(
                      "p-6 cursor-pointer transition-all border-2 overflow-hidden relative group",
                      archetypeId === arch.id 
                        ? "border-primary bg-primary/5" 
                        : "border-card-border hover:border-primary/30"
                    )}
                    onClick={() => setArchetypeId(arch.id)}
                  >
                    {/* Background glow if selected */}
                    {archetypeId === arch.id && (
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
                    )}
                    
                    <div className="relative z-10 space-y-4">
                      <div className="w-12 h-12 rounded-lg bg-background border border-border flex items-center justify-center">
                        <Sword className={cn("w-6 h-6", archetypeId === arch.id ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold tracking-tight mb-1">{arch.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono h-12 leading-relaxed line-clamp-3">{arch.description}</p>
                      </div>
                      {arch.focusAreas && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {arch.focusAreas.map(area => (
                            <span key={area} className="text-[10px] font-mono px-2 py-1 bg-background rounded border text-muted-foreground">
                              {area}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              <div className="flex justify-between items-center">
                <Button variant="ghost" onClick={() => handleNextStep(3)}>Back</Button>
                <Button onClick={handleArchetype} disabled={archetypeMutation.isPending} className="w-full sm:w-auto">
                  {archetypeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Lock In"}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 5: COMPLETE */}
          {currentStep >= 5 && (
            <div className="space-y-8 animate-slide-up-fade text-center py-12">
              <div className="w-24 h-24 bg-primary/20 border-2 border-primary flex items-center justify-center rounded-full mx-auto shadow-[0_0_50px_hsl(var(--primary)/0.4)]">
                <Sword className="w-10 h-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-glow uppercase">Calibration Complete</h2>
                <p className="text-muted-foreground font-mono text-sm max-w-xs mx-auto">Your character profile is synced. The dashboard awaits your command.</p>
              </div>
              <div className="pt-4">
                <Button onClick={handleComplete} disabled={completeMutation.isPending} size="lg" className="w-full sm:w-auto min-w-[200px]">
                  {completeMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Enter Dashboard"}
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
