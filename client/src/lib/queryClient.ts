import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAdminToken } from "@/lib/adminAuth";

let internalToken: string | null = null;

async function getToken(): Promise<string> {
  if (!internalToken) {
    const res = await fetch("/api/auth/bootstrap");
    if (!res.ok) throw new Error("Failed to fetch internal token");
    const data = await res.json();
    internalToken = data.token;
  }
  return internalToken!;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return { "X-Internal-Token": token };
}

/** Include X-Admin-Token when an admin session is active. */
function getAdminHeaders(): Record<string, string> {
  const adminToken = getAdminToken();
  return adminToken ? { "X-Admin-Token": adminToken } : {};
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = await getToken();
  const res = await fetch(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      "X-Internal-Token": token,
      ...getAdminHeaders(),
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
    const token = await getToken();
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: { "X-Internal-Token": token, ...getAdminHeaders() },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
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
