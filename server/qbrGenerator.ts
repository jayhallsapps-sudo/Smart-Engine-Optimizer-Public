import { storage } from "./storage";
import { queryGsc, handlesGscCommand } from "./gscClient";
import { queryGa4, handlesGa4Command } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { querySemrush, handlesSemrushCommand } from "./semrushClient";
import { fetchAirtableWorkLog } from "./airtable";
import type { Slide } from "../client/src/components/report-preview/pptx-preview";

export interface QbrFullReportJson {
  report_title: string;
  client_name: string;
  quarter_label: string;
  generated_at: string;
  slides: Slide[];
}

function quarterLabel(quarter: number, year: number): string {
  return `Q${quarter} ${year}`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function generateQbrFull(input: {
  clientId: number;
  quarter: number;
  year: number;
  timezone?: string;
}): Promise<QbrFullReportJson> {
  const client = await storage.getClient(input.clientId);
  if (!client) throw new Error("Client not found: " + input.clientId);

  const label = quarterLabel(input.quarter, input.year);
  const now = new Date();
  const dateRange = "last_quarter_vs_prev_quarter";

  const [gscQueries, gscPages, ga4Funnel, ga4Landing, ctResult, semOverview, semDist, semRankings, airtableResult] = await Promise.allSettled([
    handlesGscCommand("gsc_qoq_queries" as any) ? queryGsc("gsc_qoq_queries" as any, client, dateRange) : Promise.resolve(null),
    handlesGscCommand("gsc_qoq_pages" as any) ? queryGsc("gsc_qoq_pages" as any, client, dateRange) : Promise.resolve(null),
    handlesGa4Command("ga4_qoq_organic_funnel" as any) ? queryGa4("ga4_qoq_organic_funnel" as any, client, dateRange) : Promise.resolve(null),
    handlesGa4Command("ga4_qoq_organic_landing_pages" as any) ? queryGa4("ga4_qoq_organic_landing_pages" as any, client, dateRange) : Promise.resolve(null),
    handlesCallRailCommand("callrail_qoq_organic_calls" as any) ? queryCallRail("callrail_qoq_organic_calls" as any, client, dateRange) : Promise.resolve(null),
    handlesSemrushCommand("semrush_organic_overview" as any) ? querySemrush("semrush_organic_overview" as any, client, dateRange) : Promise.resolve(null),
    handlesSemrushCommand("semrush_keyword_distribution" as any) ? querySemrush("semrush_keyword_distribution" as any, client, dateRange) : Promise.resolve(null),
    handlesSemrushCommand("semrush_keyword_rankings" as any) ? querySemrush("semrush_keyword_rankings" as any, client, dateRange) : Promise.resolve(null),
    fetchAirtableWorkLog(client.id, "2025-01-01", new Date().toISOString().slice(0, 10)),
  ]);

  const slides: Slide[] = [];

  slides.push({
    id: "title",
    type: "title",
    title: `Quarterly Business Review — ${label}`,
    clientName: client.name,
    date: fmtDate(now),
  });

  const qoqMetrics: Array<{ label: string; current: string; previous?: string; delta?: string; isPositive?: boolean }> = [];
  if (ga4Funnel.status === "fulfilled" && ga4Funnel.value) {
    const summary = (ga4Funnel.value as any).summary ?? [];
    qoqMetrics.push(...summary.slice(0, 4).map((s: any) => ({ label: s.label, current: s.current, previous: s.previous, delta: s.deltaPercent, isPositive: s.isPositive })));
  }
  if (gscQueries.status === "fulfilled" && gscQueries.value) {
    const summary = (gscQueries.value as any).summary ?? [];
    qoqMetrics.push(...summary.slice(0, 2).map((s: any) => ({ label: s.label, current: s.current, previous: s.previous, delta: s.deltaPercent, isPositive: s.isPositive })));
  }
  if (ctResult.status === "fulfilled" && ctResult.value) {
    const summary = (ctResult.value as any).summary ?? [];
    qoqMetrics.push(...summary.slice(0, 1).map((s: any) => ({ label: s.label, current: s.current, previous: s.previous, delta: s.deltaPercent, isPositive: s.isPositive })));
  }
  if (semOverview.status === "fulfilled" && semOverview.value) {
    const summary = (semOverview.value as any).summary ?? [];
    qoqMetrics.push(...summary.slice(0, 1).map((s: any) => ({ label: s.label, current: s.current, previous: s.previous, delta: s.deltaPercent, isPositive: s.isPositive })));
  }

  slides.push({
    id: "qoq_performance",
    type: "metrics",
    title: `QoQ Performance — ${label}`,
    subtitle: "Quarter-over-Quarter Comparison",
    metrics: qoqMetrics.length > 0 ? qoqMetrics : [
      { label: "Organic Sessions", current: "—" },
      { label: "Conversions / Leads", current: "—" },
      { label: "Organic Clicks", current: "—" },
      { label: "Avg. Position", current: "—" },
    ],
  });

  if (gscQueries.status === "fulfilled" && gscQueries.value) {
    const tables = (gscQueries.value as any).tables ?? [];
    if (tables.length > 0) {
      const chartData = tables[0].rows.slice(0, 12).map((row: any[]) => ({
        label: String(row[0] ?? "").split(" ").slice(0, 3).join(" "),
        Clicks: Number(row[1] ?? 0),
        Impressions: Number(row[2] ?? 0),
      }));

      slides.push({
        id: "top_queries",
        type: "two-col",
        title: "Top Performing Queries",
        leftContent: {
          type: "table",
          table: { headers: tables[0].headers, rows: tables[0].rows.slice(0, 12) },
        },
        rightContent: {
          type: "chart-bar",
          chartData: chartData.length > 0 ? chartData : undefined,
          chartKeys: chartData.length > 0 ? ["Clicks"] : undefined,
        },
      });
    }
  }

  if (ga4Landing.status === "fulfilled" && ga4Landing.value) {
    const tables = (ga4Landing.value as any).tables ?? [];
    if (tables.length > 0) {
      const chartData = tables[0].rows.slice(0, 10).map((row: any[]) => ({
        label: String(row[0] ?? "").split("/").pop() || String(row[0] ?? "").slice(-15),
        Sessions: Number(row[1] ?? 0),
        Conversions: Number(row[row.length - 1] ?? 0),
      }));

      slides.push({
        id: "landing_pages",
        type: "two-col",
        title: "Top Landing Pages — Organic",
        leftContent: {
          type: "table",
          table: { headers: tables[0].headers, rows: tables[0].rows.slice(0, 12) },
        },
        rightContent: {
          type: "chart-bar",
          chartData: chartData.length > 0 ? chartData : undefined,
          chartKeys: chartData.length > 0 ? ["Sessions", "Conversions"] : undefined,
        },
      });
    }
  }

  if (semDist.status === "fulfilled" && semDist.value) {
    const tables = (semDist.value as any).tables ?? [];
    if (tables.length > 0) {
      const chartData = tables[0].rows.map((row: any[]) => ({
        label: String(row[0] ?? ""),
        Keywords: Number(row[1] ?? 0),
      }));

      slides.push({
        id: "keyword_distribution",
        type: "two-col",
        title: "Keyword Ranking Distribution",
        subtitle: "Positions 1–100 breakdown",
        leftContent: {
          type: "table",
          table: { headers: tables[0].headers, rows: tables[0].rows },
        },
        rightContent: {
          type: "chart-bar",
          chartData: chartData.length > 0 ? chartData : undefined,
          chartKeys: chartData.length > 0 ? ["Keywords"] : undefined,
        },
      });
    }
  }

  if (semRankings.status === "fulfilled" && semRankings.value) {
    const tables = (semRankings.value as any).tables ?? [];
    if (tables.length > 0) {
      slides.push({
        id: "rankings_table",
        type: "table",
        title: "Keyword Rankings",
        subtitle: `${label} — Current Positions`,
        table: { headers: tables[0].headers, rows: tables[0].rows },
      });
    }
  }

  const conversionFunnelData: Array<{ label: string; [key: string]: string | number }> = [];
  if (ga4Funnel.status === "fulfilled" && ga4Funnel.value) {
    const summary = (ga4Funnel.value as any).summary ?? [];
    for (const s of summary) {
      conversionFunnelData.push({ label: s.label, Value: parseFloat(s.current.replace(/[^0-9.]/g, "")) || 0 });
    }
  }

  if (conversionFunnelData.length > 0) {
    slides.push({
      id: "conversion_funnel",
      type: "chart-bar",
      title: "Organic Conversion Funnel",
      subtitle: `${label} vs Prior Quarter`,
      chartData: conversionFunnelData,
      chartKeys: ["Value"],
    });
  }

  let workLogRows: Array<{ area: string; whatWeDid: string; whatsNext: string }> = [];
  if (airtableResult.status === "fulfilled" && airtableResult.value?.success) {
    const data = airtableResult.value.data;
    for (const [creditType, items] of Object.entries(data.byCreditType)) {
      for (const item of items as any[]) {
        workLogRows.push({ area: creditType, whatWeDid: item.task, whatsNext: item.url ?? "—" });
      }
    }
  }

  slides.push({
    id: "work_completed",
    type: workLogRows.length > 0 ? "table" : "bullets",
    title: `Work Completed — ${label}`,
    ...(workLogRows.length > 0 ? {
      table: {
        headers: ["Area", "Task / Deliverable", "URL / Notes"],
        rows: workLogRows.map(r => [r.area, r.whatWeDid, r.whatsNext]),
      }
    } : {
      bullets: ["Connect Airtable in Setup to pull live work log data."],
    }),
  });

  slides.push({
    id: "roadmap",
    type: "bullets",
    title: `Strategic Roadmap — Next Quarter`,
    bullets: [
      "Continue scaling content production for high-intent treatment queries.",
      "Address technical SEO issues identified in Screaming Frog audit.",
      "Expand local SEO coverage for additional service locations.",
      "Implement CRO improvements for top service page landing pages.",
      "Launch authority-building campaign targeting industry publications.",
    ],
  });

  return {
    report_title: `QBR — ${label}`,
    client_name: client.name,
    quarter_label: label,
    generated_at: now.toISOString(),
    slides,
  };
}
