/**
 * useConfigOverrides
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared hook for reading admin config overrides from /api/admin/config-overrides.
 * Used in both admin (edit mode) and runtime (read-only consumption) contexts.
 *
 * Falls back gracefully: if the request fails or returns no data, all `getNote`
 * calls return null and the calling code uses its code-defined defaults.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { AdminConfigOverride } from "@shared/schema";

export function useConfigOverrides(namespace?: string) {
  const qKey = namespace
    ? ["/api/admin/config-overrides", namespace]
    : ["/api/admin/config-overrides"];

  const url = namespace
    ? `/api/admin/config-overrides?namespace=${encodeURIComponent(namespace)}`
    : "/api/admin/config-overrides";

  const { data: overrides = [] } = useQuery<AdminConfigOverride[]>({
    queryKey: qKey,
    queryFn: async () => {
      const res = await apiRequest("GET", url);
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 60_000,
  });

  function getNote(itemKey: string): string | null {
    const ns = namespace;
    const entry = overrides.find(
      o =>
        (ns ? o.namespace === ns : true) &&
        o.itemKey === itemKey &&
        o.field === "note",
    );
    return entry?.value ?? null;
  }

  function getEntry(itemKey: string): AdminConfigOverride | null {
    const ns = namespace;
    return (
      overrides.find(
        o =>
          (ns ? o.namespace === ns : true) &&
          o.itemKey === itemKey &&
          o.field === "note",
      ) ?? null
    );
  }

  return { overrides, getNote, getEntry };
}
