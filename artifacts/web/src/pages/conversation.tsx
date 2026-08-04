import { useState, useEffect, useRef } from "react";
import AppLayout from "@/components/layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Loader2, ArrowLeft, Send } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
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

interface Message {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  sender_username: string;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
}

interface ConvInfo {
  id: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string | null;
  other_avatar_url: string | null;
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Conversation() {
  const { id: convId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe({ query: { queryKey: ["/api/users/me"] } });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get conversation info
  const { data: conversations = [] } = useQuery<ConvInfo[]>({
    queryKey: ["/api/messages/conversations"],
    queryFn: () => apiFetch("/messages/conversations"),
  });
  const conv = conversations.find((c: any) => c.id === convId);

  // Load initial messages
  const { isLoading, data: initialMessages } = useQuery<Message[]>({
    queryKey: ["/api/messages/conversations", convId, "messages"],
    queryFn: () => apiFetch(`/messages/conversations/${convId}/messages`),
    enabled: !!convId,
  });

  useEffect(() => {
    if (initialMessages) setMessages(initialMessages);
  }, [initialMessages]);

  // SSE for real-time messages — pass token as query param (EventSource can't set headers)
  useEffect(() => {
    if (!convId) return;
    const token = getToken();
    const es = new EventSource(`/api/messages/conversations/${convId}/events?token=${encodeURIComponent(token ?? "")}`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "message") {
          setMessages(prev => {
            if (prev.some(m => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        }
      } catch {}
    };

    return () => es.close();
  }, [convId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !convId) return;
    setSending(true);
    setInput("");
    try {
      await apiFetch(`/messages/conversations/${convId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: text }),
      });
      // Message will arrive via SSE
    } catch {
      setInput(text); // restore on fail
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const otherName = conv?.other_display_name || conv?.other_username || "Chat";
  const otherAvatar = mediaUrl((conv as any)?.other_avatar_url);

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground">
      {/* Header */}
      <header className="h-14 flex items-center gap-3 px-4 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-2xl shrink-0">
        <button onClick={() => setLocation("/messages")} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06] transition-all">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center font-bold text-xs overflow-hidden shrink-0">
          {otherAvatar ? <img src={otherAvatar} className="w-full h-full object-cover" alt="" /> : otherName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">{otherName}</p>
          {conv?.other_username && <p className="text-[10px] text-white/30">@{conv.other_username}</p>}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-white/30" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-white/30 text-sm">Say hello 👋</div>
        ) : messages.map(msg => {
          const isMine = msg.sender_id === me?.id;
          const avatar = mediaUrl(msg.sender_avatar_url);
          return (
            <div key={msg.id} className={cn("flex gap-2.5 items-end", isMine && "flex-row-reverse")}>
              {!isMine && (
                <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                  {avatar ? <img src={avatar} className="w-full h-full object-cover" alt="" /> : (msg.sender_display_name || msg.sender_username).charAt(0).toUpperCase()}
                </div>
              )}
              <div className={cn("max-w-[75%] space-y-0.5", isMine && "items-end flex flex-col")}>
                <div className={cn(
                  "px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
                  isMine
                    ? "bg-white text-black rounded-br-sm"
                    : "bg-white/[0.07] border border-white/[0.08] text-white rounded-bl-sm"
                )}>
                  {msg.content}
                </div>
                <p className="text-[9px] text-white/25 px-1">{fmtTime(msg.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/[0.06] bg-black/90 backdrop-blur-2xl shrink-0 flex gap-2 items-end">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Message..."
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors pr-4"
          />
        </div>
        <button onClick={send} disabled={!input.trim() || sending}
          className={cn(
            "w-10 h-10 rounded-2xl flex items-center justify-center transition-all shrink-0",
            input.trim() ? "bg-white text-black hover:scale-105 active:scale-95" : "bg-white/[0.06] text-white/30"
          )}>
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
