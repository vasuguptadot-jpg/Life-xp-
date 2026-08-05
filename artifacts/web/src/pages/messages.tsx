import { useState } from "react";
import AppLayout from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, MessageSquare, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

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

function mediaUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `/api/social/objects${path.replace(/^\/objects/, "")}`;
}

interface Conversation {
  id: string;
  created_at: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string | null;
  other_avatar_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function NewMessageModal({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();

  const start = async () => {
    if (!username.trim()) return;
    setLoading(true); setError("");
    try {
      // Search for user by username
      const users = await apiFetch<any[]>(`/social/leaderboard?limit=100`);
      const found = users.find(u => u.username?.toLowerCase() === username.trim().toLowerCase());
      if (!found) { setError("User not found"); setLoading(false); return; }
      const conv = await apiFetch<{ id: string }>("/messages/conversations", {
        method: "POST",
        body: JSON.stringify({ otherUserId: found.id }),
      });
      setLocation(`/messages/${conv.id}`);
    } catch { setError("Something went wrong"); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="glass-heavy border border-white/[0.1] rounded-2xl w-full max-w-sm p-5 space-y-4">
        <h2 className="font-bold text-lg">New Message</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={username} onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && start()}
            placeholder="Enter username..."
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>
        {error && <p className="text-xs text-white/60">{error}</p>}
        <button onClick={start} disabled={loading || !username.trim()}
          className="w-full py-2.5 rounded-xl bg-white text-black text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start Conversation"}
        </button>
      </div>
    </div>
  );
}

export default function Messages() {
  const [, setLocation] = useLocation();
  const [showNew, setShowNew] = useState(false);

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/messages/conversations"],
    queryFn: () => apiFetch<Conversation[]>("/messages/conversations"),
    refetchInterval: 15000,
  });

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-4 animate-slide-up-fade">
        {/* Header */}
        <header className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-0.5">Social</p>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-white/50" /> Messages
            </h1>
          </div>
          <button onClick={() => setShowNew(true)}
            className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.1] transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-white/30" /></div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-white/[0.07]">
            <MessageSquare className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm font-semibold text-white/40">No messages yet</p>
            <p className="text-xs text-white/25 mt-1">Start a conversation with someone from the community</p>
            <button onClick={() => setShowNew(true)}
              className="mt-4 px-4 py-2 rounded-xl border border-white/[0.1] text-xs font-semibold text-white/50 hover:text-white/70 hover:border-white/20 transition-all flex items-center gap-1.5 mx-auto">
              <Plus className="w-3.5 h-3.5" /> New Message
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map(conv => {
              const avatarSrc = mediaUrl(conv.other_avatar_url);
              return (
                <button key={conv.id} onClick={() => setLocation(`/messages/${conv.id}`)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.04] transition-colors text-left">
                  <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                    {avatarSrc ? <img src={avatarSrc} className="w-full h-full object-cover" alt="" /> : (conv.other_display_name || conv.other_username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold truncate">{conv.other_display_name || conv.other_username}</p>
                      {conv.last_message_at && <span className="text-[10px] text-white/30 shrink-0 ml-2">{timeAgo(conv.last_message_at)}</span>}
                    </div>
                    <p className="text-xs text-white/40 truncate mt-0.5">{conv.last_message ?? "No messages yet"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {showNew && <NewMessageModal onClose={() => setShowNew(false)} />}
    </AppLayout>
  );
}
