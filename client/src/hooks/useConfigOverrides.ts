/**
 * useConfigOverrides
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared hook for reading admin config overrides from /api/admin/config-overrides.
 * Used in both admin (edit mode) and runtime (read-only consumption) contexts.
 *
 * Falls back gracefully: if the request fails or returns no data, all helpers
 * return null / the supplied fallback and the calling code uses code-defined defaults.
 *
 * Supported fields per namespace
 * ──────────────────────────────
 *   reportType  →  note (annotation), description (override)
 *   fieldMap    →  note (annotation), sourceHint (override)
 *   qbsMap      →  note (annotation), sourceHint (override)
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

  /** Get the value of any field override. Returns the override value or `fallback` (or empty string). */
  function getValue(itemKey: string, field: string, fallback?: string): string {
    const ns = namespace;
    const entry = overrides.find(
      o => (ns ? o.namespace === ns : true) && o.itemKey === itemKey && o.field === field,
    );
    return entry?.value ?? fallback ?? "";
  }

  /** Shortcut for field === "note". Returns null when no note is saved. */
  function getNote(itemKey: string): string | null {
    const v = getValue(itemKey, "note");
    return v || null;
  }

  /** Returns the full DB row for itemKey+field:"note", or null. */
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

  /** Returns the full DB row for any field, or null. */
  function getFieldEntry(itemKey: string, field: string): AdminConfigOverride | null {
    const ns = namespace;
    return (
      overrides.find(
        o =>
          (ns ? o.namespace === ns : true) &&
          o.itemKey === itemKey &&
          o.field === field,
      ) ?? null
    );
  }

  return { overrides, getValue, getNote, getEntry, getFieldEntry };
}
