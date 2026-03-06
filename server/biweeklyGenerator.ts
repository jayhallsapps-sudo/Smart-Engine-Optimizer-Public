import { storage } from "./storage";
import { queryGsc, handlesGscCommand } from "./gscClient";
import { queryGa4, handlesGa4Command } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { queryCtm, handlesCtmCommand } from "./ctmClient";
import { fetchAirtableWorkLog } from "./airtable";
import type { WorkLogItem } from "./airtable";
import type { DocxSection } from "../client/src/components/report-preview/docx-preview";

export interface BiweeklyReportJson {
  report_title: string;
  client_name: string;
  date: string;
  preparedBy: string;
  generated_at: string;
  sections: DocxSection[];
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseDateStr(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function makeWindowLabel(start: string, end: string): string {
  return `${fmtDate(parseDateStr(start))} – ${fmtDate(parseDateStr(end))}`;
}

function isOptimizationItem(item: WorkLogItem): boolean {
  return (
    item.task.toLowerCase().includes("optimization") ||
    item.creditType === "Optimization" ||
    item.creditType === "CRO Update"
  );
}

function parseSfCanonicalIssues(
  headers: string[],
  data: Record<string, any>[]
): { count: number; examples: string[] } {
  const addrCol = headers.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? "Address";
  const canonCol = headers.find(h => /canonical/i.test(h));
  if (!canonCol) return { count: 0, examples: [] };
  const issues = data.filter(r => {
    const addr = String(r[addrCol] ?? "").trim();
    const canon = String(r[canonCol] ?? "").trim();
    return addr && canon && addr !== canon;
  });
  return {
    count: issues.length,
    examples: issues.slice(0, 3).map(r => String(r[addrCol] ?? "")),
  };
}

function parseSfImageIssues(headers: string[], data: Record<string, any>[]): { count: number } {
  const sizeCol = headers.find(h => /^size$/i.test(h) || /image.?size/i.test(h));
  if (!sizeCol) return { count: 0 };
  const LARGE_BYTES = 150 * 1024;
  const large = data.filter(r => {
    const v = parseInt(String(r[sizeCol] ?? "0").replace(/[^0-9]/g, ""), 10);
    return v > LARGE_BYTES;
  });
  return { count: large.length };
}

function parseSf404s(headers: string[], data: Record<string, any>[]): { count: number } {
  const statusCol = headers.find(h => /status.?code/i.test(h) || /^status$/i.test(h));
  if (!statusCol) return { count: 0 };
  const broken = data.filter(r => String(r[statusCol] ?? "").trim() === "404");
  return { count: broken.length };
}

function parseSfMissingMeta(headers: string[], data: Record<string, any>[]): { count: number } {
  const metaCol = headers.find(h => /meta.?description/i.test(h));
  if (!metaCol) return { count: 0 };
  const missing = data.filter(r => !String(r[metaCol] ?? "").trim());
  return { count: missing.length };
}

function getSfTopPriorities(headers: string[], data: Record<string, any>[]): string[] {
  const issues: Array<{ count: number; label: string }> = [];

  const canonical = parseSfCanonicalIssues(headers, data);
  if (canonical.count > 0) {
    issues.push({ count: canonical.count, label: `Resolve ${canonical.count} canonical mismatch${canonical.count !== 1 ? "es" : ""} (conflicting canonical tags detected)` });
  }

  const images = parseSfImageIssues(headers, data);
  if (images.count > 0) {
    issues.push({ count: images.count, label: `Optimize ${images.count} oversized image${images.count !== 1 ? "s" : ""} (>150 KB) to improve page speed` });
  }

  const errors404 = parseSf404s(headers, data);
  if (errors404.count > 0) {
    issues.push({ count: errors404.count, label: `Fix ${errors404.count} broken link${errors404.count !== 1 ? "s" : ""} returning 404 errors` });
  }

  const missingMeta = parseSfMissingMeta(headers, data);
  if (missingMeta.count > 0) {
    issues.push({ count: missingMeta.count, label: `Write meta descriptions for ${missingMeta.count} page${missingMeta.count !== 1 ? "s" : ""} missing them` });
  }

  issues.sort((a, b) => b.count - a.count);
  const top3 = issues.slice(0, 3).map(i => i.label);

  if (top3.length === 0) {
    return [
      "Review crawl for any new redirect chains or broken internal links",
      "Audit page speed scores (Core Web Vitals) for top landing pages",
      "Check for any newly flagged duplicate content issues",
    ];
  }

  while (top3.length < 3) {
    const fallbacks = [
      "Review crawl for redirect chains and broken internal links",
      "Audit Core Web Vitals for top landing pages",
      "Check for duplicate content issues",
    ];
    top3.push(fallbacks[top3.length] ?? "Additional technical review");
  }

  return top3;
}

function allAirtableItems(result: PromiseSettledResult<any>): WorkLogItem[] {
  if (result.status !== "fulfilled" || !result.value?.success) return [];
  const data = result.value.data;
  const items: WorkLogItem[] = [];
  for (const group of Object.values(data.byCreditType)) {
    items.push(...(group as WorkLogItem[]));
  }
  return items;
}

export async function generateBiweekly(input: {
  clientId: number;
  startDate: string;
  endDate: string;
  preparedBy: string;
}): Promise<BiweeklyReportJson> {
  const { clientId, startDate, endDate, preparedBy } = input;
  const client = await storage.getClient(clientId);
  if (!client) throw new Error("Client not found: " + clientId);

  const windowLabel = makeWindowLabel(startDate, endDate);
  const now = new Date();
  const customDateRange = `custom:${startDate}:${endDate}`;

  const [gscResult, ga4Result, callTrackingResult, publishedResult, productionResult, sfResult] =
    await Promise.allSettled([
      (async () => {
        if (handlesGscCommand("gsc_qoq_queries" as any)) {
          return queryGsc("gsc_qoq_queries" as any, client, customDateRange);
        }
        return null;
      })(),
      (async () => {
        if (handlesGa4Command("ga4_qoq_organic_funnel" as any)) {
          return queryGa4("ga4_qoq_organic_funnel" as any, client, customDateRange);
        }
        return null;
      })(),
      (async () => {
        if (handlesCallRailCommand("callrail_qoq_organic_calls" as any)) {
          return queryCallRail("callrail_qoq_organic_calls" as any, client, customDateRange);
        }
        if (handlesCtmCommand("ctm_calls_summary" as any)) {
          return queryCtm("ctm_calls_summary" as any, client, customDateRange);
        }
        return null;
      })(),
      (async () => fetchAirtableWorkLog(clientId, startDate, endDate, "Published"))(),
      (async () => fetchAirtableWorkLog(clientId, startDate, endDate, "Production"))(),
      (async () => {
        const reports = await storage.getSfReports(clientId);
        return reports.length > 0 ? reports[0] : null;
      })(),
    ]);

  const sections: DocxSection[] = [];

  sections.push({
    id: "bw_purpose",
    type: "bullets",
    title: "Purpose",
    bullets: [
      "To review recent SEO progress, share quick wins, and align on upcoming priorities that support your business goals.",
    ],
  });

  const pulseMetrics: Array<{
    label: string;
    current: string;
    previous?: string;
    delta?: string;
    isPositive?: boolean;
  }> = [];

  if (ga4Result.status === "fulfilled" && ga4Result.value) {
    const summary = (ga4Result.value as any).summary ?? [];
    for (const s of summary) {
      pulseMetrics.push({ label: s.label, current: s.current });
    }
  }

  if (gscResult.status === "fulfilled" && gscResult.value) {
    const summary = (gscResult.value as any).summary ?? [];
    for (const s of summary.slice(0, 3)) {
      pulseMetrics.push({ label: s.label, current: s.current });
    }
  }

  if (callTrackingResult.status === "fulfilled" && callTrackingResult.value) {
    const summary = (callTrackingResult.value as any).summary ?? [];
    for (const s of summary.slice(0, 2)) {
      pulseMetrics.push({ label: s.label, current: s.current });
    }
  }

  if (pulseMetrics.length === 0) {
    pulseMetrics.push(
      { label: "Organic Sessions", current: "—" },
      { label: "Organic Clicks", current: "—" },
      { label: "Organic Calls", current: "—" }
    );
  }

  pulseMetrics.push(
    { label: "NSM Sessions Goal", current: "—" },
    { label: "NSM Calls Goal", current: "—" }
  );

  sections.push({
    id: "bw_pulse",
    type: "pulse",
    title: `Performance Pulse — ${windowLabel}`,
    metrics: pulseMetrics,
  });

  const publishedItems = allAirtableItems(publishedResult);
  const productionItems = allAirtableItems(productionResult);

  const publishedContent = publishedItems.filter(i => !isOptimizationItem(i));
  const publishedOptimization = publishedItems.filter(i => isOptimizationItem(i));
  const productionContent = productionItems.filter(i => !isOptimizationItem(i));
  const productionOptimization = productionItems.filter(i => isOptimizationItem(i));

  const noAirtable = publishedItems.length === 0 && productionItems.length === 0;

  const sfData = sfResult.status === "fulfilled" && sfResult.value ? sfResult.value as any : null;
  const sfHeaders: string[] = sfData?.headers ?? [];
  const sfRows: Record<string, any>[] = (sfData?.data ?? []) as Record<string, any>[];
  const sfPriorities = sfData ? getSfTopPriorities(sfHeaders, sfRows) : [
    "Upload a Screaming Frog crawl CSV in the sidebar to generate technical priorities",
    "Audit Core Web Vitals for top landing pages",
    "Review internal link structure for crawl efficiency",
  ];

  function buildWhatWeDid(items: WorkLogItem[]): Array<{ text: string; url?: string }> {
    if (items.length === 0) return [];
    return items.map(i => ({
      text: i.task,
      url: i.url ?? undefined,
    }));
  }

  function buildWhatsNext(items: WorkLogItem[]): string[] {
    if (items.length === 0) return [];
    return items.map(i => i.task);
  }

  const newContentDid = buildWhatWeDid(publishedContent);
  const newContentNext = buildWhatsNext(productionContent);
  const optDid = buildWhatWeDid(publishedOptimization);
  const optNext = buildWhatsNext(productionOptimization);

  const workLog: NonNullable<DocxSection["workLog"]> = [
    {
      area: "New Content",
      whatWeDid: noAirtable
        ? "Connect Airtable in Setup to pull live published content."
        : newContentDid.map(i => i.text).join("\n") || "No new content published this period.",
      whatsNext: noAirtable
        ? "—"
        : newContentNext.join("\n") || "Review Production board for upcoming content.",
      items: noAirtable ? undefined : (newContentDid.length > 0 ? newContentDid : undefined),
      nextItems: noAirtable ? undefined : (newContentNext.length > 0 ? newContentNext : undefined),
    },
    {
      area: "Optimization",
      whatWeDid: noAirtable
        ? "Connect Airtable in Setup to pull live optimization work."
        : optDid.map(i => i.text).join("\n") || "No optimization work published this period.",
      whatsNext: noAirtable
        ? "—"
        : optNext.join("\n") || "Review Production board for upcoming optimization tasks.",
      items: noAirtable ? undefined : (optDid.length > 0 ? optDid : undefined),
      nextItems: noAirtable ? undefined : (optNext.length > 0 ? optNext : undefined),
    },
    {
      area: "Technical SEO",
      whatWeDid: "Enter technical SEO tasks completed this period.",
      whatsNext: sfPriorities.join("\n"),
      nextItems: sfPriorities,
    },
    {
      area: "Local SEO",
      whatWeDid: "Review GBP for content published or updated this period.",
      whatsNext: "Optimize GBP photos and posts for active campaigns.\nMonitor and respond to new Google reviews.",
      nextItems: [
        "Optimize GBP photos and posts for active campaigns.",
        "Monitor and respond to new Google reviews.",
      ],
    },
  ];

  sections.push({
    id: "bw_progress",
    type: "progress",
    title: "Progress & Quick Wins",
    workLog,
  });

  const technicalRows: string[][] = [];
  if (sfData) {
    const canonical = parseSfCanonicalIssues(sfHeaders, sfRows);
    const images = parseSfImageIssues(sfHeaders, sfRows);
    const errors404 = parseSf404s(sfHeaders, sfRows);
    const missingMeta = parseSfMissingMeta(sfHeaders, sfRows);
    if (canonical.count > 0) {
      technicalRows.push(["Canonical Mismatches", String(canonical.count)]);
      for (const ex of canonical.examples) {
        technicalRows.push(["  → Example URL", ex]);
      }
    }
    if (images.count > 0) {
      technicalRows.push(["Oversized Images (>150 KB)", String(images.count)]);
    }
    if (errors404.count > 0) {
      technicalRows.push(["404 Errors", String(errors404.count)]);
    }
    if (missingMeta.count > 0) {
      technicalRows.push(["Missing Meta Descriptions", String(missingMeta.count)]);
    }
    if (technicalRows.length === 0) {
      technicalRows.push(["No issues detected in crawl", "—"]);
    }
    technicalRows.push(["Crawl file", sfData.filename ?? "—"]);
  } else {
    technicalRows.push([
      "Status",
      "No Screaming Frog report uploaded for this client — upload a crawl CSV in the sidebar.",
    ]);
  }

  sections.push({
    id: "bw_technical",
    type: "technical",
    title: "Technical Maintenance",
    technicalTable: {
      headers: ["Issue Type", "Count / Detail"],
      rows: technicalRows,
    },
  });

  sections.push({
    id: "bw_partnership",
    type: "bullets",
    title: "Partnership & Alignment",
    bullets: ["", "", ""],
  });

  return {
    report_title: "SEO Bi-weekly Meeting",
    client_name: client.name,
    date: fmtDate(now),
    preparedBy: preparedBy || "JAY HALL",
    generated_at: now.toISOString(),
    sections,
  };
}
