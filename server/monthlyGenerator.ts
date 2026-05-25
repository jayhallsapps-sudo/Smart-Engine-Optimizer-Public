import { storage } from "./storage";
import { queryGsc, handlesGscCommand, fetchGscQueryRowsForTopicClustering, fetchGscDailyTrend } from "./gscClient";
import { queryGa4, handlesGa4Command, fetchGa4DailyTrend } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { queryCtm, handlesCtmCommand } from "./ctmClient";
import { querySemrush, handlesSemrushCommand } from "./semrushClient";
import { queryAhrefs, handlesAhrefsCommand } from "./ahrefsClient";
import { fetchAirtableWorkLog, getCreditCost } from "./airtable";
import { fetchAsanaWorkLog, asanaSectionToCategory, groupAsanaTasks } from "./asanaClient";
import { clusterQueriesByTopic, topicAdmitConnection } from "./qbrPrepHelpers";
import { fetchNsmGoalsForSpecificQuarter } from "./sheetsClient";
import { scanSiteForEeat, type SiteEeatSummary } from "./pageContentClient";
import type { Slide } from "../client/src/components/report-preview/pptx-preview";
import { type GapContext } from "./gapAnswerContext";
import { narrateWorkLog, narratePriorities, type MonthlySourceFacts, NARRATION_PROMPT_VERSION } from "./reportNarration";

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
  producedBy?: string;
  quarterlyStrategyFocus?: string;
  vvobsCount?: string;
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
  sourceFacts?: MonthlySourceFacts;
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

