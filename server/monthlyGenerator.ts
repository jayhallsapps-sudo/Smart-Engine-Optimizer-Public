import { storage } from "./storage";
import { queryGsc, handlesGscCommand, fetchGscQueryRowsForTopicClustering, fetchGscDailyTrend } from "./gscClient";
import { queryGa4, handlesGa4Command, fetchGa4DailyTrend } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { querySemrush, handlesSemrushCommand } from "./semrushClient";
import { fetchAirtableWorkLog } from "./airtable";
import { fetchAsanaWorkLog, asanaSectionToCategory, groupAsanaTasks } from "./asanaClient";
import { clusterQueriesByTopic, topicAdmitConnection } from "./qbrPrepHelpers";
import type { Slide } from "../client/src/components/report-preview/pptx-preview";
import { type GapContext } from "./gapAnswerContext";

export interface MonthlyAmInputs {
  clientSentiment?: string;
  amThoughts?: string;
  priorityChecks?: string;
  clientNotes?: string;
  progressFeeling?: string;
  hypothesis?: string;
  auditNotes?: string;
  contextAnomalies?: string;
  leadershipNote?: string;
  focusNextMonth?: string;
}

function normalizeMonthlyAmInputs(raw: MonthlyAmInputs): MonthlyAmInputs {
  return {
    ...raw,
    amThoughts: raw.amThoughts || raw.hypothesis || "",
    priorityChecks: raw.priorityChecks || raw.auditNotes || "",
  };
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

// Combine progressFeeling + contextAnomalies into a single compact commentary line.
// Returns undefined when both fields are empty.
function buildPerformanceCommentary(am: MonthlyAmInputs): string | undefined {
  const feeling = am.progressFeeling?.trim();
  const context = am.contextAnomalies?.trim();
  if (!feeling && !context) return undefined;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const end = (s: string) => /[.!?]$/.test(s) ? s : `${s}.`;
  if (feeling && context) return `${end(cap(feeling))} Context: ${cap(context)}`;
  return end(cap(feeling || context!));
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
  gapContext?: GapContext;
}): Promise<MonthlyReportJson> {
  const client = await storage.getClient(input.clientId);
  if (!client) throw new Error("Client not found: " + input.clientId);

  const label = monthLabel(input.month, input.year);
  const now = new Date();
  const am = normalizeMonthlyAmInputs(input.amInputs ?? {});

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
    gscQueryPageMap,
    gscTopicClusterData,
    gscDailyTrend,
    ga4DailyTrend,
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
    handlesGscCommand("gsc_query_to_page_map" as any)
      ? queryGsc("gsc_query_to_page_map" as any, client, calMonthRange)
      : Promise.resolve(null),
    fetchGscQueryRowsForTopicClustering(client, calMonthRange),
    fetchGscDailyTrend(client, calMonthRange),
    fetchGa4DailyTrend(client, calMonthRange),
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

  const perfCommentary = buildPerformanceCommentary(am);
  let finalCommentary = perfCommentary;
  if (input.gapContext && input.gapContext.hasAnswers) {
    const gapParts = [
      input.gapContext.sentimentContext,
      input.gapContext.businessChanges,
      input.gapContext.narrativeNotes
    ].filter(Boolean);
    if (gapParts.length > 0) {
      finalCommentary = (finalCommentary ? finalCommentary + " " : "") + "Gap Insights: " + gapParts.join("; ");
    }
  }

  slides.push({
    id: "performance",
    type: "metrics",
    title: "Monthly Performance Overview",
    subtitle: `${label} vs ${new Date(input.year, input.month - 2, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
    ...(finalCommentary ? { commentary: finalCommentary } : {}),
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

  // ─── SLIDE 3b: Query Groups (Topic-Level Aggregation with % Deltas) ──
  if (gscTopicClusterData.status === "fulfilled" && gscTopicClusterData.value) {
    const { currentRows, previousRows } = gscTopicClusterData.value as { currentRows: any[]; previousRows: any[] };
    if (currentRows.length > 0) {
      const currQueryData = currentRows.map(r => ({
        query: r.keys?.[0] ?? "",
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      }));
      const clusters = clusterQueriesByTopic(currQueryData, client);

      const prevClusters = new Map<string, { queryCount: number; impressions: number }>();
      if (previousRows.length > 0) {
        const prevQueryData = previousRows.map(r => ({
          query: r.keys?.[0] ?? "",
          clicks: r.clicks ?? 0,
          impressions: r.impressions ?? 0,
          ctr: r.ctr ?? 0,
          position: r.position ?? 0,
        }));
        const prevTopicClusters = clusterQueriesByTopic(prevQueryData, client);
        for (const [topic, queries] of prevTopicClusters.entries()) {
          prevClusters.set(topic, {
            queryCount: queries.length,
            impressions: queries.reduce((s, q) => s + q.impressions, 0),
          });
        }
      }

      const pctDelta = (curr: number, prev: number): string => {
        if (prev === 0 && curr === 0) return "0%";
        if (prev === 0) return "+100%";
        const d = ((curr - prev) / prev) * 100;
        return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
      };

      const topicRows = [...clusters.entries()]
        .map(([topic, queries]) => ({
          topic,
          queryCount: queries.length,
          totalImpressions: queries.reduce((s, q) => s + q.impressions, 0),
          connection: topicAdmitConnection(topic),
        }))
        .sort((a, b) => b.queryCount - a.queryCount)
        .slice(0, 10);

      const prevMonthLabel = new Date(input.year, input.month - 2, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

      const tableRows = topicRows.map(t => {
        const prev = prevClusters.get(t.topic);
        return [
          t.topic,
          String(t.queryCount),
          prev ? pctDelta(t.queryCount, prev.queryCount) : "—",
          t.totalImpressions.toLocaleString("en-US"),
          prev ? pctDelta(t.totalImpressions, prev.impressions) : "—",
          t.connection,
        ];
      });

      slides.push({
        id: "query_groups",
        type: "table",
        title: "Query Groups",
        subtitle: `${label} vs ${prevMonthLabel} — Topic-Level Aggregation`,
        table: {
          headers: ["Query Group", "# Queries", "Δ Queries", "Impressions", "Δ Impressions", "Admit Connection"],
          rows: tableRows,
        },
      });
    }
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

  // ─── SLIDE 5: Top Landing Pages (enhanced with multi-metric deltas) ─
  const queryPageMapData =
    gscQueryPageMap.status === "fulfilled" && gscQueryPageMap.value
      ? ((gscQueryPageMap.value as any).tables?.[0]?.rows ?? [])
      : [];
  const queryCountByPageMonthly = new Map<string, number>();
  for (const row of queryPageMapData) {
    const page = String(row[1] ?? "");
    queryCountByPageMonthly.set(page, (queryCountByPageMonthly.get(page) ?? 0) + 1);
  }

  if (gscPages.status === "fulfilled" && gscPages.value) {
    const tables = (gscPages.value as any).tables ?? [];
    if (tables.length > 0) {
      const enhancedHeaders = ["Page", "Clicks", "Δ Clicks", "Impressions", "Δ Impressions", "# Queries", "CTR", "Avg Position"];
      const enhancedRows = tables[0].rows.map((row: any[]) => {
        const page = String(row[0] ?? "");
        const clicks = row[1] ?? "—";
        const deltaClicks = row[2] ?? "—";
        const impressions = row[3] ?? "—";
        const deltaImpressions = row[4] ?? "—";
        const ctr = row[5] ?? "—";
        const pos = row[6] ?? "—";
        const queryCount = queryCountByPageMonthly.get(page) ?? queryCountByPageMonthly.get(page.startsWith("/") ? `${client.gscSiteUrl?.replace(/\/$/, "")}${page}` : page) ?? 0;
        return [page, clicks, deltaClicks, impressions, deltaImpressions, queryCount > 0 ? String(queryCount) : "—", ctr, pos];
      });
      slides.push({
        id: "landing_pages",
        type: "table",
        title: "Top Landing Pages",
        subtitle: `${label} — GSC Organic Performance with Deltas`,
        table: { headers: enhancedHeaders, rows: enhancedRows },
      });
    } else {
      slides.push({
        id: "landing_pages",
        type: "table",
        title: "Top Landing Pages",
        subtitle: `${label} — Organic Clicks`,
        table: {
          headers: ["Page", "Clicks", "Δ Clicks", "Impressions", "Δ Impressions", "# Queries", "CTR", "Avg Position"],
          rows: [["Manual entry needed", "—", "—", "—", "—", "—", "—", "—"]],
        },
      });
    }
  } else if (ga4Landing.status === "fulfilled" && ga4Landing.value) {
    const tables = (ga4Landing.value as any).tables ?? [];
    slides.push({
      id: "landing_pages",
      type: "table",
      title: "Top Landing Pages",
      subtitle: `${label} — Organic Sessions (GA4)`,
      table:
        tables.length > 0
          ? { headers: tables[0].headers, rows: tables[0].rows }
          : {
              headers: ["Page", "Sessions", "Conversions", "CVR"],
              rows: [["Manual entry needed", "—", "—", "—"]],
            },
    });
  } else {
    slides.push({
      id: "landing_pages",
      type: "table",
      title: "Top Landing Pages",
      subtitle: `${label} — Organic Performance`,
      table: {
        headers: ["Page", "Clicks", "Δ Clicks", "Impressions", "Δ Impressions", "# Queries", "CTR", "Avg Position"],
        rows: [["Manual entry needed", "—", "—", "—", "—", "—", "—", "—"]],
      },
    });
  }

  // ─── SLIDE 6: Top Pages by Clicks ────────────────────────────────
  if (gscPages.status === "fulfilled" && gscPages.value) {
    const tables = (gscPages.value as any).tables ?? [];
    if (tables.length > 0) {
      const chartData = tables[0].rows.slice(0, 10).map((row: any[]) => ({
        label: cleanPageLabel(String(row[0] ?? "")),
        Clicks: parseInt(String(row[1] ?? "0").replace(/,/g, ""), 10) || 0,
        Impressions: parseInt(String(row[3] ?? "0").replace(/,/g, ""), 10) || 0,
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

  if (am.priorityChecks?.trim()) {
    const note = am.priorityChecks.trim();
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const end = (s: string) => /[.!?]$/.test(s) ? s : `${s}.`;
    nextMonthBullets.push(`Technical note: ${end(cap(note))}`);
  }

  if (am.leadershipNote) {
    nextMonthBullets.push(`Leadership note: ${am.leadershipNote}`);
  }
  if (am.amThoughts?.trim()) {
    nextMonthBullets.push(`Strategic focus: ${am.amThoughts}`);
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

  const amInputsBullets: string[] = [];
  if (am.clientSentiment) amInputsBullets.push(`Client Sentiment: ${am.clientSentiment}`);
  if (am.amThoughts?.trim()) amInputsBullets.push(`AM's Thoughts: ${am.amThoughts.trim()}`);
  if (am.priorityChecks?.trim()) amInputsBullets.push(`Priority Checks: ${am.priorityChecks.trim()}`);
  if (am.clientNotes?.trim()) amInputsBullets.push(`Client Notes: ${am.clientNotes.trim()}`);

  if (amInputsBullets.length > 0) {
    slides.push({
      id: "am_inputs",
      type: "bullets",
      title: "AM Inputs",
      subtitle: "Account Manager Context & Priorities",
      bullets: amInputsBullets,
    });
  }

  if (gscDailyTrend.status === "fulfilled" && gscDailyTrend.value) {
    const { current: gscCurr, previous: gscPrev } = gscDailyTrend.value as { current: any[]; previous: any[] };
    if (gscCurr.length > 0) {
      const maxLen = Math.max(gscCurr.length, gscPrev.length);
      const chartData = [];
      for (let i = 0; i < maxLen; i++) {
        const dayLabel = `Day ${i + 1}`;
        chartData.push({
          label: dayLabel,
          "Clicks": gscCurr[i]?.clicks ?? 0,
          "Clicks (prev)": gscPrev[i]?.clicks ?? 0,
          "Impressions": gscCurr[i]?.impressions ?? 0,
          "Impressions (prev)": gscPrev[i]?.impressions ?? 0,
        });
      }
      slides.push({
        id: "gsc_daily_trend",
        type: "chart-line",
        title: "GSC Daily Trend — Clicks & Impressions",
        subtitle: `${label} vs Previous Period`,
        chartData,
        chartKeys: ["Clicks", "Clicks (prev)", "Impressions", "Impressions (prev)"],
      });
    }
  }

  if (ga4DailyTrend.status === "fulfilled" && ga4DailyTrend.value) {
    const { current: ga4Curr, previous: ga4Prev } = ga4DailyTrend.value as { current: any[]; previous: any[] };
    if (ga4Curr.length > 0) {
      const maxLen = Math.max(ga4Curr.length, ga4Prev.length);
      const chartData = [];
      for (let i = 0; i < maxLen; i++) {
        const dayLabel = `Day ${i + 1}`;
        chartData.push({
          label: dayLabel,
          "Sessions": ga4Curr[i]?.sessions ?? 0,
          "Sessions (prev)": ga4Prev[i]?.sessions ?? 0,
          "Engaged": ga4Curr[i]?.engagedSessions ?? 0,
          "Engaged (prev)": ga4Prev[i]?.engagedSessions ?? 0,
        });
      }
      slides.push({
        id: "ga4_daily_trend",
        type: "chart-line",
        title: "GA4 Organic Daily Trend — Sessions",
        subtitle: `${label} vs Previous Period`,
        chartData,
        chartKeys: ["Sessions", "Sessions (prev)", "Engaged", "Engaged (prev)"],
      });
    }
  }

  return {
    report_title: `SEO Monthly Report — ${label}`,
    client_name: client.name,
    month_label: label,
    generated_at: now.toISOString(),
    slides,
  };
}
