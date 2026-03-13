/**
 * qbsQbrMapping.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Defines the structured mapping from a saved QBS (qbr_prep) report into the
 * QBR (qbr_full) page fields, plus the quarter-aware source selection logic.
 *
 * ── WHERE QUARTER/YEAR METADATA LIVES ────────────────────────────────────────
 * saved_reports.planningQuarter  INTEGER  (nullable — null for older records)
 * saved_reports.planningYear     INTEGER  (nullable — null for older records)
 *
 * QBS (qbr_prep) sets these via inferQuarterClient(generationDate) when the AM
 * generates a QBS report.  QBR (qbr_full) sets them via its quarter/year UI
 * selectors when saving.  Both already pass these fields to useReportSave.
 *
 * ── QBS SOURCE SELECTION PRIORITY ORDER ──────────────────────────────────────
 * Given a target quarter Q and year Y (from the QBR page):
 *
 *   Tier 1 — EXACT   planningQuarter === Q AND planningYear === Y
 *   Tier 2 — YEAR    planningYear === Y, any planningQuarter
 *   Tier 3 — LEGACY  planningQuarter IS NULL  (no period metadata — older saves)
 *   Tier 4 — FALLBACK any remaining record (most recently created)
 *
 * Within each tier, records are already ordered createdAt DESC by the API, so
 * the first record in each tier group is the most recently created.
 *
 * When Tier 1 contains MORE than one match, all are surfaced as "alternatives"
 * so the AM can pick the intended source via an inline picker in the banner.
 *
 * ── BACKWARD COMPAT FOR OLDER QBS RECORDS ────────────────────────────────────
 * Older QBS records with null planningQuarter/planningYear fall to Tier 3.
 * They are still surfaced and importable — just labelled "no period metadata".
 *
 * ── QBS → QBR FIELD MAPPING ──────────────────────────────────────────────────
 *   QBR amThoughts        ← QBS amThoughts / hypothesis
 *   QBR priorityChecks    ← QBS priorityChecks / auditNotes
 *   QBR amFocusNextQuarter← QBS prevQtrAssessment
 *   QBR clientNotes       ← QBS clientNotes
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { SavedReport } from "@shared/schema";

// ─── QBS manual inputs shape ───────────────────────────────────────────────────

export interface QbsManualInputs {
  clientSentiment?: string;
  amThoughts?: string;
  hypothesis?: string;
  priorityChecks?: string;
  auditNotes?: string;
  prevQtrAssessment?: string;
  clientNotes?: string;
}

export function extractQbsInputs(report: SavedReport): QbsManualInputs {
  const snap = report.sourceSnapshotJson as any;
  if (!snap) return {};
  return (snap.manualInputs ?? {}) as QbsManualInputs;
}

function getText(inputs: QbsManualInputs, ...keys: (keyof QbsManualInputs)[]): string {
  for (const key of keys) {
    const v = inputs[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

// ─── Quarter-aware selection ───────────────────────────────────────────────────

/** Which priority tier the selected QBS falls into */
export type QbsSelectionTier = "exact" | "year" | "legacy" | "fallback";

export interface QbsSelectionResult {
  /** Best-matching QBS record for the target quarter/year */
  match: SavedReport;
  /** Which tier the match was found at */
  tier: QbsSelectionTier;
  /**
   * Other records at the SAME tier as the match (same Q+Y for "exact",
   * same year for "year", etc.). Shown in the picker when length > 0.
   */
  alternatives: SavedReport[];
  /** Human-readable note explaining why this source was chosen */
  note: string;
}

/**
 * Select the best QBS source for a given QBR target quarter + year.
 *
 * Records must be pre-ordered by createdAt DESC (this is what the API returns).
 * Returns null only if records is empty.
 */
export function selectQbsSource(
  records: SavedReport[],
  targetQuarter: number,
  targetYear: number,
): QbsSelectionResult | null {
  if (!records.length) return null;

  // Tier 1 — exact quarter + year match
  const tier1 = records.filter(
    r => r.planningQuarter === targetQuarter && r.planningYear === targetYear,
  );
  if (tier1.length > 0) {
    return {
      match: tier1[0],
      tier: "exact",
      alternatives: tier1.slice(1),
      note: `Matched Q${targetQuarter} ${targetYear}`,
    };
  }

  // Tier 2 — same year, any quarter
  const tier2 = records.filter(
    r => r.planningYear === targetYear && r.planningQuarter !== targetQuarter,
  );
  if (tier2.length > 0) {
    const q = tier2[0].planningQuarter;
    return {
      match: tier2[0],
      tier: "year",
      alternatives: tier2.slice(1),
      note: `No Q${targetQuarter} ${targetYear} match — using nearest (Q${q ?? "?"} ${targetYear})`,
    };
  }

  // Tier 3 — legacy records (no period metadata)
  const tier3 = records.filter(
    r => r.planningQuarter == null && r.planningYear == null,
  );
  if (tier3.length > 0) {
    return {
      match: tier3[0],
      tier: "legacy",
      alternatives: tier3.slice(1),
      note: "No period metadata — using most recent QBS",
    };
  }

  // Tier 4 — absolute fallback (any remaining record)
  return {
    match: records[0],
    tier: "fallback",
    alternatives: records.slice(1),
    note: `No match for Q${targetQuarter} ${targetYear} — using most recent QBS`,
  };
}

// ─── Field map entry type ──────────────────────────────────────────────────────

export interface QbsQbrFieldEntry {
  fieldId: string;
  fieldLabel: string;
  sourceHint: string;
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
export function buildQbsQbrValues(report: SavedReport): Record<string, string> {
  const inputs = extractQbsInputs(report);
  const result: Record<string, string> = {};
  for (const entry of QBS_QBR_FIELD_MAP) {
    const value = entry.buildFrom(inputs);
    if (value) result[entry.fieldId] = value;
  }
  return result;
}
