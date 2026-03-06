import { storage } from "./storage";
import { queryGsc, handlesGscCommand } from "./gscClient";
import { queryGa4, handlesGa4Command } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { queryCtm, handlesCtmCommand } from "./ctmClient";
import { fetchAirtableWorkLog } from "./airtable";
import { fetchNsmGoals } from "./sheetsClient";
import type { WorkLogItem } from "./airtable";
import type { DocxSection } from "../client/src/components/report-preview/docx-preview";

export interface BiweeklyReportJson {
  report_title: string;
  client_name: string;
  date: string;
  reportingWindow: string;
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
): number {
  const addrCol = headers.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? "Address";
  const canonCol = headers.find(h => /canonical/i.test(h));
  if (!canonCol) return 0;
  return data.filter(r => {
    const addr = String(r[addrCol] ?? "").trim();
    const canon = String(r[canonCol] ?? "").trim();
    return addr && canon && addr !== canon;
  }).length;
}

function parseSfImageIssues(headers: string[], data: Record<string, any>[]): number {
  const sizeCol = headers.find(h => /^size$/i.test(h) || /image.?size/i.test(h));
  if (!sizeCol) return 0;
  const LARGE_BYTES = 150 * 1024;
  return data.filter(r => {
    const v = parseInt(String(r[sizeCol] ?? "0").replace(/[^0-9]/g, ""), 10);
    return v > LARGE_BYTES;
  }).length;
}

function parseSf404s(headers: string[], data: Record<string, any>[]): number {
  const statusCol = headers.find(h => /status.?code/i.test(h) || /^status$/i.test(h));
  if (!statusCol) return 0;
  return data.filter(r => String(r[statusCol] ?? "").trim() === "404").length;
}

function parseSfMissingMeta(headers: string[], data: Record<string, any>[]): number {
  const metaCol = headers.find(h => /meta.?description/i.test(h));
  if (!metaCol) return 0;
  return data.filter(r => !String(r[metaCol] ?? "").trim()).length;
}

interface SfIssueCounts {
  canonical: number;
  images: number;
  errors404: number;
  missingMeta: number;
}

function getSfTopPriorities(counts: SfIssueCounts): string[] {
  const issues: Array<{ count: number; label: string }> = [];

  if (counts.canonical > 0) {
    issues.push({ count: counts.canonical, label: `Resolve ${counts.canonical} canonical mismatch${counts.canonical !== 1 ? "es" : ""} (conflicting canonical tags detected)` });
  }
  if (counts.images > 0) {
    issues.push({ count: counts.images, label: `Optimize ${counts.images} oversized image${counts.images !== 1 ? "s" : ""} (>150 KB) to improve page speed` });
  }
  if (counts.errors404 > 0) {
    issues.push({ count: counts.errors404, label: `Fix ${counts.errors404} broken link${counts.errors404 !== 1 ? "s" : ""} returning 404 errors` });
  }
  if (counts.missingMeta > 0) {
    issues.push({ count: counts.missingMeta, label: `Prioritize meta descriptions for top-traffic pages (${counts.missingMeta} pages flagged — focus on highest-value first)` });
  }

  issues.sort((a, b) => b.count - a.count);
  const top3 = issues.slice(0, 3).map(i => i.label);

  const fallbacks = [
    "Review crawl for redirect chains and broken internal links",
    "Audit Core Web Vitals for top landing pages",
    "Check for duplicate content issues",
  ];
  while (top3.length < 3) {
    top3.push(fallbacks[top3.length] ?? "Additional technical review");
  }

  return top3;
}

