import { useState } from "react";
import { useParams, useLocation } from "wouter";
import AppLayout from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Zap, Trophy, UserCheck, UserPlus, Users, Calendar, Weight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGetMe } from "@workspace/api-client-react";

function getToken() { return localStorage.getItem("accessToken"); }
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function rankLabel(level: number) {
  if (level < 5) return "Initiate";
  if (level < 10) return "Adventurer";
  if (level < 20) return "Champion";
  if (level < 35) return "Hero";
  return "Legend";
}

interface PublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  createdAt: string;
  level: number;
  totalXp: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  profile: {
    avatarUrl: string | null;
    bio: string | null;
    age: number | null;
    weightKg: string | null;
    heightCm: number | null;
  } | null;
}

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: ["/api/users/me"] } });

  const { data: profile, isLoading } = useQuery<PublicProfile>({
    queryKey: ["/api/social/users", id],
    queryFn: () => apiFetch<PublicProfile>(`/social/users/${id}`),
    enabled: !!id,
  });

  const followMut = useMutation({
    mutationFn: () => apiFetch(`/social/users/${id}/follow`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/social/users", id] }),
  });
  const unfollowMut = useMutation({
    mutationFn: () => apiFetch(`/social/users/${id}/follow`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/social/users", id] }),
  });

  if (isLoading) {
    return <AppLayout><div className="flex justify-center p-16"><Loader2 className="w-8 h-8 animate-spin text-white/30" /></div></AppLayout>;
  }
  if (!profile) {
    return <AppLayout><div className="text-center py-20 text-white/40">User not found</div></AppLayout>;
  }

  const isMe = profile.id === me?.id;
  const avatarSrc = profile.profile?.avatarUrl
    ? `/api/social/objects${profile.profile.avatarUrl.replace(/^\/objects/, "")}`
    : null;

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-4 animate-slide-up-fade">
        {/* Back button */}
        <button onClick={() => setLocation("/leaderboard")} className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-sm mb-2">
          <ArrowLeft className="w-4 h-4" /> Back to Rankings
        </button>

        {/* Profile card */}
        <div className="glass-heavy border border-white/[0.1] rounded-2xl p-6">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-2xl font-black shrink-0 overflow-hidden">
              {avatarSrc
                ? <img src={avatarSrc} className="w-full h-full object-cover" />
                : (profile.displayName || profile.username).charAt(0).toUpperCase()}
            </div>

            {/* Name + follow */}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold leading-tight">{profile.displayName || profile.username}</h1>
              <p className="text-sm text-white/40">@{profile.username}</p>
              {profile.profile?.bio && (
                <p className="text-xs text-white/60 mt-1.5 leading-relaxed">{profile.profile.bio}</p>
              )}
            </div>

            {!isMe && (
              <Button
                size="sm"
                variant={profile.isFollowing ? "outline" : "default"}
                onClick={() => profile.isFollowing ? unfollowMut.mutate() : followMut.mutate()}
                disabled={followMut.isPending || unfollowMut.isPending}
                className="shrink-0"
              >
                {followMut.isPending || unfollowMut.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : profile.isFollowing
                    ? <><UserCheck className="w-4 h-4 mr-1.5" />Following</>
                    : <><UserPlus className="w-4 h-4 mr-1.5" />Follow</>}
              </Button>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3 mt-5 pt-5 border-t border-white/[0.06]">
            <div className="text-center">
              <p className="text-lg font-black">{profile.level}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Level</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black flex items-center justify-center gap-0.5">
                <Zap className="w-4 h-4 text-white/60" />{profile.totalXp.toLocaleString()}
              </p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">XP</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black">{profile.followerCount}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Followers</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black">{profile.followingCount}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Following</p>
            </div>
          </div>
        </div>

        {/* Details card */}
        <div className="glass-heavy border border-white/[0.08] rounded-2xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/30">Details</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Trophy, label: "Rank", value: rankLabel(profile.level) },
              { icon: Zap, label: "Title", value: rankLabel(profile.level) },
              ...(profile.profile?.age ? [{ icon: Calendar, label: "Age", value: `${profile.profile.age} yrs` }] : []),
              ...(profile.profile?.weightKg ? [{ icon: Weight, label: "Weight", value: `${profile.profile.weightKg} kg` }] : []),
              ...(profile.profile?.heightCm ? [{ icon: Target, label: "Height", value: `${profile.profile.heightCm} cm` }] : []),
              { icon: Users, label: "Member since", value: new Date(profile.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <Icon className="w-4 h-4 text-white/30 shrink-0" />
                <div>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider">{label}</p>
                  <p className="text-sm font-semibold">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
