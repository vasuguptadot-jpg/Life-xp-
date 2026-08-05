import { Flame, Beef, Wheat, Droplets, Info, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProfileExtra } from "@/hooks/use-profile";
import { useAiGoals } from "@/hooks/use-ai";
import { cn } from "@/lib/utils";

// ── Diet calculation ─────────────────────────────────────────────────────────

type GoalType = "lose" | "gain" | "maintain";

function detectGoal(goalsText: string | null | undefined): GoalType {
  if (!goalsText) return "maintain";
  const t = goalsText.toLowerCase();
  if (/lose|weight loss|cut|slim|fat|deficit/.test(t)) return "lose";
  if (/muscle|gain|bulk|build|mass|surplus|stronger/.test(t)) return "gain";
  return "maintain";
}

interface DietPlan {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  goalType: GoalType;
  bmi: number | null;
}

function calculateDiet(
  weightKg: number,
  heightCm: number,
  age: number,
  goalType: GoalType,
): DietPlan {
  // Mifflin-St Jeor (gender-neutral: avg of male/female offsets)
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 78;
  const tdee = Math.round(bmr * 1.55); // moderate activity

  const adjust = goalType === "lose" ? -500 : goalType === "gain" ? 300 : 0;
  const calories = Math.max(1200, tdee + adjust);

  // Macros
  const proteinG = Math.round(weightKg * 2.0);           // 2g/kg
  const fatG     = Math.round((calories * 0.25) / 9);    // 25% of cals from fat
  const carbsG   = Math.round((calories - proteinG * 4 - fatG * 9) / 4);

  const bmi = Math.round((weightKg / Math.pow(heightCm / 100, 2)) * 10) / 10;

  return { calories, proteinG, carbsG: Math.max(0, carbsG), fatG, goalType, bmi };
}

// ── Components ───────────────────────────────────────────────────────────────

const GOAL_LABELS: Record<GoalType, { label: string; colour: string }> = {
  lose:     { label: "Fat Loss",      colour: "text-orange-400" },
  gain:     { label: "Muscle Gain",   colour: "text-green-400"  },
  maintain: { label: "Maintenance",   colour: "text-blue-400"   },
};

interface MacroBarProps {
  label: string;
  grams: number;
  calories: number;
  color: string;
  icon: React.ElementType;
  pct: number;
}

function MacroBar({ label, grams, calories, color, icon: Icon, pct }: MacroBarProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("w-3.5 h-3.5", color)} />
          <span className="text-xs font-semibold text-white/70">{label}</span>
        </div>
        <div className="text-right">
          <span className={cn("text-sm font-black tabular-nums", color)}>{grams}g</span>
          <span className="text-[10px] text-white/30 ml-1">· {calories} kcal</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", `bg-gradient-to-r ${color.replace("text-", "from-")} to-transparent`)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function DietPlanCard() {
  const { data: profile, isLoading: profileLoading } = useProfileExtra();
  const { data: aiGoals } = useAiGoals();

  const hasData = profile?.weightKg && profile?.heightCm;
  const isLoading = profileLoading;

  if (isLoading) {
    return (
      <Card className="animate-slide-up-fade stagger-3 relative overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
            <Flame className="w-3.5 h-3.5" /> Daily Diet Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="animate-shimmer rounded-lg h-24" />
        </CardContent>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <Card className="animate-slide-up-fade stagger-3 relative overflow-hidden border-white/[0.06]">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
            <Flame className="w-3.5 h-3.5" /> Daily Diet Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-yellow-400/70 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-white/60">Add your weight & height in Profile to unlock your personalised diet plan.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const goalType = detectGoal(aiGoals?.goals);
  const age = profile.age ?? 25;
  const plan = calculateDiet(profile.weightKg!, profile.heightCm!, age, goalType);

  const totalCals = plan.proteinG * 4 + plan.fatG * 9 + plan.carbsG * 4;
  const proteinPct = Math.round((plan.proteinG * 4 / totalCals) * 100);
  const fatPct     = Math.round((plan.fatG * 9 / totalCals) * 100);
  const carbsPct   = 100 - proteinPct - fatPct;

  const { label: goalLabel, colour: goalColour } = GOAL_LABELS[plan.goalType];

  return (
    <Card className="animate-slide-up-fade stagger-3 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_100%_0%,rgba(255,255,255,0.015),transparent)] pointer-events-none" />
      <CardHeader className="pb-3 pt-4 px-5 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
            <Flame className="w-3.5 h-3.5" /> Daily Diet Plan
          </CardTitle>
          <span className={cn("text-[10px] font-bold uppercase tracking-wide", goalColour)}>
            {goalLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-4 space-y-5">

        {/* Calorie target */}
        <div className="flex items-end gap-3">
          <div>
            <span className="text-4xl font-black leading-none tabular-nums">{plan.calories.toLocaleString()}</span>
            <span className="text-sm text-white/30 ml-2">kcal / day</span>
          </div>
          {plan.bmi !== null && (
            <div className="mb-0.5 flex items-center gap-1.5 text-white/30 text-[10px] font-semibold">
              <Info className="w-3 h-3" />
              BMI {plan.bmi}
            </div>
          )}
        </div>

        {/* Macro bars */}
        <div className="space-y-3.5">
          <MacroBar
            label="Protein"
            grams={plan.proteinG}
            calories={plan.proteinG * 4}
            color="text-red-400"
            icon={Beef}
            pct={proteinPct}
          />
          <MacroBar
            label="Carbs"
            grams={plan.carbsG}
            calories={plan.carbsG * 4}
            color="text-yellow-400"
            icon={Wheat}
            pct={carbsPct}
          />
          <MacroBar
            label="Fat"
            grams={plan.fatG}
            calories={plan.fatG * 9}
            color="text-blue-400"
            icon={Droplets}
            pct={fatPct}
          />
        </div>

        {/* Macro ratio pills */}
        <div className="flex gap-2">
          {[
            { label: `${proteinPct}% Protein`, color: "bg-red-400/10 text-red-400/80 border-red-400/20" },
            { label: `${carbsPct}% Carbs`,   color: "bg-yellow-400/10 text-yellow-400/80 border-yellow-400/20" },
            { label: `${fatPct}% Fat`,       color: "bg-blue-400/10 text-blue-400/80 border-blue-400/20" },
          ].map(p => (
            <span key={p.label} className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", p.color)}>
              {p.label}
            </span>
          ))}
        </div>

        <p className="text-[10px] text-white/20 leading-relaxed">
          Based on {profile.weightKg}kg · {profile.heightCm}cm · age {age} · moderate activity.
          Adjust in your Profile settings.
        </p>
      </CardContent>
    </Card>
  );
}
