import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Fetch the X-Internal-Token from the server bootstrap endpoint.
 * Used by pages that make direct fetch() calls (print pages, file downloads)
 * that need the token in their headers alongside the session cookie.
 */
let _cachedToken: string | null = null;
export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!_cachedToken) {
    try {
      const res = await fetch("/api/auth/bootstrap", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        _cachedToken = data.token as string;
      }
    } catch {
      // Return empty if bootstrap is unavailable — session cookie still works
      return {};
    }
  }
  return _cachedToken ? { "X-Internal-Token": _cachedToken } : {};
}

/**
 * Auth model: the server uses an HTTP-only session cookie (`smarteo.sid`).
 * As long as we send `credentials: "include"` the cookie rides along
 * automatically — no client-side token plumbing needed.
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") return null;
      // Soft-redirect to login on session expiry. ProtectedRoute will keep
      // unauthenticated visitors out of protected pages on first load.
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        const here = window.location.pathname + window.location.search;
        window.location.assign(`/login?redirect=${encodeURIComponent(here)}`);
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
