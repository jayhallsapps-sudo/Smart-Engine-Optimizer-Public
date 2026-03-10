import { storage } from "./storage";
import { queryGsc, handlesGscCommand } from "./gscClient";
import { queryGa4, handlesGa4Command } from "./ga4Client";
import { queryCallRail, handlesCallRailCommand } from "./callrailClient";
import { querySemrush, handlesSemrushCommand } from "./semrushClient";
import { fetchAirtableWorkLog } from "./airtable";
import { fetchAsanaWorkLog, groupAsanaTasks } from "./asanaClient";
import { fetchQssbData } from "./qssbClient";
import { fetchStrategyBank } from "./notionClient";
import type { Slide } from "../client/src/components/report-preview/pptx-preview";
import { type GapContext } from "./gapAnswerContext";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QbrAmInputs {
  clientSentiment?: string;
  amThoughts?: string;
  priorityChecks?: string;
  clientNotes?: string;
  quarterFeeling?: string;
  hypothesis?: string;
  auditNotes?: string;
  contextAnomalies?: string;
  leadershipNote?: string;
  focusNextQuarter?: string;
  competitorObservations?: string;
  trackingNotes?: string;
}

function normalizeQbrAmInputs(raw: QbrAmInputs): QbrAmInputs {
  return {
    ...raw,
    amThoughts: raw.amThoughts || raw.hypothesis || "",
    priorityChecks: raw.priorityChecks || raw.auditNotes || "",
  };
}

