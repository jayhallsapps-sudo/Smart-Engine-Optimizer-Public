/**
 * WorkflowContextBanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown in report builder sidebars when workflow prep data is available for
 * the current report type + client. Presents a structured, field-aware import
 * UI so the AM can see exactly what will be populated before applying.
 *
 * UX design:
 *  • Header: summary (N areas, N findings)
 *  • Field list: one card per mapped field, checkbox to include/exclude
 *  • Each card has an inline preview toggle (shows derived text)
 *  • Empty fields (build returns "") are listed but disabled / greyed out
 *  • Single "Apply N fields" button — intentional, not automatic
 *  • After apply: calm confirmation row; banner stays visible until dismissed
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Minus,
  Sparkles,
  X,
} from "lucide-react";
import type { WorkflowHandoffContext } from "@/lib/workflowHandoff";
import { clearWorkflowContext } from "@/lib/workflowHandoff";
import { getFieldMapping, buildFieldValues } from "@/lib/workflowFieldMapping";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface WorkflowContextBannerProps {
  context: WorkflowHandoffContext;
  /** Called with a map of fieldId → derived text for all selected + non-empty fields */
  onApply: (fields: Record<string, string>) => void;
  onDismiss: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function WorkflowContextBanner({
  context,
  onApply,
  onDismiss,
}: WorkflowContextBannerProps) {
  // ── Derived field values ──────────────────────────────────────────────────

  const fieldMap = useMemo(() => getFieldMapping(context.reportTypeId), [context.reportTypeId]);

  const builtValues = useMemo(
    () => buildFieldValues(context.reportTypeId, context),
    [context],
  );

  // fieldId → checked (only fields with content are checked by default)
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        fieldMap.map(e => [e.fieldId, !!builtValues[e.fieldId]]),
      ),
  );

  // fieldId → expanded (preview open)
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});

  const [applied, setApplied] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);

  // ── Counts ────────────────────────────────────────────────────────────────

  const committedCount = context.committedAreas.length;
  const findingCount = context.committedAreas.reduce(
    (n, a) => n + a.findings.filter(f => f.selected && f.status !== "rejected").length,
    0,
  );

  const selectedNonEmpty = fieldMap.filter(
    e => checkedFields[e.fieldId] && builtValues[e.fieldId],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  function toggleField(fieldId: string) {
    setCheckedFields(prev => ({ ...prev, [fieldId]: !prev[fieldId] }));
  }

  function togglePreview(fieldId: string) {
    setPreviewOpen(prev => ({ ...prev, [fieldId]: !prev[fieldId] }));
  }

  function handleApply() {
    const toApply: Record<string, string> = {};
    for (const e of fieldMap) {
      if (checkedFields[e.fieldId] && builtValues[e.fieldId]) {
        toApply[e.fieldId] = builtValues[e.fieldId];
      }
    }
    onApply(toApply);
    setApplied(true);
    setAppliedCount(Object.keys(toApply).length);
  }

  function handleDismiss() {
    clearWorkflowContext();
    onDismiss();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="mx-3 mb-3 rounded-lg border border-[#1B3A6B]/25 bg-[#1B3A6B]/5"
      data-testid="workflow-context-banner"
    >
      {/* Header */}
      <div className="flex items-start gap-2 p-2.5 pb-2">
        <Sparkles className="w-3.5 h-3.5 text-[#1B3A6B] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] font-semibold text-[#1B3A6B] leading-tight">
              Workflow prep ready
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
            {committedCount} area{committedCount !== 1 ? "s" : ""} ·{" "}
            {findingCount} finding{findingCount !== 1 ? "s" : ""} ·{" "}
            <span className="text-[#1B3A6B]">
              {context.clientName || "client"}
            </span>
          </p>
        </div>
      </div>

      {/* Field list */}
      {!applied && (
        <div className="px-2.5 pb-1 space-y-1">
          <p className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">
            Fields to populate
          </p>
          {fieldMap.map(entry => {
            const hasContent = !!builtValues[entry.fieldId];
            const checked = checkedFields[entry.fieldId] && hasContent;
            const isPreviewOpen = previewOpen[entry.fieldId] ?? false;
            const preview = builtValues[entry.fieldId] ?? "";

            return (
              <div
                key={entry.fieldId}
                className={`rounded border text-[10px] ${
                  hasContent
                    ? "border-[#1B3A6B]/20 bg-white/60 dark:bg-[#1B3A6B]/10"
                    : "border-border/40 bg-muted/30 opacity-50"
                }`}
                data-testid={`field-map-entry-${entry.fieldId}`}
              >
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  {/* Checkbox */}
                  <button
                    onClick={() => hasContent && toggleField(entry.fieldId)}
                    disabled={!hasContent}
                    className={`w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center border transition-colors ${
                      checked
                        ? "bg-[#1B3A6B] border-[#1B3A6B]"
                        : "border-border bg-background"
                    } ${!hasContent ? "cursor-not-allowed" : "cursor-pointer"}`}
                    data-testid={`checkbox-field-${entry.fieldId}`}
                    aria-label={checked ? `Deselect ${entry.fieldLabel}` : `Select ${entry.fieldLabel}`}
                  >
                    {checked && <Check className="w-2 h-2 text-white" />}
                    {!hasContent && <Minus className="w-2 h-2 text-muted-foreground" />}
                  </button>

                  {/* Label + hint */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground/80 truncate">
                      {entry.fieldLabel}
                    </div>
                    <div className="text-muted-foreground leading-snug truncate">
                      {hasContent ? entry.sourceHint : "No matching content in this session"}
                    </div>
                  </div>

                  {/* Preview toggle */}
                  {hasContent && (
                    <button
                      onClick={() => togglePreview(entry.fieldId)}
                      className="shrink-0 text-muted-foreground hover:text-[#1B3A6B] transition-colors"
                      title={isPreviewOpen ? "Hide preview" : "Preview content"}
                      data-testid={`button-preview-${entry.fieldId}`}
                    >
                      {isPreviewOpen ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>

                {/* Inline preview */}
                {hasContent && isPreviewOpen && (
                  <div className="px-2 pb-2 pt-0.5 border-t border-[#1B3A6B]/10">
                    <p
                      className="text-[9.5px] text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-24 overflow-y-auto"
                      data-testid={`preview-content-${entry.fieldId}`}
                    >
                      {preview}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {!applied ? (
        <div className="border-t border-[#1B3A6B]/15 px-2.5 py-1.5 mt-1">
          <button
            onClick={handleApply}
            disabled={selectedNonEmpty.length === 0}
            className={`w-full text-[10px] font-semibold rounded px-2 py-1 transition-colors ${
              selectedNonEmpty.length > 0
                ? "bg-[#1B3A6B] text-white hover:bg-[#1B3A6B]/85"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
            data-testid="button-apply-workflow-context"
          >
            Apply {selectedNonEmpty.length > 0 ? selectedNonEmpty.length : ""}{" "}
            field{selectedNonEmpty.length !== 1 ? "s" : ""}
          </button>
        </div>
      ) : (
        <div className="border-t border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 rounded-b-lg px-2.5 py-1.5 flex items-center justify-center gap-1.5">
          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
            {appliedCount} field{appliedCount !== 1 ? "s" : ""} applied — review and edit as needed
          </span>
        </div>
      )}
    </div>
  );
}
