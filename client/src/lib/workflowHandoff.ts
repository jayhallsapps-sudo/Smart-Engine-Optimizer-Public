/**
 * workflowHandoff.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight localStorage-based bridge from the guided workflow to report
 * builder pages. Writes once when the user reaches Step 6 (Preview & Export);
 * report pages read it on mount and show a dismissable banner.
 *
 * Key: `smarteo:wf_ctx`  (single slot — newest workflow run wins)
 * TTL: 4 hours (context is stale after that)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Finding } from "./findingTypes";
import { effectiveScore, BUCKET_LABELS } from "./priorityEngine";

const STORAGE_KEY = "smarteo:wf_ctx";
const TTL_MS = 4 * 60 * 60 * 1000;

export interface WorkflowCommittedArea {
  areaId: string;
  areaLabel: string;
  amInput: string;
  findings: Finding[];
}

export interface WorkflowHandoffContext {
  version: 1;
  reportTypeId: string;
  clientId: number;
  clientName: string;
  createdAt: number;
  committedAreas: WorkflowCommittedArea[];
}

export function saveWorkflowContext(ctx: Omit<WorkflowHandoffContext, "version" | "createdAt">): void {
  try {
    const full: WorkflowHandoffContext = { version: 1, createdAt: Date.now(), ...ctx };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  } catch {
    // localStorage may be unavailable in some environments — fail silently
  }
}

export function loadWorkflowContext(
  reportTypeId: string,
  clientId: number | null,
): WorkflowHandoffContext | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw) as WorkflowHandoffContext;
    if (ctx.version !== 1) return null;
    if (Date.now() - ctx.createdAt > TTL_MS) return null;
    if (ctx.reportTypeId !== reportTypeId) return null;
    if (clientId !== null && ctx.clientId !== clientId) return null;
    return ctx;
  } catch {
    return null;
  }
}

export function clearWorkflowContext(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * Derive a combined AM thoughts string from all committed areas.
 * Areas with no amInput are skipped.
 */
export function buildAmThoughtsFromContext(ctx: WorkflowHandoffContext): string {
  const parts: string[] = [];
  for (const area of ctx.committedAreas) {
    if (area.amInput.trim()) {
      parts.push(`[${area.areaLabel}]\n${area.amInput.trim()}`);
    }
  }
  return parts.join("\n\n");
}

/**
 * Derive a priority checks string (bullet list) from accepted/revised findings.
 *
 * Findings are sorted by effective priority (manual override > heuristic) so the
 * highest-impact items surface first in the report builder's pre-populated inputs.
 * Each line includes the effective priority bucket label so report authors can see
 * AM priority judgements at a glance.
 */
export function buildPriorityChecksFromContext(ctx: WorkflowHandoffContext): string {
  const lines: string[] = [];
  for (const area of ctx.committedAreas) {
    const selected = area.findings
      .filter(f => f.selected && f.status !== "rejected")
      .slice()
      .sort((a, b) => effectiveScore(b) - effectiveScore(a));

    for (const f of selected) {
      const ov = f.priorityOverride;
      const bucket = ov?.bucket ?? f.priority?.bucket;
      const bucketLabel = bucket ? BUCKET_LABELS[bucket] : null;
      const overrideMarker = ov ? " [adj]" : "";
      const priorityTag = bucketLabel ? ` (${bucketLabel}${overrideMarker})` : "";
      lines.push(`• [${area.areaLabel}]${priorityTag} ${f.body}`);
    }
  }
  return lines.join("\n");
}
