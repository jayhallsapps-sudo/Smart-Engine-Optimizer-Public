/**
 * QbsContextBanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown in the QBR sidebar when a matching QBS saved report exists. Lets the
 * AM intentionally import structured planning context from QBS into QBR fields.
 *
 * Tier-aware display:
 *   "exact"   — exact Q+Y match; no warning shown
 *   "year"    — same year, different Q; amber note shown
 *   "legacy"  — no period metadata; amber note shown
 *   "fallback"— last resort; amber note shown
 *
 * Multi-candidate handling:
 *   When alternatives.length > 0, an inline source picker appears so the AM
 *   can select a different QBS from the same tier rather than accepting the
 *   auto-selected one silently.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useConfigOverrides } from "@/hooks/useConfigOverrides";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Minus,
  BookOpen,
  AlertTriangle,
  X,
} from "lucide-react";
import type { SavedReport } from "@shared/schema";
import type { QbsSelectionResult } from "@/lib/qbsQbrMapping";
import {
  QBS_QBR_FIELD_MAP,
  buildQbsQbrValues,
} from "@/lib/qbsQbrMapping";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface QbsContextBannerProps {
  /** Result from selectQbsSource — includes match, tier, alternatives, note */
  selection: QbsSelectionResult;
  /** Called with fieldId → derived text for all selected non-empty fields */
  onApply: (fields: Record<string, string>) => void;
  onDismiss: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function quarterLabel(report: SavedReport): string {
  if (report.planningQuarter && report.planningYear) {
    return `Q${report.planningQuarter} ${report.planningYear}`;
  }
  return "No period";
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function QbsContextBanner({
  selection,
  onApply,
  onDismiss,
}: QbsContextBannerProps) {
  const { tier, note, alternatives } = selection;
  const { getNote: getAdminNote } = useConfigOverrides("qbsMap");

  // Active source — starts as the auto-selected match, AM can change via picker
  const [activeReport, setActiveReport] = useState<SavedReport>(selection.match);

  // Build values from the active report (recomputed when source changes)
  const builtValues = buildQbsQbrValues(activeReport);

  // fieldId → checked (non-empty fields default to checked)
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        QBS_QBR_FIELD_MAP.map(e => [e.fieldId, !!builtValues[e.fieldId]]),
      ),
  );

  // fieldId → preview open
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);

  const selectedNonEmpty = QBS_QBR_FIELD_MAP.filter(
    e => checkedFields[e.fieldId] && builtValues[e.fieldId],
  );

  const showTierWarning = tier !== "exact";
  const showPicker = alternatives.length > 0;

  // All options for the picker = active + alternatives
  const allCandidates = [activeReport, ...alternatives];

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleSourceChange(id: string) {
    const chosen = allCandidates.find(r => String(r.id) === id);
    if (!chosen) return;
    setActiveReport(chosen);
    // Re-initialize checked state from new source's values
    const newValues = buildQbsQbrValues(chosen);
    setCheckedFields(
      Object.fromEntries(
        QBS_QBR_FIELD_MAP.map(e => [e.fieldId, !!newValues[e.fieldId]]),
      ),
    );
    setPreviewOpen({});
    setApplied(false);
  }

  function toggleField(fieldId: string) {
    setCheckedFields(prev => ({ ...prev, [fieldId]: !prev[fieldId] }));
  }

  function togglePreview(fieldId: string) {
    setPreviewOpen(prev => ({ ...prev, [fieldId]: !prev[fieldId] }));
  }

  function handleApply() {
    const toApply: Record<string, string> = {};
    const currentValues = buildQbsQbrValues(activeReport);
    for (const e of QBS_QBR_FIELD_MAP) {
      if (checkedFields[e.fieldId] && currentValues[e.fieldId]) {
        toApply[e.fieldId] = currentValues[e.fieldId];
      }
    }
    onApply(toApply);
    setApplied(true);
    setAppliedCount(Object.keys(toApply).length);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="mx-3 mb-3 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/5"
      data-testid="qbs-context-banner"
    >
      {/* Header */}
      <div className="flex items-start gap-2 p-2.5 pb-2">
        <BookOpen className="w-3.5 h-3.5 text-[#C0392B] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] font-semibold text-[#C0392B] leading-tight">
              QBS context available
            </p>
            <button
              onClick={onDismiss}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              title="Dismiss"
              data-testid="button-dismiss-qbs-context"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Source picker or static name */}
          {showPicker ? (
            <div className="mt-1">
              <p className="text-[9.5px] text-muted-foreground mb-0.5 uppercase tracking-wide">
                Source QBS
              </p>
              <select
                value={String(activeReport.id)}
                onChange={e => handleSourceChange(e.target.value)}
                className="w-full text-[10px] rounded border border-border bg-background px-1.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-[#C0392B]/50"
                data-testid="select-qbs-source"
              >
                {allCandidates.map(r => (
                  <option key={r.id} value={String(r.id)}>
                    {r.reportName} · {quarterLabel(r)} · {formatDate(r.createdAt)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug truncate">
                {activeReport.reportName}
              </p>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {quarterLabel(activeReport)} · Saved {formatDate(activeReport.createdAt)}
              </p>
            </>
          )}

          {/* Tier warning for non-exact matches */}
          {showTierWarning && (
            <div className="flex items-start gap-1 mt-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 px-1.5 py-1">
              <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0 mt-px" />
              <p className="text-[9.5px] text-amber-700 dark:text-amber-400 leading-snug">
                {note}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Field list */}
      {!applied && (
        <div className="px-2.5 pb-1 space-y-1">
          <p className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">
            Fields to import
          </p>
          {QBS_QBR_FIELD_MAP.map(entry => {
            const currentValues = buildQbsQbrValues(activeReport);
            const hasContent = !!currentValues[entry.fieldId];
            const checked = checkedFields[entry.fieldId] && hasContent;
            const isPreviewOpen = previewOpen[entry.fieldId] ?? false;
            const preview = currentValues[entry.fieldId] ?? "";

            return (
              <div
                key={entry.fieldId}
                className={`rounded border text-[10px] ${
                  hasContent
                    ? "border-[#C0392B]/20 bg-white/60 dark:bg-[#C0392B]/10"
                    : "border-border/40 bg-muted/30 opacity-50"
                }`}
                data-testid={`qbs-field-entry-${entry.fieldId}`}
              >
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <button
                    onClick={() => hasContent && toggleField(entry.fieldId)}
                    disabled={!hasContent}
                    className={`w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center border transition-colors ${
                      checked
                        ? "bg-[#C0392B] border-[#C0392B]"
                        : "border-border bg-background"
                    } ${!hasContent ? "cursor-not-allowed" : "cursor-pointer"}`}
                    data-testid={`qbs-checkbox-${entry.fieldId}`}
                    aria-label={checked ? `Deselect ${entry.fieldLabel}` : `Select ${entry.fieldLabel}`}
                  >
                    {checked && <Check className="w-2 h-2 text-white" />}
                    {!hasContent && <Minus className="w-2 h-2 text-muted-foreground" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground/80 truncate">
                      {entry.fieldLabel}
                    </div>
                    <div className="text-muted-foreground leading-snug truncate">
                      {hasContent ? entry.sourceHint : "Not set in this QBS"}
                    </div>
                    {(() => {
                      const adminNote = getAdminNote(entry.fieldId);
                      return adminNote ? (
                        <div className="text-[9px] text-[#1B3A6B]/70 italic leading-snug mt-0.5">
                          {adminNote}
                        </div>
                      ) : null;
                    })()}
                  </div>

                  {hasContent && (
                    <button
                      onClick={() => togglePreview(entry.fieldId)}
                      className="shrink-0 text-muted-foreground hover:text-[#C0392B] transition-colors"
                      title={isPreviewOpen ? "Hide preview" : "Preview content"}
                      data-testid={`qbs-preview-toggle-${entry.fieldId}`}
                    >
                      {isPreviewOpen ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>

                {hasContent && isPreviewOpen && (
                  <div className="px-2 pb-2 pt-0.5 border-t border-[#C0392B]/10">
                    <p
                      className="text-[9.5px] text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-24 overflow-y-auto"
                      data-testid={`qbs-preview-content-${entry.fieldId}`}
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
        <div className="border-t border-[#C0392B]/15 px-2.5 py-1.5 mt-1">
          <button
            onClick={handleApply}
            disabled={selectedNonEmpty.length === 0}
            className={`w-full text-[10px] font-semibold rounded px-2 py-1 transition-colors ${
              selectedNonEmpty.length > 0
                ? "bg-[#C0392B] text-white hover:bg-[#C0392B]/85"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
            data-testid="button-apply-qbs-context"
          >
            Import {selectedNonEmpty.length > 0 ? selectedNonEmpty.length : ""}{" "}
            field{selectedNonEmpty.length !== 1 ? "s" : ""} from QBS
          </button>
        </div>
      ) : (
        <div className="border-t border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 rounded-b-lg px-2.5 py-1.5 flex items-center justify-center gap-1.5">
          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
            {appliedCount} field{appliedCount !== 1 ? "s" : ""} imported — review and edit as needed
          </span>
        </div>
      )}
    </div>
  );
}
