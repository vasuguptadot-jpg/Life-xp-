import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Loader2, Sparkles, ChevronDown } from "lucide-react";
import { useChatHistory, useSendMessage, type ChatMessage } from "@/hooks/use-ai";
import { cn } from "@/lib/utils";

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-white/[0.08] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-white/60" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-white text-black rounded-tr-sm"
            : "bg-white/[0.06] border border-white/[0.06] text-white/90 rounded-tl-sm",
        )}
      >
        {msg.content}
      </div>
    </div>
  );
}

interface AiCoachPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AiCoachPanel({ open, onClose }: AiCoachPanelProps) {
  const [input, setInput] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: history = [], isLoading } = useChatHistory();
  const send = useSendMessage();

  const allMessages = [...history, ...optimisticMessages];

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages, isThinking]);

  // Clear optimistic messages when real history updates
  useEffect(() => {
    setOptimisticMessages([]);
  }, [history.length]);

  async function handleSend() {
    const text = input.trim();
    if (!text || send.isPending) return;
    setInput("");

    // Optimistic message
    const tempId = `temp-${Date.now()}`;
    setOptimisticMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: text, createdAt: new Date().toISOString() },
    ]);
    setIsThinking(true);

    try {
      await send.mutateAsync(text);
    } finally {
      setIsThinking(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed bottom-0 right-0 z-50 w-full max-w-sm h-[600px] max-h-[85vh] flex flex-col",
          "rounded-t-2xl border border-white/[0.08] border-b-0 bg-[#0d0d0d]",
          "transition-transform duration-300 ease-out",
          "md:bottom-6 md:right-6 md:rounded-2xl md:border-b md:border-white/[0.08]",
          open ? "translate-y-0" : "translate-y-[110%]",
        )}
        style={{
          boxShadow: "0 -4px 60px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.06) inset",
        }}
      >
        {/* Top shimmer line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-2xl" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/[0.08] border border-white/[0.08] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white/70" />
            </div>
            <div>
              <p className="text-sm font-semibold">AI Coach</p>
              <p className="text-[10px] text-white/30">Powered by Groq · llama-3.3-70b</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
            </div>
          ) : allMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                <Bot className="w-6 h-6 text-white/20" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/50">Your AI Coach</p>
                <p className="text-xs text-white/25 mt-1 max-w-[200px]">
                  Ask me anything about your fitness goals, daily tasks, or progress.
                </p>
              </div>
              <div className="flex flex-col gap-1.5 w-full mt-2">
                {[
                  "What should I focus on today?",
                  "Create a workout plan for me",
                  "How do I level up faster?",
                ].map((hint) => (
                  <button
                    key={hint}
                    onClick={() => setInput(hint)}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs text-white/40 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:text-white/60 transition-all"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {allMessages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {isThinking && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/[0.08] border border-white/[0.08] flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-white/60" />
                  </div>
                  <div className="bg-white/[0.06] border border-white/[0.06] rounded-2xl rounded-tl-sm">
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="px-3 pb-4 pt-2 border-t border-white/[0.06] shrink-0">
          <div className="flex items-end gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2 focus-within:border-white/20 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your coach anything…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 resize-none focus:outline-none max-h-32 leading-relaxed"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || send.isPending}
              className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-white/90 transition-all mb-0.5"
            >
              {send.isPending ? (
                <Loader2 className="w-3.5 h-3.5 text-black animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 text-black" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-white/15 text-center mt-1.5">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  );
}

// ── Floating trigger button ──────────────────────────────────────────────────
interface AiCoachButtonProps {
  onClick: () => void;
  hasUnread?: boolean;
}

export function AiCoachButton({ onClick, hasUnread }: AiCoachButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-30 w-14 h-14 rounded-2xl bg-white shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      style={{ boxShadow: "0 4px 24px rgba(255,255,255,0.15), 0 1px 0 rgba(255,255,255,0.4) inset" }}
      aria-label="Open AI Coach"
    >
      <Bot className="w-6 h-6 text-black" />
      {hasUnread && (
        <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-white border-2 border-black" />
      )}
    </button>
  );
}