// Combine progressFeeling + contextAnomalies + clientSentiment into a single compact commentary line.
// Returns undefined when all fields are empty.
function buildPerformanceCommentary(am: MonthlyAmInputs): string | undefined {
  const feeling = am.progressFeeling?.trim();
  const context = am.contextAnomalies?.trim();
  const sentiment = am.clientSentiment?.trim();
  if (!feeling && !context && !sentiment) return undefined;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const end = (s: string) => /[.!?]$/.test(s) ? s : `${s}.`;
  const parts: string[] = [];
  if (feeling) parts.push(end(cap(feeling)));
  if (context) parts.push(`Context: ${cap(context)}`);
  if (sentiment) parts.push(`Client sentiment: ${cap(sentiment)}`);
  return parts.join(" ");
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
    nsmResult,
    ctSummaryResult,
    airtableProductionResult,
    // ─── Phase 3d additions ─────────────────────────────────────────────
    // Ahrefs domain authority overview — feeds Slide 11 (Authority, internal
    // linking) and contributes to Slide 7 (EEAT) for trust signals.
    ahrefsOverview,
    // EEAT site scan — fetches HTML for ~20 EEAT-critical pages and extracts
    // schema, byline, credentials, FAQs, etc. Feeds Slide 7 (EEAT) and
    // Slide 12 (AI discoverability).
    // Note: gscPages may not be fulfilled yet when we kick this off, but the
    // scanner gracefully handles missing inputs and will still scan the
    // homepage + common EEAT paths. We pass an empty list if GSC fails.
    eeatScanResult,
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
    // Call tracking: route CallRail if configured; fall back to CTM
    client.callrailCompanyId && handlesCallRailCommand("callrail_qoq_organic_calls" as any)
      ? queryCallRail("callrail_qoq_organic_calls" as any, client, calMonthRange)
      : (client as any).ctmAccountId && handlesCtmCommand("ctm_qoq_organic_calls" as any)
        ? queryCtm("ctm_qoq_organic_calls" as any, client, calMonthRange)
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
    // QTD calls for Slide 4 — CallRail QTD (or CTM fallback)
    client.callrailCompanyId && handlesCallRailCommand("callrail_qoq_organic_calls" as any)
      ? queryCallRail("callrail_qoq_organic_calls" as any, client, calQtdRange)
      : (client as any).ctmAccountId && handlesCtmCommand("ctm_qoq_organic_calls" as any)
        ? queryCtm("ctm_qoq_organic_calls" as any, client, calQtdRange)
        : Promise.resolve(null),
    handlesGscCommand("gsc_query_to_page_map" as any)
      ? queryGsc("gsc_query_to_page_map" as any, client, calMonthRange)
      : Promise.resolve(null),
    fetchGscQueryRowsForTopicClustering(client, calMonthRange),
    fetchGscDailyTrend(client, calMonthRange),
    fetchGa4DailyTrend(client, calMonthRange),
    fetchNsmGoalsForSpecificQuarter(client.name, Math.ceil(input.month / 3), input.year).catch(() => null),
    // Call source breakdown — used for "Top Conversion Sources" slide
    client.callrailCompanyId && handlesCallRailCommand("callrail_summary" as any)
      ? queryCallRail("callrail_summary" as any, client, calMonthRange)
      : (client as any).ctmAccountId && handlesCtmCommand("ctm_qoq_sources" as any)
        ? queryCtm("ctm_qoq_sources" as any, client, calMonthRange)
        : Promise.resolve(null),
    // Airtable production view — in-progress audit / production items
    fetchAirtableWorkLog(client.id, "", "", "production"),
    // ─── Phase 3d additions ─────────────────────────────────────────────
    // Ahrefs domain authority overview. Returns null if the client has no
    // Ahrefs project URL configured or the Ahrefs token isn't set.
    handlesAhrefsCommand("ahrefs_backlink_overview")
      ? queryAhrefs("ahrefs_backlink_overview", client, calMonthRange).catch(() => null)
      : Promise.resolve(null),
    // EEAT site scan. Kicked off without GSC top-pages context because we
    // can't `await` gscPages here — instead the scan uses the homepage +
    // common EEAT paths + any service URLs we can derive later. If we want
    // GSC-driven page selection, that requires a second-pass scan (deferred).
    // The scan handles all errors internally and always resolves.
    scanSiteForEeat({ client }).catch((err: any) => {
      console.warn("[Monthly] EEAT scan failed:", err?.message ?? err);
      return null;
    }),
  ]);

  const slides: Slide[] = [];

  // ─── SLIDE 1: Title ───────────────────────────────────────────────
  slides.push({
    id: "title",
    type: "title",
    title: `SEO Monthly Report — ${label}`,
    clientName: client.name,
    date: fmtDate(now),
    ...(am.producedBy?.trim() ? { producedBy: am.producedBy.trim() } : {}),
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
    const callSource = client.callrailCompanyId ? "CallRail" : (client as any).ctmAccountId ? "CTM" : "Calls";
    perfMetrics.push(
      ...summary.slice(0, 1).map((s: any) => ({
        label: s.label,
        current: s.current,
        previous: s.previous,
        delta: s.deltaPercent,
        isPositive: s.isPositive,
        source: callSource,
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
            { label: "Organic Sessions", current: "—", sourceNote: "Connect GA4 to populate" },
            { label: "Conversions", current: "—", sourceNote: "Connect GA4 to populate" },
            { label: "Organic Clicks", current: "—", sourceNote: "Connect GSC to populate" },
            { label: "Organic Calls", current: "—", sourceNote: "Connect CallRail or CTM to populate" },
          ],
  });

  // ─── SLIDE 2a: SEO Strategy Focus (quarterly tactics) ───────────────────────
  // Shown when AM has filled in the quarterly strategy focus field.
  // Mirrors the "SEO Q[N] Tactics" slide in the PDF report.
  const qNum2 = Math.ceil(input.month / 3);
  const strategyBullets: string[] = [];
  if (am.quarterlyStrategyFocus?.trim()) {
    // AM-provided text: split on newlines or semicolons into bullets
    const lines = am.quarterlyStrategyFocus.trim().split(/\n|;/).map(l => l.trim()).filter(Boolean);
    strategyBullets.push(...lines);
  }
  // Always include default pillars so slide has substance even without AM input
  if (strategyBullets.length === 0) {
    strategyBullets.push(
      "Capture Demand Early — Answer symptom- and risk-based questions before users identify as needing help, building trust and topical authority early.",
      "Guide Evaluation — Create treatment-focused and geo-specific pages that help users compare levels of care, facilities, and treatment options.",
      "Convert With Clarity — Remove friction with clear insurance messaging, admissions CTAs, and credibility signals to convert VOB-ready intent."
    );
  }
  slides.push({
    id: "strategy_focus",
    type: "bullets",
    title: `Q${qNum2} SEO Strategy Focus`,
    subtitle: `${label} — Scaling with a Treatment Center-Specific SEO Funnel`,
    bullets: strategyBullets,
  });

  // ─── SLIDE 2b: Top Conversion Sources ───────────────────────────
  // Primary: CallRail source breakdown (callrail_summary → tables[0] = "Calls by Source")
  // Shows which tracking sources (Google My Business, Organic Search, etc.) generated calls.
  // VVOBs column: populated from AM input (vvobsCount) when call-level VVOB tagging is unavailable.
  const vvobTotal = parseInt(String(am.vvobsCount ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
  if (ctSummaryResult.status === "fulfilled" && ctSummaryResult.value) {
    const sourceTables = (ctSummaryResult.value as any).tables ?? [];
    if (sourceTables.length > 0 && sourceTables[0].rows?.length > 0) {
      const totalCalls = sourceTables[0].rows.reduce((sum: number, r: any[]) => {
        return sum + (parseInt(String(r[1] ?? "0").replace(/,/g, ""), 10) || 0);
      }, 0);
      const enhancedRows = sourceTables[0].rows.map((r: any[]) => {
        const cnt = parseInt(String(r[1] ?? "0").replace(/,/g, ""), 10) || 0;
        const share = totalCalls > 0 ? `${Math.round((cnt / totalCalls) * 100)}%` : "—";
        return [...r, share];
      });
      const callProviderLabel = client.callrailCompanyId ? "CallRail" : (client as any).ctmAccountId ? "CTM" : "Call Tracker";
      // Add VVOBs column (manual entry via AM input; shown as total in first data row)
      const vvobRows = enhancedRows.map((r: any[], idx: number) => [
        ...r,
        idx === 0 && vvobTotal > 0 ? String(vvobTotal) : "—",
      ]);
      slides.push({
        id: "conversion_sources",
        type: "table",
        title: "Top Conversion Sources",
        subtitle: `${label} — Calls by Tracking Source (${callProviderLabel})`,
        table: {
          headers: [...sourceTables[0].headers, "Share", "VVOBs"],
          rows: vvobRows,
        },
        ...(vvobTotal === 0 ? { sourceNote: "VVOBs: Enter total in 'VVOB Count' field above to populate" } : {}),
      });
    }
  }

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
              rows: [["—", "—", "—", "—", "—"]],
              sourceNote: "GSC connected but no rows returned for this period",
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
        rows: [["—", "—", "—", "—", "—"]],
      },
      sourceNote: "GSC not connected — connect Google Search Console to populate",
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

      const prevClusters = new Map<string, { queryCount: number; impressions: number; clicks: number }>();
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
            clicks: queries.reduce((s, q) => s + q.clicks, 0),
          });
        }
      }

      const pctDelta = (curr: number, prev: number): string => {
        if (prev === 0 && curr === 0) return "0%";
        if (prev === 0) return "+100%";
        const d = ((curr - prev) / prev) * 100;
        return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
      };

      // Generate a brief trend note per topic based on click and impression movement
      function topicNote(topic: string, currClicks: number, currImpressions: number, prev?: { queryCount: number; impressions: number; clicks: number }): string {
        if (!prev) return "New topic this period.";
        const clickDelta = currClicks - prev.clicks;
        const impDelta = currImpressions - prev.impressions;
        const clickPct = prev.clicks > 0 ? ((clickDelta / prev.clicks) * 100) : 0;
        const impPct = prev.impressions > 0 ? ((impDelta / prev.impressions) * 100) : 0;
        if (Math.abs(clickPct) < 5 && Math.abs(impPct) < 5) return "Stable MoM.";
        if (clickPct > 20) return `Strong click growth (+${clickPct.toFixed(0)}% MoM).`;
        if (clickPct < -20) return `Click decline (${clickPct.toFixed(0)}% MoM) — monitor.`;
        if (impPct > 15) return `Impression growth (+${impPct.toFixed(0)}% MoM).`;
        if (impPct < -15) return `Impression decline (${impPct.toFixed(0)}% MoM) — review.`;
        return `${clickDelta >= 0 ? "+" : ""}${clickDelta} clicks MoM.`;
      }

      const topicRows = [...clusters.entries()]
        .map(([topic, queries]) => ({
          topic,
          queryCount: queries.length,
          totalClicks: queries.reduce((s, q) => s + q.clicks, 0),
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
          t.totalClicks.toLocaleString("en-US"),
          prev ? pctDelta(t.totalClicks, prev.clicks) : "—",
          t.totalImpressions.toLocaleString("en-US"),
          prev ? pctDelta(t.totalImpressions, prev.impressions) : "—",
          topicNote(t.topic, t.totalClicks, t.totalImpressions, prev),
        ];
      });

      slides.push({
        id: "query_groups",
        type: "table",
        title: "Query Groups",
        subtitle: `${label} vs ${prevMonthLabel} — Topic-Level Aggregation`,
        table: {
          headers: ["Query Group", "# Queries", "Δ Queries", "Clicks", "Δ Clicks", "Impressions", "Δ Impressions", "Notes"],
          rows: tableRows,
        },
      });
    }
  }

  // ─── SLIDE 4: QTD Key Performance Indicators ─────────────────────
  // Primary: GA4 QTD organic sessions + conversions, CallRail QTD calls.
  // Goals from NSM Tracker (Google Sheets).
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
    ga4QtdSummary.find((s: any) => /session/i.test(s.label))?.current ?? "—";
  const qtdConversions =
    ga4QtdSummary.find((s: any) => /conver|admit|lead/i.test(s.label))?.current ?? "—";
  const qtdCalls =
    ctQtdSummary.find((s: any) => /call/i.test(s.label))?.current ?? "—";

  const qNum = Math.ceil(input.month / 3);
  const qtdLabel = `Q${qNum} ${input.year} to date`;

  const nsmGoals = nsmResult.status === "fulfilled" ? nsmResult.value : null;
  const ME = "—";

  function pctToGoal(actual: string | number, goal: string): string {
    const a = typeof actual === "number" ? actual : parseFloat(String(actual).replace(/[^0-9.-]/g, ""));
    const g = parseFloat(String(goal).replace(/[^0-9.-]/g, ""));
    if (isNaN(a) || isNaN(g) || g === 0) return ME;
    return `${Math.round((a / g) * 100)}%`;
  }

  function onTrackStatus(actual: string | number, goal: string): string {
    const a = typeof actual === "number" ? actual : parseFloat(String(actual).replace(/[^0-9.-]/g, ""));
    const g = parseFloat(String(goal).replace(/[^0-9.-]/g, ""));
    if (isNaN(a) || isNaN(g) || g === 0) return ME;
    const pct = a / g;
    if (pct >= 0.9) return "On Track";
    if (pct >= 0.7) return "Monitor";
    return "At Risk";
  }

  const sessGoal = nsmGoals?.sessionsGoal && nsmGoals.sessionsGoal !== ME ? nsmGoals.sessionsGoal : null;
  const mvpGoal = nsmGoals?.mvpGoal && nsmGoals.mvpGoal !== ME ? nsmGoals.mvpGoal : null;
  const rawMvpType = nsmGoals?.mvpType && nsmGoals.mvpType !== ME ? nsmGoals.mvpType : null;
  const mvpType = rawMvpType ?? "Calls";
  const isMvpCallBased = !rawMvpType || /call/i.test(rawMvpType);
  const mvpActual = isMvpCallBased ? qtdCalls : qtdConversions;

  qtdRows.push(
    [
      "Organic Sessions",
      qtdSessions,
      sessGoal ?? "—",
      sessGoal ? pctToGoal(qtdSessions, sessGoal) : ME,
      sessGoal ? onTrackStatus(qtdSessions, sessGoal) : ME,
    ],
    [
      "Organic Conversions / Leads",
      qtdConversions,
      "—",
      ME,
      ME,
    ],
    [
      `Qualified ${mvpType}`,
      mvpActual,
      mvpGoal ?? "—",
      mvpGoal ? pctToGoal(mvpActual, mvpGoal) : ME,
      mvpGoal ? onTrackStatus(mvpActual, mvpGoal) : ME,
    ]
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
          rows: [["—", "—", "—", "—", "—", "—", "—", "—"]],
        },
        sourceNote: "GSC connected but no page rows returned for this period",
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
              rows: [["—", "—", "—", "—"]],
            },
      ...(tables.length === 0 ? { sourceNote: "GA4 connected but no landing page rows returned" } : {}),
    });
  } else {
    slides.push({
      id: "landing_pages",
      type: "table",
      title: "Top Landing Pages",
      subtitle: `${label} — Organic Performance`,
      table: {
        headers: ["Page", "Clicks", "Δ Clicks", "Impressions", "Δ Impressions", "# Queries", "CTR", "Avg Position"],
        rows: [["—", "—", "—", "—", "—", "—", "—", "—"]],
      },
      sourceNote: "GSC not connected — connect Google Search Console to populate",
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
          rows: [["—", "—", "—", "—", "—"]],
        },
        sourceNote: "GSC connected but no page rows returned for this period",
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
        rows: [["—", "—", "—", "—", "—"]],
      },
      sourceNote: "GSC not connected — connect Google Search Console to populate",
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
      subtitle: `${label} — Position Ranges (SEMrush supplemental — 30-day rolling window; GSC is primary for clicks/impressions/CTR/position)`,
      table:
        tables.length > 0
          ? { headers: tables[0].headers, rows: tables[0].rows }
          : {
              headers: ["Position Range", "Keywords", "Share"],
              rows: [["—", "—", "—"]],
            },
      ...(tables.length === 0 ? { sourceNote: "SEMrush connected but no keyword distribution rows returned" } : {}),
    });
  } else {
    slides.push({
      id: "keywords",
      type: "table",
      title: "Keyword Visibility Distribution",
      subtitle: `${label} — Position Ranges`,
      table: {
        headers: ["Position Range", "Keywords", "Share"],
        rows: [["—", "—", "—"]],
      },
      sourceNote: "SEMrush not connected — connect SEMrush to populate keyword distribution",
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

  // ─── AI Narration: Work Log ───────────────────────────────────────
  const rawWorkItems = workLogRows.map(r => ({ area: r.area, task: r.task, url: r.notes !== "—" ? r.notes : undefined }));
  let narrationProvider: string | null = null;
  let narrationFallback = false;
  if (rawWorkItems.length > 0) {
    try {
      const narRes = await narrateWorkLog(rawWorkItems, label, "monthly");
      if (narRes.narratedRows.length === rawWorkItems.length) {
        workLogRows = workLogRows.map((r, i) => ({ ...r, task: narRes.narratedRows[i].task }));
      }
      narrationProvider = narRes.provider;
      narrationFallback = narRes.fallbackTriggered;
      console.log(`[Monthly] Work log narration: ${narRes.fallbackTriggered ? "deterministic fallback" : `AI via ${narRes.provider}`}. ${rawWorkItems.length} items processed.`);
    } catch (e: any) {
      console.warn("[Monthly] Work log narration failed:", e.message);
      narrationFallback = true;
    }
  }

  // ─── SLIDE 8b: Supporting Strategic Initiatives ──────────────────
  // Primary: Asana (tasks grouped by category/section with completion status)
  // Shows initiative area, tasks completed vs. upcoming, and pacing status.
  if (asanaData) {
    const allCategories = new Set([
      ...Object.keys(asanaCompletedByCategory),
      ...Object.keys(asanaUpcomingByCategory),
    ]);
    const initiativeRows: string[][] = [];
    for (const cat of allCategories) {
      const completed = (asanaCompletedByCategory[cat] ?? []).length;
      const upcoming = (asanaUpcomingByCategory[cat] ?? []).length;
      const status = completed > 0 && upcoming === 0 ? "Complete" : completed > 0 ? "In Progress" : "Planned";
      const taskNames = [
        ...(asanaCompletedByCategory[cat] ?? []).slice(0, 2).map(t => t.name),
        ...(asanaUpcomingByCategory[cat] ?? []).slice(0, 1).map(t => `[Next] ${t.name}`),
      ].join("; ") || "—";
      initiativeRows.push([cat, status, String(completed), String(upcoming), taskNames]);
    }
    if (initiativeRows.length > 0) {
      slides.push({
        id: "strategic_initiatives",
        type: "table",
        title: "Supporting Strategic Initiatives",
        subtitle: `${label} — Asana Work Progress by Category`,
        table: {
          headers: ["Initiative Area", "Status", "Completed", "Upcoming", "Key Tasks"],
          rows: initiativeRows,
        },
      });
    }
  }

  // ─── SLIDE 8b: Audit Progress (from Airtable production view) ────────────────
  // Shows in-progress content audit items grouped by audit level
  const auditLevelMap: Record<string, string> = {
    "Remove & Redirect": "Redirects",
    "Cannibal Review": "Redirects",
    "Content Refresh": "Low Level Rewrite",
    "New Content": "Low Level Rewrite",
    "Canonical Review": "Low Level Rewrite",
  };
  const auditLevelOrder = ["Redirects", "Low Level Rewrite", "Medium Level Rewrite", "High Level Rewrite"];
  const auditByLevel: Record<string, string[]> = {};

  if (airtableProductionResult.status === "fulfilled" && airtableProductionResult.value?.success) {
    const prodData = airtableProductionResult.value.data;
    for (const [, items] of Object.entries(prodData.byCreditType)) {
      for (const item of items as any[]) {
        const rawStatus = item.statusLabel ?? item.status ?? "";
        const level = auditLevelMap[rawStatus] ?? (item.creditType === "Scale" ? "High Level Rewrite" : "Medium Level Rewrite");
        if (!auditByLevel[level]) auditByLevel[level] = [];
        if (item.url) auditByLevel[level].push(item.url);
        else auditByLevel[level].push(item.task);
      }
    }
  }

  const hasAuditItems = Object.keys(auditByLevel).some(k => auditByLevel[k].length > 0);
  if (hasAuditItems) {
    const auditTableRows = auditLevelOrder
      .filter(level => auditByLevel[level]?.length > 0)
      .map(level => {
        const items = auditByLevel[level] ?? [];
        return [
          level,
          String(items.length),
          items.slice(0, 3).join(", "),
        ];
      });
    slides.push({
      id: "audit_progress",
      type: "table",
      title: `${label} Audit Content`,
      subtitle: `In-Progress Audit Items by Level (Airtable Production View)`,
      table: {
        headers: ["Audit Level", "# Items", "Sample Pages"],
        rows: auditTableRows,
      },
    });
  }

  // ─── SLIDE 8c: Content Credits Table ──────────────────────────────────────────
  // Shows published content items with credit type, cost, keyword, and URL.
  // Mirrors the "Content Completion" table in the PDF report.
  if (airtableResult.status === "fulfilled" && airtableResult.value?.success) {
    const aData = airtableResult.value.data;
    const creditRows: string[][] = [];
    for (const [, items] of Object.entries(aData.byCreditType)) {
      for (const item of items as any[]) {
        const creditLabel = item.creditType === "Scale" ? "New Content" : item.creditType === "Optimization" ? "Optimize" : item.creditType;
        creditRows.push([
          item.url ?? item.task,
          item.targetKeyword ?? "—",
          "—",
          item.pageType ?? (item.creditType === "Scale" ? "Blog" : "Page"),
          creditLabel,
          getCreditCost(item.creditType),
        ]);
      }
    }
    if (creditRows.length > 0) {
      slides.push({
        id: "content_credits",
        type: "table",
        title: `${label} Content Completion`,
        subtitle: `Published Content — Credit Summary`,
        table: {
          headers: ["Page", "Target Keyword", "Current Rank", "Page Type", "Credit Type", "Credit Cost"],
          rows: creditRows,
        },
        sourceNote: "Current Rank: requires GSC cross-reference — update manually or connect live rank tracking.",
      });
    }
  }

  slides.push({
    id: "work_completed",
    type: workLogRows.length > 0 ? "table" : "bullets",
    title: "Work Completed This Month",
    ...(workLogRows.length > 0
      ? {
          table: {
            headers: ["Type", "Task / Deliverable", "URL / Notes"],
            rows: workLogRows.map(r => [r.area, r.task, r.notes]),
          },
        }
      : {
          bullets: ["— No work log data available. Connect Airtable or Asana in Setup to populate."],
        }),
  });

  // ─── SLIDE 9: Next Month Priorities ──────────────────────────────
  // Phase 1: Collect raw task names from all automated sources
  const rawAsanaNextBullets: string[] = [];
  for (const [, tasks] of Object.entries(asanaUpcomingByCategory)) {
    rawAsanaNextBullets.push(...tasks.slice(0, 3).map(t => t.name));
  }

  // Phase 2: Data-driven fallbacks when Asana data is thin
  const dataDrivenFallbacks: string[] = [];
  if (rawAsanaNextBullets.length < 3) {
    if (
      gscQueries.status === "fulfilled" &&
      gscQueries.value &&
      (gscQueries.value as any).summary?.some((s: any) => !s.isPositive)
    ) {
      dataDrivenFallbacks.push("Investigate declining query positions and refresh underperforming pages.");
    }
    if (
      ga4Funnel.status === "fulfilled" &&
      ga4Funnel.value &&
      (ga4Funnel.value as any).summary?.find((s: any) => /cvr|conversion/i.test(s.label) && !s.isPositive)
    ) {
      dataDrivenFallbacks.push("Review conversion rate drop on key landing pages and test CTA improvements.");
    }
    if (input.currentCrawlAssetId) {
      dataDrivenFallbacks.push("Review current crawl findings for technical issues and address top-priority items.");
    }
    if (input.comparisonCrawlAssetId) {
      dataDrivenFallbacks.push("Compare current vs. prior crawl to track technical remediation progress.");
    }
  }

  const rawNextMonth = [...rawAsanaNextBullets, ...dataDrivenFallbacks];

  // Phase 3: AI narration for asana-sourced bullets (not AM inputs, not data-driven)
  let narratedNextBullets = rawAsanaNextBullets;
  if (rawAsanaNextBullets.length > 0) {
    try {
      const nextNarRes = await narratePriorities(rawAsanaNextBullets, label, "monthly_next");
      if (nextNarRes.bullets.length > 0) narratedNextBullets = nextNarRes.bullets;
      if (!narrationProvider) narrationProvider = nextNarRes.provider;
      if (nextNarRes.fallbackTriggered) narrationFallback = true;
      console.log(`[Monthly] Next-month priority narration: ${nextNarRes.fallbackTriggered ? "deterministic fallback" : `AI via ${nextNarRes.provider}`}. ${rawAsanaNextBullets.length} bullets.`);
    } catch (e: any) {
      console.warn("[Monthly] Priority narration failed:", e.message);
      narrationFallback = true;
    }
  }

  // Phase 4: Assemble final bullets list
  const nextMonthBullets: string[] = [];

  // AM focus first
  if (am.focusNextMonth) nextMonthBullets.unshift(am.focusNextMonth);

  // Narrated Asana bullets
  nextMonthBullets.push(...narratedNextBullets);

  // Data-driven fallbacks (already clean copy)
  nextMonthBullets.push(...dataDrivenFallbacks);

  // Hard fallback if still empty
  if (nextMonthBullets.length === 0) {
    nextMonthBullets.push(
      "Publish next scheduled content pieces per the content calendar.",
      "Resolve technical SEO issues identified in the most recent crawl.",
      "Monitor keyword ranking changes and adjust on-page optimization as needed.",
      "Review QTD KPI progress ahead of the next planning cycle."
    );
  }

  // AM override annotations (appended last, not narrated)
  if (am.priorityChecks?.trim()) {
    const note = am.priorityChecks.trim();
    const capStr = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const endStr = (s: string) => /[.!?]$/.test(s) ? s : `${s}.`;
    nextMonthBullets.push(`Technical note: ${endStr(capStr(note))}`);
  }
  if (am.leadershipNote) nextMonthBullets.push(`Leadership note: ${am.leadershipNote}`);
  if (am.amThoughts?.trim()) nextMonthBullets.push(`Strategic focus: ${am.amThoughts}`);
  if (am.clientNotes?.trim()) nextMonthBullets.push(`Client notes: ${am.clientNotes.trim()}`);

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

  // AM Inputs standalone slide removed — context is now distributed into relevant slides:
  //   clientSentiment → Monthly Performance Overview commentary
  //   priorityChecks  → Next Month Priorities ("Technical note")
  //   amThoughts      → Next Month Priorities ("Strategic focus")
  //   clientNotes     → Next Month Priorities ("Client notes")

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

  const sourceFacts: MonthlySourceFacts = {
    windowLabel: label,
    aiNarrationUsed: rawWorkItems.length > 0 || rawAsanaNextBullets.length > 0,
    aiNarrationProvider: narrationProvider,
    fallbackTriggered: narrationFallback,
    promptVersion: NARRATION_PROMPT_VERSION,
    generatedAt: now.toISOString(),
    airtableRecords: airtableResult.status === "fulfilled" && airtableResult.value?.success
      ? Object.values((airtableResult.value as any).data?.byCreditType ?? {}).reduce((s: number, v: any) => s + (Array.isArray(v) ? v.length : 0), 0)
      : 0,
    asanaCompleted: asanaData
      ? Object.values(asanaCompletedByCategory).reduce((s, v) => s + v.length, 0)
      : 0,
    asanaUpcoming: asanaData
      ? Object.values(asanaUpcomingByCategory).reduce((s, v) => s + v.length, 0)
      : 0,
    hasGsc: gscQueries.status === "fulfilled" && !!gscQueries.value,
    hasGa4: ga4Funnel.status === "fulfilled" && !!ga4Funnel.value,
    rawWorkLogItems: rawWorkItems,
    rawNextPriorityItems: rawNextMonth,
  };

  return {
    report_title: `SEO Monthly Report — ${label}`,
    client_name: client.name,
    month_label: label,
    generated_at: now.toISOString(),
    slides,
    sourceFacts,
  };
}
