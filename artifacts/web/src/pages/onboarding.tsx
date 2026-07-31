import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetOnboarding, useUpdateOnboardingStep, useUpdateOnboardingProfile,
  useSetGoals, useSelectArchetype, useCompleteOnboarding, useGetArchetypes
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight, Zap, Dumbbell, Flame, Brain, Target as TargetIcon, Check, Trophy } from "lucide-react";
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
  { id: "strength",   label: "Build Strength",    icon: Dumbbell },
  { id: "endurance",  label: "Increase Endurance", icon: Flame },
  { id: "mind",       label: "Mental Clarity",     icon: Brain },
  { id: "discipline", label: "Build Routine",      icon: TargetIcon },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast }       = useToast();
  const qc              = useQueryClient();

  const { data: state,     isLoading: loadingState } = useGetOnboarding({ query: { queryKey: ["/api/onboarding"], retry: false } });
  const { data: archetypes }                          = useGetArchetypes({ query: { queryKey: ["/api/archetypes"] } });

  const stepMutation      = useUpdateOnboardingStep();
  const profileMutation   = useUpdateOnboardingProfile();
  const goalsMutation     = useSetGoals();
  const archetypeMutation = useSelectArchetype();
  const completeMutation  = useCompleteOnboarding();

  // ── Form state — hydrated from API ────────────────────────────────────────
  const [height,     setHeight]     = useState("");
  const [weight,     setWeight]     = useState("");
  const [dob,        setDob]        = useState("");
  const [activity,   setActivity]   = useState<string | null>(null);
  const [goals,      setLocalGoals] = useState<string[]>([]);
  const [archetypeId, setArchetypeId] = useState("");

  // Hydrate from saved state
  useEffect(() => {
    if (!state) return;
    if (state.state.isCompleted) { setLocation("/dashboard"); return; }
    const p = state.profile;
    if (p) {
      if (p.heightCm)      setHeight(String(p.heightCm));
      if (p.weightKg)      setWeight(String(p.weightKg));
      if (p.activityLevel) setActivity(p.activityLevel);
      if (p.dateOfBirth)   setDob(p.dateOfBirth.slice(0, 10)); // ISO date
    }
    if (state.goals?.length) {
      setLocalGoals(state.goals.map((g: any) => g.goalKey));
    }
    if (state.character) {
      const ch = state.character as any;
      const arcId = ch.user_characters?.archetypeId || ch.archetypeId;
      if (arcId) setArchetypeId(arcId);
    }
  }, [state, setLocation]);

  if (loadingState || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-white/30" />
      </div>
    );
  }

  const currentStep = state.state.currentStep || 1;
  const TOTAL = 5;

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/onboarding"] });
  const nextStep = (n: number) => stepMutation.mutate({ data: { currentStep: n } }, { onSuccess: refresh });

  const handleProfile = () =>
    profileMutation.mutate({
      data: {
        heightCm:      height   ? Number(height)   : undefined,
        weightKg:      weight   ? Number(weight)   : undefined,
        activityLevel: (activity as any) ?? undefined,
        dateOfBirth:   dob      ? dob              : undefined,
      }
    }, { onSuccess: () => nextStep(3) });

  const handleGoals = () => {
    if (!goals.length) { toast({ title: "Pick at least one goal", description: "Select at least one focus area." }); return; }
    goalsMutation.mutate({ data: { goals, primaryGoal: goals[0] } }, { onSuccess: () => nextStep(4) });
  };

  const handleArchetype = () => {
    if (!archetypeId) { toast({ title: "Select a class", description: "Choose an archetype before continuing." }); return; }
    archetypeMutation.mutate({ data: { archetypeId } }, { onSuccess: () => nextStep(5) });
  };

  const handleComplete = () =>
    completeMutation.mutate(undefined, {
      onSuccess: () => { toast({ title: "Setup complete!" }); setLocation("/dashboard"); }
    });

  const selBtn = (active: boolean) =>
    cn("w-full p-4 rounded-xl border text-left transition-all duration-150 flex items-center justify-between",
      active ? "bg-white/[0.08] border-white/20" : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.1]");

  const checkBox = (active: boolean) =>
    cn("w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
      active ? "bg-white border-white" : "border-white/20");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(255,255,255,0.03),transparent)] pointer-events-none" />

      {/* Progress bar */}
      <div className="h-[2px] w-full bg-white/[0.05]">
        <div className="h-full bg-white/70 transition-all duration-500 ease-out"
          style={{ width: `${(currentStep / TOTAL) * 100}%` }} />
      </div>

      {/* Step dots */}
      <div className="flex justify-center gap-1.5 pt-5">
        {Array.from({ length: TOTAL }).map((_, i) => (
          <div key={i} className={cn("h-1 rounded-full transition-all duration-300",
            i + 1 <= currentStep ? "bg-white/70 w-5" : "bg-white/10 w-3")} />
        ))}
      </div>

      <div className="flex-1 flex items-center justify-center p-5">
        <div className="w-full max-w-md">

          {/* ── Step 1: Welcome ── */}
          {currentStep === 1 && (
            <div className="space-y-8 text-center animate-slide-up-fade">
              <div className="w-16 h-16 rounded-3xl bg-white flex items-center justify-center mx-auto shadow-[0_0_48px_rgba(255,255,255,0.15)]">
                <Zap className="w-8 h-8 text-black" fill="currentColor" />
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-black tracking-tight">Welcome to LifeXP</h1>
                <p className="text-white/50 leading-relaxed max-w-xs mx-auto text-sm">
                  Every real-world action — workouts, habits, study sessions — becomes XP. Let's set up your profile.
                </p>
              </div>
              <Button onClick={() => nextStep(2)} size="lg" className="min-w-[200px] font-bold group">
                Get Started <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </div>
          )}

          {/* ── Step 2: Profile ── */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-slide-up-fade">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-1">Step 2 of {TOTAL}</p>
                <h2 className="text-xl font-bold">Your Baseline</h2>
                <p className="text-sm text-white/40 mt-1">Used to personalise your fitness progression.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Height (cm)", val: height, set: setHeight, ph: "175" },
                  { label: "Weight (kg)", val: weight, set: setWeight, ph: "70" },
                ].map(f => (
                  <div key={f.label} className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{f.label}</Label>
                    <Input type="number" value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                      className="h-11 bg-white/[0.04] border-white/[0.08] focus-visible:border-white/25 rounded-xl text-base font-semibold" />
                  </div>
                ))}
              </div>

              {/* Date of birth */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Date of Birth <span className="normal-case text-white/25 tracking-normal font-normal">(optional)</span></Label>
                <Input type="date" value={dob} onChange={e => setDob(e.target.value)}
                  className="h-11 bg-white/[0.04] border-white/[0.08] focus-visible:border-white/25 rounded-xl font-medium" />
              </div>

              {/* Activity level */}
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Activity Level</Label>
                {ACTIVITY_LEVELS.map(lvl => (
                  <button key={lvl.id} type="button" onClick={() => setActivity(lvl.id)} className={selBtn(activity === lvl.id)}>
                    <div>
                      <div className="text-sm font-semibold">{lvl.label}</div>
                      <div className="text-xs text-white/40 mt-0.5">{lvl.desc}</div>
                    </div>
                    <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      activity === lvl.id ? "border-white bg-white" : "border-white/20")}>
                      {activity === lvl.id && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => nextStep(1)}>Back</Button>
                <Button size="sm" onClick={handleProfile} disabled={profileMutation.isPending}>
                  {profileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Goals ── */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-slide-up-fade">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-1">Step 3 of {TOTAL}</p>
                <h2 className="text-xl font-bold">Focus Areas</h2>
                <p className="text-sm text-white/40 mt-1">Select what you want to improve. Pick any that apply.</p>
              </div>

              <div className="space-y-2">
                {GOAL_OPTIONS.map(g => {
                  const sel = goals.includes(g.id);
                  const Icon = g.icon;
                  return (
                    <button key={g.id} type="button" onClick={() => sel ? setLocalGoals(goals.filter(x => x !== g.id)) : setLocalGoals([...goals, g.id])}
                      className={selBtn(sel)}>
                      <div className="flex items-center gap-3">
                        <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center shrink-0",
                          sel ? "bg-white/[0.1] border-white/20" : "bg-white/[0.04] border-white/[0.06]")}>
                          <Icon className={cn("w-4.5 h-4.5", sel ? "text-white" : "text-white/40")} />
                        </div>
                        <span className="text-sm font-semibold">{g.label}</span>
                      </div>
                      <div className={checkBox(sel)}>{sel && <Check className="w-3 h-3 text-black" />}</div>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => nextStep(2)}>Back</Button>
                <Button size="sm" onClick={handleGoals} disabled={goalsMutation.isPending}>
                  {goalsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 4: Archetype ── */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-slide-up-fade">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-1">Step 4 of {TOTAL}</p>
                <h2 className="text-xl font-bold">Choose Your Class</h2>
                <p className="text-sm text-white/40 mt-1">Your archetype shapes your starting stat multipliers.</p>
              </div>

              {archetypes && archetypes.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {archetypes.map(arch => {
                    const sel = archetypeId === arch.id;
                    return (
                      <button key={arch.id} type="button" onClick={() => setArchetypeId(arch.id)}
                        className={cn("p-4 rounded-2xl border text-left transition-all duration-150 relative",
                          sel ? "bg-white/[0.07] border-white/20" : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]")}>
                        {sel && (
                          <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-black" />
                          </div>
                        )}
                        <div className="w-8 h-8 rounded-lg bg-white/[0.08] border border-white/[0.08] flex items-center justify-center mb-3">
                          <Zap className={cn("w-4 h-4", sel ? "text-white" : "text-white/40")} />
                        </div>
                        <h3 className="font-bold text-sm mb-1">{arch.name}</h3>
                        <p className="text-xs text-white/40 leading-relaxed line-clamp-3">{arch.description}</p>
                        {arch.focusAreas?.length ? (
                          <div className="flex flex-wrap gap-1 mt-2.5">
                            {arch.focusAreas.map(a => (
                              <span key={a} className="text-[9px] px-1.5 py-0.5 bg-white/[0.06] border border-white/[0.06] rounded-full text-white/40">{a}</span>
                            ))}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-white/30">
                  <p className="text-sm">No archetypes available yet.</p>
                  <Button variant="ghost" size="sm" className="mt-3" onClick={() => nextStep(5)}>Skip for now</Button>
                </div>
              )}

              {archetypes && archetypes.length > 0 && (
                <div className="flex justify-between pt-1">
                  <Button variant="ghost" size="sm" onClick={() => nextStep(3)}>Back</Button>
                  <Button size="sm" onClick={handleArchetype} disabled={archetypeMutation.isPending}>
                    {archetypeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Class"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Done ── */}
          {currentStep >= 5 && (
            <div className="space-y-8 text-center animate-slide-up-fade py-8">
              <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mx-auto shadow-[0_0_60px_rgba(255,255,255,0.15)]">
                <Trophy className="w-10 h-10 text-black" fill="currentColor" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black tracking-tight">You're All Set</h2>
                <p className="text-white/40 text-sm max-w-xs mx-auto leading-relaxed">
                  Your profile is ready. Head to the dashboard to start earning XP.
                </p>
              </div>
              <Button onClick={handleComplete} disabled={completeMutation.isPending} size="lg" className="min-w-[200px] font-bold group">
                {completeMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <>Enter Dashboard <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></>}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
