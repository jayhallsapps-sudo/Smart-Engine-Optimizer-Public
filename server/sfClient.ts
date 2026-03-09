import type { Client, Command, CommandResult } from "@shared/schema";
import { storage } from "./storage";

function fmtN(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function priorityRank(val: string): number {
  return PRIORITY_ORDER[String(val).toLowerCase().trim()] ?? 4;
}

export async function querySfReport(
  command: Command,
  client: Client,
  _dateRange: string
): Promise<CommandResult | null> {
  if (
    command !== "technical_health_summary" &&
    command !== "new_pages_tracker" &&
    command !== "sf_issues_summary"
  )
    return null;

  const allReports = await storage.getSfReports(client.id);
  if (!allReports.length) return null;

  if (command === "sf_issues_summary") {
    const issuesReport = allReports.find(r => r.fileType === "issues");
    if (!issuesReport) return null;
    const headers = issuesReport.headers ?? [];
    const rows = ((issuesReport.data ?? []) as Record<string, any>[]);
    if (!rows.length) return null;

    const issueCol =
      headers.find(h => /^issue\s*name$/i.test(h)) ??
      headers.find(h => /^issue\s*type$/i.test(h)) ??
      headers.find(h => /^issue$/i.test(h)) ??
      headers[0];
    const priorityCol = headers.find(h => /priority/i.test(h));
    const countCol =
      headers.find(h => /occurrence/i.test(h)) ??
      headers.find(h => /^count$/i.test(h)) ??
      headers.find(h => /^urls?$/i.test(h));

    const sorted = [...rows].sort((a, b) => {
      const pa = priorityRank(String(a[priorityCol ?? ""] ?? ""));
      const pb = priorityRank(String(b[priorityCol ?? ""] ?? ""));
      return pa !== pb ? pa - pb : (Number(b[countCol ?? ""] ?? 0) - Number(a[countCol ?? ""] ?? 0));
    });

    const high = sorted.filter(r => /high|critical/i.test(String(r[priorityCol ?? ""] ?? ""))).length;
    const medium = sorted.filter(r => /medium/i.test(String(r[priorityCol ?? ""] ?? ""))).length;
    const low = sorted.filter(r => /low/i.test(String(r[priorityCol ?? ""] ?? ""))).length;

    const tableRows = sorted.slice(0, 25).map(r => [
      String(r[issueCol] ?? "—"),
      priorityCol ? String(r[priorityCol] ?? "—") : "—",
      countCol ? fmtN(Number(String(r[countCol] ?? "0").replace(/[^0-9.]/g, "")) || 0) : "—",
    ]);

    return {
      command,
      clientName: client.name,
      dateRange: issuesReport.reportDate,
      summary: [
        { label: "Total Issues", current: fmtN(sorted.length), previous: "—", delta: "—", deltaPercent: "—", isPositive: sorted.length === 0 },
        { label: "High / Critical", current: fmtN(high), previous: "—", delta: "—", deltaPercent: "—", isPositive: high === 0 },
        { label: "Medium", current: fmtN(medium), previous: "—", delta: "—", deltaPercent: "—", isPositive: medium === 0 },
        { label: "Low", current: fmtN(low), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
      ],
      tables: tableRows.length
        ? [{ title: "Issues by Priority", headers: ["Issue", "Priority", "Occurrences"], rows: tableRows }]
        : [],
    };
  }

  // Crawl commands — exclude issues reports, only use crawl data
  const reports = allReports.filter(r => r.fileType !== "issues");
  if (!reports.length) return null;

  const latest = reports[0];
  const rows = ((latest.data ?? []) as Record<string, any>[]);
  if (!rows.length) return null;

  const headers = latest.headers ?? [];
  const urlCol = headers.find(h => ["Address", "URL", "address", "url"].includes(h)) ?? headers[0];
  const statusCol = headers.find(h => ["Status Code", "Status code", "status_code", "Status"].includes(h));
  const indexCol = headers.find(h => ["Indexability", "indexability"].includes(h));
  const titleCol = headers.find(h => ["Title 1", "Title", "title", "Page Title"].includes(h));
  const h1Col = headers.find(h => ["H1-1", "H1", "h1"].includes(h));

  if (command === "technical_health_summary") {
    const total = rows.length;
    const errors = rows.filter(r => Number(r[statusCol ?? ""]) >= 400);
    const redirects = rows.filter(r => { const s = Number(r[statusCol ?? ""]); return s >= 300 && s < 400; });
    const notIndexable = indexCol ? rows.filter(r => r[indexCol] && r[indexCol].toLowerCase() !== "indexable") : [];
    const missingTitle = titleCol ? rows.filter(r => !r[titleCol] || String(r[titleCol]).trim() === "") : [];
    const missingH1 = h1Col ? rows.filter(r => !r[h1Col] || String(r[h1Col]).trim() === "") : [];

    const errorRows = errors.slice(0, 15).map(r => [
      String(r[urlCol] ?? "—").replace(/^https?:\/\/[^/]+/, "") || "/",
      String(r[statusCol ?? ""] ?? "—"),
      indexCol ? String(r[indexCol] ?? "—") : "—",
    ]);

    return {
      command,
      clientName: client.name,
      dateRange: latest.reportDate,
      summary: [
        { label: "Total URLs Crawled", current: fmtN(total), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
        { label: "Errors (4xx/5xx)", current: fmtN(errors.length), previous: "—", delta: "—", deltaPercent: "—", isPositive: errors.length === 0 },
        { label: "Redirects (3xx)", current: fmtN(redirects.length), previous: "—", delta: "—", deltaPercent: "—", isPositive: true },
        { label: "Non-Indexable", current: fmtN(notIndexable.length), previous: "—", delta: "—", deltaPercent: "—", isPositive: notIndexable.length === 0 },
        { label: "Missing Titles", current: fmtN(missingTitle.length), previous: "—", delta: "—", deltaPercent: "—", isPositive: missingTitle.length === 0 },
        { label: "Missing H1", current: fmtN(missingH1.length), previous: "—", delta: "—", deltaPercent: "—", isPositive: missingH1.length === 0 },
      ],
      tables: errorRows.length ? [{ title: "Error Pages (4xx/5xx)", headers: ["URL", "Status", "Indexability"], rows: errorRows }] : [],
    };
  }

  if (command === "new_pages_tracker") {
    if (reports.length < 2) {
      const recentRows = rows.slice(0, 20).map(r => [
        String(r[urlCol] ?? "—").replace(/^https?:\/\/[^/]+/, "") || "/",
        titleCol ? String(r[titleCol] ?? "—") : "—",
        statusCol ? String(r[statusCol] ?? "—") : "—",
      ]);
      return {
        command,
        clientName: client.name,
        dateRange: latest.reportDate,
        summary: [{ label: "Pages in Latest Crawl", current: fmtN(rows.length), previous: "—", delta: "—", deltaPercent: "—", isPositive: true }],
        tables: [{ title: "Pages (Latest Crawl)", headers: ["URL", "Title", "Status"], rows: recentRows }],
      };
    }

    const prev = reports[1];
    const prevRows = ((prev.data ?? []) as Record<string, any>[]);
    const prevUrls = new Set(prevRows.map(r => r[urlCol]));
    const currUrls = new Set(rows.map(r => r[urlCol]));
    const newPages = rows.filter(r => !prevUrls.has(r[urlCol]));
    const removedPages = prevRows.filter(r => !currUrls.has(r[urlCol]));

    const newPageRows = newPages.slice(0, 20).map(r => [
      String(r[urlCol] ?? "—").replace(/^https?:\/\/[^/]+/, "") || "/",
      titleCol ? String(r[titleCol] ?? "—") : "—",
    ]);
    const removedPageRows = removedPages.slice(0, 10).map(r => [
      String(r[urlCol] ?? "—").replace(/^https?:\/\/[^/]+/, "") || "/",
    ]);

    return {
      command,
      clientName: client.name,
      dateRange: `${prev.reportDate} → ${latest.reportDate}`,
      summary: [
        { label: "New Pages", current: fmtN(newPages.length), previous: "—", delta: `+${newPages.length}`, deltaPercent: "—", isPositive: true },
        { label: "Removed Pages", current: fmtN(removedPages.length), previous: "—", delta: `-${removedPages.length}`, deltaPercent: "—", isPositive: removedPages.length === 0 },
      ],
      tables: [
        ...(newPageRows.length ? [{ title: "New Pages Since Last Crawl", headers: ["URL", "Title"], rows: newPageRows }] : []),
        ...(removedPageRows.length ? [{ title: "Pages No Longer Found", headers: ["URL"], rows: removedPageRows }] : []),
      ],
    };
  }

  return null;
}

export function handlesSfCommand(command: Command): boolean {
  return ["technical_health_summary", "new_pages_tracker", "sf_issues_summary"].includes(command);
}
