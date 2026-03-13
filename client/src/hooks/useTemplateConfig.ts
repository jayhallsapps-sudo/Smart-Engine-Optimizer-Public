/**
 * useTemplateConfig
 * ─────────────────────────────────────────────────────────────────────────────
 * Merges DB-persisted template section overrides with code-defined defaults
 * from templateDefaults.ts.
 *
 * Returns a stable ordered array of ResolvedSection objects.
 *
 * Fallback: if the API fails or returns no data, all sections use code defaults.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ReportTemplateSection } from "@shared/schema";
import { getSectionDefaults } from "@shared/templateDefaults";

export type ResolvedSection = {
  /** DB row id — undefined when using pure defaults (no DB row exists). */
  id: number | undefined;
  sectionKey: string;
  /** Resolved display label (DB override ?? code default). */
  label: string;
  /** Resolved enabled flag (DB override ?? code default). */
  enabled: boolean;
  /** Resolved display order (DB override ?? code default). */
  order: number;
  /** Optional admin helper copy shown to AMs. Null when not set. */
  helperCopy: string | null;
  /** True when all fields are code-defined defaults (no DB row). */
  isDefault: boolean;
  /** True when this section cannot be disabled by admin. */
  alwaysEnabled: boolean;
  /** Admin-facing description of what this section contains. */
  description: string;
  /** Code-defined default label (for reset/comparison UI). */
  defaultLabel: string;
  /** Code-defined default order. */
  defaultOrder: number;
};

export function useTemplateConfig(reportType: string | null) {
  const { data: rows = [], isLoading } = useQuery<ReportTemplateSection[]>({
    queryKey: ["/api/admin/template-sections", reportType],
    queryFn: async () => {
      if (!reportType) return [];
      try {
        const res = await apiRequest("GET", `/api/admin/template-sections?reportType=${encodeURIComponent(reportType)}`);
        const json = await res.json();
        return Array.isArray(json) ? json : [];
      } catch {
        return [];
      }
    },
    enabled: !!reportType,
    staleTime: 60_000,
  });

  const sections: ResolvedSection[] = getSectionDefaults(reportType ?? "").map(def => {
    const row = rows.find(r => r.sectionKey === def.sectionKey);
    const resolvedOrder = row?.displayOrder ?? def.defaultOrder;

    return {
      id: row?.id,
      sectionKey: def.sectionKey,
      label: row?.sectionLabel ?? def.defaultLabel,
      enabled: row?.enabled ?? def.defaultEnabled,
      order: resolvedOrder,
      helperCopy: row?.helperCopy ?? null,
      isDefault: !row,
      alwaysEnabled: def.alwaysEnabled,
      description: def.description,
      defaultLabel: def.defaultLabel,
      defaultOrder: def.defaultOrder,
    };
  }).sort((a, b) => a.order - b.order);

  /** Only enabled sections, sorted by order. */
  const enabledSections = sections.filter(s => s.enabled);

  return { sections, enabledSections, isLoading };
}
