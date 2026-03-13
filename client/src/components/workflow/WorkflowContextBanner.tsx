/**
 * WorkflowContextBanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown in report builder sidebars when the page was opened from the guided
 * workflow and context is available. Lets the AM apply their workflow prep
 * (AM notes + finding bullets) into the report fields with one click.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles, Check, X } from "lucide-react";
import type { WorkflowHandoffContext } from "@/lib/workflowHandoff";
import {
  buildAmThoughtsFromContext,
  buildPriorityChecksFromContext,
  clearWorkflowContext,
} from "@/lib/workflowHandoff";

interface WorkflowContextBannerProps {
  context: WorkflowHandoffContext;
  onApply: (amThoughts: string, priorityChecks: string) => void;
  onDismiss: () => void;
}

export function WorkflowContextBanner({
  context,
  onApply,
  onDismiss,
}: WorkflowContextBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [applied, setApplied] = useState(false);

  const committedCount = context.committedAreas.length;
  const findingCount = context.committedAreas.reduce(
    (n, a) => n + a.findings.filter(f => f.selected && f.status !== "rejected").length,
    0,
  );

  function handleApply() {
    const amThoughts = buildAmThoughtsFromContext(context);
    const priorityChecks = buildPriorityChecksFromContext(context);
    onApply(amThoughts, priorityChecks);
    setApplied(true);
  }

  function handleDismiss() {
    clearWorkflowContext();
    onDismiss();
  }

  return (
    <div
      className="mx-3 mb-3 rounded-lg border border-[#1B3A6B]/25 bg-[#1B3A6B]/5"
      data-testid="workflow-context-banner"
    >
      <div className="flex items-start gap-2 p-2.5">
        <Sparkles className="w-3.5 h-3.5 text-[#1B3A6B] mt-px shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] font-semibold text-[#1B3A6B] leading-tight">
              Workflow prep available
            </p>
            <button
              onClick={handleDismiss}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              title="Dismiss"
              data-testid="button-dismiss-workflow-context"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
            {committedCount} area{committedCount !== 1 ? "s" : ""} committed ·{" "}
            {findingCount} finding{findingCount !== 1 ? "s" : ""}
          </p>

          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-0.5 text-[10px] text-[#1B3A6B] mt-1 hover:underline"
            data-testid="button-expand-workflow-context"
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {expanded ? "Hide" : "Show"} details
          </button>

          {expanded && (
            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {context.committedAreas.map(area => {
                const areaFindings = area.findings.filter(
                  f => f.selected && f.status !== "rejected",
                );
                return (
                  <div key={area.areaId} className="text-[10px]">
                    <div className="font-semibold text-foreground/80 mb-0.5">
                      {area.areaLabel}
                      {area.amInput.trim() && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          (has AM notes)
                        </span>
                      )}
                    </div>
                    {areaFindings.length > 0 ? (
                      <ul className="space-y-0.5 pl-2">
                        {areaFindings.map(f => (
                          <li
                            key={f.id}
                            className="text-muted-foreground leading-snug line-clamp-2"
                          >
                            • {f.body}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground/60 pl-2 italic">No findings</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!applied ? (
        <div className="border-t border-[#1B3A6B]/15 px-2.5 py-1.5">
          <button
            onClick={handleApply}
            className="w-full text-[10px] font-medium text-[#1B3A6B] hover:text-[#1B3A6B]/80 transition-colors flex items-center justify-center gap-1"
            data-testid="button-apply-workflow-context"
          >
            Apply to AM Hypothesis &amp; Priority Checks
          </button>
        </div>
      ) : (
        <div className="border-t border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 rounded-b-lg px-2.5 py-1.5 flex items-center justify-center gap-1.5">
          <Check className="w-3 h-3 text-emerald-600" />
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
            Applied — review and edit as needed
          </span>
        </div>
      )}
    </div>
  );
}
