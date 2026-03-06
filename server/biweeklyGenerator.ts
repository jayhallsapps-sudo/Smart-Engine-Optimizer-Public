import { storage } from "./storage";
import { queryGsc, handlesGscCommand } from "./gscClient";
import { queryGa4, handlesGa4Command } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { queryCtm, handlesCtmCommand } from "./ctmClient";
import { fetchAirtableWorkLog } from "./airtable";
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

  const [gscResult, ga4Result, callTrackingResult, airtableResult, sfResult] =
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
      (async () => fetchAirtableWorkLog(clientId, startDate, endDate))(),
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

  const workLog: Array<{ area: string; whatWeDid: string; whatsNext: string }> = [];
  if (airtableResult.status === "fulfilled" && airtableResult.value?.success) {
    const data = airtableResult.value.data;
    for (const [creditType, items] of Object.entries(data.byCreditType)) {
      for (const item of items as any[]) {
        workLog.push({
          area: creditType,
          whatWeDid: item.task + (item.status ? ` [${item.status}]` : ""),
          whatsNext: item.url ?? "—",
        });
      }
    }
  }

  sections.push({
    id: "bw_progress",
    type: "progress",
    title: "Progress & Quick Wins",
    workLog:
      workLog.length > 0
        ? workLog
        : [
            {
              area: "Content",
              whatWeDid: "Connect Airtable in Setup to pull live work log data.",
              whatsNext: "—",
            },
          ],
  });

  const technicalRows: string[][] = [];
  if (sfResult.status === "fulfilled" && sfResult.value) {
    const sf = sfResult.value as any;
    const headers: string[] = sf.headers ?? [];
    const data: Record<string, any>[] = (sf.data ?? []) as Record<string, any>[];
    const canonical = parseSfCanonicalIssues(headers, data);
    const images = parseSfImageIssues(headers, data);
    if (canonical.count > 0) {
      technicalRows.push(["Canonical Mismatches", String(canonical.count)]);
      for (const ex of canonical.examples) {
        technicalRows.push(["  → Example URL", ex]);
      }
    }
    if (images.count > 0) {
      technicalRows.push(["Oversized Images (>150 KB)", String(images.count)]);
    }
    if (technicalRows.length === 0) {
      technicalRows.push(["No issues detected", "—"]);
    }
    technicalRows.push(["Crawl file", sf.filename ?? "—"]);
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
