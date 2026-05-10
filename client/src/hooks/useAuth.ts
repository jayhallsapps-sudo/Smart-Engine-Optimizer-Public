import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { SafeUser } from "@shared/schema";

interface MeResponse {
  user: SafeUser;
}

async function fetchCurrentUser(): Promise<SafeUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const data: MeResponse = await res.json();
  return data.user;
}

const ME_KEY = ["/api/auth/me"] as const;

export function useCurrentUser() {
  const query = useQuery<SafeUser | null>({
    queryKey: ME_KEY,
    queryFn: fetchCurrentUser,
    staleTime: 60_000,
    retry: false,
  });
  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useIsAdmin(): boolean {
  const { user } = useCurrentUser();
  return user?.role === "admin";
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", input);
      const data: MeResponse = await res.json();
      return data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(ME_KEY, null);
      queryClient.clear();
    },
  });
}
