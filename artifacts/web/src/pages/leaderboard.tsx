import { useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trophy, Crown, Medal, Zap, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetMe } from "@workspace/api-client-react";

function getToken() { return localStorage.getItem("accessToken"); }
async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  totalXp: number;
  currentLevel: number;
}

function rankLabel(level: number) {
  if (level < 5) return "Initiate";
  if (level < 10) return "Adventurer";
  if (level < 20) return "Champion";
  if (level < 35) return "Hero";
  return "Legend";
}

function rankColor(rank: number) {
  if (rank === 1) return "text-yellow-400";
  if (rank === 2) return "text-slate-300";
  if (rank === 3) return "text-amber-600";
  return "text-white/30";
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className={cn("text-sm font-black tabular-nums w-5 text-center", rankColor(rank))}>{rank}</span>;
}

export default function Leaderboard() {
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe({ query: { queryKey: ["/api/users/me"] } });
  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/social/leaderboard"],
    queryFn: () => apiFetch<LeaderboardEntry[]>("/social/leaderboard?limit=50"),
  });

  const myRank = entries.findIndex(e => e.id === me?.id) + 1;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 animate-slide-up-fade">
        {/* Header */}
        <header className="mb-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Rankings</p>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-400/80" />
            Position
          </h1>
          <p className="text-xs text-white/40 mt-1">Global XP leaderboard — earn XP by completing AI tasks</p>
        </header>

        {/* My rank banner */}
        {me && myRank > 0 && (
          <div className="glass-heavy border border-white/[0.1] rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/[0.08] flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5 text-yellow-400/80" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">Your Rank</p>
              <p className="text-lg font-black">#{myRank}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40">Total XP</p>
              <p className="text-lg font-black flex items-center gap-1">
                <Zap className="w-4 h-4 text-yellow-400" />
                {entries.find(e => e.id === me.id)?.totalXp?.toLocaleString() ?? 0}
              </p>
            </div>
          </div>
        )}

        {/* Top 3 podium */}
        {!isLoading && entries.length >= 3 && (
          <div className="grid grid-cols-3 gap-3 mb-2">
            {[entries[1], entries[0], entries[2]].map((entry, i) => {
              const isCenter = i === 1;
              const actualRank = isCenter ? 1 : i === 0 ? 2 : 3;
              return (
                <button
                  key={entry.id}
                  onClick={() => setLocation(`/users/${entry.id}`)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all hover:scale-105",
                    isCenter
                      ? "border-yellow-400/20 bg-yellow-400/[0.04] mt-0"
                      : "border-white/[0.06] bg-white/[0.02] mt-4"
                  )}
                >
                  {isCenter && <Crown className="w-5 h-5 text-yellow-400 mb-0.5" />}
                  <div className={cn(
                    "rounded-xl border flex items-center justify-center font-black text-base shrink-0",
                    isCenter ? "w-12 h-12 bg-yellow-400/10 border-yellow-400/20 text-yellow-400" : "w-10 h-10 bg-white/[0.06] border-white/[0.08]"
                  )}>
                    {entry.avatarUrl
                      ? <img src={`/api/social/objects${entry.avatarUrl.replace(/^\/objects/, "")}`} className="w-full h-full rounded-xl object-cover" />
                      : (entry.displayName || entry.username).charAt(0).toUpperCase()}
                  </div>
                  <p className="text-[11px] font-bold text-center truncate w-full leading-tight">{entry.displayName || entry.username}</p>
                  <p className={cn("text-[10px] font-black", rankColor(actualRank))}>#{actualRank}</p>
                  <p className="text-[10px] text-white/40 flex items-center gap-0.5">
                    <Zap className="w-2.5 h-2.5" />{entry.totalXp.toLocaleString()}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Full list */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-white/30" /></div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-white/[0.07]">
            <Trophy className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm font-semibold text-white/40">No rankings yet</p>
            <p className="text-xs text-white/25 mt-1">Complete AI tasks to earn XP and rank up</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {entries.map(entry => {
              const isMe = entry.id === me?.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => setLocation(`/users/${entry.id}`)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-2xl border transition-all hover:bg-white/[0.04] text-left",
                    isMe
                      ? "border-white/[0.12] bg-white/[0.04]"
                      : "border-white/[0.05] bg-white/[0.01]"
                  )}
                >
                  {/* Rank */}
                  <div className="w-7 flex justify-center shrink-0">
                    <RankIcon rank={entry.rank} />
                  </div>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                    {entry.avatarUrl
                      ? <img src={`/api/social/objects${entry.avatarUrl.replace(/^\/objects/, "")}`} className="w-full h-full object-cover" />
                      : (entry.displayName || entry.username).charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm font-semibold truncate", isMe && "text-white")}>{entry.displayName || entry.username}</p>
                      {isMe && <span className="text-[9px] bg-white/10 text-white/60 rounded-full px-1.5 py-0.5 font-bold uppercase tracking-wider shrink-0">You</span>}
                    </div>
                    <p className="text-[10px] text-white/30">Lv {entry.currentLevel} · {rankLabel(entry.currentLevel)}</p>
                  </div>

                  {/* XP */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Zap className="w-3.5 h-3.5 text-yellow-400/70" />
                    <span className="text-sm font-bold tabular-nums">{entry.totalXp.toLocaleString()}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-white/20 ml-0.5" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