export interface QbrFullReportJson {
  report_title: string;
  client_name: string;
  quarter_label: string;
  quarter: number;
  year: number;
  generated_at: string;
  slides: Slide[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MNE = "Manual entry needed";

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function end(s: string) { return /[.!?]$/.test(s.trim()) ? s : `${s}.`; }
function norm(s: string | undefined) { if (!s?.trim()) return undefined; return end(cap(s.trim())); }

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtIso(d: Date) { return d.toISOString().slice(0, 10); }

function quarterDates(quarter: number, year: number) {
  const qStartMonth = (quarter - 1) * 3;
  const qStart = new Date(year, qStartMonth, 1);
  const qEnd = new Date(year, qStartMonth + 3, 0);
  const prevQStartMonthRaw = qStartMonth - 3;
  const prevQYear = prevQStartMonthRaw < 0 ? year - 1 : year;
  const prevQStartMonth = prevQStartMonthRaw < 0 ? prevQStartMonthRaw + 12 : prevQStartMonthRaw;
  const prevQStart = new Date(prevQYear, prevQStartMonth, 1);
  const prevQEnd = new Date(qStart.getTime() - 86400000);
  const qLabel = `Q${quarter} ${year}`;
  const prevQLabel = `Q${prevQStartMonth / 3 + 1} ${prevQYear}`;
  return { qStart, qEnd, prevQStart, prevQEnd, qLabel, prevQLabel, qStartMonth, prevQYear, prevQStartMonth };
}

function quarterMonthNames(quarter: number, year: number) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const start = (quarter - 1) * 3;
  return `${months[start]}–${months[start + 2]} ${year}`;
}

function extractSummary(result: PromiseSettledResult<any>): Array<{ label: string; current: string; previous?: string; delta?: string; deltaPercent?: string; isPositive?: boolean }> {
  if (result.status !== "fulfilled" || !result.value) return [];
  return (result.value as any).summary ?? [];
}

function extractTables(result: PromiseSettledResult<any>): Array<{ headers: string[]; rows: any[][] }> {
  if (result.status !== "fulfilled" || !result.value) return [];
  return (result.value as any).tables ?? [];
}

function safeRows(tables: Array<{ headers: string[]; rows: any[][] }>, idx = 0) {
  return tables[idx]?.rows ?? [];
}

function pctStr(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? "+∞%" : "—";
  const p = ((curr - prev) / prev) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

function fmtNum(n: number | string | undefined): string {
  if (n === undefined || n === null || n === "") return MNE;
  const num = Number(n);
  if (isNaN(num)) return String(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

// Parse a formatted metric string ("1.2K", "34.2K", "892", "2.1M") → raw number
function parseFormatted(s: string | undefined): number | null {
  if (!s || s === MNE || s === "—" || s === "") return null;
  const t = String(s).trim();
  if (/^[\d.]+[Kk]$/.test(t)) return parseFloat(t) * 1_000;
  if (/^[\d.]+[Mm]$/.test(t)) return parseFloat(t) * 1_000_000;
  const n = parseFloat(t.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

// Parse a percentage-format delta string ("+34.8%", "-5.2%", "0%") → numeric value.
// Returns null for absolute-change strings like "+2,585" (no "%") or non-parseable values.
function parseDeltaPct(d: string | undefined): number | null {
  if (!d || !d.includes("%")) return null;
  const m = String(d).match(/([+-]?\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

// Smart goal projection for standard metrics (higher = better)
// Logic: examine current actuals, prior quarter delta, and trend direction.
// Returns a deterministic goal + plain-English rationale.
interface GoalResult { goal: string; rationale: string; }
type SummaryMetric = { label: string; current: string; previous?: string; delta?: string; deltaPercent?: string; isPositive?: boolean };

function smartProjectGoal(metric: SummaryMetric | undefined): GoalResult {
  const noData: GoalResult = { goal: MNE, rationale: "No current data — manual entry needed" };
  if (!metric) return noData;

  const curr = parseFormatted(metric.current);
  if (curr === null || curr === 0) return noData;

  const hasPrev = metric.previous && metric.previous !== MNE && metric.previous !== "—";
  if (!hasPrev) {
    return {
      goal: fmtNum(Math.round(curr * 1.03)),
      rationale: "No prior quarter data — conservative +3% applied (low confidence)",
    };
  }

  // Prefer deltaPercent (e.g. "+10.1%") over delta (e.g. "+2,585" — absolute, not a %)
  const deltaNum = parseDeltaPct(metric.deltaPercent ?? metric.delta);
  const isPositive = metric.isPositive ?? true;

  let growthPct: number;
  let rationale: string;

  if (deltaNum !== null) {
    if (!isPositive && deltaNum < -10) {
      growthPct = 0;
      rationale = `${deltaNum.toFixed(1)}% QoQ decline — stabilization goal set; growth target deferred until trend reverses`;
    } else if (!isPositive && deltaNum < 0) {
      growthPct = 0.02;
      rationale = `${deltaNum.toFixed(1)}% QoQ decline — conservative +2% recovery target`;
    } else if (isPositive && deltaNum > 20) {
      const rate = Math.min((deltaNum * 0.4) / 100, 0.12);
      growthPct = rate;
      rationale = `+${deltaNum.toFixed(1)}% QoQ strong growth — projecting ${(rate * 100).toFixed(0)}% (moderated to avoid overcommitment)`;
    } else if (isPositive && deltaNum > 5) {
      const rate = Math.max((deltaNum * 0.75) / 100, 0.05);
      growthPct = rate;
      rationale = `+${deltaNum.toFixed(1)}% QoQ trend — projecting ${(rate * 100).toFixed(0)}% continuation`;
    } else if (isPositive) {
      growthPct = 0.05;
      rationale = `+${deltaNum.toFixed(1)}% QoQ modest growth — +5% target`;
    } else {
      growthPct = 0.03;
      rationale = `Flat trend — conservative +3% stabilization target`;
    }
  } else {
    growthPct = isPositive ? 0.05 : 0.03;
    rationale = isPositive
      ? "Positive trend direction — +5% continuation target"
      : "Trend direction unclear — conservative +3% target";
  }

  return { goal: fmtNum(Math.round(curr * (1 + growthPct))), rationale };
}

// Smart projection for GSC avg position (inverted: lower is better)
function smartProjectPosition(metric: SummaryMetric | undefined): GoalResult {
  if (!metric) return { goal: MNE, rationale: "No position data — manual entry needed" };
  const curr = parseFormatted(metric.current);
  if (curr === null) return { goal: MNE, rationale: "No position data — manual entry needed" };

  const hasPrev = metric.previous && metric.previous !== MNE && metric.previous !== "—";
  if (!hasPrev) {
    return {
      goal: `${Math.max(1, Math.round(curr - 1))}`,
      rationale: "No prior quarter data — targeting 1-position improvement (low confidence)",
    };
  }

  const isPositive = metric.isPositive ?? true;
  const deltaNum = parseDeltaPct(metric.deltaPercent ?? metric.delta);

  if (!isPositive) {
    return {
      goal: metric.current,
      rationale: `Position declined QoQ${deltaNum !== null ? ` (${deltaNum.toFixed(1)}%)` : ""} — stabilization goal; manual entry recommended`,
    };
  }

  if (deltaNum !== null && Math.abs(deltaNum) > 10) {
    return {
      goal: `${Math.max(1, Math.round(curr - 2))}`,
      rationale: `Strong ${deltaNum.toFixed(1)}% QoQ ranking improvement — targeting further 2-position gain`,
    };
  }

  return {
    goal: `${Math.max(1, Math.round(curr - 1))}`,
    rationale: `Improving ranking trend — targeting 1-position gain next quarter`,
  };
}

// ─── Main Generator ───────────────────────────────────────────────────────────

export async function generateQbrFull(input: {
  clientId: number;
  quarter: number;
  year: number;
  timezone?: string;
  amInputs?: QbrAmInputs;
  currentCrawlAssetId?: number | null;
  comparisonCrawlAssetId?: number | null;
  gapContext?: GapContext;
}): Promise<QbrFullReportJson> {
  const client = await storage.getClient(input.clientId);
  if (!client) throw new Error("Client not found: " + input.clientId);

  const am = normalizeQbrAmInputs(input.amInputs ?? {});
  const now = new Date();
  const { qStart, qEnd, prevQStart, prevQEnd, qLabel, prevQLabel } = quarterDates(input.quarter, input.year);

  // True calendar quarter date range key (handled by googleToken.ts)
  const calQtrRange = `calendar_quarter:${input.quarter}-${input.year}`;

  // Airtable date range for work log (full quarter)
  const airtableStart = fmtIso(qStart);
  const airtableEnd = fmtIso(qEnd);

  // Parallel data fetch — all sources
  const [
    gscQueries,
    gscPages,
    ga4Funnel,
    ga4Landing,
    ctResult,
    semOverview,
    semCompetitor,
    airtableResult,
    asanaResult,
  ] = await Promise.allSettled([
    handlesGscCommand("top_queries" as any)
      ? queryGsc("top_queries" as any, client, calQtrRange)
      : queryGsc("top_queries" as any, client, "last_90_vs_prev_90"),
    handlesGscCommand("top_pages" as any)
      ? queryGsc("top_pages" as any, client, calQtrRange)
      : queryGsc("top_pages" as any, client, "last_90_vs_prev_90"),
    handlesGa4Command("organic_funnel" as any)
      ? queryGa4("organic_funnel" as any, client, calQtrRange)
      : queryGa4("organic_funnel" as any, client, "last_90_vs_prev_90"),
    handlesGa4Command("organic_landing_pages" as any)
      ? queryGa4("organic_landing_pages" as any, client, calQtrRange)
      : queryGa4("organic_landing_pages" as any, client, "last_90_vs_prev_90"),
    handlesCallRailCommand("organic_calls" as any)
      ? queryCallRail("organic_calls" as any, client, calQtrRange)
      : queryCallRail("organic_calls" as any, client, "last_90_vs_prev_90"),
    handlesSemrushCommand("semrush_organic_overview" as any)
      ? querySemrush("semrush_organic_overview" as any, client, "last_30_vs_prev_30")
      : Promise.resolve(null),
    handlesSemrushCommand("semrush_keyword_rankings" as any)
      ? querySemrush("semrush_keyword_rankings" as any, client, "last_30_vs_prev_30")
      : Promise.resolve(null),
    fetchAirtableWorkLog(client.id, airtableStart, airtableEnd),
    fetchAsanaWorkLog(client.id, airtableStart, airtableEnd),
  ]);

  // Extract key data
  const gscQueriesSummary = extractSummary(gscQueries);
  const gscQueriesTables = extractTables(gscQueries);
  const gscPagesTables = extractTables(gscPages);
  const ga4Summary = extractSummary(ga4Funnel);
  const ga4Tables = extractTables(ga4Funnel);
  const ga4LandingTables = extractTables(ga4Landing);
  const ctSummary = extractSummary(ctResult);
  const ctTables = extractTables(ctResult);
  const semSummary = extractSummary(semOverview);
  const semCompetitorTables = extractTables(semCompetitor);

  // Work log from Airtable
  const airtableRows: Array<{ area: string; task: string; url: string }> = [];
  if (airtableResult.status === "fulfilled" && airtableResult.value?.success) {
    const data = airtableResult.value.data;
    for (const [creditType, items] of Object.entries(data.byCreditType)) {
      for (const item of items as any[]) {
        airtableRows.push({ area: creditType, task: item.task, url: item.url ?? "—" });
      }
    }
  }

  // Work log from Asana
  const asanaRows: Array<{ area: string; task: string }> = [];
  if (asanaResult.status === "fulfilled" && asanaResult.value?.success) {
    const tasks = asanaResult.value.data?.tasks ?? [];
    const grouped = groupAsanaTasks(tasks);
    for (const [section, items] of Object.entries(grouped)) {
      for (const item of items as any[]) {
        asanaRows.push({ area: section, task: item.name ?? item.task ?? "" });
      }
    }
  }

  const workRows = airtableRows.length > 0
    ? airtableRows.map(r => [r.area, r.task, r.url])
    : asanaRows.length > 0
      ? asanaRows.map(r => [r.area, r.task, "—"])
      : [];

  // Build organic sessions QoQ from GSC or GA4
  const organicSessionsMetric = ga4Summary[0] ?? gscQueriesSummary[0];
  const organicClicksMetric = gscQueriesSummary.find(s => s.label?.toLowerCase().includes("click"));
  const impressionsMetric = gscQueriesSummary.find(s => s.label?.toLowerCase().includes("impression"));
  const avgPosMetric = gscQueriesSummary.find(s => s.label?.toLowerCase().includes("position") || s.label?.toLowerCase().includes("pos"));
  const callsMetric = ctSummary[0];

  const slides: Slide[] = [];

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 1 — TITLE
  // ────────────────────────────────────────────────────────────────────────────
  slides.push({
    id: "s01_title",
    type: "title",
    title: `Quarterly Business Review — ${qLabel}`,
    clientName: client.name,
    date: fmtDate(now),
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 2 — AGENDA
  // ────────────────────────────────────────────────────────────────────────────
  slides.push({
    id: "s02_agenda",
    type: "bullets",
    title: "Agenda",
    subtitle: qLabel,
    bullets: [
      "Performance Review — QoQ KPIs, Call Volume, Traffic & Conversion Trends",
      "Strategy Overview — Market Insights, Competitive Snapshot, Challenges & Opportunities",
      "Strategic Plan — NSM Goals, Next-Quarter Tactics",
      "Roadmap & Alignment — Content & SEO Roadmap, Next Steps",
      "Partnership Items — Win-Win Referral Program & Closing",
    ],
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 3 — SECTION DIVIDER: PERFORMANCE REVIEW
  // ────────────────────────────────────────────────────────────────────────────
  slides.push({
    id: "s03_divider_perf",
    type: "divider",
    title: "Performance Review",
    subtitle: quarterMonthNames(input.quarter, input.year),
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 4 — SEO NSM OVERVIEW (KPI summary)
  // ────────────────────────────────────────────────────────────────────────────
  const nsmMetrics: Slide["metrics"] = [];

  if (organicSessionsMetric) {
    nsmMetrics.push({ label: "Organic Sessions", current: organicSessionsMetric.current, previous: organicSessionsMetric.previous, delta: organicSessionsMetric.delta, isPositive: organicSessionsMetric.isPositive });
  } else {
    nsmMetrics.push({ label: "Organic Sessions", current: MNE });
  }

  if (organicClicksMetric) {
    nsmMetrics.push({ label: "Organic Clicks (GSC)", current: organicClicksMetric.current, previous: organicClicksMetric.previous, delta: organicClicksMetric.delta, isPositive: organicClicksMetric.isPositive });
  } else {
    nsmMetrics.push({ label: "Organic Clicks (GSC)", current: MNE });
  }

  if (callsMetric) {
    nsmMetrics.push({ label: "Organic Calls", current: callsMetric.current, previous: callsMetric.previous, delta: callsMetric.delta, isPositive: callsMetric.isPositive });
  } else {
    nsmMetrics.push({ label: "Organic Calls", current: MNE });
  }

  if (avgPosMetric) {
    nsmMetrics.push({ label: "Avg. GSC Position", current: avgPosMetric.current, previous: avgPosMetric.previous, delta: avgPosMetric.delta, isPositive: avgPosMetric.isPositive });
  } else if (impressionsMetric) {
    nsmMetrics.push({ label: "Impressions", current: impressionsMetric.current, previous: impressionsMetric.previous, delta: impressionsMetric.delta, isPositive: impressionsMetric.isPositive });
  } else {
    nsmMetrics.push({ label: "Avg. GSC Position", current: MNE });
  }

  // Leadership note or quarter feeling → commentary
  let nsmCommentary = norm(am.leadershipNote) ?? norm(am.quarterFeeling);
  if (input.gapContext && input.gapContext.hasAnswers) {
    const gapParts = [
      input.gapContext.sentimentContext,
      input.gapContext.businessChanges,
      input.gapContext.narrativeNotes
    ].filter(Boolean);
    if (gapParts.length > 0) {
      nsmCommentary = (nsmCommentary ? nsmCommentary + " " : "") + "Gap Insights: " + gapParts.join("; ");
    }
  }

  slides.push({
    id: "s04_nsm_overview",
    type: "metrics",
    title: `SEO NSM Overview — ${qLabel}`,
    subtitle: `${qLabel} vs ${prevQLabel}`,
    metrics: nsmMetrics,
    ...(nsmCommentary ? { commentary: nsmCommentary } : {}),
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 5 — CALL VOLUME BY ORGANIC SOURCE
  // ────────────────────────────────────────────────────────────────────────────
  const callRows = ctTables[0]?.rows ?? [];
  const callHeaders = ctTables[0]?.headers ?? ["Source", "Calls", "QoQ Change"];

  slides.push({
    id: "s05_call_volume",
    type: "table",
    title: "Call Volume by Organic Source",
    subtitle: `${qLabel} vs ${prevQLabel}`,
    table: {
      headers: callHeaders,
      rows: callRows.length > 0
        ? callRows.slice(0, 15)
        : [
            ["Organic Search (Google)", MNE, MNE],
            ["Google Business Profile", MNE, MNE],
            ["Organic Direct", MNE, MNE],
          ],
    },
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 6 — SEO PERFORMANCE / BIGGEST LIFT NARRATIVE
  // ────────────────────────────────────────────────────────────────────────────
  const liftBullets: string[] = [];

  // Pull top gaining query from GSC
  const topQueryRows = gscQueriesTables[0]?.rows ?? [];
  if (topQueryRows.length > 0) {
    const topQuery = String(topQueryRows[0][0] ?? "").trim();
    const topClicks = topQueryRows[0][1];
    if (topQuery) liftBullets.push(`Top GSC query this quarter: "${topQuery}" — ${fmtNum(topClicks)} clicks.`);
  }

  // Pull top gaining page from GSC pages
  const topPageRows = gscPagesTables[0]?.rows ?? [];
  if (topPageRows.length > 0) {
    const topPage = String(topPageRows[0][0] ?? "").trim();
    const topPageClicks = topPageRows[0][1];
    if (topPage) liftBullets.push(`Highest-traffic page: ${topPage} — ${fmtNum(topPageClicks)} clicks.`);
  }

  // GA4 conversion context
  const gaConversions = ga4Summary.find(s => s.label?.toLowerCase().includes("conversion") || s.label?.toLowerCase().includes("lead"));
  if (gaConversions) {
    liftBullets.push(`GA4 conversions: ${gaConversions.current}${gaConversions.delta ? ` (${gaConversions.delta} QoQ)` : ""}.`);
  }

  // AM context
  if (norm(am.quarterFeeling)) liftBullets.push(norm(am.quarterFeeling)!);
  if (norm(am.amThoughts)) liftBullets.push(`AM Focus: ${norm(am.amThoughts)}`);

  if (liftBullets.length < 3) {
    liftBullets.push(`${MNE} — Add narrative summary of the biggest SEO growth driver(s) this quarter.`);
  }

  slides.push({
    id: "s06_biggest_lift",
    type: "bullets",
    title: "SEO Performance — Biggest Lift This Quarter",
    subtitle: `${qLabel} Highlights`,
    bullets: liftBullets,
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 7 — QUARTER-OVER-QUARTER VOLUME BREAKDOWN
  // ────────────────────────────────────────────────────────────────────────────
  const volumeRows: (string | number)[][] = [];
  const volumeHeaders = ["Metric", qLabel, prevQLabel, "Change"];

  const addVolumeRow = (label: string, metric: typeof ga4Summary[0] | undefined) => {
    if (metric) {
      volumeRows.push([label, metric.current, metric.previous ?? MNE, metric.delta ?? MNE]);
    } else {
      volumeRows.push([label, MNE, MNE, MNE]);
    }
  };

  addVolumeRow("Organic Sessions (GA4)", ga4Summary[0]);
  addVolumeRow("Organic Clicks (GSC)", organicClicksMetric ?? gscQueriesSummary[0]);
  addVolumeRow("Impressions (GSC)", impressionsMetric);
  addVolumeRow("Avg. Position (GSC)", avgPosMetric);
  addVolumeRow("Organic Calls", callsMetric);

  slides.push({
    id: "s07_qoq_volume",
    type: "table",
    title: "Quarter-over-Quarter Volume Breakdown",
    subtitle: `${qLabel} vs ${prevQLabel}`,
    table: { headers: volumeHeaders, rows: volumeRows },
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 8 — QOQ COST EFFICIENCY (SEO leverage / effort-to-outcome)
  // ────────────────────────────────────────────────────────────────────────────
  const efficiencyBullets: string[] = [];

  // Summarize work done vs outcome
  if (workRows.length > 0) {
    const creditTypes = [...new Set(workRows.map(r => String(r[0])))];
    efficiencyBullets.push(`${workRows.length} deliverables completed across ${creditTypes.length} credit type(s): ${creditTypes.slice(0, 4).join(", ")}.`);
  } else {
    efficiencyBullets.push(`${MNE} — Total deliverables completed this quarter.`);
  }

  // Clicks-per-task efficiency if available
  if (organicClicksMetric?.current && workRows.length > 0) {
    const clicks = Number(String(organicClicksMetric.current).replace(/[^0-9.]/g, ""));
    if (!isNaN(clicks) && workRows.length > 0) {
      efficiencyBullets.push(`Avg. organic click leverage: ~${Math.round(clicks / workRows.length).toLocaleString()} clicks per deliverable.`);
    }
  }

  // Organic call leverage
  if (callsMetric?.current) {
    efficiencyBullets.push(`Organic call volume: ${callsMetric.current} — driven without paid channel support.`);
  } else {
    efficiencyBullets.push(`${MNE} — Organic call volume this quarter.`);
  }

  // GA4 conversion rate proxy
  if (ga4Summary.length >= 2) {
    const sessions = ga4Summary[0];
    const conversions = ga4Summary.find(s => s.label?.toLowerCase().includes("conversion"));
    if (sessions && conversions) {
      efficiencyBullets.push(`Organic conversion context: ${sessions.current} sessions → ${conversions.current} conversions.`);
    }
  }

  // Contextual note
  if (norm(am.contextAnomalies)) efficiencyBullets.push(norm(am.contextAnomalies)!);

  if (efficiencyBullets.length < 3) {
    efficiencyBullets.push(`${MNE} — SEO efficiency / leverage metrics for this quarter.`);
  }

  slides.push({
    id: "s08_qoq_efficiency",
    type: "bullets",
    title: "Quarter-over-Quarter SEO Efficiency",
    subtitle: "Organic leverage without paid media",
    bullets: efficiencyBullets,
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 9 — SECTION DIVIDER: STRATEGY OVERVIEW
  // ────────────────────────────────────────────────────────────────────────────
  slides.push({
    id: "s09_divider_strategy",
    type: "divider",
    title: "Strategy Overview",
    subtitle: "Market, Competitive & Opportunity Context",
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 10 — MARKET INSIGHTS: SEO / AI OVERVIEWS & SEARCH BEHAVIOR
  // ────────────────────────────────────────────────────────────────────────────
  const marketBullets: string[] = [];

  // GSC query trends
  if (topQueryRows.length >= 3) {
    const queries = topQueryRows.slice(0, 5).map(r => `"${String(r[0]).trim()}"`).join(", ");
    marketBullets.push(`Top queries driving traffic this quarter: ${queries}.`);
  }

  // GSC page structure context
  if (topPageRows.length >= 2) {
    const topPages = topPageRows.slice(0, 3).map(r => String(r[0]).split("/").filter(Boolean).pop() ?? String(r[0]));
    marketBullets.push(`Top landing pages: ${topPages.join(", ")} — organic intent concentrated on treatment-specific content.`);
  }

  // AI overview / SERP context note (strategic, always present)
  marketBullets.push("AI Overviews (SGE) are now appearing for broad treatment and recovery queries — branded results are being displaced in some SERP positions.");
  marketBullets.push("Search behavior continues shifting toward longer, intent-rich queries vs. short-tail. High-quality hub pages outperform thin category pages.");

  // AM context
  if (norm(am.amThoughts)) marketBullets.push(norm(am.amThoughts)!);
  if (norm(am.contextAnomalies)) marketBullets.push(norm(am.contextAnomalies)!);

  slides.push({
    id: "s10_market_insights",
    type: "bullets",
    title: "Market Insights — SEO / AI Overviews & Search Behavior",
    subtitle: "Relevant SERP trends affecting the account",
    bullets: marketBullets,
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 11 — SEO COMPETITIVE SNAPSHOT / AI OVERVIEW VISIBILITY
  // ────────────────────────────────────────────────────────────────────────────
  const competitorRows = semCompetitorTables[0]?.rows ?? [];
  const competitorHeaders = semCompetitorTables[0]?.headers ?? ["Keyword", "Position", "Competitor", "Their Position"];

  const competitorBullets: string[] = [];
  if (norm(am.competitorObservations)) competitorBullets.push(norm(am.competitorObservations)!);

  if (competitorRows.length > 0) {
    slides.push({
      id: "s11_competitive_snapshot",
      type: "table",
      title: "SEO Competitive Snapshot",
      subtitle: "Keyword visibility vs. competitors",
      table: { headers: competitorHeaders, rows: competitorRows.slice(0, 15) },
    });
  } else {
    competitorBullets.push(`${MNE} — Competitor keyword rankings and share-of-voice data.`);
    competitorBullets.push(`${MNE} — AI Overview / SGE visibility observations for target queries.`);
    if (!norm(am.competitorObservations)) {
      competitorBullets.push("Note: Connect SEMrush in Setup, or add competitive observations in AM Inputs.");
    }
    slides.push({
      id: "s11_competitive_snapshot",
      type: "bullets",
      title: "SEO Competitive Snapshot / AI Overview Visibility",
      subtitle: "Keyword visibility context",
      bullets: competitorBullets,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 12 — THE CHALLENGE: SEO
  // ────────────────────────────────────────────────────────────────────────────
  const challengeBullets: string[] = [];

  if (norm(am.priorityChecks)) challengeBullets.push(norm(am.priorityChecks)!);

  // Derive challenge signals from data
  if (avgPosMetric?.current) {
    const pos = parseFloat(String(avgPosMetric.current).replace(/[^0-9.]/g, ""));
    if (!isNaN(pos) && pos > 20) {
      challengeBullets.push(`Average GSC position is ${avgPosMetric.current} — significant ranking depth remains; top-3 visibility is limited for high-intent queries.`);
    }
  }

  if (impressionsMetric && organicClicksMetric) {
    const imp = parseFloat(String(impressionsMetric.current).replace(/[^0-9.]/g, "")) || 0;
    const clk = parseFloat(String(organicClicksMetric.current).replace(/[^0-9.]/g, "")) || 0;
    const ctr = imp > 0 ? ((clk / imp) * 100).toFixed(1) : null;
    if (ctr && parseFloat(ctr) < 3) {
      challengeBullets.push(`Overall organic CTR is approximately ${ctr}% — low CTR signals may indicate SERP feature displacement or title/meta misalignment.`);
    }
  }

  if (challengeBullets.length < 2) {
    challengeBullets.push(`${MNE} — Main technical or structural challenge(s) blocking organic growth this quarter.`);
    challengeBullets.push(`${MNE} — Add crawl-based findings (Screaming Frog) in the Crawl Assets section to populate this slide automatically.`);
  }

  challengeBullets.push("Behavioral health treatment queries face strict YMYL scrutiny — authority signals and content depth remain critical for rankings.");

  slides.push({
    id: "s12_the_challenge",
    type: "bullets",
    title: "The Challenge — SEO",
    subtitle: "What is blocking growth this quarter",
    bullets: challengeBullets,
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 13 — SEO OPPORTUNITY
  // ────────────────────────────────────────────────────────────────────────────
  const opportunityBullets: string[] = [];

  if (norm(am.amThoughts)) opportunityBullets.push(`AM-identified opportunity: ${norm(am.amThoughts)}`);

  // Top pages with low clicks but high impressions → opportunity
  if (topPageRows.length >= 3) {
    opportunityBullets.push(`${topPageRows.length} indexed landing pages found in GSC — optimizing low-CTR, high-impression pages represents the fastest near-term leverage.`);
  }

  // Calls opportunity
  if (callsMetric?.delta) {
    const isGrowth = callsMetric.isPositive;
    opportunityBullets.push(isGrowth
      ? `Organic call volume grew ${callsMetric.delta} QoQ — double down on the content and pages driving this growth.`
      : `Organic call volume declined ${callsMetric.delta} QoQ — investigate conversion path friction and GBP optimization.`
    );
  } else {
    opportunityBullets.push(`${MNE} — Organic call volume opportunity context.`);
  }

  opportunityBullets.push("Structured data / FAQ schema on key treatment pages can improve SERP real estate and reduce AI Overview displacement.");
  opportunityBullets.push("Local SEO expansion (GBP, localized landing pages) represents an underutilized channel for admission-intent queries.");

  if (norm(am.focusNextQuarter)) opportunityBullets.push(`Next quarter focus: ${norm(am.focusNextQuarter)}`);

  slides.push({
    id: "s13_seo_opportunity",
    type: "bullets",
    title: "SEO Opportunity",
    subtitle: "Strategic opportunity for next quarter",
    bullets: opportunityBullets,
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 14 — SECTION DIVIDER: STRATEGIC PLAN
  // ────────────────────────────────────────────────────────────────────────────
  slides.push({
    id: "s14_divider_strategy_plan",
    type: "divider",
    title: "Strategic Plan",
    subtitle: "Goals & Tactics for Next Quarter",
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 15 — UPDATED SEO NSM FOR NEXT QUARTER
  // ────────────────────────────────────────────────────────────────────────────
  // Next-quarter is the quarter after input.quarter
  const nextQtr = input.quarter === 4 ? 1 : input.quarter + 1;
  const nextQtrYear = input.quarter === 4 ? input.year + 1 : input.year;
  const nextQtrLabel = `Q${nextQtr} ${nextQtrYear}`;

  // Smart goal projection: factors in current actuals, prior quarter delta, and trend direction.
  // Each metric gets a deterministic goal + plain-English rationale based on observed trend.
  const sessionsGoal = smartProjectGoal(ga4Summary[0] ?? organicSessionsMetric);
  const clicksGoal   = smartProjectGoal(organicClicksMetric ?? gscQueriesSummary[0]);
  const callsGoal    = smartProjectGoal(callsMetric);
  const posGoal      = smartProjectPosition(avgPosMetric);

  const nsmGoalRows: (string | number)[][] = [
    ["Organic Sessions (GA4)", organicSessionsMetric?.current ?? MNE, sessionsGoal.goal, sessionsGoal.rationale],
    ["Organic Clicks (GSC)",   organicClicksMetric?.current ?? MNE,   clicksGoal.goal,   clicksGoal.rationale],
    ["Organic Calls",          callsMetric?.current ?? MNE,           callsGoal.goal,    callsGoal.rationale],
    ["Avg. GSC Position",      avgPosMetric?.current ?? MNE,          posGoal.goal,      posGoal.rationale],
  ];

  slides.push({
    id: "s15_nsm_next_quarter",
    type: "table",
    title: `Updated SEO NSM — ${nextQtrLabel}`,
    subtitle: `Proposed goals based on ${qLabel} actuals`,
    table: {
      headers: [`Metric`, `${qLabel} Actual`, `${nextQtrLabel} Goal`, "Rationale"],
      rows: nsmGoalRows,
    },
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 16 — SEO NEXT-QUARTER TACTICS
  // ────────────────────────────────────────────────────────────────────────────
  const tacticBullets: string[] = [];

  if (norm(am.focusNextQuarter)) tacticBullets.push(norm(am.focusNextQuarter)!);

  // Derive from challenge/opportunity slides
  if (norm(am.priorityChecks)) tacticBullets.push(`Technical: ${norm(am.priorityChecks)}`);

  // Standard realistic quarterly tactics for behavioral health SEO
  const standardTactics = [
    "Content: Publish 3–5 treatment hub pages targeting high-intent queries identified in GSC.",
    "Technical: Resolve crawl errors, improve Core Web Vitals, and implement structured data on key pages.",
    "Local: Optimize GBP listings and create location-specific landing pages for priority markets.",
    "Authority: Execute 2–3 strategic link acquisition placements via industry publications.",
    "CRO: A/B test CTA placement on top-10 organic landing pages.",
  ];

  for (const t of standardTactics) {
    if (tacticBullets.length < 7) tacticBullets.push(t);
  }

  slides.push({
    id: "s16_tactics",
    type: "bullets",
    title: `SEO Tactics — ${nextQtrLabel}`,
    subtitle: "4–7 focused priorities for next quarter",
    bullets: tacticBullets.slice(0, 7),
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 17 — SECTION DIVIDER: ROADMAP & ALIGNMENT
  // ────────────────────────────────────────────────────────────────────────────
  slides.push({
    id: "s17_divider_roadmap",
    type: "divider",
    title: "Roadmap & Alignment",
    subtitle: "Content & SEO Roadmap — Next Steps",
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 18 — CONTENT & SEO ROADMAP
  // ────────────────────────────────────────────────────────────────────────────
  if (workRows.length > 0) {
    slides.push({
      id: "s18_roadmap",
      type: "table",
      title: "Content & SEO Roadmap",
      subtitle: `${nextQtrLabel} — Prioritized Deliverables`,
      table: {
        headers: ["Focus Area", "Deliverable / Initiative", "Notes"],
        rows: workRows.slice(0, 14),
      },
    });
  } else {
    const roadmapBullets: string[] = [
      `${MNE} — Connect Airtable or Asana in Setup to pull live roadmap data.`,
      "Priority 1: Launch treatment hub pages for top-performing query clusters.",
      "Priority 2: Technical audit remediation — crawl errors, schema, Core Web Vitals.",
      "Priority 3: GBP optimization across all active service locations.",
      "Priority 4: Authority link-building outreach to 3 industry publications.",
    ];
    if (norm(am.focusNextQuarter)) roadmapBullets.unshift(norm(am.focusNextQuarter)!);
    slides.push({
      id: "s18_roadmap",
      type: "bullets",
      title: "Content & SEO Roadmap",
      subtitle: `${nextQtrLabel} — Prioritized Initiatives`,
      bullets: roadmapBullets,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 19 — SECTION DIVIDER: PARTNERSHIP ITEMS
  // ────────────────────────────────────────────────────────────────────────────
  slides.push({
    id: "s19_divider_partnership",
    type: "divider",
    title: "Partnership Items",
    subtitle: "Referral Program & Closing",
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SLIDE 20 — WIN-WIN REFERRAL PROGRAM / CLOSING
  // ────────────────────────────────────────────────────────────────────────────
  const closingBullets: string[] = [];

  if (norm(am.trackingNotes)) closingBullets.push(norm(am.trackingNotes)!);

  closingBullets.push(
    "Partnership referral program: Mutual introductions to aligned behavioral health and addiction treatment networks.",
    "Open items: Review NSM goals, confirm next quarter priorities, and approve roadmap.",
    "Next QBR: Scheduled for end of next quarter — interim bi-weekly reports will track progress.",
    `Thank you — ${client.name} × Webserv`
  );

  if (norm(am.leadershipNote) && !closingBullets.includes(norm(am.leadershipNote)!)) {
    closingBullets.unshift(`Leadership note: ${norm(am.leadershipNote)}`);
  }

  slides.push({
    id: "s20_closing",
    type: "bullets",
    title: "Partnership Items & Close",
    subtitle: "Next steps and referral program",
    bullets: closingBullets.slice(0, 8),
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

  try {
    const [qssbData, strategyBank] = await Promise.all([fetchQssbData(), fetchStrategyBank()]);
    if (qssbData.clientInsights.length > 0) {
      slides.push({
        id: "qssb_insights",
        type: "bullets",
        title: "Client Insights",
        subtitle: "Questions to Ask the Client",
        bullets: qssbData.clientInsights.slice(0, 10),
      });
    }
    const opps = [
      ...qssbData.additionalOpportunities.map(o => `${o.service}${o.description ? ": " + o.description : ""}`),
      ...strategyBank.entries.map(e => `${e.service}${e.description ? ": " + e.description : ""}`),
    ];
    if (opps.length > 0) {
      slides.push({
        id: "qssb_opportunities",
        type: "bullets",
        title: "Additional Opportunities",
        subtitle: "Cross-sell & Upsell Recommendations",
        bullets: opps.slice(0, 12),
      });
    }
  } catch (qssbErr: any) {
    console.warn("[QBR Full] QSSB/Strategy Bank fetch failed:", qssbErr.message);
  }

  return {
    report_title: `QBR — ${qLabel}`,
    client_name: client.name,
    quarter_label: qLabel,
    quarter: input.quarter,
    year: input.year,
    generated_at: now.toISOString(),
    slides,
  };
}
