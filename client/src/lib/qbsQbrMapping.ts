/**
 * qbsQbrMapping.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Defines the structured mapping from a saved QBS (qbr_prep) report into the
 * QBR (qbr_full) page fields.
 *
 * QBS SOURCE SELECTION RULE
 * ─────────────────────────
 * Query: GET /api/saved-reports?clientId={id}&reportType=qbr_prep
 * The API returns records ordered by createdAt DESC with soft-deleted rows
 * already filtered out. The FIRST item is used as the source QBS — i.e. the
 * most recently created (not necessarily most recently updated) QBS for the
 * client. This gives a stable, deterministic pick without needing the AM to
 * manually select.
 *
 * If no QBS exists for the client, the banner is not shown and QBR remains
 * fully standalone.
 *
 * QBS → QBR FIELD MAPPING
 * ───────────────────────
 *   QBR amThoughts        ← QBS amThoughts          (hypothesis carries forward)
 *   QBR priorityChecks    ← QBS priorityChecks       (priority items carry forward)
 *   QBR amFocusNextQuarter← QBS prevQtrAssessment    (prev-qtr context → next-qtr framing)
 *   QBR clientNotes       ← QBS clientNotes          (client context notes)
 *
 * To add a new mapping: add a QbsQbrFieldEntry to QBS_QBR_FIELD_MAP.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { SavedReport } from "@shared/schema";

// ─── QBS manual inputs shape ───────────────────────────────────────────────────
// This mirrors what qbr-prep.tsx stores in sourceSnapshotJson.manualInputs.

export interface QbsManualInputs {
  clientSentiment?: string;
  /** Strategy hypothesis / AM's Hypothesis */
  amThoughts?: string;
  /** Legacy alias */
  hypothesis?: string;
  /** Priority checks / audit findings */
  priorityChecks?: string;
  /** Legacy alias */
  auditNotes?: string;
  /** Previous quarter assessment */
  prevQtrAssessment?: string;
  /** Client notes / context */
  clientNotes?: string;
}

/** Safely extract manualInputs from a saved report's sourceSnapshotJson */
export function extractQbsInputs(report: SavedReport): QbsManualInputs {
  const snap = report.sourceSnapshotJson as any;
  if (!snap) return {};
  return (snap.manualInputs ?? {}) as QbsManualInputs;
}

/** Resolve legacy field aliases */
function getText(inputs: QbsManualInputs, ...keys: (keyof QbsManualInputs)[]): string {
  for (const key of keys) {
    const v = inputs[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

// ─── Field map entry type ──────────────────────────────────────────────────────

export interface QbsQbrFieldEntry {
  /** Matches the React state key in qbr-full.tsx */
  fieldId: string;
  /** Human-readable label shown in the import banner */
  fieldLabel: string;
  /** One-liner explaining where this comes from in QBS */
  sourceHint: string;
  /** Derives the text to pre-populate in the QBR field */
  buildFrom: (inputs: QbsManualInputs) => string;
}

// ─── Mapping definition ────────────────────────────────────────────────────────

export const QBS_QBR_FIELD_MAP: QbsQbrFieldEntry[] = [
  {
    fieldId: "amThoughts",
    fieldLabel: "AM's Hypothesis",
    sourceHint: "QBS strategic hypothesis — carried forward as-is",
    buildFrom: inputs => getText(inputs, "amThoughts", "hypothesis"),
  },
  {
    fieldId: "priorityChecks",
    fieldLabel: "Priority Checks",
    sourceHint: "QBS priority checks / key audit findings",
    buildFrom: inputs => getText(inputs, "priorityChecks", "auditNotes"),
  },
  {
    fieldId: "amFocusNextQuarter",
    fieldLabel: "Focus Next Quarter",
    sourceHint: "QBS previous-quarter assessment — use as next-quarter framing basis",
    buildFrom: inputs => getText(inputs, "prevQtrAssessment"),
  },
  {
    fieldId: "clientNotes",
    fieldLabel: "Client Notes",
    sourceHint: "QBS client context notes",
    buildFrom: inputs => getText(inputs, "clientNotes"),
  },
];

/**
 * Build all QBR field values from a QBS source report.
 * Returns only entries where the derived content is non-empty.
 */
export function buildQbsQbrValues(
  report: SavedReport,
): Record<string, string> {
  const inputs = extractQbsInputs(report);
  const result: Record<string, string> = {};
  for (const entry of QBS_QBR_FIELD_MAP) {
    const value = entry.buildFrom(inputs);
    if (value) result[entry.fieldId] = value;
  }
  return result;
}