function aggregateSfCounts(reports: any[]): SfIssueCounts {
  const totals: SfIssueCounts = { canonical: 0, images: 0, errors404: 0, missingMeta: 0 };
  for (const sf of reports) {
    const headers: string[] = sf.headers ?? [];
    const data: Record<string, any>[] = (sf.data ?? []) as Record<string, any>[];
    totals.canonical += parseSfCanonicalIssues(headers, data);
    totals.images += parseSfImageIssues(headers, data);
    totals.errors404 += parseSf404s(headers, data);
    totals.missingMeta += parseSfMissingMeta(headers, data);
  }
  return totals;
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

type BulletItem = { text: string; url?: string };
type WorkLogRow = NonNullable<DocxSection["workLog"]>[number];

function makeRow(
  area: string,
  didItems: BulletItem[],
  nextItems: string[],
  didPlaceholder: string,
  nextPlaceholder: string
): WorkLogRow {
  const actualDid = didItems.length > 0 ? didItems : didPlaceholder ? [{ text: didPlaceholder }] : [];
  const actualNext = nextItems.length > 0 ? nextItems : nextPlaceholder ? [nextPlaceholder] : [];
  return {
    area,
    whatWeDid: actualDid.map(i => i.text).join("\n"),
    whatsNext: actualNext.join("\n"),
    items: actualDid,
    nextItems: actualNext,
  };
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

  const [gscResult, ga4Result, callTrackingResult, publishedResult, productionResult, sfReportsResult, nsmResult] =
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
      (async () => fetchAirtableWorkLog(clientId, startDate, endDate, "published"))(),
      (async () => {
        const prodStart = endDate;
        const prodEndDate = new Date(parseDateStr(endDate).getTime() + 14 * 24 * 60 * 60 * 1000);
        const prodEnd = `${prodEndDate.getFullYear()}-${String(prodEndDate.getMonth() + 1).padStart(2, "0")}-${String(prodEndDate.getDate()).padStart(2, "0")}`;
        return fetchAirtableWorkLog(clientId, prodStart, prodEnd, "production");
      })(),
      (async () => storage.getSfReports(clientId))(),
      (async () => fetchNsmGoals(client.name))(),
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

  const EXCLUDED_PULSE_LABELS = new Set(["Total Clicks", "Total Calls"]);

  if (gscResult.status === "fulfilled" && gscResult.value) {
    const summary = (gscResult.value as any).summary ?? [];
    for (const s of summary.slice(0, 3)) {
      if (!EXCLUDED_PULSE_LABELS.has(s.label)) {
        pulseMetrics.push({ label: s.label, current: s.current });
      }
    }
  }

  if (callTrackingResult.status === "fulfilled" && callTrackingResult.value) {
    const summary = (callTrackingResult.value as any).summary ?? [];
    for (const s of summary.slice(0, 2)) {
      if (!EXCLUDED_PULSE_LABELS.has(s.label)) {
        pulseMetrics.push({ label: s.label, current: s.current });
      }
    }
  }

  const nsmGoals = nsmResult.status === "fulfilled" ? nsmResult.value : null;
  if (nsmGoals) {
    pulseMetrics.push(
      { label: "NSM Quarter",          current: nsmGoals.quarter },
      { label: "NSM Sessions Goal",     current: nsmGoals.sessionsGoal },
      { label: "NSM Sessions Actual",   current: nsmGoals.sessionsActual },
      { label: "NSM Sessions %",        current: nsmGoals.sessionsPercent },
      { label: "NSM Sessions On Track", current: nsmGoals.sessionsOnTrack },
      { label: `NSM MVP (${nsmGoals.mvpType}) Goal`,    current: nsmGoals.mvpGoal },
      { label: `NSM MVP (${nsmGoals.mvpType}) Actual`,  current: nsmGoals.mvpActual },
      { label: `NSM MVP (${nsmGoals.mvpType}) %`,       current: nsmGoals.mvpPercent },
      { label: `NSM MVP (${nsmGoals.mvpType}) On Track`,current: nsmGoals.mvpOnTrack },
    );
  }

  sections.push({
    id: "bw_pulse",
    type: "pulse",
    title: "Performance Pulse",
    metrics: pulseMetrics,
  });

  const publishedItems = allAirtableItems(publishedResult);
  const productionItems = allAirtableItems(productionResult);
  const airtableNotConfigured =
    (publishedResult.status === "fulfilled" && (publishedResult.value as any)?.setupRequired === true) ||
    publishedResult.status === "rejected";
  const noAirtable = airtableNotConfigured;

  const publishedContent = publishedItems.filter(i => !isOptimizationItem(i));
  const publishedOptimization = publishedItems.filter(i => isOptimizationItem(i));
  const productionContent = productionItems.filter(i => !isOptimizationItem(i));
  const productionOptimization = productionItems.filter(i => isOptimizationItem(i));

  const allSfReports = sfReportsResult.status === "fulfilled" ? (sfReportsResult.value ?? []) : [];
  const hasSf = allSfReports.length > 0;
  const sfCounts = hasSf ? aggregateSfCounts(allSfReports) : null;
  const sfPriorities = sfCounts
    ? getSfTopPriorities(sfCounts)
    : [
        "Upload a Screaming Frog crawl CSV in the sidebar to generate technical priorities",
        "Audit Core Web Vitals for top landing pages",
        "Review internal link structure for crawl efficiency",
      ];

  const snapshotKey = `sf_snapshot_${clientId}`;
  const prevSnapshotRaw = await storage.getSetting(snapshotKey);
  const prevSnapshot: SfIssueCounts & { date?: string } | null = prevSnapshotRaw
    ? JSON.parse(prevSnapshotRaw)
    : null;

  const sfDidItems: BulletItem[] = [];
  if (sfCounts && prevSnapshot) {
    const resolved = {
      canonical: Math.max(0, prevSnapshot.canonical - sfCounts.canonical),
      images: Math.max(0, prevSnapshot.images - sfCounts.images),
      errors404: Math.max(0, prevSnapshot.errors404 - sfCounts.errors404),
      missingMeta: Math.max(0, prevSnapshot.missingMeta - sfCounts.missingMeta),
    };
    if (resolved.canonical > 0) sfDidItems.push({ text: `Resolved ${resolved.canonical} canonical mismatches` });
    if (resolved.errors404 > 0) sfDidItems.push({ text: `Fixed ${resolved.errors404} broken links (404s)` });
    if (resolved.images > 0) sfDidItems.push({ text: `Optimized ${resolved.images} oversized images` });
    if (resolved.missingMeta > 0) sfDidItems.push({ text: `Added meta descriptions to ${resolved.missingMeta} priority pages` });
  }

  const newContentDid: BulletItem[] = publishedContent.map(i => ({ text: i.task, url: i.url ?? undefined }));
  const newContentNext: string[] = productionContent.map(i => i.task);
  const optDid: BulletItem[] = publishedOptimization.map(i => ({ text: i.task, url: i.url ?? undefined }));
  const optNext: string[] = productionOptimization.map(i => i.task);

  const workLog: NonNullable<DocxSection["workLog"]> = [
    makeRow(
      "New Content",
      noAirtable ? [] : newContentDid,
      noAirtable ? [] : newContentNext,
      "Connect Airtable in Setup to pull live published content.",
      noAirtable ? "Connect Airtable in Setup to pull upcoming content." : ""
    ),
    makeRow(
      "Optimization",
      noAirtable ? [] : optDid,
      noAirtable ? [] : optNext,
      "Connect Airtable in Setup to pull live optimization work.",
      noAirtable ? "Connect Airtable in Setup to pull upcoming optimization tasks." : ""
    ),
    makeRow(
      "Technical SEO",
      sfDidItems,
      sfPriorities,
      "Enter technical SEO tasks completed this period.",
      sfPriorities[0]
    ),
    makeRow(
      "Local SEO",
      [],
      [
        "Optimize GBP photos and posts for active campaigns.",
        "Monitor and respond to new Google reviews.",
      ],
      "Review GBP for content published or updated this period.",
      "Optimize GBP photos and posts for active campaigns."
    ),
  ];

  sections.push({
    id: "bw_progress",
    type: "progress",
    title: "Progress & Quick Wins",
    workLog,
  });

  // SF technical data already feeds into the Technical SEO row's nextItems (sfPriorities above).
  // No separate Technical Maintenance section — matches the 3-section template structure.

  sections.push({
    id: "bw_partnership",
    type: "bullets",
    title: "Partnership & Alignment",
    bullets: [
      "Open discussion: feedback, lead quality, new initiatives, or observations.",
      "Confirm next steps, responsibilities, and upcoming deliverables.",
    ],
  });

  if (sfCounts) {
    await storage.setSetting(snapshotKey, JSON.stringify({ ...sfCounts, date: now.toISOString() }));
  }

  return {
    report_title: "SEO Bi-weekly Meeting",
    client_name: client.name,
    date: fmtDate(now),
    reportingWindow: windowLabel,
    preparedBy: preparedBy || "JAY HALL",
    generated_at: now.toISOString(),
    sections,
  };
}
