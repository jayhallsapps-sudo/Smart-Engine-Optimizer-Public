/**
 * Server-side export readiness validator for QBR Prep reports.
 *
 * Called by all three export routes (DOCX, PDF, Drive) to enforce
 * finalization prerequisites independently of frontend state.
 *
 * Gate conditions:
 *   A. auditMissing  — reportData.section6Priorities.auditMissing === true
 *   B. crossSellPending — crossSellPreview exists with ≥1 item AND
 *                         edits["s6_crossSells_confirmed"] is absent
 *
 * "Resolved" for cross-sell means s6_crossSells_confirmed is present,
 * even if its value is "[]" (all items marked not-relevant).
 */

export interface ExportReadinessResult {
  canExport: boolean;
  code: "QBR_PREP_EXPORT_BLOCKED" | "OK";
  reasons: string[];
}

export function validateQbrPrepExportReadiness(
  reportData: any,
  edits: Record<string, string> | null | undefined
): ExportReadinessResult {
  const reasons: string[] = [];

  const auditMissing = reportData?.section6Priorities?.auditMissing === true;
  if (auditMissing) {
    reasons.push(
      "Audit input is required before export. Enter a site audit summary in the Priority Checks / Audit Notes field and regenerate."
    );
  }

  const crossSellPreview: any[] =
    reportData?.section6Priorities?.crossSellPreview ?? [];
  const crossSellConfirmed = edits?.["s6_crossSells_confirmed"];
  const crossSellPending =
    crossSellPreview.length > 0 && crossSellConfirmed === undefined;
  if (crossSellPending) {
    reasons.push(
      "Cross-sell / upsell preview items must be classified before export. Use the Classify Opportunities panel in the sidebar and click Apply."
    );
  }

  if (reasons.length > 0) {
    return { canExport: false, code: "QBR_PREP_EXPORT_BLOCKED", reasons };
  }
  return { canExport: true, code: "OK", reasons: [] };
}
