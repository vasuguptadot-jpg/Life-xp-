import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function getToken(): string | null {
  return localStorage.getItem("accessToken");
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api/ai${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface AiGoal {
  goals: string | null;
  updatedAt: string | null;
}

export interface DailyTask {
  id: string;
  date: string;
  taskText: string;
  category: string;
  xpReward: number;
  isCompleted: boolean;
  completedAt: string | null;
}

export interface LifeTip {
  tip: string;
  category: string;
  date: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useAiGoals() {
  return useQuery<AiGoal>({
    queryKey: ["/api/ai/goals"],
    queryFn: () => apiFetch<AiGoal>("/goals"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveAiGoals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goals: string) =>
      apiFetch("/goals", { method: "POST", body: JSON.stringify({ goals }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ai/goals"] });
      qc.invalidateQueries({ queryKey: ["/api/ai/daily-tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/ai/life-tip"] });
    },
  });
}

export function useDailyTasks() {
  return useQuery<DailyTask[]>({
    queryKey: ["/api/ai/daily-tasks"],
    queryFn: () => apiFetch<DailyTask[]>("/daily-tasks"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/daily-tasks/${id}/complete`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ai/daily-tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/users/me/progression"] });
    },
  });
}

export function useLifeTip() {
  return useQuery<LifeTip>({
    queryKey: ["/api/ai/life-tip"],
    queryFn: () => apiFetch<LifeTip>("/life-tip"),
    staleTime: 60 * 60 * 1000,
  });
}

export function useChatHistory() {
  return useQuery<ChatMessage[]>({
    queryKey: ["/api/ai/chat/history"],
    queryFn: () => apiFetch<ChatMessage[]>("/chat/history"),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      apiFetch<{ message: string; id: string }>("/chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ai/chat/history"] });
    },
  });
}
