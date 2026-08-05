import { X, Palette, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type StyleTheme, type ColorPalette } from "@/hooks/use-theme";

// ── Data ─────────────────────────────────────────────────────────────────────

interface StyleOption {
  id: StyleTheme;
  label: string;
  desc: string;
  preview: React.ReactNode;
}

const STYLES: StyleOption[] = [
  {
    id: "glass",
    label: "Glass",
    desc: "Liquid black glass — the default",
    preview: (
      <div className="w-full h-10 rounded-lg bg-white/[0.06] border border-white/10 backdrop-blur-md flex items-center justify-center">
        <div className="w-8 h-1.5 rounded-full bg-white/40" />
      </div>
    ),
  },
  {
    id: "brutalism",
    label: "Brutalism",
    desc: "Raw edges, bold contrast, no fluff",
    preview: (
      <div className="w-full h-10 rounded-none bg-black border-2 border-white flex items-center justify-center">
        <div className="w-8 h-1.5 bg-white" />
      </div>
    ),
  },
  {
    id: "maximalism",
    label: "Maximalism",
    desc: "Vivid, dense, and unapologetically loud",
    preview: (
      <div className="w-full h-10 rounded-lg bg-gradient-to-r from-purple-600/40 via-pink-500/40 to-orange-400/40 border border-purple-400/30 flex items-center justify-center gap-1">
        <div className="w-3 h-3 rounded-full bg-pink-400" />
        <div className="w-5 h-1.5 rounded-full bg-yellow-300/80" />
        <div className="w-2 h-2 rounded-full bg-cyan-400" />
      </div>
    ),
  },
  {
    id: "minimalism",
    label: "Minimalism",
    desc: "Light, airy, with deliberate whitespace",
    preview: (
      <div className="w-full h-10 rounded-sm bg-white/95 border border-black/10 flex items-center justify-center">
        <div className="w-8 h-px bg-black/30" />
      </div>
    ),
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    desc: "Neon on dark, terminal vibes",
    preview: (
      <div className="w-full h-10 rounded-none bg-black border border-cyan-400/50 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 4px,rgba(0,255,255,0.3) 4px,rgba(0,255,255,0.3) 5px)" }} />
        <div className="w-8 h-1 bg-cyan-400 shadow-[0_0_8px_rgba(0,255,255,0.8)]" />
      </div>
    ),
  },
];

interface PaletteOption {
  id: ColorPalette;
  label: string;
  colors: string[];
}

const PALETTES: PaletteOption[] = [
  { id: "obsidian", label: "Obsidian",  colors: ["#050505", "#171717", "#f7f7f7"] },
  { id: "midnight", label: "Midnight",  colors: ["#020818", "#0f1f3d", "#7dd3fc"] },
  { id: "forest",   label: "Forest",    colors: ["#021505", "#0d2b13", "#86efac"] },
  { id: "violet",   label: "Violet",    colors: ["#0e0618", "#1e0d38", "#c4b5fd"] },
  { id: "ember",    label: "Ember",     colors: ["#120800", "#2a1200", "#fdba74"] },
  { id: "rose",     label: "Rose",      colors: ["#120410", "#280a22", "#f9a8d4"] },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ThemePicker({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md mx-auto bg-[hsl(var(--card))] border border-[hsl(var(--card-border))] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scale-in max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[hsl(var(--card))] border-b border-white/[0.06] px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <Palette className="w-4 h-4 text-white/40" />
            <h2 className="text-sm font-bold">Appearance</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.1] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-5 space-y-7">
          {/* ── Style themes ─────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-white/30" />
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">Style</h3>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {STYLES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setTheme({ style: s.id })}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                    theme.style === s.id
                      ? "border-white/30 bg-white/[0.06]"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]",
                  )}
                >
                  <div className="w-24 shrink-0">{s.preview}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{s.label}</p>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-snug">{s.desc}</p>
                  </div>
                  {theme.style === s.id && (
                    <div className="ml-auto w-2 h-2 rounded-full bg-white/80 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* ── Color palettes ───────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-white/30" />
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">Color</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PALETTES.map(p => (
                <button
                  key={p.id}
                  onClick={() => setTheme({ palette: p.id })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                    theme.palette === p.id
                      ? "border-white/30 bg-white/[0.06]"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]",
                  )}
                >
                  <div className="flex gap-1">
                    {p.colors.map((c, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full border border-white/10"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-semibold text-white/60">{p.label}</span>
                  {theme.palette === p.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white/80" />
                  )}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
