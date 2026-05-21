import type { QcrFinding, QcrSeverity } from "./types";

export interface SeverityContext {
  totalPagesScanned: number;
}

export function adjustSeverity(finding: QcrFinding, ctx: SeverityContext): QcrFinding {
  const affected = finding.affectedUrls.length;
  const half = ctx.totalPagesScanned * 0.5;
  const tenth = ctx.totalPagesScanned * 0.1;

  let newSeverity = finding.severity;
  if (affected >= half) {
    newSeverity = "critical";
  } else if (affected >= tenth && finding.severity === "low") {
    newSeverity = "medium";
  }

  if (newSeverity === finding.severity) return finding;
  return { ...finding, severity: newSeverity };
}

interface SuppressionRule {
  ruleId: string;
  condition: (finding: QcrFinding) => boolean;
}

const SUPPRESSION_RULES: SuppressionRule[] = [
  {
    ruleId: "universal.meta_title_length",
    condition: (f) => f.affectedUrls.length < 20,
  },
  {
    ruleId: "universal.meta_description_length",
    condition: (f) => f.affectedUrls.length < 20,
  },
  {
    ruleId: "universal.image_alt_coverage",
    condition: (f) => {
      const total = (f.evidence.totalImages as number) ?? 0;
      return total < 10;
    },
  },
  {
    ruleId: "technical.duplicate_meta_description",
    condition: (f) => (f.evidence.pageCount as number) === 2,
  },
];

export function applyNoiseSuppression(findings: QcrFinding[], _ctx: SeverityContext): QcrFinding[] {
  return findings.map((f) => {
    const suppress = SUPPRESSION_RULES.some(
      (sr) => sr.ruleId === f.ruleId && sr.condition(f),
    );
    if (suppress) {
      return { ...f, suppressed: true };
    }
    return f;
  });
}
