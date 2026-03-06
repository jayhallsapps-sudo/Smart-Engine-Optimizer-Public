import { storage } from "./storage";
import { queryGsc, handlesGscCommand } from "./gscClient";
import { queryGa4, handlesGa4Command } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { querySemrush, handlesSemrushCommand } from "./semrushClient";
import { fetchAirtableWorkLog } from "./airtable";
import { fetchAsanaWorkLog, asanaSectionToCategory, groupAsanaTasks } from "./asanaClient";
import type { Slide } from "../client/src/components/report-preview/pptx-preview";

export interface MonthlyReportJson {
  report_title: string;
  client_name: string;
  month_label: string;
  generated_at: string;
  slides: Slide[];
}

function monthLabel(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function generateMonthly(input: {
  clientId: number;
  month: number;
  year: number;
  timezone?: string;
}): Promise<MonthlyReportJson> {
  const client = await storage.getClient(input.clientId);
  if (!client) throw new Error("Client not found: " + input.clientId);

  const label = monthLabel(input.month, input.year);
  const now = new Date();
  const dateRange = "last_30_vs_prev_30";

  const asanaProjectId = (client as any).asanaProjectId as string | null | undefined;

  const monthStart = new Date(input.year, input.month - 1, 1);
  const monthEnd = new Date(input.year, input.month, 0);
  const fmtIso = (d: Date) => d.toISOString().slice(0, 10);
  const monthStartStr = fmtIso(monthStart);
  const monthEndStr = fmtIso(monthEnd);

  const [gscQueries, gscPages, ga4Funnel, ga4Landing, ctResult, semResult, airtableResult, asanaResult] = await Promise.allSettled([
    handlesGscCommand("gsc_qoq_queries" as any) ? queryGsc("gsc_qoq_queries" as any, client, dateRange) : Promise.resolve(null),
    handlesGscCommand("gsc_qoq_pages" as any) ? queryGsc("gsc_qoq_pages" as any, client, dateRange) : Promise.resolve(null),
    handlesGa4Command("ga4_qoq_organic_funnel" as any) ? queryGa4("ga4_qoq_organic_funnel" as any, client, dateRange) : Promise.resolve(null),
    handlesGa4Command("ga4_qoq_organic_landing_pages" as any) ? queryGa4("ga4_qoq_organic_landing_pages" as any, client, dateRange) : Promise.resolve(null),
    handlesCallRailCommand("callrail_qoq_organic_calls" as any) ? queryCallRail("callrail_qoq_organic_calls" as any, client, dateRange) : Promise.resolve(null),
    handlesSemrushCommand("semrush_keyword_distribution" as any) ? querySemrush("semrush_keyword_distribution" as any, client, dateRange) : Promise.resolve(null),
    fetchAirtableWorkLog(client.id, monthStartStr, monthEndStr, "published"),
    asanaProjectId ? fetchAsanaWorkLog(asanaProjectId, monthStartStr, monthEndStr) : Promise.resolve(null),
  ]);

  const slides: Slide[] = [];

  slides.push({
    id: "title",
    type: "title",
    title: `SEO Monthly Report — ${label}`,
    clientName: client.name,
    date: fmtDate(now),
  });

  const perfMetrics: Array<{ label: string; current: string; previous?: string; delta?: string; isPositive?: boolean; source?: string }> = [];
  if (ga4Funnel.status === "fulfilled" && ga4Funnel.value) {
    const summary = (ga4Funnel.value as any).summary ?? [];
    perfMetrics.push(...summary.slice(0, 4).map((s: any) => ({ label: s.label, current: s.current, previous: s.previous, delta: s.deltaPercent, isPositive: s.isPositive, source: "GA4" })));
  }
  if (gscQueries.status === "fulfilled" && gscQueries.value) {
    const summary = (gscQueries.value as any).summary ?? [];
    perfMetrics.push(...summary.slice(0, 2).map((s: any) => ({ label: s.label, current: s.current, previous: s.previous, delta: s.deltaPercent, isPositive: s.isPositive, source: "GSC" })));
  }
  if (ctResult.status === "fulfilled" && ctResult.value) {
    const summary = (ctResult.value as any).summary ?? [];
    perfMetrics.push(...summary.slice(0, 1).map((s: any) => ({ label: s.label, current: s.current, previous: s.previous, delta: s.deltaPercent, isPositive: s.isPositive, source: "CallRail" })));
  }

  slides.push({
    id: "performance",
    type: "metrics",
    title: "Monthly Performance Overview",
    subtitle: `${label} vs Prior Period`,
    metrics: perfMetrics.length > 0 ? perfMetrics : [
      { label: "Organic Sessions", current: "—" },
      { label: "Conversions", current: "—" },
      { label: "Organic Clicks", current: "—" },
      { label: "Organic Calls", current: "—" },
    ],
  });

  if (gscQueries.status === "fulfilled" && gscQueries.value) {
    const tables = (gscQueries.value as any).tables ?? [];
    if (tables.length > 0) {
      slides.push({
        id: "gsc_queries",
        type: "table",
        title: "Top Organic Queries",
        subtitle: `${label} — Ranked by Clicks`,
        table: { headers: tables[0].headers, rows: tables[0].rows },
      });
    }
  }

  if (ga4Landing.status === "fulfilled" && ga4Landing.value) {
    const tables = (ga4Landing.value as any).tables ?? [];
    if (tables.length > 0) {
      slides.push({
        id: "landing_pages",
        type: "table",
        title: "Top Landing Pages",
        subtitle: `${label} — Organic Traffic`,
        table: { headers: tables[0].headers, rows: tables[0].rows },
      });
    }
  }

  if (gscPages.status === "fulfilled" && gscPages.value) {
    const tables = (gscPages.value as any).tables ?? [];
    if (tables.length > 0) {
      const chartData = tables[0].rows.slice(0, 10).map((row: any[]) => ({
        label: String(row[0] ?? "").split("/").pop() || String(row[0] ?? ""),
        Clicks: Number(row[1] ?? 0),
        Impressions: Number(row[2] ?? 0),
      }));
      if (chartData.length > 0) {
        slides.push({
          id: "pages_chart",
          type: "chart-bar",
          title: "Top Pages by Clicks",
          subtitle: `${label}`,
          chartData,
          chartKeys: ["Clicks", "Impressions"],
        });
      }
    }
  }

  if (semResult.status === "fulfilled" && semResult.value) {
    const tables = (semResult.value as any).tables ?? [];
    if (tables.length > 0) {
      slides.push({
        id: "keywords",
        type: "table",
        title: "Keyword Visibility Distribution",
        subtitle: `${label} — Position Ranges`,
        table: { headers: tables[0].headers, rows: tables[0].rows },
      });
    }
  }

  const asanaData = asanaResult.status === "fulfilled" && asanaResult.value && (asanaResult.value as any).success
    ? (asanaResult.value as { success: true; completed: import("./asanaClient").AsanaTask[]; upcoming: import("./asanaClient").AsanaTask[] })
    : null;
  const asanaCompletedByCategory = asanaData ? groupAsanaTasks(asanaData.completed) : {};
  const asanaUpcomingByCategory = asanaData ? groupAsanaTasks(asanaData.upcoming) : {};

  let workLogRows: Array<{ area: string; task: string; notes: string }> = [];

  if (airtableResult.status === "fulfilled" && airtableResult.value?.success) {
    const data = airtableResult.value.data;
    for (const [creditType, items] of Object.entries(data.byCreditType)) {
      for (const item of items as any[]) {
        workLogRows.push({ area: creditType, task: item.task, notes: item.url ?? "—" });
      }
    }
  }

  for (const [category, tasks] of Object.entries(asanaCompletedByCategory)) {
    for (const t of tasks) {
      const { italicize } = asanaSectionToCategory(t.section);
      workLogRows.push({
        area: category,
        task: italicize ? `*${t.name}*` : t.name,
        notes: t.notes || "—",
      });
    }
  }

  const nextMonthBullets: string[] = [];
  for (const [, tasks] of Object.entries(asanaUpcomingByCategory)) {
    nextMonthBullets.push(...tasks.map(t => t.name));
  }
  if (nextMonthBullets.length === 0) {
    nextMonthBullets.push(
      "Continue publishing scheduled content pieces.",
      "Review and resolve technical SEO findings from latest crawl.",
      "Monitor keyword ranking changes and adjust content strategy as needed.",
    );
  }

  const hasWorkLog = workLogRows.length > 0;
  slides.push({
    id: "work_completed",
    type: hasWorkLog ? "table" : "bullets",
    title: "Work Completed This Month",
    ...(hasWorkLog ? {
      table: {
        headers: ["Area", "Task / Deliverable", "Notes"],
        rows: workLogRows.map(r => [r.area, r.task, r.notes]),
      }
    } : {
      bullets: ["Connect Airtable or Asana in Setup to pull live work log data."],
    }),
  });

  slides.push({
    id: "next_month",
    type: "bullets",
    title: "Next Month Priorities",
    bullets: nextMonthBullets,
  });

  return {
    report_title: `SEO Monthly Report — ${label}`,
    client_name: client.name,
    month_label: label,
    generated_at: now.toISOString(),
    slides,
  };
}
