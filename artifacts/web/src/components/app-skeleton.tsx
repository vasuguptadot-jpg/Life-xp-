import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

/* ── Shimmer bone ─────────────────────────────────────────────────────────── */
function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("rounded-lg animate-shimmer", className)}
      style={style}
    />
  );
}

/* ── Heart + EKG pulse ────────────────────────────────────────────────────── */
export function HeartLoader() {
  return (
    <div className="flex flex-col items-center gap-5 select-none">
      {/* Heart */}
      <div className="relative flex items-center justify-center w-20 h-20">
        <div className="absolute inset-0 rounded-full bg-white/[0.06] blur-2xl scale-150" />
        <svg
          viewBox="0 0 24 22"
          className="w-14 h-14 animate-heartbeat relative z-10"
          fill="rgba(255,255,255,0.90)"
        >
          <path d="M12 21.593C5.63 16.054 1 11.296 1 7.191 1 3.4 4.068 2 6.281 2c1.312 0 4.151.501 5.719 4.457C13.59 2.489 16.464 2 17.726 2 20.266 2 23 3.621 23 7.181c0 4.069-5.136 8.793-11 14.412z" />
        </svg>
      </div>

      {/* EKG line */}
      <svg viewBox="0 0 150 28" className="w-36 h-7" fill="none">
        <polyline
          points="0,14 20,14 32,4 40,24 50,14 66,14 76,2 81,26 87,14 104,14 112,7 118,21 126,14 150,14"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="240"
          strokeDashoffset="240"
          className="animate-ekg"
        />
      </svg>

      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/25">
        Loading
      </p>
    </div>
  );
}

/* ── Dashboard content skeleton (inside AppLayout) ────────────────────────── */
export function DashboardSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Page header */}
      <div className="space-y-1.5 mb-1">
        <Bone className="h-2.5 w-14" />
        <Bone className="h-6 w-28" />
      </div>

      {/* Level card */}
      <div className="rounded-2xl border border-white/[0.06] p-6">
        <div className="flex items-center gap-6">
          <Bone className="w-28 h-28 rounded-full shrink-0" style={{ borderRadius: "50%" }} />
          <div className="flex-1 space-y-3">
            <Bone className="h-4 w-20" />
            <Bone className="h-2.5 w-48" />
            <Bone className="h-1.5 w-full rounded-full" />
            <Bone className="h-2.5 w-32 opacity-60" />
          </div>
        </div>
      </div>

      {/* 7 attribute mini cards */}
      <div>
        <Bone className="h-3 w-20 mb-3" />
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/[0.05] p-3 flex flex-col items-center gap-2"
              style={{ opacity: 1 - i * 0.07 }}
            >
              <Bone className="w-8 h-8 rounded-lg" />
              <Bone className="h-5 w-6" />
              <Bone className="h-2 w-7 opacity-50" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom 2-col row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Skill bars */}
        <div className="rounded-2xl border border-white/[0.06] p-5 space-y-4">
          <Bone className="h-3 w-28" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Bone className="h-2.5 w-20" />
                <Bone className="h-2.5 w-5" />
              </div>
              <Bone className="h-1 w-full rounded-full" />
            </div>
          ))}
        </div>

        {/* XP feed */}
        <div className="rounded-2xl border border-white/[0.06] p-5 space-y-1">
          <Bone className="h-3 w-24 mb-4" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <Bone className="w-7 h-7 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Bone className="h-2.5 w-36" />
                <Bone className="h-2 w-20 opacity-55" />
              </div>
              <Bone className="h-5 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Full app exoskeleton (before auth resolves) ──────────────────────────── */
export function AppSkeleton() {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r border-white/[0.06] bg-white/[0.01]">
        {/* Logo row */}
        <div className="h-14 flex items-center px-5 border-b border-white/[0.06] gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/[0.06] animate-shimmer shrink-0" />
          <Bone className="h-4 w-20" />
        </div>
        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {[1, 0.65, 0.45].map((op, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ opacity: op }}>
              <Bone className="w-4 h-4 rounded-md" />
              <Bone className="h-3 w-20" />
            </div>
          ))}
        </nav>
        {/* User footer */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <Bone className="w-7 h-7 rounded-full shrink-0" style={{ borderRadius: "50%" }} />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-2.5 w-24" />
              <Bone className="h-2 w-16 opacity-55" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden h-14 flex items-center px-4 border-b border-white/[0.06] gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/[0.06] animate-shimmer shrink-0" />
          <Bone className="h-4 w-20" />
        </header>

        {/* Content: ghost dashboard + centered heart overlay */}
        <div className="flex-1 overflow-hidden p-4 md:p-7 relative">

          {/* Ghost skeleton of the dashboard content */}
          <div className="max-w-5xl mx-auto space-y-5 opacity-[0.35] pointer-events-none">
            <div className="space-y-1.5">
              <Bone className="h-2.5 w-14" />
              <Bone className="h-6 w-28" />
            </div>
            <div className="rounded-2xl border border-white/[0.05] p-6">
              <div className="flex items-center gap-6">
                <Bone className="w-28 h-28 rounded-full shrink-0" style={{ borderRadius: "50%" }} />
                <div className="flex-1 space-y-3">
                  <Bone className="h-4 w-20" />
                  <Bone className="h-2.5 w-48" />
                  <Bone className="h-1.5 w-full rounded-full" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-white/[0.04] p-3 flex flex-col items-center gap-2">
                  <Bone className="w-8 h-8 rounded-lg" />
                  <Bone className="h-5 w-6" />
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.05] p-5 space-y-3.5">
                <Bone className="h-3 w-24" />
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Bone className="h-2.5 w-28" />
                    <Bone className="h-1 w-full rounded-full" />
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-white/[0.05] p-5 space-y-2">
                <Bone className="h-3 w-20 mb-3" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <Bone className="w-7 h-7 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Bone className="h-2.5 w-32" />
                      <Bone className="h-2 w-20 opacity-60" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Heart loader — centred on top of the ghost */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-3xl px-10 py-8 elevation-2"
              style={{
                background:           "rgba(255,255,255,0.05)",
                backdropFilter:       "blur(40px) saturate(180%)",
                WebkitBackdropFilter: "blur(40px) saturate(180%)",
                border:               "1px solid rgba(255,255,255,0.10)",
                boxShadow:            "0 16px 48px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12)",
              }}
            >
              <HeartLoader />
            </div>
          </div>
        </div>

        {/* Mobile bottom nav skeleton */}
        <nav className="md:hidden h-[68px] border-t border-white/[0.06] flex items-center justify-around px-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <Bone className="w-5 h-5 rounded" />
              <Bone className="h-2 w-10 opacity-50" />
            </div>
          ))}
        </nav>
      </main>
    </div>
  );
}
