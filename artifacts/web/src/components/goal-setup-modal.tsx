import { useState } from "react";
import { Target, Sparkles } from "lucide-react";
import { useSaveAiGoals } from "@/hooks/use-ai";
import { cn } from "@/lib/utils";

interface GoalSetupModalProps {
  onClose: () => void;
}

const QUICK_GOALS = [
  "Build muscle and get stronger",
  "Lose weight and improve fitness",
  "Run a 5K or improve cardio",
  "Eat healthier and track nutrition",
  "Build better sleep and recovery habits",
  "Learn new skills and expand knowledge",
  "Improve flexibility and mobility",
  "Build consistent daily discipline",
];

export default function GoalSetupModal({ onClose }: GoalSetupModalProps) {
  const [goals, setGoals] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const save = useSaveAiGoals();

  function toggleQuick(g: string) {
    setSelected((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  }

  async function handleSubmit() {
    const combined = [
      ...selected,
      ...(goals.trim() ? [goals.trim()] : []),
    ].join(". ");

    if (!combined.trim()) return;

    await save.mutateAsync(combined);
    onClose();
  }

  const finalText = [
    ...selected,
    ...(goals.trim() ? [goals.trim()] : []),
  ].join(", ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl border border-white/[0.1] bg-[#0d0d0d] shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 0 80px rgba(0,0,0,0.8), 0 0 1px rgba(255,255,255,0.08) inset" }}
      >
        {/* Top gradient */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-32 bg-white/[0.03] blur-3xl rounded-full pointer-events-none" />

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
              <Target className="w-5 h-5 text-white/70" />
            </div>
            <div>
              <h2 className="text-base font-bold">Set Your Goals</h2>
              <p className="text-xs text-white/40">Your AI coach uses this to personalize your daily tasks</p>
            </div>
          </div>

          {/* Quick select */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-2.5">
              Quick select
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_GOALS.map((g) => (
                <button
                  key={g}
                  onClick={() => toggleQuick(g)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                    selected.includes(g)
                      ? "bg-white/[0.12] border-white/20 text-white"
                      : "bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.06] hover:text-white/70",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Custom input */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-2">
              Or describe in your own words
            </p>
            <textarea
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="e.g. I want to run a marathon by December and eat a cleaner diet..."
              rows={3}
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3.5 py-3 text-sm text-white placeholder:text-white/20 resize-none focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-colors"
            />
          </div>

          {/* Preview */}
          {finalText && (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3.5 py-3 flex gap-2.5">
              <Sparkles className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
              <p className="text-xs text-white/40 leading-relaxed">{finalText}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-10 rounded-xl border border-white/[0.08] text-sm text-white/40 hover:text-white/60 hover:bg-white/[0.03] transition-all"
            >
              Skip for now
            </button>
            <button
              onClick={handleSubmit}
              disabled={!finalText.trim() || save.isPending}
              className="flex-1 h-10 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {save.isPending ? "Saving…" : "Set Goals →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
