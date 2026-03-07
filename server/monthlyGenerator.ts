import { storage } from "./storage";
import { queryGsc, handlesGscCommand } from "./gscClient";
import { queryGa4, handlesGa4Command } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { querySemrush, handlesSemrushCommand } from "./semrushClient";
import { fetchAirtableWorkLog } from "./airtable";
import { fetchAsanaWorkLog, asanaSectionToCategory, groupAsanaTasks } from "./asanaClient";
import type { Slide } from "../client/src/components/report-preview/pptx-preview";

export interface MonthlyAmInputs {
  progressFeeling?: string;
  hypothesis?: string;
  auditNotes?: string;
  contextAnomalies?: string;
  leadershipNote?: string;
  focusNextMonth?: string;
}

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

function fmtIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Converts a URL slug into a readable label.
// "/programs/detox-residential-treatment" → "Detox Residential Treatment"
function cleanPageLabel(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://x.com${rawUrl}`);
    const path = u.pathname;
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return "/";
    const last = segments[segments.length - 1];
    return last
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim() || path;
  } catch {
    return rawUrl.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? rawUrl;
  }
}

export async function generateMonthly(input: {
  clientId: number;
  month: number;
  year: number;
  timezone?: string;
  amInputs?: MonthlyAmInputs;
  currentCrawlAssetId?: number | null;
  comparisonCrawlAssetId?: number | null;
}): Promise<MonthlyReportJson> {
  const client = await storage.getClient(input.clientId);
  if (!client) throw new Error("Client not found: " + input.clientId);

  const label = monthLabel(input.month, input.year);
  const now = new Date();
  const am = input.amInputs ?? {};

  // True calendar month date range — analysis window
  const monthPad = String(input.month).padStart(2, "0");
  const calMonthRange = `calendar_month:${input.year}-${monthPad}`;

  // QTD date range (quarter start through end of selected month)
  const calQtdRange = `calendar_qtd:${input.year}-${monthPad}`;

  // Compute month/prev month labels for display
  const monthStart = new Date(input.year, input.month - 1, 1);
  const monthEnd = new Date(input.year, input.month, 0);
  const prevMonthStart = new Date(input.year, input.month - 2, 1);
  const prevMonthEnd = new Date(input.year, input.month - 1, 0);
  const monthStartStr = fmtIso(monthStart);
  const monthEndStr = fmtIso(monthEnd);
  const prevMonthStartStr = fmtIso(prevMonthStart);
  const prevMonthEndStr = fmtIso(prevMonthEnd);

  const asanaProjectId = (client as any).asanaProjectId as string | null | undefined;

  // Fire all data fetches in parallel
  // GSC: calendar month — full API support for exact date windows
  // GA4: calendar month — full API support for exact date windows
  // CallRail: calendar month — supports start_date/end_date fields directly
  // SEMrush: uses best available window (rolling, not calendar — documented fallback)
  // Airtable/Asana: calendar month window
  const [
    gscQueries,
    gscPages,
    ga4Funnel,
    ga4Landing,
    ctResult,
    semResult,
    airtableResult,
    asanaResult,
    ga4FunnelQtd,
    ctResultQtd,
  ] = await Promise.allSettled([
    handlesGscCommand("gsc_qoq_queries" as any)
      ? queryGsc("gsc_qoq_queries" as any, client, calMonthRange)
      : Promise.resolve(null),
    handlesGscCommand("gsc_qoq_pages" as any)
      ? queryGsc("gsc_qoq_pages" as any, client, calMonthRange)
      : Promise.resolve(null),
    handlesGa4Command("ga4_qoq_organic_funnel" as any)
      ? queryGa4("ga4_qoq_organic_funnel" as any, client, calMonthRange)
      : Promise.resolve(null),
    handlesGa4Command("ga4_qoq_organic_landing_pages" as any)
      ? queryGa4("ga4_qoq_organic_landing_pages" as any, client, calMonthRange)
      : Promise.resolve(null),
    handlesCallRailCommand("callrail_qoq_organic_calls" as any)
      ? queryCallRail("callrail_qoq_organic_calls" as any, client, calMonthRange)
      : Promise.resolve(null),
    // SEMrush does not support calendar month windows via current integration;
    // falls back to rolling 30-day window which is the best available approximation.
    handlesSemrushCommand("semrush_keyword_distribution" as any)
      ? querySemrush("semrush_keyword_distribution" as any, client, "last_30_vs_prev_30")
      : Promise.resolve(null),
    fetchAirtableWorkLog(client.id, monthStartStr, monthEndStr, "published"),
    asanaProjectId
      ? fetchAsanaWorkLog(asanaProjectId, monthStartStr, monthEndStr)
      : Promise.resolve(null),
    // QTD calls for Slide 4 — GA4 funnel QTD
    handlesGa4Command("ga4_qoq_organic_funnel" as any)
      ? queryGa4("ga4_qoq_organic_funnel" as any, client, calQtdRange)
      : Promise.resolve(null),
    // QTD calls for Slide 4 — CallRail QTD
    handlesCallRailCommand("callrail_qoq_organic_calls" as any)
      ? queryCallRail("callrail_qoq_organic_calls" as any, client, calQtdRange)
      : Promise.resolve(null),
  ]);

  const slides: Slide[] = [];

  // ─── SLIDE 1: Title ───────────────────────────────────────────────
  slides.push({
    id: "title",
    type: "title",
    title: `SEO Monthly Report — ${label}`,
    clientName: client.name,
    date: fmtDate(now),
  });

  // ─── SLIDE 2: Monthly Performance Overview ────────────────────────
  const perfMetrics: Array<{
    label: string;
    current: string;
    previous?: string;
    delta?: string;
    isPositive?: boolean;
    source?: string;
  }> = [];

  if (ga4Funnel.status === "fulfilled" && ga4Funnel.value) {
    const summary = (ga4Funnel.value as any).summary ?? [];
    perfMetrics.push(
      ...summary.slice(0, 4).map((s: any) => ({
        label: s.label,
        current: s.current,
        previous: s.previous,
        delta: s.deltaPercent,
        isPositive: s.isPositive,
        source: "GA4",
      }))
    );
  }
  if (gscQueries.status === "fulfilled" && gscQueries.value) {
    const summary = (gscQueries.value as any).summary ?? [];
    perfMetrics.push(
      ...summary.slice(0, 2).map((s: any) => ({
        label: s.label,
        current: s.current,
        previous: s.previous,
        delta: s.deltaPercent,
        isPositive: s.isPositive,
        source: "GSC",
      }))
    );
  }
  if (ctResult.status === "fulfilled" && ctResult.value) {
    const summary = (ctResult.value as any).summary ?? [];
    perfMetrics.push(
      ...summary.slice(0, 1).map((s: any) => ({
        label: s.label,
        current: s.current,
        previous: s.previous,
        delta: s.deltaPercent,
        isPositive: s.isPositive,
        source: "CallRail",
      }))
    );
  }

  slides.push({
    id: "performance",
    type: "metrics",
    title: "Monthly Performance Overview",
    subtitle: `${label} vs ${new Date(input.year, input.month - 2, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
    metrics:
      perfMetrics.length > 0
        ? perfMetrics
        : [
            { label: "Organic Sessions", current: "Manual entry needed" },
            { label: "Conversions", current: "Manual entry needed" },
            { label: "Organic Clicks", current: "Manual entry needed" },
            { label: "Organic Calls", current: "Manual entry needed" },
          ],
  });

  // ─── SLIDE 3: Top Organic Queries ────────────────────────────────
  if (gscQueries.status === "fulfilled" && gscQueries.value) {
    const tables = (gscQueries.value as any).tables ?? [];
    slides.push({
      id: "gsc_queries",
      type: "table",
      title: "Top Organic Queries",
      subtitle: `${label} — Ranked by Clicks`,
      table:
        tables.length > 0
          ? { headers: tables[0].headers, rows: tables[0].rows }
          : {
              headers: ["Query", "Clicks", "Impressions", "CTR", "Position"],
              rows: [["Manual entry needed", "—", "—", "—", "—"]],
            },
    });
  } else {
    slides.push({
      id: "gsc_queries",
      type: "table",
      title: "Top Organic Queries",
      subtitle: `${label} — Ranked by Clicks`,
      table: {
        headers: ["Query", "Clicks", "Impressions", "CTR", "Position"],
        rows: [["Manual entry needed", "—", "—", "—", "—"]],
      },
    });
  }

  // ─── SLIDE 4: QTD Key Performance Indicators ─────────────────────
  // Primary: GA4 QTD organic sessions + conversions, CallRail QTD calls.
  // Goals require NSM Tracker integration (not connected) — shown as "Manual entry needed".
  const qtdRows: (string | number)[][] = [];

  const ga4QtdSummary =
    ga4FunnelQtd.status === "fulfilled" && ga4FunnelQtd.value
      ? ((ga4FunnelQtd.value as any).summary ?? [])
      : [];
  const ctQtdSummary =
    ctResultQtd.status === "fulfilled" && ctResultQtd.value
      ? ((ctResultQtd.value as any).summary ?? [])
      : [];

  const qtdSessions =
    ga4QtdSummary.find((s: any) => /session/i.test(s.label))?.current ?? "Manual entry needed";
  const qtdConversions =
    ga4QtdSummary.find((s: any) => /conver|admit|lead/i.test(s.label))?.current ??
    "Manual entry needed";
  const qtdCalls =
    ctQtdSummary.find((s: any) => /call/i.test(s.label))?.current ?? "Manual entry needed";

  const qNum = Math.ceil(input.month / 3);
  const qtdLabel = `Q${qNum} ${input.year} to date`;

  qtdRows.push(
    ["Organic Sessions", qtdSessions, "Manual entry needed", "—", "—"],
    ["Organic Conversions / Leads", qtdConversions, "Manual entry needed", "—", "—"],
    ["Qualified Calls", qtdCalls, "Manual entry needed", "—", "—"]
  );

  slides.push({
    id: "qtd_kpi",
    type: "table",
    title: "QTD Key Performance Indicators",
    subtitle: qtdLabel,
    table: {
      headers: ["KPI", "QTD Actual", "Goal", "% to Goal", "Status"],
      rows: qtdRows,
    },
  });

  // ─── SLIDE 5: Top Landing Pages ───────────────────────────────────
  if (ga4Landing.status === "fulfilled" && ga4Landing.value) {
    const tables = (ga4Landing.value as any).tables ?? [];
    slides.push({
      id: "landing_pages",
      type: "table",
      title: "Top Landing Pages",
      subtitle: `${label} — Organic Sessions`,
      table:
        tables.length > 0
          ? { headers: tables[0].headers, rows: tables[0].rows }
          : {
              headers: ["Page", "Sessions", "Conversions", "CVR"],
              rows: [["Manual entry needed", "—", "—", "—"]],
            },
    });
  } else if (gscPages.status === "fulfilled" && gscPages.value) {
    // Fallback: use GSC pages when GA4 landing page data is unavailable
    const tables = (gscPages.value as any).tables ?? [];
    slides.push({
      id: "landing_pages",
      type: "table",
      title: "Top Landing Pages",
      subtitle: `${label} — Organic Clicks (GSC fallback; GA4 landing page data unavailable)`,
      table:
        tables.length > 0
          ? { headers: tables[0].headers, rows: tables[0].rows }
          : {
              headers: ["Page", "Clicks", "Impressions", "CTR"],
              rows: [["Manual entry needed", "—", "—", "—"]],
            },
    });
  } else {
    slides.push({
      id: "landing_pages",
      type: "table",
      title: "Top Landing Pages",
      subtitle: `${label} — Organic Sessions`,
      table: {
        headers: ["Page", "Sessions", "Conversions", "CVR"],
        rows: [["Manual entry needed", "—", "—", "—"]],
      },
    });
  }

  // ─── SLIDE 6: Top Pages by Clicks ────────────────────────────────
  if (gscPages.status === "fulfilled" && gscPages.value) {
    const tables = (gscPages.value as any).tables ?? [];
    if (tables.length > 0) {
      const chartData = tables[0].rows.slice(0, 10).map((row: any[]) => ({
        label: cleanPageLabel(String(row[0] ?? "")),
        Clicks: Number(row[1] ?? 0),
        Impressions: Number(row[2] ?? 0),
      }));
      slides.push({
        id: "pages_chart",
        type: "chart-bar",
        title: "Top Pages by Clicks",
        subtitle: `${label} — GSC Organic`,
        chartData,
        chartKeys: ["Clicks", "Impressions"],
      });
    } else {
      slides.push({
        id: "pages_chart",
        type: "table",
        title: "Top Pages by Clicks",
        subtitle: `${label} — GSC Organic`,
        table: {
          headers: ["Page", "Clicks", "Impressions", "CTR", "Position"],
          rows: [["Manual entry needed", "—", "—", "—", "—"]],
        },
      });
    }
  } else {
    slides.push({
      id: "pages_chart",
      type: "table",
      title: "Top Pages by Clicks",
      subtitle: `${label} — GSC Organic`,
      table: {
        headers: ["Page", "Clicks", "Impressions", "CTR", "Position"],
        rows: [["Manual entry needed", "—", "—", "—", "—"]],
      },
    });
  }

  // ─── SLIDE 7: Keyword Visibility Distribution ─────────────────────
  // Primary: SEMrush keyword distribution (only SEMrush source available for position buckets).
  // Note: SEMrush does not support calendar month windows; uses rolling last-30-day approximation.
  if (semResult.status === "fulfilled" && semResult.value) {
    const tables = (semResult.value as any).tables ?? [];
    slides.push({
      id: "keywords",
      type: "table",
      title: "Keyword Visibility Distribution",
      subtitle: `${label} — Position Ranges (SEMrush, ~30-day window)`,
      table:
        tables.length > 0
          ? { headers: tables[0].headers, rows: tables[0].rows }
          : {
              headers: ["Position Range", "Keywords", "Share"],
              rows: [["Manual entry needed", "—", "—"]],
            },
    });
  } else {
    slides.push({
      id: "keywords",
      type: "table",
      title: "Keyword Visibility Distribution",
      subtitle: `${label} — Position Ranges`,
      table: {
        headers: ["Position Range", "Keywords", "Share"],
        rows: [["Manual entry needed", "—", "—"]],
      },
    });
  }

  // ─── SLIDE 8: Work Completed This Month ──────────────────────────
  const asanaData =
    asanaResult.status === "fulfilled" &&
    asanaResult.value &&
    (asanaResult.value as any).success
      ? (asanaResult.value as {
          success: true;
          completed: import("./asanaClient").AsanaTask[];
          upcoming: import("./asanaClient").AsanaTask[];
        })
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

  // De-duplicate by task name
  const seen = new Set<string>();
  workLogRows = workLogRows.filter(r => {
    if (seen.has(r.task)) return false;
    seen.add(r.task);
    return true;
  });

  slides.push({
    id: "work_completed",
    type: workLogRows.length > 0 ? "table" : "bullets",
    title: "Work Completed This Month",
    ...(workLogRows.length > 0
      ? {
          table: {
            headers: ["Area", "Task / Deliverable", "Notes"],
            rows: workLogRows.map(r => [r.area, r.task, r.notes]),
          },
        }
      : {
          bullets: ["Manual entry needed — connect Airtable or Asana to pull live work log data."],
        }),
  });

  // ─── SLIDE 9: Next Month Priorities ──────────────────────────────
  const nextMonthBullets: string[] = [];

  // Use Asana upcoming tasks for realistic priorities
  for (const [, tasks] of Object.entries(asanaUpcomingByCategory)) {
    nextMonthBullets.push(...tasks.slice(0, 3).map(t => t.name));
  }

  // Enrich from AM inputs if provided
  if (am.focusNextMonth) {
    nextMonthBullets.unshift(am.focusNextMonth);
  }

  // Performance-driven priorities when Asana data is thin
  if (nextMonthBullets.length < 3) {
    if (
      gscQueries.status === "fulfilled" &&
      gscQueries.value &&
      (gscQueries.value as any).summary?.some((s: any) => !s.isPositive)
    ) {
      nextMonthBullets.push("Investigate declining query positions and refresh underperforming pages.");
    }
    if (
      ga4Funnel.status === "fulfilled" &&
      ga4Funnel.value &&
      (ga4Funnel.value as any).summary?.find((s: any) => /cvr|conversion/i.test(s.label) && !s.isPositive)
    ) {
      nextMonthBullets.push("Review conversion rate drop on key landing pages and test CTA improvements.");
    }
    if (input.currentCrawlAssetId) {
      nextMonthBullets.push(
        "Review current crawl findings for technical issues and address top-priority items."
      );
    }
    if (input.comparisonCrawlAssetId) {
      nextMonthBullets.push(
        "Compare current vs. prior crawl to track technical remediation progress."
      );
    }
  }

  // Fallback bullets if still empty
  if (nextMonthBullets.length === 0) {
    nextMonthBullets.push(
      "Continue publishing scheduled content pieces.",
      "Review and resolve technical SEO findings from latest crawl.",
      "Monitor keyword ranking changes and adjust content strategy as needed.",
      "Prepare QTD KPI goals for leadership review — connect NSM Tracker for automated pull."
    );
  }

  // Add AM context bullets if provided
  if (am.leadershipNote) {
    nextMonthBullets.push(`Leadership note: ${am.leadershipNote}`);
  }
  if (am.hypothesis) {
    nextMonthBullets.push(`Strategic focus: ${am.hypothesis}`);
  }

  const nextMonthName = new Date(input.year, input.month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  slides.push({
    id: "next_month",
    type: "bullets",
    title: `Next Month Priorities — ${nextMonthName}`,
    bullets: nextMonthBullets.slice(0, 8),
  });

  return {
    report_title: `SEO Monthly Report — ${label}`,
    client_name: client.name,
    month_label: label,
    generated_at: now.toISOString(),
    slides,
  };
}
