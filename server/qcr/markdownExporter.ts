import type { QcrReport, QcrFinding } from "./types";

export function makeFilename(clientName: string, scanDate: string): string {
  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug}-qcr-${scanDate}.md`;
}

function renderFindings(findings: QcrFinding[], maxUrls = 20): string {
  if (findings.length === 0) return "_No findings in this category._\n\n";
  let md = "";
  for (const f of findings) {
    md += `- **${f.title}**\n`;
    md += `  ${f.description}\n`;
    md += `  Affected: ${f.affectedUrls.length} URLs\n`;
    const urls = f.affectedUrls.slice(0, maxUrls);
    for (const url of urls) {
      md += `  - ${url}\n`;
    }
    if (f.affectedUrls.length > maxUrls) {
      md += `  - (+${f.affectedUrls.length - maxUrls} more)\n`;
    }
    md += `\n`;
  }
  return md;
}

export function renderReportToMarkdown(report: QcrReport): string {
  const scanDate = report.scanCompletedAt.split("T")[0];
  const durationSec = Math.round(report.scanDurationMs / 1000);

  let md = `# ${report.clientName} \u2014 Quarterly Content Roadmap\n\n`;
  md += `Scan completed ${report.scanCompletedAt}\n\n`;
  md += `${report.urlsScanned} URLs scanned in ${durationSec}s\n\n`;

  const categories: Array<{ key: import("./types").QcrCategory; label: string }> = [
    { key: "technical_seo", label: "Technical SEO" },
    { key: "seo_content", label: "SEO Content" },
    { key: "local_seo", label: "Local SEO" },
    { key: "seo_strategy", label: "SEO Strategy" },
  ];

  for (const { key, label } of categories) {
    md += `## ${label}\n\n`;
    const catFindings = report.categories[key]?.findings ?? [];
    const critical = catFindings.filter((f) => f.severity === "critical" && !f.suppressed);
    const medium = catFindings.filter((f) => f.severity === "medium" && !f.suppressed);
    const low = catFindings.filter((f) => f.severity === "low" && !f.suppressed);

    if (critical.length > 0) {
      md += `### Critical\n\n`;
      md += renderFindings(critical);
    }
    if (medium.length > 0) {
      md += `### Medium\n\n`;
      md += renderFindings(medium);
    }
    if (low.length > 0) {
      md += `### Low\n\n`;
      md += renderFindings(low);
    }
    if (critical.length === 0 && medium.length === 0 && low.length === 0) {
      md += "_No findings in this category._\n\n";
    }
  }

  return md;
}
