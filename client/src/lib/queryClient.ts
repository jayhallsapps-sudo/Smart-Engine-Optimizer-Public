import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Internal token cache.
 * The server derives this token from SESSION_SECRET (HMAC-SHA256) and validates
 * it on every /api route via X-Internal-Token. The client fetches it once from
 * the public /api/auth/bootstrap endpoint and caches it for the page lifetime.
 */
let _cachedToken: string | null = null;
let _tokenFetchPromise: Promise<string | null> | null = null;

async function fetchInternalToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/bootstrap", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      return (data.token as string) ?? null;
    }
  } catch {
    // Silently ignore — requests without the token will be rejected by the server
  }
  return null;
}

/**
 * Returns { "X-Internal-Token": <token> } headers after fetching from
 * /api/auth/bootstrap on first call. Subsequent calls use the cached value.
 * Exported for use in direct fetch() calls (print pages, file downloads, SSE).
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (_cachedToken) return { "X-Internal-Token": _cachedToken };

  // Deduplicate concurrent requests
  if (!_tokenFetchPromise) {
    _tokenFetchPromise = fetchInternalToken().then(t => {
      _cachedToken = t;
      _tokenFetchPromise = null;
      return t;
    });
  }
  const token = await _tokenFetchPromise;
  return token ? { "X-Internal-Token": token } : {};
}

/**
 * All SmartEO API calls go through this function. It injects:
 * - X-Internal-Token header (validated by the server's auth middleware)
 * - credentials: "include" so the smarteo_session cookie rides along
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...authHeaders,
    },
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
    const authHeaders = await getAuthHeaders();
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: authHeaders,
    });

    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") return null;
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
