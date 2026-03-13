/**
 * GuidancePanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Compact, collapsible guidance panel surfacing active Admin Guidance entries
 * relevant to the current working context (report type and/or workflow area).
 *
 * ── FILTERING / SELECTION LOGIC ──────────────────────────────────────────────
 * All active guidance entries are fetched once and filtered client-side.
 * Entries are matched in priority order:
 *
 *   Tier 1 — reportType === X  AND  workflowArea === Y  (exact match)
 *   Tier 2 — reportType === X  AND  workflowArea is null/undefined
 *   Tier 3 — reportType is null/undefined  AND  workflowArea === Y
 *   Tier 4 — reportType is null  AND  workflowArea is null  (global)
 *
 * All matching entries across all tiers are surfaced, ordered by tier then by
 * updatedAt DESC (API already returns newest-first).
 *
 * ── SESSION DISMISSAL ────────────────────────────────────────────────────────
 * "Hide for this session" stores a flag in sessionStorage:
 *   key = `smarteo:guidance_hidden:${sessionKey}`
 * The panel re-appears on page reload. No persistence beyond the session.
 *
 * ── PROPS ────────────────────────────────────────────────────────────────────
 * reportType   — matches adminGuidance.reportType  (e.g. "biweekly", "monthly")
 * workflowArea — matches adminGuidance.workflowArea ("content"|"technical"|"local"|"discovery")
 * sessionKey   — unique string per page/context; prevents cross-page dismissal bleed
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronDown, ChevronRight, X } from "lucide-react";
import type { AdminGuidance } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface GuidancePanelProps {
  reportType?: string | null;
  workflowArea?: string | null;
  sessionKey: string;
}

// ─── Filtering ─────────────────────────────────────────────────────────────────

function selectGuidance(
  entries: AdminGuidance[],
  reportType: string | null | undefined,
  workflowArea: string | null | undefined,
): AdminGuidance[] {
  const rt = reportType ?? null;
  const wa = workflowArea ?? null;

  const tier1 = entries.filter(e => e.reportType === rt && rt !== null && e.workflowArea === wa && wa !== null);
  const tier2 = entries.filter(e => e.reportType === rt && rt !== null && (e.workflowArea === null || e.workflowArea === undefined));
  const tier3 = entries.filter(e => (e.reportType === null || e.reportType === undefined) && e.workflowArea === wa && wa !== null);
  const tier4 = entries.filter(e => (e.reportType === null || e.reportType === undefined) && (e.workflowArea === null || e.workflowArea === undefined));

  // Deduplicate by id across tiers (earlier tiers win)
  const seen = new Set<number>();
  const result: AdminGuidance[] = [];
  for (const entry of [...tier1, ...tier2, ...tier3, ...tier4]) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      result.push(entry);
    }
  }
  return result;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function GuidancePanel({ reportType, workflowArea, sessionKey }: GuidancePanelProps) {
  const storageKey = `smarteo:guidance_hidden:${sessionKey}`;

  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === "1"; } catch { return false; }
  });
  const [collapsed, setCollapsed] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const { data: allActive = [] } = useQuery<AdminGuidance[]>({
    queryKey: ["/api/admin/guidance", "active"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/guidance?status=active");
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 60_000,
  });

  const relevant = selectGuidance(allActive, reportType, workflowArea);

  if (hidden || relevant.length === 0) return null;

  function dismiss() {
    try { sessionStorage.setItem(storageKey, "1"); } catch {}
    setHidden(true);
  }

  function toggleEntry(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="mx-3 mb-3 rounded-lg border border-[#1B3A6B]/20 bg-[#1B3A6B]/5"
      data-testid="guidance-panel"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <BookOpen className="w-3 h-3 text-[#1B3A6B]/70 shrink-0" />
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex-1 flex items-center gap-1.5 text-left"
          data-testid="button-guidance-collapse"
        >
          <span className="text-[10px] font-semibold text-[#1B3A6B] leading-none">
            Leadership Guidance
          </span>
          <span className="text-[9px] text-[#1B3A6B]/60 bg-[#1B3A6B]/10 rounded px-1 py-0.5 leading-none">
            {relevant.length}
          </span>
          {collapsed ? (
            <ChevronRight className="w-3 h-3 text-[#1B3A6B]/50 ml-auto" />
          ) : (
            <ChevronDown className="w-3 h-3 text-[#1B3A6B]/50 ml-auto" />
          )}
        </button>
        <button
          onClick={dismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title="Hide for this session"
          data-testid="button-guidance-dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Entry list */}
      {!collapsed && (
        <div className="px-2.5 pb-2 space-y-1">
          {relevant.map(entry => {
            const isExpanded = expandedIds.has(entry.id);
            const hasBody = entry.body && entry.body.trim().length > 0;
            return (
              <div
                key={entry.id}
                className="rounded border border-[#1B3A6B]/15 bg-white/50 dark:bg-[#1B3A6B]/10"
                data-testid={`guidance-entry-${entry.id}`}
              >
                <button
                  onClick={() => hasBody && toggleEntry(entry.id)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left ${hasBody ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span className="text-[10px] font-semibold text-foreground/80 flex-1 leading-snug">
                    {entry.title}
                  </span>
                  {hasBody && (
                    isExpanded
                      ? <ChevronDown className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                  )}
                </button>
                {hasBody && isExpanded && (
                  <div className="px-2 pb-2 pt-0 border-t border-[#1B3A6B]/10">
                    <p className="text-[9.5px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {entry.body}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
          <button
            onClick={dismiss}
            className="w-full text-[9.5px] text-muted-foreground hover:text-foreground transition-colors text-center pt-0.5"
            data-testid="button-guidance-hide-session"
          >
            Hide for this session
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Area ID → workflowArea group ─────────────────────────────────────────────
// Maps granular workflow area IDs to the 4 guidance workflowArea group values.

const AREA_GROUP_MAP: Record<string, string> = {
  content_refresh: "content",
  new_content: "content",
  cro_content: "content",
  technical_infra: "technical",
  technical_content: "technical",
  advanced_technical: "technical",
  local_gbp: "local",
  discoverability: "discovery",
};

export function areaIdToWorkflowGroup(areaId: string): string | null {
  return AREA_GROUP_MAP[areaId] ?? null;
}
