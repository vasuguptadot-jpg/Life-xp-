import { useQuery } from "@tanstack/react-query";

function getToken(): string | null {
  return localStorage.getItem("accessToken");
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface ProfileExtra {
  avatarUrl: string | null;
  bio: string | null;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
}

export function useProfileExtra() {
  return useQuery<ProfileExtra>({
    queryKey: ["/api/users/me/profile-extra"],
    queryFn: () => apiFetch<ProfileExtra>("/users/me/profile-extra"),
    staleTime: 5 * 60 * 1000,
  });
}
