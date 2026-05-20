import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type HealthStatus = "ok" | "partial" | "broken" | "not_configured";

export interface SourceHealth {
  status: HealthStatus;
  message: string;
}

export interface ClientSourceHealthResponse {
  gsc: SourceHealth;
  ga4: SourceHealth;
  callrail: SourceHealth;
  ctm: SourceHealth;
  nimbata: SourceHealth;
  airtable: SourceHealth;
  asana: SourceHealth;
  semrush: SourceHealth;
  ahrefs: SourceHealth;
  checkedAt: string;
}

export function useClientSourceHealth(clientId: number | null | undefined) {
  return useQuery<ClientSourceHealthResponse>({
    queryKey: ["/api/clients", clientId, "source-health"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/clients/${clientId}/source-health`);
      return res.json();
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

export const HEALTH_LABEL: Record<HealthStatus, string> = {
  ok: "Connected",
  partial: "Partial",
  broken: "Broken",
  not_configured: "Not configured",
};

export const HEALTH_DOT_COLOR: Record<HealthStatus, string> = {
  ok: "#22c55e",
  partial: "#eab308",
  broken: "#ef4444",
  not_configured: "#6b7280",
};
