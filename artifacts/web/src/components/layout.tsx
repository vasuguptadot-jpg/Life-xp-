import { Link, useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { LayoutDashboard, Target, User as UserIcon, Zap, Trophy, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { AppSkeleton } from "@/components/app-skeleton";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetMe({
    query: { queryKey: ["/api/users/me"], retry: false }
  });

  useEffect(() => {
    if (isError) setLocation("/auth/login");
  }, [isError, setLocation]);

  if (isLoading) {
    return <AppSkeleton />;
  }

  if (!user) return null;

  const navItems = [
    { href: "/dashboard",   label: "Dashboard", icon: LayoutDashboard },
    { href: "/quests",      label: "Quests",    icon: Target },
    { href: "/leaderboard", label: "Position",  icon: Trophy },
    { href: "/feed",        label: "Feed",      icon: Sparkles },
    { href: "/profile",     label: "Profile",   icon: UserIcon },
  ];

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r border-white/[0.06] bg-white/[0.02] backdrop-blur-2xl">
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-[0_0_16px_rgba(255,255,255,0.15)]">
              <Zap className="w-4 h-4 text-black" fill="currentColor" />
            </div>
            <span className="font-bold text-lg tracking-tight">LifeXP</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(item => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className="block">
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-white/[0.08] text-white border border-white/[0.08]"
                    : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
                )}>
                  <item.icon className="w-4.5 h-4.5 shrink-0" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.04]">
            <div className="w-7 h-7 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs font-bold shrink-0">
              {user.username?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold truncate">{user.displayName || user.username}</div>
              <div className="text-[10px] text-white/40 truncate">{user.email}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden h-14 flex items-center justify-between px-4 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-2xl sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-[0_0_12px_rgba(255,255,255,0.12)]">
              <Zap className="w-4 h-4 text-black" fill="currentColor" />
            </div>
            <span className="font-bold text-base tracking-tight">LifeXP</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-7 pb-28 md:pb-7">
          {children}
        </div>

        {/* Mobile bottom nav — 5 items */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[68px] border-t border-white/[0.06] bg-black/90 backdrop-blur-2xl flex items-center justify-around px-2 z-50">
          {navItems.map(item => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className="flex-1 flex justify-center">
                <div className={cn(
                  "flex flex-col items-center gap-0.5 py-2 px-2 rounded-xl transition-all duration-150",
                  isActive ? "text-white" : "text-white/40"
                )}>
                  <div className={cn("p-1 rounded-lg transition-all", isActive && "bg-white/10")}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[9px] font-semibold">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
