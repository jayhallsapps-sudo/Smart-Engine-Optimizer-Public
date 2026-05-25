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

  // ─── Phase 3d Step 2b — 14-slide emission ──────────────────────────────
  // Emits the locked 14-slide spec (CLAUDE.md). Every slide ALWAYS renders;
  // missing data sources become empty states. AI commentary (headline,
  // narrative, key moves, per-slide interpretations) is wired in Phase 3f.

  // Unwrap PromiseSettledResults into typed locals.
  const val = <T,>(p: PromiseSettledResult<T>): T | null =>
    p.status === "fulfilled" ? (p.value as T) : null;
  const gscQ = val(gscQueries) as any;
  const gscP = val(gscPages) as any;
  const ga4F = val(ga4Funnel) as any;
  const ga4L = val(ga4Landing) as any;
  const ct = val(ctResult) as any;
  const sem = val(semResult) as any;
  const airtable = val(airtableResult) as any;
  const asana = val(asanaResult) as any;
  const ga4FQtd = val(ga4FunnelQtd) as any;
  const ctQtd = val(ctResultQtd) as any;
  const gscQpm = val(gscQueryPageMap) as any;
  const gscTopic = val(gscTopicClusterData) as { currentRows: any[]; previousRows: any[] } | null;
  const gscDaily = val(gscDailyTrend) as any;
  const ga4Daily = val(ga4DailyTrend) as any;
  const nsm = val(nsmResult) as any;
  const ctSum = val(ctSummaryResult) as any;
  const airtableProd = val(airtableProductionResult) as any;
  const ahrefs = val(ahrefsOverview) as any;
  const eeat = val(eeatScanResult) as SiteEeatSummary | null;

  const prevMonthName = new Date(input.year, input.month - 2, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const nextMonthName = new Date(input.year, input.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const quarter = Math.ceil(input.month / 3);
  const monthsIntoQuarter = ((input.month - 1) % 3) + 1;

  const slides: Slide[] = [];

  // ─── SLIDE 1: Cover ───────────────────────────────────────────────
  slides.push({
    id: "cover",
    type: "title",
    title: `SEO Monthly Report — ${label}`,
    clientName: client.name,
    date: fmtDate(now),
    ...(am.producedBy?.trim() ? { producedBy: am.producedBy.trim() } : {}),
  });

  // ─── SLIDE 2: Headline & executive summary ────────────────────────
  // Phase 3f wires AI synthesis here. Step 2b emits placeholder copy so
  // the slide always renders with the right shape.
  slides.push({
    id: "exec",
    type: "exec_summary",
    title: "Headline & executive summary",
    subtitle: label,
    headline: "Headline pending AI synthesis.",
    narrative: "Executive narrative pending — Phase 3f synthesizes outcomes, visibility, and trust signals into a single read.",
    keyMoves: [
      "Key move 1 pending AI synthesis.",
      "Key move 2 pending AI synthesis.",
      "Key move 3 pending AI synthesis.",
    ],
  });

  // ─── SLIDE 3: Business outcomes + QTD goal pacing ─────────────────
  const outcomesMetrics: NonNullable<Slide["metrics"]> = [];
  if (ga4F?.summary) {
    for (const s of (ga4F.summary as any[]).slice(0, 2)) {
      outcomesMetrics.push({
        label: s.label,
        current: s.current,
        previous: s.previous,
        delta: s.deltaPercent,
        isPositive: s.isPositive,
        source: "GA4",
      });
    }
  }
  if (ct?.summary) {
    const callSrc = client.callrailCompanyId ? "CallRail" : (client as any).ctmAccountId ? "CTM" : "Calls";
    for (const s of (ct.summary as any[]).slice(0, 1)) {
      outcomesMetrics.push({
        label: s.label,
        current: s.current,
        previous: s.previous,
        delta: s.deltaPercent,
        isPositive: s.isPositive,
        source: callSrc,
      });
    }
  }
  if (outcomesMetrics.length === 0) {
    outcomesMetrics.push(
      { label: "Organic Sessions", current: "—", sourceNote: "Connect GA4 to populate" },
      { label: "Conversions", current: "—", sourceNote: "Connect GA4 to populate" },
      { label: "Organic Calls", current: "—", sourceNote: "Connect CallRail or CTM to populate" },
    );
  }

  // QTD goal pacing from NSM Tracker sheet.
  // monthsIntoQuarter / 3 = the share of the quarter we should have hit by now.
  // pacingPercent = (actual − expected) / expected × 100.
  const pacingBadges: NonNullable<Slide["pacingBadges"]> = [];
  if (nsm) {
    const computeBadge = (
      badgeLabel: string,
      actualRaw: any,
      goalRaw: any,
    ): NonNullable<Slide["pacingBadges"]>[number] => {
      const actual = parseFloat(String(actualRaw ?? "").replace(/[^0-9.-]/g, ""));
      const goal = parseFloat(String(goalRaw ?? "").replace(/[^0-9.-]/g, ""));
      if (isNaN(actual) || isNaN(goal) || goal <= 0) {
        return {
          label: badgeLabel,
          current: actualRaw && actualRaw !== "—" ? String(actualRaw) : "—",
          goal: goalRaw && goalRaw !== "—" ? String(goalRaw) : "—",
          status: "—",
          pacingPercent: "—",
        };
      }
      const expectedByNow = goal * (monthsIntoQuarter / 3);
      const pacingPercent = ((actual - expectedByNow) / expectedByNow) * 100;
      const status = pacingPercent >= 10 ? "Ahead" : pacingPercent >= -10 ? "On Pace" : "At Risk";
      return {
        label: badgeLabel,
        current: String(actualRaw),
        goal: String(goalRaw),
        status,
        pacingPercent: `${pacingPercent >= 0 ? "+" : ""}${pacingPercent.toFixed(0)}%`,
      };
    };

    const qtdSessActual = (ga4FQtd?.summary as any[] | undefined)?.find(s => /session/i.test(s.label))?.current;
    const qtdConvActual = (ga4FQtd?.summary as any[] | undefined)?.find(s => /conver|admit|lead/i.test(s.label))?.current;
    const qtdCallActual = (ctQtd?.summary as any[] | undefined)?.find(s => /call/i.test(s.label))?.current;

    if (nsm.sessionsGoal && nsm.sessionsGoal !== "—") {
      pacingBadges.push(computeBadge(`Organic Sessions Q${quarter}TD`, qtdSessActual, nsm.sessionsGoal));
    }
    if (nsm.mvpGoal && nsm.mvpGoal !== "—") {
      const isCallBased = !nsm.mvpType || nsm.mvpType === "—" || /call/i.test(String(nsm.mvpType));
      const mvpActual = isCallBased ? qtdCallActual : qtdConvActual;
      const mvpLabel = nsm.mvpType && nsm.mvpType !== "—" ? `Qualified ${nsm.mvpType} Q${quarter}TD` : `Qualified MVP Q${quarter}TD`;
      pacingBadges.push(computeBadge(mvpLabel, mvpActual, nsm.mvpGoal));
    }
  }

  // Outcomes by source — CallRail/CTM summary surfaces calls split across
  // Google My Business, Organic Search, Direct, etc.
  let outcomesTable: Slide["table"] | undefined;
  if (ctSum?.tables?.length > 0 && ctSum.tables[0].rows?.length > 0) {
    outcomesTable = { headers: ctSum.tables[0].headers, rows: ctSum.tables[0].rows };
  }

  const outcomesHasData = outcomesMetrics.some(m => m.current !== "—") || pacingBadges.length > 0 || !!outcomesTable;
  slides.push({
    id: "outcomes",
    type: "outcomes",
    title: "Business outcomes",
    subtitle: `${label} — Q${quarter} ${input.year}`,
    metrics: outcomesMetrics,
    ...(pacingBadges.length > 0 ? { pacingBadges } : {}),
    ...(outcomesTable ? { table: outcomesTable } : {}),
    commentary: outcomesHasData
      ? "Outcomes-and-pacing interpretation pending — Phase 3f synthesizes commentary."
      : "Conversion tracking + NSM goals not yet connected. Once linked, business outcomes and goal pacing will populate.",
  });

  // ─── SLIDE 4: Organic visibility & discoverability ────────────────
  const visibilityMetrics: NonNullable<Slide["metrics"]> = [];
  if (gscQ?.summary) {
    for (const s of (gscQ.summary as any[]).slice(0, 2)) {
      visibilityMetrics.push({
        label: s.label,
        current: s.current,
        previous: s.previous,
        delta: s.deltaPercent,
        isPositive: s.isPositive,
        source: "GSC",
      });
    }
  }
  if (ahrefs?.summary) {
    const drRow = (ahrefs.summary as any[]).find(s => /domain rating/i.test(s.label));
    const kwRow = (ahrefs.summary as any[]).find(s => /organic keywords/i.test(s.label));
    if (drRow) visibilityMetrics.push({ label: "Domain Rating", current: drRow.current, source: "Ahrefs" });
    if (kwRow) visibilityMetrics.push({ label: "Organic Keywords", current: kwRow.current, source: "Ahrefs" });
  }
  if (visibilityMetrics.length === 0) {
    visibilityMetrics.push(
      { label: "Organic Clicks", current: "—", sourceNote: "GSC not connected" },
      { label: "Organic Impressions", current: "—", sourceNote: "GSC not connected" },
      { label: "Domain Rating", current: "—", sourceNote: "Ahrefs not connected" },
      { label: "Organic Keywords", current: "—", sourceNote: "Ahrefs not connected" },
    );
  }

  let visibilityTable: Slide["table"] | undefined;
  if (gscTopic && gscTopic.currentRows.length > 0) {
    const currQs = gscTopic.currentRows.map(r => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
    const clusters = clusterQueriesByTopic(currQs, client);
    const ordered = [...clusters.entries()]
      .map(([topic, queries]) => ({
        topic,
        queryCount: queries.length,
        impressions: queries.reduce((s, q) => s + q.impressions, 0),
        clicks: queries.reduce((s, q) => s + q.clicks, 0),
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 8);
    visibilityTable = {
      headers: ["Cluster", "# Queries", "Impressions", "Clicks"],
      rows: ordered.map(t => [
        t.topic,
        String(t.queryCount),
        t.impressions.toLocaleString("en-US"),
        t.clicks.toLocaleString("en-US"),
      ]),
    };
  }

  const visibilityHasData = visibilityMetrics.some(m => m.current !== "—") || !!visibilityTable;
  slides.push({
    id: "visibility",
    type: "visibility",
    title: "Organic visibility & discoverability",
    subtitle: label,
    metrics: visibilityMetrics,
    ...(visibilityTable ? { table: visibilityTable } : {}),
    commentary: visibilityHasData
      ? "Visibility-vs-clicks interpretation pending — Phase 3f synthesizes commentary."
      : "GSC + Ahrefs not connected. Once linked, visibility data will populate.",
  });

  // ─── SLIDE 5: Keyword & intent movement ───────────────────────────
  // Cluster-level table: # queries, Δ queries, clicks, Δ clicks per topic
  // cluster, with intent classification via topicAdmitConnection.
  let kwTable: Slide["table"];
  if (gscTopic && gscTopic.currentRows.length > 0) {
    const toQs = (rows: any[]) => rows.map(r => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
    const currClusters = clusterQueriesByTopic(toQs(gscTopic.currentRows), client);
    const prevClusters = clusterQueriesByTopic(toQs(gscTopic.previousRows ?? []), client);
    const pctDelta = (curr: number, prev: number) => {
      if (prev === 0 && curr === 0) return "0%";
      if (prev === 0) return "+100%";
      const d = ((curr - prev) / prev) * 100;
      return `${d >= 0 ? "+" : ""}${d.toFixed(0)}%`;
    };
    const rows: (string | number)[][] = [...currClusters.entries()]
      .map(([topic, qs]) => {
        const prevQs = prevClusters.get(topic) ?? [];
        const currClicks = qs.reduce((s, q) => s + q.clicks, 0);
        const prevClicks = prevQs.reduce((s, q) => s + q.clicks, 0);
        return {
          topic,
          intent: topicAdmitConnection(topic),
          queries: qs.length,
          deltaQueries: pctDelta(qs.length, prevQs.length),
          clicks: currClicks,
          deltaClicks: pctDelta(currClicks, prevClicks),
        };
      })
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 12)
      .map(t => [
        t.topic,
        t.intent,
        String(t.queries),
        t.deltaQueries,
        t.clicks.toLocaleString("en-US"),
        t.deltaClicks,
        "Cluster note pending AI synthesis.",
      ]);
    kwTable = { headers: ["Cluster", "Intent", "# Queries", "Δ Queries", "Clicks", "Δ Clicks", "Notes"], rows };
  } else {
    kwTable = {
      headers: ["Cluster", "Intent", "# Queries", "Δ Queries", "Clicks", "Δ Clicks", "Notes"],
      rows: [["—", "—", "—", "—", "—", "—", "GSC not connected"]],
    };
  }

  slides.push({
    id: "keywords",
    type: "keyword_table",
    title: "Keyword & intent movement",
    subtitle: `${label} vs ${prevMonthName}`,
    table: kwTable,
    commentary: "Cluster-level notes pending — Phase 3f synthesizes per-cluster commentary.",
  });

  // ─── SLIDE 6: Search intent alignment ─────────────────────────────
  // Phase 3f will do real intent classification + misalignment detection.
  // Step 2b surfaces high-volume query-to-page pairs as candidates so the
  // structure is in place; recommendation copy is placeholder.
  const intentFindings: NonNullable<Slide["intentFindings"]> = [];
  if (gscQpm?.tables?.[0]?.rows?.length > 0) {
    const rows = gscQpm.tables[0].rows as any[][];
    for (const r of rows.slice(0, 5)) {
      const query = String(r[0] ?? "");
      const url = String(r[1] ?? "");
      if (!url) continue;
      intentFindings.push({
        url,
        expected: "Pending AI classification",
        observed: query,
        recommendation: "Misalignment review pending — Phase 3f flags + recommends fixes.",
      });
    }
  }

  slides.push({
    id: "intent",
    type: "intent_alignment",
    title: "Search intent alignment",
    subtitle: label,
    intentFindings,
    commentary: intentFindings.length === 0
      ? "No major intent misalignments detected (or GSC query-to-page map not connected)."
      : "Intent alignment findings pending — Phase 3f synthesizes recommendations.",
  });

  // ─── SLIDE 7: Content quality, trust & E-E-A-T ────────────────────
  // Structural signals from the page HTML scan (pageContentClient) get
  // surfaced as stat cards + a gap table. Behavioral + link signals join
  // in Phase 3f via AI synthesis.
  const eeatMetrics: NonNullable<Slide["metrics"]> = [];
  if (eeat) {
    const total = Math.max(eeat.totalPagesScanned, 1);
    eeatMetrics.push(
      { label: "Pages with author schema", current: `${eeat.pagesWithAuthorSchema}/${total}`, source: "EEAT scan" },
      { label: "Pages with reviewer markup", current: `${eeat.pagesWithReviewerInfo}/${total}`, source: "EEAT scan" },
      { label: "Pages with FAQs", current: `${eeat.pagesWithFaqs}/${total}`, source: "EEAT scan" },
      { label: "Pages with last-reviewed dates", current: `${eeat.pagesWithLastReviewed}/${total}`, source: "EEAT scan" },
    );
  } else {
    eeatMetrics.push(
      { label: "Pages with author schema", current: "—", sourceNote: "EEAT scan unavailable" },
      { label: "Pages with reviewer markup", current: "—", sourceNote: "EEAT scan unavailable" },
      { label: "Pages with FAQs", current: "—", sourceNote: "EEAT scan unavailable" },
      { label: "Branded click share", current: "—", sourceNote: "Computed in Phase 3f" },
    );
  }

  let eeatTable: Slide["table"] | undefined;
  if (eeat?.topGapsByCategory && eeat.topGapsByCategory.length > 0) {
    eeatTable = {
      headers: ["Gap category", "Pages affected", "Sample URLs"],
      rows: eeat.topGapsByCategory.slice(0, 6).map(g => [
        g.category,
        String(g.pagesAffected),
        g.sampleUrls.slice(0, 3).join(", ") || "—",
      ]),
    };
  }

  slides.push({
    id: "eeat",
    type: "stat_grid",
    title: "Content quality & E-E-A-T",
    subtitle: label,
    metrics: eeatMetrics,
    ...(eeatTable ? { table: eeatTable } : {}),
    commentary: eeat
      ? "E-E-A-T posture summary pending — Phase 3f synthesizes per-dimension assessment + top 3 priorities."
      : "EEAT scan requires GSC + page HTML fetch. Connect GSC and ensure the client domain is reachable to populate.",
  });

  // ─── SLIDE 8: Technical SEO health ────────────────────────────────
  // GSC Index Coverage + Crawl Stats not yet wired through the GSC client.
  // Shell-page detection from the EEAT scanner is a useful proxy for
  // JS-rendered content risk in the meantime.
  const techMetrics: NonNullable<Slide["metrics"]> = [
    { label: "Indexed pages", current: "—", sourceNote: "Connect GSC Index Coverage to populate" },
    { label: "Pages with errors", current: "—", sourceNote: "Connect GSC Index Coverage to populate" },
    { label: "Crawl issues", current: "—", sourceNote: "Connect GSC Crawl Stats to populate" },
  ];
  if (eeat) {
    techMetrics.push({
      label: "Shell pages detected",
      current: String(eeat.shellPagesDetected),
      source: "EEAT scan",
    });
  }
  slides.push({
    id: "technical",
    type: "stat_grid",
    title: "Technical SEO health",
    subtitle: label,
    metrics: techMetrics,
    commentary: "Technical SEO assessment pending — Phase 3f flags top issues.",
  });

  // ─── SLIDE 9: Page speed & Core Web Vitals ────────────────────────
  // PageSpeed Insights API not yet wired. Empty state is acceptable.
  slides.push({
    id: "speed",
    type: "stat_grid",
    title: "Page speed & Core Web Vitals",
    subtitle: label,
    metrics: [
      { label: "LCP (avg)", current: "—", sourceNote: "PageSpeed Insights not connected" },
      { label: "INP (avg)", current: "—", sourceNote: "PageSpeed Insights not connected" },
      { label: "CLS (avg)", current: "—", sourceNote: "PageSpeed Insights not connected" },
    ],
    commentary: "Page speed monitoring not connected. Once linked, CWV trend will populate.",
  });

  // ─── SLIDE 10: CRO & user experience ──────────────────────────────
  const croMetrics: NonNullable<Slide["metrics"]> = [];
  if (ga4F?.summary) {
    const cvr = (ga4F.summary as any[]).find(s => /cvr|conversion\s*rate/i.test(s.label));
    const eng = (ga4F.summary as any[]).find(s => /engage/i.test(s.label));
    if (cvr) croMetrics.push({
      label: cvr.label,
      current: cvr.current,
      previous: cvr.previous,
      delta: cvr.deltaPercent,
      isPositive: cvr.isPositive,
      source: "GA4",
    });
    if (eng) croMetrics.push({
      label: eng.label,
      current: eng.current,
      previous: eng.previous,
      delta: eng.deltaPercent,
      isPositive: eng.isPositive,
      source: "GA4",
    });
  }
  if (croMetrics.length === 0) {
    croMetrics.push(
      { label: "Conversion rate", current: "—", sourceNote: "GA4 conversion events not configured" },
      { label: "Engagement rate", current: "—", sourceNote: "GA4 conversion events not configured" },
      { label: "Avg engagement time", current: "—", sourceNote: "GA4 conversion events not configured" },
    );
  }
  let croTable: Slide["table"] | undefined;
  if (ga4L?.tables?.[0]?.rows?.length > 0) {
    croTable = { headers: ga4L.tables[0].headers, rows: ga4L.tables[0].rows };
  }
  slides.push({
    id: "cro",
    type: "stat_grid",
    title: "CRO & user experience",
    subtitle: label,
    metrics: croMetrics,
    ...(croTable ? { table: croTable } : {}),
    commentary: "High-traffic-low-conversion pages pending — Phase 3f surfaces specific CRO opportunities.",
  });

  // ─── SLIDE 11: Authority, internal linking & site structure ───────
  const authMetrics: NonNullable<Slide["metrics"]> = [];
  if (ahrefs?.summary) {
    for (const s of ahrefs.summary as any[]) {
      authMetrics.push({ label: s.label, current: s.current, source: "Ahrefs" });
    }
  } else {
    authMetrics.push(
      { label: "Domain Rating", current: "—", sourceNote: "Ahrefs not connected" },
      { label: "Referring Domains", current: "—", sourceNote: "Ahrefs not connected" },
      { label: "Backlinks", current: "—", sourceNote: "Ahrefs not connected" },
    );
  }
  slides.push({
    id: "authority",
    type: "stat_grid",
    title: "Authority & internal linking",
    subtitle: label,
    metrics: authMetrics,
    commentary: ahrefs
      ? "Authority commentary pending — Phase 3f highlights link velocity + structural opportunities."
      : "Ahrefs not connected — connect Ahrefs in client settings to populate authority signals.",
  });

  // ─── SLIDE 12: AI discoverability ─────────────────────────────────
  const aiMetrics: NonNullable<Slide["metrics"]> = [];
  if (eeat) {
    const total = Math.max(eeat.totalPagesScanned, 1);
    const pagesWithSchema = eeat.pages.filter(p => p.schemaBlockCount > 0).length;
    const totalSchemaBlocks = eeat.pages.reduce((s, p) => s + p.schemaBlockCount, 0);
    aiMetrics.push(
      { label: "Pages with structured data", current: `${pagesWithSchema}/${total}`, source: "EEAT scan" },
      { label: "Total schema blocks", current: String(totalSchemaBlocks), source: "EEAT scan" },
      { label: "Pages with FAQ schema", current: `${eeat.pagesWithFaqs}/${total}`, source: "EEAT scan" },
    );
  } else {
    aiMetrics.push(
      { label: "Pages with structured data", current: "—", sourceNote: "EEAT scan unavailable" },
      { label: "Total schema blocks", current: "—", sourceNote: "EEAT scan unavailable" },
      { label: "GBP completeness", current: "—", sourceNote: "GBP not connected" },
    );
  }
  slides.push({
    id: "ai_discoverability",
    type: "stat_grid",
    title: "AI discoverability",
    subtitle: label,
    metrics: aiMetrics,
    commentary: eeat
      ? "AI discoverability assessment pending — Phase 3f synthesizes entity coverage + structured data improvements."
      : "AI discoverability assessment pending — EEAT scan + GBP connection required.",
  });

  // ─── SLIDE 13: Next month's content pipeline ──────────────────────
  // Production view = items currently scheduled / in progress. Each row
  // becomes a planned-content entry with credit cost, URL, and reasoning.
  const pipelineRows: (string | number)[][] = [];
  if (airtableProd?.success) {
    for (const items of Object.values(airtableProd.data.byCreditType) as any[]) {
      for (const item of items) {
        pipelineRows.push([
          item.targetKeyword ?? "—",
          getCreditCost(item.creditType),
          item.url ?? "—",
          item.task && item.task !== item.targetKeyword
            ? item.task
            : "Reasoning pending AI synthesis.",
        ]);
      }
    }
  }
  slides.push({
    id: "content_pipeline",
    type: "content_pipeline",
    title: `${nextMonthName} content pipeline`,
    subtitle: "Scheduled in Airtable Production",
    table: {
      headers: ["Target Keyword", "Credit Cost", "URL", "Reasoning"],
      rows: pipelineRows.length > 0
        ? pipelineRows
        : [["—", "—", "—", "No content scheduled in Airtable Production view for next month."]],
    },
  });

  // ─── SLIDE 14: Strategic initiatives & next month priorities ──────
  // Two-panel slide: left = this-month category status table from Asana;
  // right = bullets combining AM priorities + Asana upcoming + AM notes.
  const asanaData = asana && asana.success ? asana : null;
  const completedByCategory = asanaData ? groupAsanaTasks(asanaData.completed) : {};
  const upcomingByCategory = asanaData ? groupAsanaTasks(asanaData.upcoming) : {};
  const allCategories = new Set([
    ...Object.keys(completedByCategory),
    ...Object.keys(upcomingByCategory),
  ]);
  const thisMonthRows: (string | number)[][] = [];
  for (const cat of allCategories) {
    const done = (completedByCategory[cat] ?? []).length;
    const upcoming = (upcomingByCategory[cat] ?? []).length;
    const status = done > 0 && upcoming === 0 ? "Complete" : done > 0 ? "In Progress" : "Planned";
    thisMonthRows.push([cat, status, String(done)]);
  }
  if (thisMonthRows.length === 0 && airtable?.success) {
    const totalPublished = Object.values(airtable.data?.byCreditType ?? {})
      .reduce((s: number, v: any) => s + (Array.isArray(v) ? v.length : 0), 0);
    if (totalPublished > 0) {
      thisMonthRows.push(["Published content", "Complete", String(totalPublished)]);
    }
  }

  const nextMonthBullets: string[] = [];
  if (am.focusNextMonth?.trim()) nextMonthBullets.push(am.focusNextMonth.trim());
  for (const tasks of Object.values(upcomingByCategory)) {
    nextMonthBullets.push(...tasks.slice(0, 2).map(t => t.name));
  }
  if (am.priorityChecks?.trim()) nextMonthBullets.push(`Technical note: ${am.priorityChecks.trim()}`);
  if (am.leadershipNote?.trim()) nextMonthBullets.push(`Leadership note: ${am.leadershipNote.trim()}`);
  if (am.amThoughts?.trim()) nextMonthBullets.push(`Strategic focus: ${am.amThoughts.trim()}`);
  if (am.clientNotes?.trim()) nextMonthBullets.push(`Client notes: ${am.clientNotes.trim()}`);
  if (nextMonthBullets.length === 0) {
    nextMonthBullets.push("Add priorities in the AM input form, or connect Asana to surface upcoming tasks.");
  }

  slides.push({
    id: "initiatives_priorities",
    type: "initiatives",
    title: "Strategic initiatives & next month priorities",
    subtitle: `${label} → ${nextMonthName}`,
    table: thisMonthRows.length > 0
      ? { headers: ["Category", "Status", "Completed"], rows: thisMonthRows }
      : { headers: ["Category", "Status", "Completed"], rows: [["—", "—", "Connect Asana in client settings to populate"]] },
    bullets: nextMonthBullets.slice(0, 8),
    commentary: "Priorities rationale pending — Phase 3f drafts per-bullet rationale.",
  });

  // ─── sourceFacts — for narration / audit trail ─────────────────────
  // Phase 3f will consume rawWorkLogItems + rawNextPriorityItems when it
  // wires AI commentary. Step 2b emits the data shape without running
  // narration so the slides ship with placeholder copy.
  const rawWorkLogItems: Array<{ area: string; task: string; url?: string }> = [];
  if (airtable?.success) {
    for (const [creditType, items] of Object.entries(airtable.data.byCreditType) as [string, any[]][]) {
      for (const item of items) {
        rawWorkLogItems.push({ area: creditType, task: item.task, url: item.url });
      }
    }
  }
  if (asanaData) {
    for (const t of asanaData.completed as any[]) {
      const { category } = asanaSectionToCategory(t.section);
      rawWorkLogItems.push({ area: category, task: t.name });
    }
  }

  const rawNextPriorityItems: string[] = [];
  for (const tasks of Object.values(upcomingByCategory)) {
    rawNextPriorityItems.push(...tasks.map(t => t.name));
  }

  const sourceFacts: MonthlySourceFacts = {
    windowLabel: label,
    aiNarrationUsed: false,
    aiNarrationProvider: null,
    fallbackTriggered: false,
    promptVersion: NARRATION_PROMPT_VERSION,
    generatedAt: now.toISOString(),
    airtableRecords: airtable?.success
      ? Object.values(airtable.data?.byCreditType ?? {}).reduce((s: number, v: any) => s + (Array.isArray(v) ? v.length : 0), 0)
      : 0,
    asanaCompleted: asanaData
      ? Object.values(completedByCategory).reduce((s, v) => s + v.length, 0)
      : 0,
    asanaUpcoming: asanaData
      ? Object.values(upcomingByCategory).reduce((s, v) => s + v.length, 0)
      : 0,
    hasGsc: !!gscQ,
    hasGa4: !!ga4F,
    rawWorkLogItems,
    rawNextPriorityItems,
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
