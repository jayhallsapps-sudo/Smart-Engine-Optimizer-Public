import { type GapContext, buildGapContext, gapContextToString } from "./gapAnswerContext";
import { storage } from "./storage";
import { getGoogleAccessToken } from "./googleToken";
import { fetchNsmGoals, fetchNsmGoalsForSpecificQuarter } from "./sheetsClient";
import { fetchAirtableWorkLog } from "./airtable";
import { fetchAsanaWorkLog } from "./asanaClient";
import { queryCallRail } from "./callrailClient";
import { fetchQssbData } from "./qssbClient";
import { fetchStrategyBank } from "./notionClient";
import type { Client } from "@shared/schema";
import type {
  QbrPrepReportData,
  QbrPrepMeta,
  Section1Goals,
  Section2Conversions,
  Section3Traffic,
  Section4Services,
  Section5Diagnosis,
  Section6Priorities,
  Section7Tracking,
  Section7Credits,
  CreditMonthBlock,
  CreditRowData,
  SectionQssb,
  SectionSuggestedKeywords,
  SuggestedKeywordRow,
  SourceSnapshot,
  GenerationMeta,
  GoalRow,
  ConvertingPageRow,
  ConvertingSourceRow,
  TrafficTopicRow,
  TrafficPageRow,
  ServiceRow,
  PriorityRow,
  TrackingRow,
  AdditionalOpportunity,
  TierScorecardEntry,
} from "./qbrPrepTypes";

const JUNK_UNICODE_RE = /[\uFFFD\uFFFE\uFFFF\uF8FF\u00AD\u2060]/g;

function sanitizeString(s: string): string {
  if (!s || typeof s !== "string") return s;
  let out = s;

  // A) Replace junk unicode separators with hyphens (covers slug and label cases)
  out = out.replace(JUNK_UNICODE_RE, "-");
  // Collapse consecutive hyphens introduced by the above (but preserve URL paths)
  out = out.replace(/([^/])-{2,}([^/])/g, "$1-$2");

  // B) Remove zero-width / control chars and BOM
  out = out.replace(/[\u200B-\u200D\uFEFF]/g, "");
  // C) Remove line/paragraph separators
  out = out.replace(/\u2028|\u2029/g, " ");
  // D) Remove percent-encoded junk
  out = out.replace(/%E2%80%[0-9A-Fa-f]{2}/g, "");

  // E) Specific known broken patterns — fix before whitespace normalization
  out = out.replace(/\bSource pending confirmation via\s+\w{0,8}\.?\s*$/gi, "Source pending confirmation.");
  out = out.replace(/\s+via\s+\w{1,8}\.?\s*$/gi, ".");
  out = out.replace(/\s+via\s*\.?\s*$/gi, ".");
  out = out.replace(/\bnot\s*\.\s*$/gi, "");
  out = out.replace(/\balready\s+\w{1,5}\.?\s*$/gi, "");
  out = out.replace(/\bunde\w{0,6}\.?\s*$/gi, "");

  // F) Whitespace/punctuation normalization
  out = out.replace(/\s{2,}/g, " ");
  out = out.replace(/\s+([.,;:!?])/g, "$1");
  out = out.replace(/([.!?])\s*\.\s*$/g, "$1");
  out = out.trim();

  return out;
}

const SOURCE_NORMALIZE_MAP: [RegExp, string][] = [
  [/\bga4\b|\bgoogle analytics 4\b|\bgoogle analytics\b/i, "GA4"],
  [/\bgoogle search console\b|\bgsc\b/i, "GSC"],
  [/\bcallrail\b|\bcall rail\b/i, "CallRail"],
  [/\bcall tracking metrics\b|\bctm\b/i, "CTM"],
  [/\bscreaming frog\b/i, "Screaming Frog"],
  [/\bmulti.?source\b/i, "Multi-source"],
  [/\bgbp\b|\bgoogle business profile\b/i, "GBP"],
  [/\bairtable\b/i, "Airtable"],
];

function normalizeSrcName(raw: string): string {
  const lower = raw.toLowerCase().trim();
  for (const [re, normalized] of SOURCE_NORMALIZE_MAP) {
    if (re.test(lower)) return normalized;
  }
  return raw;
}

function extractUsedSourcesFromReport(report: QbrPrepReportData): Set<string> {
  const used = new Set<string>();
  const SOURCE_FIELD_KEYS = new Set(["source", "measurementSource", "dataSource"]);

  const walk = (obj: any): void => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    for (const key of Object.keys(obj)) {
      if (SOURCE_FIELD_KEYS.has(key) && typeof obj[key] === "string") {
        const val = obj[key];
        for (const [re, normalized] of SOURCE_NORMALIZE_MAP) {
          if (re.test(val)) used.add(normalized);
        }
      } else if (typeof obj[key] === "object") {
        walk(obj[key]);
      }
    }
  };
  walk(report.section1Goals);
  walk(report.section2Conversions);
  walk(report.section3Traffic);
  walk(report.section4Services);
  walk(report.section7Tracking);
  return used;
}

function sanitizeReport(report: QbrPrepReportData): void {
  const walk = (obj: any): void => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "string") {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === "object") {
        walk(obj[key]);
      }
    }
  };
  walk(report.section1Goals);
  walk(report.section2Conversions);
  walk(report.section3Traffic);
  walk(report.section4Services);
  walk(report.section5Diagnosis);
  walk(report.section6Priorities);
  walk(report.section7Tracking);
  if (report.meta) walk(report.meta);
}
import {
  inferQuarter,
  isBrandedQuery,
  classifyPageType,
  classifyAdmitConnection,
  classifyQueryTopic,
  clusterQueriesByTopic,
  topicAdmitConnection,
  diagnoseTier,
  analyzeSfForTierInput,
  isUtilityAdmissionsPage,
  type QuarterInfo,
  type TierDiagnosisInput,
  type NavAccessibility,
} from "./qbrPrepHelpers";

// ── Nav accessibility: fetch homepage HTML and parse nav/footer links ──────────
async function fetchNavAccessibility(siteUrl: string): Promise<NavAccessibility> {
  const empty: NavAccessibility = { vobInNav: false, vobInFooter: false, contactInNav: false, contactInFooter: false, dataAvailable: false };
  try {
    const resp = await fetch(siteUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartEO-QBR/1.0; +https://smarteo.co)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) return empty;
    const html = await resp.text();

    const extractHrefs = (block: string): string[] =>
      (block.match(/href=["']([^"']+)["']/gi) ?? [])
        .map(h => h.match(/href=["']([^"']+)["']/i)?.[1] ?? "")
        .filter(Boolean);

    const navBlocks = html.match(/<nav[\s>][^]*?<\/nav>/gi) ?? [];
    const footerBlocks = html.match(/<footer[\s>][^]*?<\/footer>/gi) ?? [];

    const navHrefs = navBlocks.flatMap(extractHrefs);
    const footerHrefs = footerBlocks.flatMap(extractHrefs);

    const VOB_RE = /verify.?insur|\/vob\b|insurance.?verif|check.?insur|\/insurance\b/i;
    const CONTACT_RE = /\/contact|\/admissions|\/get.?help|\/intake|\/reach/i;

    const normalize = (href: string): string => {
      try { return new URL(href, siteUrl).pathname; } catch { return href; }
    };

    const inNav = (hrefs: string[], re: RegExp) => hrefs.map(normalize).some(p => re.test(p));

    return {
      vobInNav:     inNav(navHrefs, VOB_RE),
      vobInFooter:  inNav(footerHrefs, VOB_RE),
      contactInNav: inNav(navHrefs, CONTACT_RE),
      contactInFooter: inNav(footerHrefs, CONTACT_RE),
      dataAvailable: true,
    };
  } catch {
    return empty;
  }
}

const ME = "Manual entry needed";
const NOT_FOUND = "Not found on site";

// ── Live page verification: HEAD-check key paths against the live site ─────────
// Returns a map of path → { exists: boolean, resolvedPath: string | null }
// A page is considered "exists" if it resolves to a non-root, non-homepage URL.
async function verifyLivePages(
  baseUrl: string,
  paths: string[]
): Promise<Map<string, { exists: boolean; resolvedPath: string | null }>> {
  const results = new Map<string, { exists: boolean; resolvedPath: string | null }>();
  const base = baseUrl.replace(/\/$/, "");
  const rootPaths = new Set(["", "/", "/home", "/index.html", "/index.php"]);

  async function checkPath(path: string): Promise<{ exists: boolean; resolvedPath: string | null }> {
    try {
      const resp = await fetch(`${base}${path}`, {
        method: "HEAD",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartEO-QBR/1.0)" },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return { exists: false, resolvedPath: null };
      // Determine where it landed
      const finalUrl = resp.url ?? `${base}${path}`;
      let finalPath = "/";
      try { finalPath = new URL(finalUrl).pathname; } catch {}
      // If it landed on root/homepage, treat as non-existent
      if (rootPaths.has(finalPath) || finalPath === "") return { exists: false, resolvedPath: null };
      return { exists: true, resolvedPath: finalPath };
    } catch {
      return { exists: false, resolvedPath: null };
    }
  }

  const checks = await Promise.allSettled(paths.map(p => checkPath(p)));
  paths.forEach((p, i) => {
    const r = checks[i];
    results.set(p, r.status === "fulfilled" ? r.value : { exists: false, resolvedPath: null });
  });
  return results;
}

// ── Infer page verification groups for key service categories ─────────────────
const PAGE_CHECK_GROUPS: Record<string, string[]> = {
  contact:     ["/contact", "/contact-us", "/get-help", "/admissions", "/admissions-and-alcohol-rehab-insurance", "/reach-out", "/intake"],
  vob:         ["/verify-insurance", "/insurance-verification", "/vob", "/verify-benefits", "/insurance"],
  detox:       ["/detox", "/detox-program", "/detoxification", "/programs/detox", "/detox-center"],
  residential: ["/residential", "/residential-treatment", "/inpatient", "/inpatient-rehab", "/programs/residential"],
};

function pctDeltaLocal(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+∞%" : "—";
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "") || "/";
}

async function gscFetch(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 200
): Promise<any[]> {
  try {
    const body: any = { startDate, endDate, dimensions, rowLimit };
    const resp = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await resp.json() as any;
    if (!resp.ok) return [];
    return data.rows ?? [];
  } catch {
    return [];
  }
}

async function ga4Fetch(accessToken: string, propertyId: string, body: any): Promise<any> {
  try {
    const resp = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await resp.json() as any;
    if (!resp.ok) return null;
    return data;
  } catch {
    return null;
  }
}

function organicFilter() {
  return {
    filter: {
      fieldName: "sessionDefaultChannelGrouping",
      stringFilter: { value: "Organic Search", matchType: "EXACT" },
    },
  };
}

export interface QbrPrepGenerateInput {
  clientId: number;
  generationDate: string;
  sentiment?: string;
  hypothesis?: string;
  prevQtrAssessment?: string;
  auditNotes?: string;
  clientNotes?: string;
  forwardLooking?: boolean;
  gapAnswers?: import("@shared/schema").GapAnswer[];
  /** Monthly content credits resolved in routes.ts from CLIENT_CREDIT_MAP (the canonical source).
   *  Defaults to 5 if not supplied. */
  monthlyCredits?: number;
  /** AM-entered freeform credit usage breakdown (stored verbatim, parsed at render time). */
  creditUsage?: string;
}

export function normalizeKpiLabel(mvpType: string): string {
  if (!mvpType || mvpType === "—" || mvpType === "-") return "Admits";
  const lower = mvpType.toLowerCase().trim();
  if (/admits?$/i.test(lower)) return "Admits";
  if (/viable\s*vob/i.test(lower) || /^vobs?$/i.test(lower)) return "Viable VOBs";
  if (/organic.*gmb.*ai.*llm.*calls/i.test(lower)) return "Organic + GMB + AI LLM Calls";
  if (/qualified.*calls/i.test(lower)) return "Qualified Calls";
  if (/leads?$/i.test(lower)) return "Leads";
  if (/contacts?$/i.test(lower)) return "Contacts";
  return mvpType.trim();
}

export async function generateQbrPrepReport(input: QbrPrepGenerateInput): Promise<QbrPrepReportData> {
  const client = await storage.getClient(input.clientId);
  if (!client) throw new Error("Client not found");

  const genDate = new Date(input.generationDate + "T12:00:00");
  const quarter = inferQuarter(genDate);

  console.log(`[QBR Prep V2] Generating for ${client.name} | Analysis: ${quarter.analysisStart} → ${quarter.analysisEnd} | Planning: Q${quarter.planningQ} ${quarter.planningYear}`);

  const [gscToken, ga4Token] = await Promise.all([
    getGoogleAccessToken("google_search_console"),
    getGoogleAccessToken("google_analytics_4"),
  ]);

  const sfReports = await storage.getSfReports(client.id).catch(() => []);
  const latestSf = sfReports[0];
  const sfData = latestSf ? ((latestSf.data ?? []) as Record<string, any>[]) : [];
  const sfHeaders = latestSf ? (latestSf.headers ?? []) : [];

  const dataSources: string[] = [];
  const missingData: string[] = [];

  let nsmData: any = null;
  let prevNsmData: any = null;
  try {
    nsmData = await fetchNsmGoals(client.name, input.forwardLooking);
    if (nsmData && nsmData.quarter !== "—") dataSources.push("Google Sheets NSM Tracker");
    else nsmData = null;
  } catch {
    nsmData = null;
  }
  if (!nsmData) missingData.push("NSM Tracker");

  // Fetch previous quarter NSM data for goal shift calculation
  // Derive prevQ from the NSM tracker's current quarter (not the analysis window),
  // so that forward-looking reports (planning Q2) correctly fetch Q1 actuals rather than Q4.
  try {
    let prevQ: number;
    let prevYear: number;
    const nsmQMatch = nsmData?.quarter?.match(/Q(\d)\s+(\d{4})/);
    if (nsmQMatch) {
      const nsmQ = parseInt(nsmQMatch[1], 10);
      const nsmYr = parseInt(nsmQMatch[2], 10);
      prevQ = nsmQ === 1 ? 4 : nsmQ - 1;
      prevYear = nsmQ === 1 ? nsmYr - 1 : nsmYr;
    } else {
      // Fallback: derive from analysis window
      const now = new Date(quarter.analysisEnd || new Date());
      const month = now.getMonth() + 1;
      const currYear = now.getFullYear();
      const currQ = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
      prevQ = currQ === 1 ? 4 : currQ - 1;
      prevYear = currQ === 1 ? currYear - 1 : currYear;
    }
    prevNsmData = await fetchNsmGoalsForSpecificQuarter(client.name, prevQ, prevYear);
    if (prevNsmData && prevNsmData.quarter === "—") prevNsmData = null;
    console.log(`[NSM] Prev quarter data: Q${prevQ} ${prevYear}, mvpGoal=${prevNsmData?.mvpGoal ?? "n/a"}, sessGoal=${prevNsmData?.sessionsGoal ?? "n/a"}`);
  } catch {
    prevNsmData = null;
  }

  let gscQueryRows: any[] = [];
  let gscPageRows: any[] = [];
  let gscQueryPageRows: any[] = [];
  let gscPrevQueryRows: any[] = [];
  let gscPrevPageRows: any[] = [];
  let gscPrevQueryPageRows: any[] = [];
  const gscAvailable = !!(gscToken && client.gscSiteUrl);
  if (gscAvailable) {
    // Quarter-aligned QTD QoQ:
    //   Current window:  quarter start → analysis end (QTD)
    //   Prior window:    prior quarter start → prior quarter start + same day-of-quarter offset
    //                    clamped to the last day of the prior quarter
    //
    // Example: current Q1 2026, Jan 1 → Mar 10
    //   monthOffset = Mar(2) − Jan(0) = 2, day = 10
    //   prior Q4 2025 start = Oct 1 (month index 9)
    //   prior end = month 9+2=11, day 10 → Dec 10, 2025

    const qStartDate = new Date(quarter.analysisStart + "T00:00:00");
    const qEndDate   = new Date(quarter.analysisEnd   + "T00:00:00");
    const currQYear  = qStartDate.getFullYear();
    const currQNum   = Math.ceil((qStartDate.getMonth() + 1) / 3); // 1–4
    const prevQNum   = currQNum === 1 ? 4 : currQNum - 1;
    const prevQYear  = currQNum === 1 ? currQYear - 1 : currQYear;

    // Prior quarter calendar boundaries (0-indexed months)
    const prevQStartMonth = (prevQNum - 1) * 3;  // Oct=9 for Q4, Jan=0 for Q1, etc.
    const prevQEndMonth   = prevQStartMonth + 2;  // last month of prior quarter

    // Align prior window end to the same position within the prior quarter
    const monthOffsetInQ = qEndDate.getMonth() - qStartDate.getMonth(); // 0, 1, or 2
    const dayOfMonth     = qEndDate.getDate();
    const prevEndRaw     = new Date(prevQYear, prevQStartMonth + monthOffsetInQ, dayOfMonth);

    // Clamp to the true last day of the prior quarter (defensive; should not trigger mid-quarter)
    const prevQLastDay = new Date(prevQYear, prevQEndMonth + 1, 0);
    const prevEndClamped = prevEndRaw > prevQLastDay ? prevQLastDay : prevEndRaw;

    const prevStartStr = new Date(prevQYear, prevQStartMonth, 1).toISOString().slice(0, 10);
    const prevEndStr   = prevEndClamped.toISOString().slice(0, 10);

    console.log(`[GSC] QoQ windows — Current Q${currQNum} ${currQYear} QTD: ${quarter.analysisStart}→${quarter.analysisEnd} | Prior Q${prevQNum} ${prevQYear} aligned QTD: ${prevStartStr}→${prevEndStr}`);

    [gscQueryRows, gscPageRows, gscQueryPageRows, gscPrevQueryRows, gscPrevPageRows, gscPrevQueryPageRows] = await Promise.all([
      gscFetch(gscToken!, client.gscSiteUrl!, quarter.analysisStart, quarter.analysisEnd, ["query"], 200),
      gscFetch(gscToken!, client.gscSiteUrl!, quarter.analysisStart, quarter.analysisEnd, ["page"], 200),
      gscFetch(gscToken!, client.gscSiteUrl!, quarter.analysisStart, quarter.analysisEnd, ["query", "page"], 100),
      gscFetch(gscToken!, client.gscSiteUrl!, prevStartStr, prevEndStr, ["query"], 200),
      gscFetch(gscToken!, client.gscSiteUrl!, prevStartStr, prevEndStr, ["page"], 200),
      gscFetch(gscToken!, client.gscSiteUrl!, prevStartStr, prevEndStr, ["query", "page"], 100),
    ]);
    if (gscQueryRows.length > 0) dataSources.push("Google Search Console");
    else missingData.push("GSC");
  } else {
    missingData.push("GSC");
  }

  let ga4LandingRows: any[] = [];
  let ga4FunnelCurr: { sessions: number; conversions: number } | null = null;
  const ga4Available = !!(ga4Token && client.ga4PropertyId);
  if (ga4Available) {
    const [landingData, funnelData] = await Promise.all([
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: quarter.analysisStart, endDate: quarter.analysisEnd }],
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
        limit: 100,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: quarter.analysisStart, endDate: quarter.analysisEnd }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
      }),
    ]);

    if (landingData?.rows) {
      ga4LandingRows = landingData.rows.map((r: any) => ({
        page: r.dimensionValues?.[0]?.value ?? "",
        sessions: parseFloat(r.metricValues?.[0]?.value ?? "0"),
        conversions: parseFloat(r.metricValues?.[1]?.value ?? "0"),
      }));
      dataSources.push("Google Analytics 4");
    } else {
      missingData.push("GA4");
    }

    if (funnelData?.rows?.[0]) {
      ga4FunnelCurr = {
        sessions: parseFloat(funnelData.rows[0].metricValues?.[0]?.value ?? "0"),
        conversions: parseFloat(funnelData.rows[0].metricValues?.[1]?.value ?? "0"),
      };
    }
  } else {
    missingData.push("GA4");
  }

  if (sfData.length > 0) dataSources.push("Multi-source");
  else missingData.push("Multi-source");

  let callTrackingData: any = null;
  let callTrackingLandingPages: Array<{ page: string; calls: number }> = [];
  let callTrackingSources: Array<{ source: string; calls: number }> = [];
  try {
    if (client.callrailCompanyId) {
      const dateRange = `custom:${quarter.analysisStart}:${quarter.analysisEnd}`;
      const [landingResult, sourceResult] = await Promise.allSettled([
        queryCallRail("callrail_qoq_top_landing_pages", client, dateRange),
        queryCallRail("callrail_qoq_organic_calls", client, dateRange),
      ]);
      if (landingResult.status === "fulfilled" && landingResult.value) {
        const rows = landingResult.value.tables?.[0]?.rows ?? [];
        callTrackingLandingPages = rows.map((r: string[]) => ({
          page: r[0] ?? "/",
          calls: parseInt((r[1] ?? "0").replace(/,/g, ""), 10) || 0,
        })).filter((r: { page: string; calls: number }) => r.calls > 0);
      }
      if (sourceResult.status === "fulfilled" && sourceResult.value) {
        const rows = sourceResult.value.tables?.[0]?.rows ?? [];
        callTrackingSources = rows.map((r: string[]) => ({
          source: r[0] ?? "Unknown",
          calls: parseInt((r[1] ?? "0").replace(/,/g, ""), 10) || 0,
        })).filter((r: { source: string; calls: number }) => r.calls > 0);
      }
      if (callTrackingLandingPages.length > 0 || callTrackingSources.length > 0) {
        dataSources.push("CallRail");
      }
      callTrackingData = { landingPages: callTrackingLandingPages, sources: callTrackingSources };
    }
  } catch (err: any) {
    console.warn("[QBR Prep] Call tracking fetch failed:", err.message);
  }

  let airtableItems: any[] = [];
  try {
    const atResult = await fetchAirtableWorkLog(client, quarter.analysisStart, quarter.analysisEnd, "work");
    if (atResult.success && atResult.data) {
      airtableItems = Object.values(atResult.data.byCreditType).flat();
      if (airtableItems.length > 0) dataSources.push("Airtable");
    }
  } catch {}

  let asanaTasks: any[] = [];
  try {
    if (client.asanaProjectId) {
      const asanaResult = await fetchAsanaWorkLog(client, quarter.analysisStart, quarter.analysisEnd);
      if (asanaResult?.tasks) {
        asanaTasks = asanaResult.tasks;
        if (asanaTasks.length > 0) dataSources.push("Asana");
      }
    }
  } catch {}

  const domain = client.gscSiteUrl?.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "") ?? ME;

  const meta: QbrPrepMeta = {
    site: client.name,
    domain,
    primaryLocation: inferLocation(sfData, sfHeaders, client),
    programPositioning: inferProgram(sfData, sfHeaders),
    analysisWindow: quarter.analysisWindowLabel,
    analysisWindowStart: quarter.analysisStart,
    analysisWindowEnd: quarter.analysisEnd,
    planningQuarter: quarter.planningQuarterLabel,
    planningYear: quarter.planningYear,
    generatedOn: input.generationDate,
  };

  const section1 = generateSection1(nsmData, ga4FunnelCurr, quarter, client, callTrackingSources, prevNsmData, input.prevQtrAssessment, input.hypothesis, (input as any).clientNotes, input.sentiment);

  // ── Live page verification — run early so S2, S4, S5 all benefit ─────────────
  // Only runs when we have a real domain (not Issues-format SF or missing config).
  let livePageVerification: Map<string, { exists: boolean; resolvedPath: string | null }> = new Map();
  const siteBaseUrl = client.gscSiteUrl
    ? client.gscSiteUrl.replace(/^sc-domain:/, "https://").replace(/\/$/, "")
    : null;
  if (siteBaseUrl && !siteBaseUrl.includes(ME)) {
    const allPathsToCheck = [
      ...PAGE_CHECK_GROUPS.contact,
      ...PAGE_CHECK_GROUPS.vob,
      ...PAGE_CHECK_GROUPS.detox,
      ...PAGE_CHECK_GROUPS.residential,
      // Also check configured money pages
      ...(client.moneyPages ?? []).map((mp: string) => mp.replace(/^https?:\/\/[^/]+/, "") || "/"),
    ];
    const uniquePaths = Array.from(new Set(allPathsToCheck));
    try {
      livePageVerification = await verifyLivePages(siteBaseUrl, uniquePaths);
      const foundCount = Array.from(livePageVerification.values()).filter(v => v.exists).length;
      console.log(`[LiveVerify] Checked ${uniquePaths.length} paths → ${foundCount} found live`);
    } catch (e: any) {
      console.warn("[LiveVerify] Page verification failed:", e.message);
    }
  }

  // Build a helper to find the first live path in a category
  function firstLivePath(category: string): string | null {
    for (const path of PAGE_CHECK_GROUPS[category] ?? []) {
      const r = livePageVerification.get(path);
      if (r?.exists) return r.resolvedPath ?? path;
    }
    return null;
  }

  // Filter money pages: keep only those that resolve to a non-homepage URL
  const verifiedMoneyPages = (client.moneyPages ?? []).filter((mp: string) => {
    const path = mp.replace(/^https?:\/\/[^/]+/, "") || "/";
    const r = livePageVerification.get(path);
    // If verification ran (map has this path) and page doesn't exist, exclude it
    if (livePageVerification.size > 0 && livePageVerification.has(path)) return r?.exists ?? false;
    // If no verification data, include as before
    return true;
  });

  const clientWithVerifiedMoneyPages = { ...client, moneyPages: verifiedMoneyPages };

  const section2 = generateSection2(ga4LandingRows, gscPageRows, clientWithVerifiedMoneyPages, callTrackingLandingPages, callTrackingSources, livePageVerification);
  const section3 = generateSection3(gscQueryRows, gscPageRows, ga4LandingRows, client, gscPrevQueryRows, gscPrevPageRows, gscQueryPageRows, gscPrevQueryPageRows);

  // Build live page overrides for S4 (maps service name → real verified URL)
  const s4LivePageOverrides: Record<string, string> = {};
  const contactPath = firstLivePath("contact");
  const vobPath = firstLivePath("vob");
  const detoxPath = firstLivePath("detox");
  const residentialPath = firstLivePath("residential");
  if (contactPath) s4LivePageOverrides["Contact / Admissions"] = contactPath;
  if (vobPath) s4LivePageOverrides["Verify Insurance"] = vobPath;
  if (detoxPath) s4LivePageOverrides["Detox"] = detoxPath;
  if (residentialPath) s4LivePageOverrides["Residential / Inpatient"] = residentialPath;

  // Detect whether SF data is a real URL crawl (has Address/URL column) vs Issues format
  const sfIsUrlCrawl = sfHeaders.some(h => /^address$/i.test(h) || /^url$/i.test(h));

  const section4 = generateSection4(sfData, sfHeaders, client, s4LivePageOverrides, livePageVerification.size > 0, sfIsUrlCrawl);

  // T003: Post-process tertiary goal reason with actual traffic data from section3
  const tertiaryIdx = section1.rows.findIndex(r => r.goalType === "Secondary Goal/NSM");
  if (tertiaryIdx >= 0 && section3.topTrafficTopics.length > 0) {
    const topTopic = section3.topTrafficTopics[0];
    const topPage = section3.topTrafficPages[0];
    // TrafficTopicRow has impressions (not clicks); use it as a relevance proxy
    const topicsWithImp = section3.topTrafficTopics.filter(t => (t.impressions ?? 0) > 0);
    const totalImp = topicsWithImp.reduce((sum, t) => sum + (t.impressions ?? 0), 0);
    const topTopicPct = totalImp > 0 && topTopic.impressions
      ? Math.round((topTopic.impressions / totalImp) * 100)
      : null;

    const topicsSnippet = topicsWithImp.slice(0, 3).map(t => `"${t.topic}"`).join(", ");
    const pageSnippet = topPage?.page
      ? topPage.page.replace(/^https?:\/\/[^/]+/, "").substring(0, 50) || topPage.page
      : null;

    let trafficContext = "";
    if (topicsSnippet) {
      trafficContext += ` Traffic is led by ${topicsSnippet} topics`;
      if (topTopicPct) trafficContext += ` (${topTopicPct}% of clicks from "${topTopic.topic}")`;
      trafficContext += ".";
    }
    if (pageSnippet) {
      trafficContext += ` Top page: ${pageSnippet}.`;
    }
    // clicksDelta is already a % string like "-9.9%" — parse its numeric value directly
    const parseDeltaPct = (s: string) => parseFloat(String(s).replace(/%/, ""));
    const topDelta = section3.topTrafficPages.find(p => p.clicksDelta && Math.abs(parseDeltaPct(p.clicksDelta)) > 15);
    if (topDelta && topDelta.clicksDelta) {
      const deltaVal = parseDeltaPct(topDelta.clicksDelta);
      const deltaDir = deltaVal > 0 ? "up" : "down";
      const deltaAbs = Math.abs(Math.round(deltaVal));
      const pagePart = (topDelta.page ?? "").split("/").filter(Boolean).slice(-1)[0] || "top page";
      trafficContext += ` Notable delta: ${pagePart} ${deltaDir} ${deltaAbs}% QoQ.`;
    }

    if (trafficContext) {
      const currentReason = section1.rows[tertiaryIdx].reason;
      if (!currentReason.includes("Traffic is led")) {
        section1.rows[tertiaryIdx] = {
          ...section1.rows[tertiaryIdx],
          reason: currentReason.trimEnd() + trafficContext,
        };
      }
    }
  }

  const sfTierInput = analyzeSfForTierInput(sfData, sfHeaders);

  // Fetch nav/footer accessibility for Tier 1 verification — non-blocking
  const navAccessibility = client.gscSiteUrl
    ? await fetchNavAccessibility(client.gscSiteUrl.replace(/^sc-domain:/, "https://"))
    : { vobInNav: false, vobInFooter: false, contactInNav: false, contactInFooter: false, dataAvailable: false };

  // HTTP verification overrides for key page presence flags (S5 Tier Scorecard)
  // If live verification ran, use it as the truth source for these flags.
  const httpHasContact = livePageVerification.size > 0 ? contactPath !== null : null;
  const httpHasVob = livePageVerification.size > 0 ? vobPath !== null : null;
  const httpHasDetox = livePageVerification.size > 0 ? detoxPath !== null : null;
  const httpHasResidential = livePageVerification.size > 0 ? residentialPath !== null : null;

  const tierInput: TierDiagnosisInput = {
    sfData,
    sfHeaders,
    totalUrls: sfTierInput.totalUrls ?? sfData.length,
    errors4xx5xx: sfTierInput.errors4xx5xx ?? 0,
    redirects: sfTierInput.redirects ?? 0,
    nonIndexable: sfTierInput.nonIndexable ?? 0,
    missingTitles: sfTierInput.missingTitles ?? 0,
    missingH1s: sfTierInput.missingH1s ?? 0,
    servicePageTypes: sfTierInput.servicePageTypes ?? [],
    // Prefer HTTP verification result over SF analysis; fall back to SF if no HTTP data
    hasVobPage: httpHasVob !== null ? httpHasVob : (sfTierInput.hasVobPage ?? false),
    hasContactPage: httpHasContact !== null ? httpHasContact : (sfTierInput.hasContactPage ?? false),
    hasDetoxPage: httpHasDetox !== null ? httpHasDetox : (sfTierInput.hasDetoxPage ?? false),
    hasResidentialPage: httpHasResidential !== null ? httpHasResidential : (sfTierInput.hasResidentialPage ?? false),
    hasConditionsHub: sfTierInput.hasConditionsHub ?? false,
    hasTherapiesHub: sfTierInput.hasTherapiesHub ?? false,
    hasLocationPage: sfTierInput.hasLocationPage ?? false,
    highIntentTrafficLandsOnClearUrls: checkHighIntentLanding(gscPageRows, sfData, sfHeaders),
    duplicateServicePages: sfTierInput.duplicateServicePages ?? 0,
    thinPages: sfTierInput.thinPages ?? 0,
    overlapGeoPages: sfTierInput.overlapGeoPages ?? 0,
    hasAboutPage: sfTierInput.hasAboutPage ?? false,
    hasTeamPage: sfTierInput.hasTeamPage ?? false,
    hasAlumniPage: sfTierInput.hasAlumniPage ?? false,
    navAccessibility,
  };

  const tierDiagnosis = diagnoseTier(tierInput);
  const section5: Section5Diagnosis = {
    tier: tierDiagnosis.tier,
    tierName: tierDiagnosis.tierName,
    diagnosis: tierDiagnosis.diagnosis,
    tierScorecard: buildTierScorecard(tierInput),
  };

  const completedWork = [...airtableItems.map(i => i.task), ...asanaTasks.filter((t: any) => t.completed).map((t: any) => t.name)];

  // Pre-fetch strategy bank for S6 cross-sell preview.
  // Source of truth: Notion Strategy Bank page configured via strategy_bank_page_id setting.
  // Failure is non-blocking but is surfaced to the AM (strategyBankFetchFailed flag).
  let s6StrategyBankEntries: Array<{ service: string; description: string }> = [];
  let s6StrategyBankFetchFailed = false;
  try {
    const bank = await fetchStrategyBank();
    if (bank.error || (bank.source === "none" && bank.entries.length === 0)) {
      // Fetch returned an error or the page ID is not configured — surface to AM
      s6StrategyBankFetchFailed = !!bank.error;
    }
    s6StrategyBankEntries = (bank.entries ?? []).map((e: any) => ({ service: e.service ?? e.title ?? "", description: e.description ?? "" }));
  } catch {
    // Network or auth failure — surface to AM
    s6StrategyBankFetchFailed = true;
  }

  // Monthly credits: resolved in routes.ts from the canonical CLIENT_CREDIT_MAP
  // (per data-handling-rules skill). Passed via input.monthlyCredits. Defaults to 5.
  const s6MonthlyCredits = input.monthlyCredits ?? 5;

  const section6 = generateSection6(
    section1, section2, section3, section4, section5, tierInput,
    completedWork, input.sentiment, input.hypothesis, input.auditNotes,
    s6MonthlyCredits, s6StrategyBankEntries, s6StrategyBankFetchFailed
  );
  const section7Evidence: Section7EvidenceFlags = {
    ga4Active: ga4LandingRows.length > 0 || ga4FunnelCurr !== null,
    gscActive: gscQueryRows.length > 0 || gscPageRows.length > 0,
    callActive: callTrackingLandingPages.length > 0 || callTrackingSources.length > 0,
    gbpActive: false,
  };
  const section7 = generateSection7(section6, section5, section7Evidence);
  const sectionSuggestedKeywords = generateSuggestedKeywords(
    gscQueryRows,
    gscQueryPageRows,
    sfData,
    sfHeaders,
    section3,
    section4,
    section2,
    s6MonthlyCredits,
  );

  // T004: Generate account-specific client insights
  function generateContextualClientInsights(params: {
    client: Client;
    section1: Section1Goals;
    section3: Section3Traffic;
    section4: Section4Services;
    callTrackingSources: Array<{ source: string; calls: number }>;
    nsmData: any;
    sentiment: string;
    qssbInsights: string[];
  }): Array<{ question: string }> {
    const { client, section1, section3, section4, callTrackingSources, nsmData, sentiment, qssbInsights } = params;
    const insights: Array<{ question: string }> = [];

    // 1. Primary goal performance question
    const primaryRow = section1.rows.find(r => r.goalType === "Primary Goal/MVP NSM");
    const primaryKpi = nsmData?.mvpType ? normalizeKpiLabel(nsmData.mvpType) : "admits";
    const callProvider = detectCallTrackingProvider(client);
    if (primaryRow && primaryRow.goal && primaryRow.goal !== ME) {
      if (callProvider) {
        insights.push({ question: `We're tracking ${primaryKpi.toLowerCase()} via ${callProvider}. Are the calls coming in matching what your admissions team is actually seeing on their end?` });
      } else {
        insights.push({ question: `Your ${primaryKpi.toLowerCase()} goal this quarter is ${primaryRow.goal}. How are you currently measuring and validating those numbers internally?` });
      }
    }

    // 2. Top traffic topic question
    const topTopic = section3.topTrafficTopics[0];
    if (topTopic && topTopic.topic) {
      const connection = topTopic.connectionToAdmits ?? "Unknown";
      if (connection === "Low" || connection === "Medium") {
        insights.push({ question: `Most of your organic traffic is driven by "${topTopic.topic}" content — which has ${connection} admission intent. Is there a specific service area you'd like us to prioritize moving forward to better align traffic with admissions-ready visitors?` });
      } else {
        insights.push({ question: `"${topTopic.topic}" content is your top organic traffic driver right now. Is that aligned with what your team is seeing in terms of call and inquiry quality?` });
      }
    }

    // 3. Service page question
    const services = section4.services.slice(0, 3).map(s => s.service).filter(Boolean);
    if (services.length > 0) {
      insights.push({ question: `Your main Levels of Care pages cover ${services.join(", ")}. Are there any new programs or treatment modalities you're planning to launch or expand that we should be building content around?` });
    }

    // 4. Sessions goal question
    const tertiaryRow = section1.rows.find(r => r.goalType === "Secondary Goal/NSM");
    if (tertiaryRow && nsmData?.sessionsGoal && nsmData.sessionsGoal !== "—") {
      const sessGoal = nsmData.sessionsGoal;
      const sessActual = nsmData.sessionsActual !== "—" ? nsmData.sessionsActual : null;
      if (sessActual) {
        insights.push({ question: `You're at ${sessActual} organic sessions against a goal of ${sessGoal} this quarter. Are you seeing any patterns in the types of inquiries coming through — are they matching the services you're trying to fill?` });
      } else {
        insights.push({ question: `Your organic sessions target for this quarter is ${sessGoal}. What's your sense of whether the inquiry volume you're seeing is matching your census goals?` });
      }
    }

    // 5. Sentiment-based question
    if (sentiment === "Frustrated" || sentiment === "Concerned") {
      insights.push({ question: `I want to make sure we're addressing what matters most to you. What's the #1 thing you wish was performing better right now?` });
    } else if (sentiment === "Happy" || sentiment === "Neutral") {
      insights.push({ question: `Looking ahead into next quarter, what's the most important new initiative you'd want SEO to support?` });
    }

    // 6. Geographic/competitive question
    if (client.primaryLocation || client.name) {
      const location = client.primaryLocation ?? "your market";
      insights.push({ question: `Have you noticed any new competitors showing up in search results for your key treatment programs in ${location}? Is there anyone in particular we should be keeping a closer eye on?` });
    }

    // Supplement with QSSB insights (deduplicated), cap total at 6
    for (const q of qssbInsights) {
      if (insights.length >= 6) break;
      if (!insights.some(i => i.question.toLowerCase().includes(q.toLowerCase().slice(0, 20)))) {
        insights.push({ question: q });
      }
    }

    return insights.slice(0, 6);
  }

  let sectionQssb: SectionQssb | undefined;
  try {
    const [qssbData, strategyBank] = await Promise.all([
      fetchQssbData(),
      fetchStrategyBank(),
    ]);

    const MONETIZABLE_SIGNALS = [
      "paid media", "paid retargeting", "retargeting", "cro", "conversion rate",
      "landing page", "landing page build", "technical cleanup", "technical sprint",
      "review generation", "gbp expansion", "call tracking", "attribution",
      "content expansion", "local seo", "local expansion", "dev support",
      "schema markup", "page speed", "core web vitals", "link building",
      "reputation management", "chat", "live chat", "video", "email marketing",
      "sms", "competitor", "competitive", "authority", "backlink", "pr campaign",
      "social", "influencer", "programmatic", "display ads",
    ];
    const isMonetizable = (title: string, desc: string): boolean => {
      const combined = `${title} ${desc}`.toLowerCase();
      return MONETIZABLE_SIGNALS.some(sig => combined.includes(sig));
    };
    const rawOpps: Array<{ title: string; description: string }> = [
      ...qssbData.additionalOpportunities
        .filter(o => isMonetizable(o.service, o.description))
        .map(o => ({ title: o.service, description: o.description })),
      ...strategyBank.entries
        .filter(e => isMonetizable(e.service, e.description))
        .map(e => ({ title: e.service, description: e.description })),
    ];
    const seen = new Set<string>();
    const additionalOpportunities = rawOpps.filter(o => {
      const key = o.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);

    // T004: Generate contextual client insights from actual report data
    const contextualInsights = generateContextualClientInsights({
      client,
      section1,
      section3,
      section4,
      callTrackingSources,
      nsmData,
      sentiment: input.sentiment ?? "Neutral",
      qssbInsights: qssbData.clientInsights,
    });

    if (contextualInsights.length > 0 || additionalOpportunities.length > 0) {
      sectionQssb = {
        clientInsights: contextualInsights,
        additionalOpportunities,
      };
      if (qssbData.clientInsights.length > 0 || qssbData.additionalOpportunities.length > 0) dataSources.push("QSSB");
      if (strategyBank.entries.length > 0) dataSources.push("Strategy Bank");
      console.log(`[QBR Prep] Client Insights: ${sectionQssb.clientInsights.length} questions, Opportunities: ${sectionQssb.additionalOpportunities.length}`);
    }
  } catch (qssbErr: any) {
    // Even without QSSB, generate contextual insights from report data
    const contextualInsights = generateContextualClientInsights({
      client,
      section1,
      section3,
      section4,
      callTrackingSources,
      nsmData,
      sentiment: input.sentiment ?? "Neutral",
      qssbInsights: [],
    });
    if (contextualInsights.length > 0) {
      sectionQssb = { clientInsights: contextualInsights, additionalOpportunities: [] };
    }
    console.warn("[QBR Prep] QSSB/Strategy Bank fetch failed:", qssbErr.message);
  }

  const gapContext = input.gapAnswers ? buildGapContext(input.gapAnswers) : undefined;

  const sourceSnapshot: SourceSnapshot = {
    smartSeoClientMeta: { name: client.name, domain, brandTerms: client.brandTerms },
    nsmTracker: nsmData,
    gsc: gscQueryRows.length > 0 ? { queryCount: gscQueryRows.length, pageCount: gscPageRows.length } : null,
    ga4: ga4FunnelCurr,
    gbp: null,
    callTracking: callTrackingData,
    screamingFrog: sfData.length > 0 ? { totalUrls: sfData.length, errors: tierInput.errors4xx5xx } : null,
    airtable: airtableItems.length > 0 ? { itemCount: airtableItems.length } : null,
    asana: asanaTasks.length > 0 ? { taskCount: asanaTasks.length } : null,
    manualInputs: {
      clientSentiment: input.sentiment,
      amThoughts: input.hypothesis,
      prevQtrAssessment: input.prevQtrAssessment,
      priorityChecks: input.auditNotes,
      clientNotes: (input as any).clientNotes ?? "",
      creditUsage: input.creditUsage ?? "",
      sentiment: input.sentiment,
      hypothesis: input.hypothesis,
      auditNotes: input.auditNotes,
    },
  };

  const report: QbrPrepReportData = {
    meta,
    section1Goals: section1,
    section2Conversions: section2,
    section3Traffic: section3,
    section4Services: section4,
    section5Diagnosis: section5,
    section6Priorities: section6,
    section7Tracking: section7,
    sectionSuggestedKeywords,
    sectionQssb,
    gapContext,
    sourceSnapshot,
    generationMeta: {
      generatedAt: new Date().toISOString(),
      dataSources,
      missingData: missingData,
    },
  };

  // Sanitize all string fields first
  sanitizeReport(report);

  // After full assembly + sanitization, scan every source field in the report
  // to build the true set of used sources, then suppress them from missingData.
  const usedInContent = extractUsedSourcesFromReport(report);
  const finalMissing = missingData.filter(m => {
    const norm = normalizeSrcName(m);
    return !usedInContent.has(norm);
  });
  report.generationMeta!.missingData = finalMissing;

  // Post-processing pass: evaluate completed report data for upsell / cross-sell opportunities.
  const additionalOpportunities = generateAdditionalOpportunities(report);
  if (additionalOpportunities.length > 0) {
    report.additionalOpportunities = additionalOpportunities;
  }

  return report;
}

const INSURANCE_BLACKLIST = [
  "blue-shield", "blue-cross", "blue-cross-blue-shield", "anthem",
  "aetna", "cigna", "geha", "highmark", "horizon", "humana",
  "kaiser", "magellan", "optum", "tricare", "unitedhealthcare",
  "uhc", "health-net", "molina", "medicare", "medicaid",
  "bcbs", "bcbsca", "united-health", "united-healthcare",
  "coventry", "medi-cal", "champva", "champ-va",
];

function isInsuranceTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return INSURANCE_BLACKLIST.some(term => lower.includes(term));
}

function inferLocation(sfData: Record<string, any>[], sfHeaders: string[], client: Client): string {
  const candidates: Array<{ location: string; source: string }> = [];
  const rejected: Array<{ candidate: string; reason: string }> = [];

  // Priority 0: Client canonical location (gbpLocationName) — most reliable
  if (client.gbpLocationName && client.gbpLocationName.trim()) {
    console.log(`[Location] Using canonical gbpLocationName: ${client.gbpLocationName}`);
    return client.gbpLocationName.trim();
  }

  const urlCol = sfHeaders.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? sfHeaders[0] ?? "";
  const urls = sfData.map(r => String(r[urlCol] ?? "").toLowerCase());

  const knownCities = [
    "huntington-beach", "costa-mesa", "irvine", "laguna-beach", "laguna-hills",
    "laguna-niguel", "newport-beach", "anaheim", "san-diego", "los-angeles",
    "orange-county", "santa-ana", "long-beach", "torrance", "pasadena",
    "santa-monica", "culver-city", "burbank", "glendale", "pomona",
    "san-francisco", "san-jose", "sacramento", "fresno", "riverside",
    "bakersfield", "stockton", "chula-vista", "fremont", "modesto",
  ];

  const exactCityPattern = new RegExp(`\\/(${knownCities.join("|")})(?:\\/|$|-ca\\b|-california\\b)`, "i");

  const generalPatterns = [
    /\/([a-z]{2,}(?:-[a-z]{2,}){1,3})-california\b/i,
    /\/([a-z]{2,}(?:-[a-z]{2,}){1,3})-ca\b/i,
  ];

  for (const url of urls) {
    // Priority 1: Exact known-city match
    const exact = url.match(exactCityPattern);
    if (exact) {
      const raw = exact[1];
      if (isInsuranceTerm(raw)) {
        rejected.push({ candidate: raw, reason: "Blacklisted insurance/payer term in known-city match" });
        continue;
      }
      const location = raw.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + ", CA";
      candidates.push({ location, source: `exact-url-match: ${url}` });
      break;
    }
  }

  if (candidates.length === 0) {
    // Priority 2: General -california / -ca pattern (with blacklist)
    for (const url of urls) {
      for (const p of generalPatterns) {
        const m = url.match(p);
        if (m) {
          const raw = m[1];
          if (isInsuranceTerm(raw)) {
            rejected.push({ candidate: raw, reason: "Blacklisted insurance/payer term in general pattern" });
            continue;
          }
          // Additional guard: reject if the segment looks like a service-area or brand slug
          if (raw.length > 40 || raw.split("-").length > 4) {
            rejected.push({ candidate: raw, reason: "Candidate too long — likely a service-area slug, not a city" });
            continue;
          }
          const words = m[1].split("-").filter(w => w.length >= 2);
          if (words.length > 0) {
            const location = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") + ", CA";
            candidates.push({ location, source: `general-pattern: ${url}` });
            break;
          }
        }
      }
      if (candidates.length > 0) break;
    }
  }

  if (rejected.length > 0) {
    console.log(`[Location] Rejected candidates: ${rejected.map(r => `${r.candidate} (${r.reason})`).join("; ")}`);
  }

  if (candidates.length > 0) {
    console.log(`[Location] Selected: ${candidates[0].location} from ${candidates[0].source}`);
    return candidates[0].location;
  }

  console.log(`[Location] No URL match found — returning Manual entry needed`);
  return ME;
}

function inferProgram(sfData: Record<string, any>[], sfHeaders: string[]): string {
  const urlCol = sfHeaders.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? sfHeaders[0] ?? "";
  const titleCol = sfHeaders.find(h => /^title/i.test(h)) ?? "";
  const urls = sfData.map(r => ({
    url: String(r[urlCol] ?? "").toLowerCase(),
    title: String(r[titleCol] ?? "").toLowerCase(),
  }));

  // Gender detection is URL-only — page titles frequently mention both genders
  // in passing (e.g. "how addiction affects men and women"), which causes false
  // Co-ed classifications on single-gender sites.
  //
  // URL patterns require the gender keyword to appear as an actual path segment
  // indicator of a program, not as incidental prose in a slug.
  // Valid examples: /womens-rehab, /programs/men, /mens-detox, /for-women
  // Would NOT match: /blog/men-and-women-in-recovery (path context wrong)
  const hasWomens = urls.some(u => /\/women[s']?[-\/]|[-\/]women[s']?[-\/]|[-\/]women[s']?$/i.test(u.url));
  const hasMens   = urls.some(u => /\/men[s']?[-\/]|[-\/]men[s']?[-\/]|[-\/]men[s']?$/i.test(u.url));
  const hasDualDiagnosis = urls.some(u => /dual.?diagnosis|co.?occurring/i.test(u.url));

  // Derive gender qualifier — avoid "Women's Men's" combined label
  let genderPrefix = "";
  if (hasWomens && hasMens) genderPrefix = "Co-ed";
  else if (hasWomens) genderPrefix = "Women's";
  else if (hasMens) genderPrefix = "Men's";

  const parts: string[] = [];
  if (genderPrefix) parts.push(genderPrefix);
  parts.push("Addiction Treatment");
  if (hasDualDiagnosis) parts.push("& Dual Diagnosis");

  return parts.join(" ");
}

function detectCallTrackingProvider(client: Client): string | null {
  if (client.callrailCompanyId) return "CallRail";
  if (client.ctmAccountId) return "CallTrackingMetrics";
  if (client.nimbataAccountId) return "Nimbata";
  return null;
}

function parseNsmNum(val: any): number | null {
  if (!val || val === "—" || val === "-") return null;
  const n = parseInt(String(val).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) || n === 0 ? null : n;
}

function computeGoalShiftPct(currentGoal: string, prevGoal: string): string {
  const curr = parseInt(String(currentGoal).replace(/[^0-9]/g, ""), 10);
  const prev = parseInt(String(prevGoal).replace(/[^0-9]/g, ""), 10);
  if (isNaN(curr) || isNaN(prev) || prev === 0) return "—";
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct === 0) return "Par";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function buildPrimaryGoalReason(p: {
  primaryKpiLabel: string;
  kpiLower: string;
  nsmMvpGoalNum: number | null;
  prevMvpGoalNum: number | null;
  prevMvpActNum: number | null;
  prevNsmData: any;
  callTrackingProvider: string | null;
  admitsShift: string;
}): string {
  const { primaryKpiLabel, kpiLower, nsmMvpGoalNum, prevMvpGoalNum, prevMvpActNum, prevNsmData, callTrackingProvider, admitsShift } = p;

  if (prevMvpGoalNum === null && nsmMvpGoalNum === null) {
    return `No prior-quarter data is available to anchor the projection — the goal represents a planning estimate that should be updated as quarter targets are confirmed in the NSM Tracker.`;
  }

  const parts: string[] = [];

  if (prevMvpGoalNum !== null && prevMvpActNum !== null) {
    const attainPct = Math.round((prevMvpActNum / prevMvpGoalNum) * 100);
    const prevPctLabel = prevNsmData?.mvpPercent && prevNsmData.mvpPercent !== "—"
      ? prevNsmData.mvpPercent : `${attainPct}%`;
    if (prevMvpActNum < prevMvpGoalNum) {
      const shortfall = prevMvpGoalNum - prevMvpActNum;
      const shortfallPct = Math.round(((prevMvpGoalNum - prevMvpActNum) / prevMvpGoalNum) * 100);
      parts.push(`Last quarter goal: ${fmtNum(prevMvpGoalNum)} ${kpiLower}. Last quarter actual: ${fmtNum(prevMvpActNum)} (${prevPctLabel} of goal). Performance fell short of target by ${fmtNum(shortfall)} ${kpiLower} (${shortfallPct}%).`);
    } else if (prevMvpActNum > prevMvpGoalNum) {
      const surplus = prevMvpActNum - prevMvpGoalNum;
      const surplusPct = Math.round(((prevMvpActNum - prevMvpGoalNum) / prevMvpGoalNum) * 100);
      parts.push(`Last quarter goal: ${fmtNum(prevMvpGoalNum)} ${kpiLower}. Last quarter actual: ${fmtNum(prevMvpActNum)} (${prevPctLabel} of goal). Performance exceeded target by ${fmtNum(surplus)} ${kpiLower} (${surplusPct}%).`);
    } else {
      parts.push(`Last quarter goal: ${fmtNum(prevMvpGoalNum)} ${kpiLower}. Last quarter actual: ${fmtNum(prevMvpActNum)} — goal met.`);
    }
  } else if (prevMvpGoalNum !== null) {
    parts.push(`Last quarter goal: ${fmtNum(prevMvpGoalNum)} ${kpiLower}. Last quarter actuals are not yet confirmed in the NSM Tracker.`);
  } else if (nsmMvpGoalNum !== null) {
    parts.push(`No prior-quarter goal is on record for this client. Current-quarter target is ${fmtNum(nsmMvpGoalNum)} ${kpiLower}.`);
    return parts[0];
  }

  if (prevMvpActNum !== null && prevMvpGoalNum !== null && prevMvpActNum < prevMvpGoalNum) {
    const attainPct = prevMvpActNum / prevMvpGoalNum;
    if (attainPct < 0.55) {
      parts.push(`Available evidence points to a likely crawl or indexation issue that suppressed organic visibility during the prior quarter, limiting inbound demand before it reached the conversion stage.`);
    } else if (attainPct < 0.75) {
      parts.push(`Available evidence points to a likely combination of attribution constraints and conversion-path friction that held actuals below target — the underlying demand signal was present but not fully captured.`);
    } else {
      parts.push(`Available evidence points to content maturity and internal linking gaps as likely contributors to the conversion-path shortfall, rather than a structural collapse in inbound demand.`);
    }
  }

  if (nsmMvpGoalNum !== null) {
    const shiftClass = admitsShift === "Par" ? "PAR" : admitsShift.startsWith("+") ? "UP" : "DOWN";
    const trackNote = callTrackingProvider ? ` tracked via ${callTrackingProvider}` : "";
    if (shiftClass === "DOWN") {
      parts.push(`As a result, the current-quarter goal is being reduced to ${fmtNum(nsmMvpGoalNum)} ${kpiLower}${trackNote} while structural and conversion-path improvements are implemented.`);
    } else if (shiftClass === "UP") {
      parts.push(`As a result, the current-quarter goal is being raised to ${fmtNum(nsmMvpGoalNum)} ${kpiLower}${trackNote} to reflect improved conditions and continued upward trajectory.`);
    } else {
      parts.push(`The current-quarter goal is held at ${fmtNum(nsmMvpGoalNum)} ${kpiLower}${trackNote} — prior-quarter performance anchors the target while improvements take effect.`);
    }
  }

  return parts.join(" ");
}

function buildSessionsGoalReason(p: {
  nsmSessGoalNum: number | null;
  prevSessGoalNum: number | null;
  prevSessActNum: number | null;
  prevNsmData: any;
  sessShift: string;
}): string {
  const { nsmSessGoalNum, prevSessGoalNum, prevSessActNum, prevNsmData, sessShift } = p;

  if (prevSessGoalNum === null && nsmSessGoalNum === null) {
    return `No prior-quarter sessions data is available to anchor the projection — the goal represents a planning estimate that should be updated as quarter targets are confirmed in the NSM Tracker.`;
  }

  const parts: string[] = [];

  if (prevSessGoalNum !== null && prevSessActNum !== null) {
    const attainPct = Math.round((prevSessActNum / prevSessGoalNum) * 100);
    const prevPctLabel = prevNsmData?.sessionsPercent && prevNsmData.sessionsPercent !== "—"
      ? prevNsmData.sessionsPercent : `${attainPct}%`;
    if (prevSessActNum < prevSessGoalNum) {
      const shortfall = prevSessGoalNum - prevSessActNum;
      const shortfallPct = Math.round(((prevSessGoalNum - prevSessActNum) / prevSessGoalNum) * 100);
      parts.push(`Last quarter goal: ${fmtNum(prevSessGoalNum)} organic sessions. Last quarter actual: ${fmtNum(prevSessActNum)} (${prevPctLabel} of goal). Performance fell short of target by ${fmtNum(shortfall)} sessions (${shortfallPct}%).`);
    } else if (prevSessActNum > prevSessGoalNum) {
      const surplus = prevSessActNum - prevSessGoalNum;
      const surplusPct = Math.round(((prevSessActNum - prevSessGoalNum) / prevSessGoalNum) * 100);
      parts.push(`Last quarter goal: ${fmtNum(prevSessGoalNum)} organic sessions. Last quarter actual: ${fmtNum(prevSessActNum)} (${prevPctLabel} of goal). Performance exceeded target by ${fmtNum(surplus)} sessions (${surplusPct}%).`);
    } else {
      parts.push(`Last quarter goal: ${fmtNum(prevSessGoalNum)} organic sessions. Last quarter actual: ${fmtNum(prevSessActNum)} — goal met.`);
    }
  } else if (prevSessGoalNum !== null) {
    parts.push(`Last quarter goal: ${fmtNum(prevSessGoalNum)} organic sessions. Last quarter actuals are not yet confirmed in the NSM Tracker.`);
  } else if (nsmSessGoalNum !== null) {
    parts.push(`No prior-quarter sessions goal is on record for this client. Current-quarter target is ${fmtNum(nsmSessGoalNum)} organic sessions.`);
    return parts[0];
  }

  if (prevSessActNum !== null && prevSessGoalNum !== null && prevSessActNum < prevSessGoalNum) {
    const attainPct = prevSessActNum / prevSessGoalNum;
    if (attainPct < 0.55) {
      parts.push(`Available evidence points to a likely crawl or indexation issue that significantly suppressed indexed page visibility during the prior quarter, directly limiting organic session volume.`);
    } else if (attainPct < 0.75) {
      parts.push(`Available evidence points to a likely mix of crawl constraints and content maturity gaps that held organic sessions below target — pages are indexed but not yet ranking with enough visibility to drive their full traffic potential.`);
    } else {
      parts.push(`Available evidence points to content and internal linking gaps as likely contributors to the sessions shortfall, rather than a structural crawl problem — the organic foundation is in place but not yet fully converting search visibility into session volume.`);
    }
  }

  if (nsmSessGoalNum !== null) {
    const shiftClass = sessShift === "Par" ? "PAR" : sessShift.startsWith("+") ? "UP" : "DOWN";
    if (shiftClass === "DOWN") {
      parts.push(`As a result, the current-quarter sessions goal is being reduced to ${fmtNum(nsmSessGoalNum)} while crawl quality and content depth improvements are prioritized.`);
    } else if (shiftClass === "UP") {
      parts.push(`As a result, the current-quarter sessions goal is being raised to ${fmtNum(nsmSessGoalNum)} to reflect organic growth momentum.`);
    } else {
      parts.push(`The current-quarter sessions goal is held at ${fmtNum(nsmSessGoalNum)} — prior-quarter performance anchors the target while content and technical improvements take effect.`);
    }
  }

  return parts.join(" ");
}

function generateSection1(nsmData: any, _ga4Funnel: any, _quarter: QuarterInfo, client: Client, _callTrackingSources: Array<{ source: string; calls: number }> = [], prevNsmData: any = null, _prevQtrAssessment?: string, _amThoughts?: string, _clientNotes?: string, _clientSentiment?: string): Section1Goals {
  const rows: GoalRow[] = [];
  const callTrackingProvider = detectCallTrackingProvider(client);

  console.log(`[Section1] client=${client.name}`);
  console.log(`[Section1] callTrackingProvider=${callTrackingProvider ?? "none"}`);
  console.log(`[Section1] nsmData present=${!!nsmData}, prevNsmData present=${!!prevNsmData}`);

  const primaryKpiLabel = nsmData ? normalizeKpiLabel(nsmData.mvpType) : "Admits";
  const kpiLower = primaryKpiLabel.toLowerCase();
  console.log(`[Section1] Primary KPI label: "${primaryKpiLabel}" (raw mvpType: "${nsmData?.mvpType ?? "—"}")`);

  // ── Parse current and previous quarter NSM values ──────────────────────────
  const nsmMvpGoalNum   = parseNsmNum(nsmData?.mvpGoal);
  const prevMvpGoalNum  = parseNsmNum(prevNsmData?.mvpGoal);
  const prevMvpActNum   = parseNsmNum(prevNsmData?.mvpActual);
  const nsmSessGoalNum  = parseNsmNum(nsmData?.sessionsGoal);
  const prevSessGoalNum = parseNsmNum(prevNsmData?.sessionsGoal);
  const prevSessActNum  = parseNsmNum(prevNsmData?.sessionsActual);

  console.log(`[Section1] Row1 MVP: currGoal=${nsmMvpGoalNum}, prevGoal=${prevMvpGoalNum}, prevAct=${prevMvpActNum}`);
  console.log(`[Section1] Row2 Sessions: currGoal=${nsmSessGoalNum}, prevGoal=${prevSessGoalNum}, prevAct=${prevSessActNum}`);

  // ── Row 1: Primary Goal / MVP NSM ──────────────────────────────────────────
  const admitsSource = callTrackingProvider ?? "NSM Tracker";

  let admitsGoalDisplay: string;
  if (nsmMvpGoalNum !== null) {
    admitsGoalDisplay = `${fmtNum(nsmMvpGoalNum)} ${kpiLower}`;
  } else if (nsmData?.mvpGoal && nsmData.mvpGoal !== "—") {
    admitsGoalDisplay = `${nsmData.mvpGoal} ${kpiLower}`;
  } else {
    admitsGoalDisplay = `${kpiLower} (goal pending)`;
  }

  let admitsShift: string;
  if (nsmMvpGoalNum !== null && prevMvpGoalNum !== null) {
    admitsShift = computeGoalShiftPct(String(nsmMvpGoalNum), String(prevMvpGoalNum));
  } else {
    admitsShift = "Par";
  }
  if (admitsShift === "—") admitsShift = "Par";

  const admitsReason = buildPrimaryGoalReason({
    primaryKpiLabel,
    kpiLower,
    nsmMvpGoalNum,
    prevMvpGoalNum,
    prevMvpActNum,
    prevNsmData,
    callTrackingProvider,
    admitsShift,
  });

  console.log(`[Section1] Row1: goal=${admitsGoalDisplay}, source=${admitsSource}, shift=${admitsShift}`);

  rows.push({
    goalType: "Primary Goal/MVP NSM",
    goal: admitsGoalDisplay,
    measurementSource: admitsSource,
    goalShift: admitsShift,
    reason: admitsReason,
  });

  // ── Row 2: Secondary Goal / NSM (Organic Sessions) ────────────────────────
  let sessGoalDisplay: string;
  if (nsmSessGoalNum !== null) {
    sessGoalDisplay = `${fmtNum(nsmSessGoalNum)} organic sessions`;
  } else if (nsmData?.sessionsGoal && nsmData.sessionsGoal !== "—") {
    sessGoalDisplay = `${nsmData.sessionsGoal} organic sessions`;
  } else {
    sessGoalDisplay = "organic sessions (goal pending)";
  }

  let sessShift: string;
  if (nsmSessGoalNum !== null && prevSessGoalNum !== null) {
    sessShift = computeGoalShiftPct(String(nsmSessGoalNum), String(prevSessGoalNum));
  } else {
    sessShift = "Par";
  }
  if (sessShift === "—") sessShift = "Par";

  const sessReason = buildSessionsGoalReason({
    nsmSessGoalNum,
    prevSessGoalNum,
    prevSessActNum,
    prevNsmData,
    sessShift,
  });

  console.log(`[Section1] Row2 Sessions: goal=${sessGoalDisplay}, source=GA4, shift=${sessShift}`);

  rows.push({
    goalType: "Secondary Goal/NSM",
    goal: sessGoalDisplay,
    measurementSource: "GA4",
    goalShift: sessShift,
    reason: sessReason,
  });

  return { rows };
}

const TRACKING_GAP_PHRASES = [
  "no direct conversion tracking detected yet",
  "verify form tracking is active",
  "event tracking here would directly measure",
  "track user engagement and exits",
  "confirm with admissions team",
  "conversion tracking needed",
  "tracking validation recommended",
  "add form tracking",
  "add call or form tracking",
  "add event tracking",
];

const ADMIT_CONNECTION_DEFINITIONS: Record<string, string> = {
  "High": "Service/admissions/VOB/contact pages or clearly treatment-intent traffic likely closest to conversion",
  "Medium": "Educational, branded, trust/evaluation, or mid-journey traffic that supports later conversion but is not a direct admit action",
  "Low": "Awareness-stage traffic with weak commercial/admissions intent",
};

export function generateSection2(
  ga4Landing: any[],
  gscPages: any[],
  client: Client,
  callLandingPages: Array<{ page: string; calls: number }> = [],
  callSources: Array<{ source: string; calls: number }> = [],
  livePageVerif: Map<string, { exists: boolean; resolvedPath: string | null }> = new Map()
): Section2Conversions {
  // Helper: resolve a path to its live destination (or return path unchanged if unknown)
  const resolvePath = (path: string): string => {
    const r = livePageVerif.get(path);
    if (r?.exists && r.resolvedPath && r.resolvedPath !== path) return r.resolvedPath;
    return path;
  };
  // Helper: is a path confirmed dead by live verification?
  const confirmedDead = (path: string): boolean => {
    if (livePageVerif.size === 0) return false;
    const r = livePageVerif.get(path);
    return r !== undefined && !r.exists;
  };
  const topConvertingPages: ConvertingPageRow[] = [];
  const topConvertingSources: ConvertingSourceRow[] = [];

  // --- TOP CONVERTING PAGES ---
  // Confidence-scored candidate pool. Higher = stronger conversion evidence.
  // 5 = GA4-backed, 4 = call-tracking-backed, 2 = GSC high-intent, 1 = GSC informational
  interface PageCandidate { row: ConvertingPageRow; confidence: number; }
  const pagePool: PageCandidate[] = [];
  const seenPageKeys = new Set<string>();

  const callTrackingSource = detectCallTrackingProvider(client) ?? "CallRail";

  // P1 — GA4 conversion-backed rows (confidence 5)
  const ga4WithConversions = ga4Landing
    .filter(r => (r.conversions ?? 0) > 0)
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 8);

  const totalGa4Conversions = ga4Landing.reduce((s, r) => s + (r.conversions ?? 0), 0);

  for (const row of ga4WithConversions) {
    const pageKey = shortUrl(row.page);
    if (seenPageKeys.has(pageKey)) continue;
    seenPageKeys.add(pageKey);
    const internalType = classifyPageType(row.page);
    pagePool.push({
      confidence: 5,
      row: {
        type: clientReadableType(internalType),
        page: buildPagePattern(row.page, internalType, "GA4"),
        conversionSource: "GA4",
        notes: buildConvertingPageNote(internalType, "GA4", row.conversions, row.sessions),
        dataSource: "GA4",
      },
    });
  }

  // P2 — Call tracking landing-page rows (confidence 4)
  if (callLandingPages.length > 0) {
    for (const row of callLandingPages.sort((a, b) => b.calls - a.calls).slice(0, 8)) {
      const normalized = row.page.replace(/^https?:\/\/[^/]+/, "") || "/";
      const shortP = normalized.length > 60 ? normalized.slice(0, 57) + "…" : normalized;
      if (seenPageKeys.has(shortP)) continue;
      seenPageKeys.add(shortP);
      const internalType = classifyPageType(row.page);
      pagePool.push({
        confidence: 4,
        row: {
          type: clientReadableType(internalType),
          page: buildPagePattern(row.page, internalType, callTrackingSource),
          conversionSource: callTrackingSource,
          notes: buildConvertingPageNote(internalType, callTrackingSource, row.calls, 0),
          dataSource: callTrackingSource,
        },
      });
    }
  }

  // Sort pool by confidence descending, then pick exactly top 2
  // Only GA4 (confidence 5) and call tracking (confidence 4) rows are in the pool.
  pagePool.sort((a, b) => b.confidence - a.confidence);

  const typeCount = new Map<string, number>();

  for (const { row, confidence } of pagePool) {
    if (topConvertingPages.length >= 2) break;
    // Diversity cap: no more than 1 row of the same type
    const typeKey = row.type;
    const currentCount = typeCount.get(typeKey) ?? 0;
    if (currentCount >= 1 && confidence < 4) continue;
    typeCount.set(typeKey, currentCount + 1);
    topConvertingPages.push(row);
  }

  // P3 — GA4 has session data but no conversion events configured yet
  // Use top session pages as directional proxies, labeled clearly as inference
  if (topConvertingPages.length === 0 && ga4Landing.length > 0) {
    const topBySession = ga4Landing
      .filter(r => (r.sessions ?? 0) > 0)
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 2);
    for (const row of topBySession) {
      const internalType = classifyPageType(row.page);
      topConvertingPages.push({
        type: clientReadableType(internalType),
        page: buildPagePattern(row.page, internalType, "GA4"),
        conversionSource: "GA4 (sessions only)",
        notes: `Directional inference: ${row.sessions.toLocaleString("en-US")} organic sessions recorded this period. GA4 conversion events are not yet configured, so this page is treated as a likely conversion-support URL based on organic entry volume and page intent. Confirm by connecting GA4 conversion events aligned to admissions actions.`,
        dataSource: "GA4",
      });
      if (topConvertingPages.length >= 2) break;
    }
  }

  // P4 — Client-configured money pages as high-confidence inference
  // Uses client.moneyPages to identify the most likely conversion-support URLs
  if (topConvertingPages.length < 2 && (client.moneyPages?.length ?? 0) > 0) {
    const intentMap: Record<string, { confidence: string; note: string }> = {
      "contact":        { confidence: "High-confidence inference", note: "Contact and admissions pages are near-certain conversion-support URLs for treatment centers — they are the primary destination for users actively seeking intake information." },
      "admissions":     { confidence: "High-confidence inference", note: "Admissions pages sit at the bottom of the conversion funnel — users reaching this page have moved past evaluation and are initiating the intake process." },
      "insurance":      { confidence: "High-confidence inference", note: "Insurance verification pages are direct conversion-support pages — users checking coverage are one step away from committing to admission." },
      "verify":         { confidence: "High-confidence inference", note: "Insurance verification pages are direct conversion-support pages — users checking coverage are one step away from committing to admission." },
      "vob":            { confidence: "High-confidence inference", note: "VOB pages are direct conversion-support pages — users checking coverage are one step away from committing to admission." },
      "detox":          { confidence: "Moderate-confidence inference", note: "Levels of Care pages for detox attract near-decision query traffic — users researching detox are typically closer to admission than users at earlier awareness stages." },
      "residential":    { confidence: "Moderate-confidence inference", note: "Residential treatment pages capture users comparing inpatient options — high intent relative to informational pages." },
      "inpatient":      { confidence: "Moderate-confidence inference", note: "Inpatient program pages attract users making level-of-care decisions — typically mid-to-bottom funnel intent." },
      "rehab":          { confidence: "Moderate-confidence inference", note: "Primary rehabilitation program page — likely supports a meaningful share of conversion activity given its funnel proximity to the admissions path." },
      "treatment":      { confidence: "Moderate-confidence inference", note: "Core treatment program page — a likely conversion-support URL based on service intent and proximity to admissions actions." },
      "php":            { confidence: "Moderate-confidence inference", note: "PHP program pages attract users actively comparing treatment intensity — meaningful intent signal." },
      "iop":            { confidence: "Moderate-confidence inference", note: "IOP program pages attract users evaluating outpatient options — typically mid-funnel with real conversion potential." },
      "program":        { confidence: "Moderate-confidence inference", note: "Program landing page likely supports conversion activity — users reviewing program details are actively evaluating fit before contacting admissions." },
    };
    for (const mp of (client.moneyPages ?? [])) {
      if (topConvertingPages.length >= 2) break;
      const rawPath = mp.replace(/^https?:\/\/[^/]+/, "").toLowerCase();
      if (seenPageKeys.has(rawPath)) continue;
      // Skip paths confirmed dead by live verification
      if (confirmedDead(rawPath)) {
        console.log(`[Section2] P4 skip ${rawPath} — confirmed dead by live verification`);
        continue;
      }
      // Use resolved path if live verification found a redirect destination
      const displayPath = resolvePath(rawPath);
      if (seenPageKeys.has(displayPath)) continue;
      const internalType = classifyPageType(mp);
      const displayType = clientReadableType(internalType);
      const matchedKey = Object.keys(intentMap).find(k => rawPath.includes(k));
      const { confidence, note } = matchedKey
        ? intentMap[matchedKey]
        : { confidence: "Moderate-confidence inference", note: "Client-configured priority page — likely supports conversion activity based on its position in the admissions funnel, though direct attribution is not yet confirmed." };
      seenPageKeys.add(rawPath);
      seenPageKeys.add(displayPath);
      topConvertingPages.push({
        type: displayType,
        page: displayPath,
        conversionSource: "Site Structure",
        notes: `${confidence}: ${note}`,
        dataSource: undefined,
      });
    }
  }

  // P5 — Structural inference from common treatment center admission-path patterns
  // Only fires when no client money pages covered the key high-intent URLs.
  // Uses live verification to resolve redirect destinations and skip confirmed-dead paths.
  const structuralCandidates: Array<{ path: string; type: string; note: string }> = [
    { path: "/contact", type: "Contact / Admissions", note: "High-confidence inference: Contact page is a near-certain conversion-support URL for any treatment center — it is the primary destination for admissions inquiries regardless of whether conversion tracking is active." },
    { path: "/contact-us", type: "Contact / Admissions", note: "High-confidence inference: Contact page is a near-certain conversion-support URL for any treatment center — it is the primary destination for admissions inquiries." },
    { path: "/admissions", type: "Contact / Admissions", note: "High-confidence inference: Admissions page sits at the bottom of the conversion funnel — users reaching this page have moved past evaluation and are initiating the intake process." },
    { path: "/admissions-and-alcohol-rehab-insurance", type: "Contact / Admissions", note: "High-confidence inference: Combined admissions and insurance page is the primary conversion-support URL — users here are evaluating coverage and committing to intake." },
    { path: "/insurance", type: "Verify Insurance", note: "High-confidence inference: Insurance verification pages are direct conversion-support pages — users checking coverage are typically one step away from committing to admission." },
    { path: "/verify-insurance", type: "Verify Insurance", note: "High-confidence inference: VOB pages are direct conversion-support pages — users checking coverage before calling are one of the clearest pre-admission signals." },
  ];
  for (const sc of structuralCandidates) {
    if (topConvertingPages.length >= 2) break;
    // Skip confirmed-dead paths (when verification ran)
    if (confirmedDead(sc.path)) {
      console.log(`[Section2] P5 skip ${sc.path} — confirmed dead by live verification`);
      continue;
    }
    // Use resolved path
    const displayPath = resolvePath(sc.path);
    if (seenPageKeys.has(sc.path) || seenPageKeys.has(displayPath)) continue;
    seenPageKeys.add(sc.path);
    seenPageKeys.add(displayPath);
    topConvertingPages.push({
      type: sc.type,
      page: displayPath,
      conversionSource: "Site Structure",
      notes: sc.note,
      dataSource: undefined,
    });
  }

  // Final fallback — only fires when every inference layer truly fails
  // (no GA4, no call tracking, no money pages, no structural inference — extremely rare)
  if (topConvertingPages.length === 0) {
    topConvertingPages.push({
      type: "No qualified data yet",
      page: "No qualifying conversion page identified",
      conversionSource: "GA4 / Call Tracking not detected",
      notes: "No GA4 conversion events, call-tracking data, or client-configured priority pages found. Connect GA4 event tracking or a call tracking provider to populate this table with verified conversion data.",
      dataSource: undefined,
    });
  }

  console.log(`[Section2] Top Converting Pages: ${topConvertingPages.length} rows (pool had ${pagePool.length} candidates; GA4=${pagePool.filter(c=>c.confidence===5).length}, callTracking=${pagePool.filter(c=>c.confidence===4).length})`);
  for (const r of topConvertingPages) {
    console.log(`[Section2]   → [${r.dataSource}] ${r.type} | ${r.page}`);
  }

  // --- TOP CONVERSION PATTERNS ---
  // Infer exactly 2 recurring conversion themes from the page pool and sources.
  const topConversionPatterns: ConversionPatternRow[] = [];
  const poolTypes = new Set(pagePool.map(c => c.row.dataSource ?? ""));
  const pageTypes = new Set(pagePool.map(c => c.row.type));
  const hasGA4Signal = pagePool.some(c => c.confidence === 5);
  const hasCallSignal = pagePool.some(c => c.confidence === 4);
  const hasAdmissions = pageTypes.has("Contact / Admissions");
  const hasVob = pageTypes.has("Verify Insurance");
  const hasServicePage = pageTypes.has("Service Page");
  const hasInfoPage = pageTypes.has("Blog / Resource");
  const hasHomepage = pageTypes.has("Homepage");

  const candidatePatterns: ConversionPatternRow[] = [];

  if (hasAdmissions || hasVob) {
    candidatePatterns.push({
      pattern: "Care Access Pages",
      whyItMatters: "Direct contact, intake, and insurance-verification pages are the last digital step before a prospective client reaches the admissions team. Conversion friction on these pages costs admits directly.",
      evidence: hasGA4Signal
        ? "High-confidence inference: Admissions-path pages show confirmed on-site conversion activity — this pattern suggests the account's strongest demand capture is concentrated at the point of direct intent, making friction reduction on these pages the highest-leverage conversion opportunity."
        : `High-confidence inference: Call tracking data attributes inbound volume to admissions or VOB pages, suggesting users are reaching the direct intake path and converting via phone — a pattern that typically indicates strong admissions intent at the point of first digital contact.`,
    });
  }

  if (hasVob && !hasAdmissions) {
    candidatePatterns.push({
      pattern: "Insurance Verification Pathway",
      whyItMatters: "VOB pages are the clearest digital pre-admission signal — completing a benefits check substantially increases the probability of an intake conversation.",
      evidence: hasGA4Signal
        ? "High-confidence inference: The insurance verification page is generating the largest measurable on-site conversion signal, suggesting benefits-check completion is a primary pre-intake behaviour and that users reaching this page are in late-stage decision-making."
        : `High-confidence inference: Call activity is originating from the insurance verification page, suggesting users who check benefits are converting to direct phone contact — a pattern that typically represents the strongest admissions-intent signal in the account.`,
    });
  }

  if (hasServicePage) {
    candidatePatterns.push({
      pattern: "Service Page Conversion Capture",
      whyItMatters: "Levels of Care pages (Detox, Residential, PHP/IOP) are the primary entry point for treatment-intent searches. Visitors landing here are actively evaluating fit — page quality and clear conversion paths determine whether they move toward admissions.",
      evidence: hasCallSignal
        ? `Moderate-confidence inference: Service pages are generating inbound call volume, suggesting that treatment-intent searchers who land on these pages are converting to phone contact at a meaningful rate — indicating the pages are functioning as active demand-capture points rather than passive informational stops.`
        : `Moderate-confidence inference: Service page sessions are associated with on-site conversion activity, suggesting that treatment-intent traffic landing on these pages is producing measurable admit-path actions — though page-level attribution should be verified to confirm the depth of that signal.`,
    });
  }

  if (hasInfoPage) {
    candidatePatterns.push({
      pattern: "Informational Assist to Conversion",
      whyItMatters: "Educational and resource content plays a supporting role in the patient decision journey — high-ranking informational pages build trust and often precede direct admit actions. Internal linking from these pages toward conversion pages amplifies their value.",
      evidence: hasCallSignal
        ? `Moderate-confidence inference: Informational pages are appearing in the call conversion path, suggesting this content is playing an assist role in the admissions journey — users likely enter through educational content and convert via phone after building trust, making the internal linking from these pages to conversion pages a priority.`
        : `Moderate-confidence inference: Informational pages are participating in the on-site conversion path, suggesting this content supports later admit-intent actions rather than converting directly — the pattern implies these pages carry pipeline value that would not be visible without multi-touch attribution.`,
    });
  }

  if (hasHomepage && candidatePatterns.length < 2) {
    candidatePatterns.push({
      pattern: "Homepage as Brand Verification Signal",
      whyItMatters: "Homepage conversion events or direct traffic through the homepage indicates strong brand recall or referral-driven behavior — users who already know the brand and are returning to take action.",
      evidence: hasGA4Signal
        ? `Moderate-confidence inference: Homepage sessions are contributing to measurable on-site conversion activity, suggesting a portion of inbound traffic arrives with pre-existing intent — likely driven by brand recall, referrals, or prior exposure — rather than being first-touch organic visits.`
        : `Moderate-confidence inference: Inbound calls are being attributed to homepage sessions, suggesting the homepage is functioning as a brand confirmation stop for users who already have intent — a pattern that indicates referral, direct, or returning-visitor behaviour is contributing meaningfully to call volume.`,
    });
  }

  // Fallback pattern if pool is empty (no GA4 or call tracking data available)
  if (candidatePatterns.length === 0) {
    candidatePatterns.push({
      pattern: "High-Intent Organic Traffic Capture",
      whyItMatters: "Treatment-intent organic queries — detox near me, rehab programs, insurance-covered treatment — represent the strongest mid-funnel intent. Pages ranking for these terms need optimized conversion paths to close the gap between clicks and contacts.",
      evidence: "Directional inference: Treatment-intent organic traffic is likely the strongest conversion-support pattern in this account because these queries sit closest to admission decision-making — however, page-level GA4 conversion verification is incomplete, so the full conversion contribution of this traffic remains inferred rather than confirmed.",
    });
  }
  if (candidatePatterns.length < 2) {
    candidatePatterns.push({
      pattern: "Tracking Gap as Conversion Floor",
      whyItMatters: "When conversion tracking is incomplete, high-value actions (form submits, call initiations, chat starts) go unattributed. This understates the true conversion rate and creates a systematic blind spot in reporting.",
      evidence: "Moderate-confidence inference: Tracking gaps appear to be suppressing visibility into true conversion behaviour — high-intent entry patterns are present but page-level event confirmation is incomplete, which means the reported conversion floor is likely understating actual admissions-intent activity.",
    });
  }

  topConversionPatterns.push(...candidatePatterns.slice(0, 2));

  // --- TOP CONVERTING SOURCES ---
  // Sources = actual acquisition/attribution categories, not page types.
  // Priority order: call tracking sources (P1) → GA4 on-site conversions (P2, single aggregate row) → fallback.
  //
  // Table is capped at 2 rows. Edge case: when no source data exists, 1 manual-entry placeholder is used.
  const moneyPages: string[] = (client as any).moneyPages ?? [];

  // P1: Call tracking source channels — these are real traffic-source categories
  // (Organic Search, Direct, Paid Search, Referral, etc.) sorted by call volume descending.
  const PPC_KEYWORDS = /\bppc\b|\bpaid\b|\bcpc\b|\badwords\b|\bgoogle\s*ads\b|\bbing\s*ads\b/i;
  if (callSources.length > 0) {
    const totalCalls = callSources.reduce((s, r) => s + r.calls, 0);
    const sortedSources = callSources.sort((a, b) => b.calls - a.calls);
    const topSource = sortedSources[0];
    for (const src of sortedSources.slice(0, 4)) {
      if (topConvertingSources.length >= 4) break;
      const pct = totalCalls > 0 ? Math.round(src.calls / totalCalls * 100) : 0;
      const isPPC = PPC_KEYWORDS.test(src.source);
      const isDominant = src === topSource && pct >= 35;
      const isSecondary = src !== topSource && pct >= 15;
      let notes: string;
      if (isPPC) {
        notes = `Paid channel is contributing ${pct}% of all tracked calls — a share that warrants monitoring cost-per-contact relative to organic channels to ensure admissions-path efficiency is not being subsidised by spend that organic search should eventually displace.`;
      } else if (isDominant) {
        notes = `This source is generating a disproportionately large share of tracked call activity at ${pct}% — a concentration that suggests this channel is the primary driver of phone-based leads and should be treated as a protection priority rather than a passive background source.`;
      } else if (isSecondary) {
        notes = `This source is contributing a meaningful secondary share of tracked calls at ${pct}% — a level that indicates it plays a consistent assist role in total call volume, so any deterioration here would likely weaken overall call performance even if the dominant source remains stable.`;
      } else {
        notes = `This source accounts for ${pct}% of tracked calls — a smaller but non-trivial share that suggests it is supporting total call volume in a supplementary capacity. Monitor for trend changes rather than treating it as background noise.`;
      }
      topConvertingSources.push({
        source: src.source,
        whatsConverting: `${fmtNum(src.calls)} inbound calls (${pct}% of all tracked calls)`,
        notes,
        dataSource: callTrackingSource,
      });
    }
  }

  // P2: GA4 on-site conversions — reported as a single aggregate source row.
  // Not broken down by page type (page type is already covered by the Pages table).
  // Source label reflects GA4 as the measurement channel, not a traffic channel.
  if (ga4WithConversions.length > 0 && topConvertingSources.length < 4) {
    const totalConversions = ga4WithConversions.reduce((s, r) => s + (r.conversions ?? 0), 0);
    const existingSources = new Set(topConvertingSources.map(s => s.dataSource));
    if (!existingSources.has("GA4")) {
      topConvertingSources.push({
        source: "Organic / On-Site Conversions",
        whatsConverting: `${fmtNum(totalConversions)} GA4 conversion events across ${ga4WithConversions.length} landing page${ga4WithConversions.length !== 1 ? "s" : ""}`,
        notes: `On-site conversion events are concentrated across ${ga4WithConversions.length} landing page${ga4WithConversions.length !== 1 ? "s" : ""} — a pattern that suggests organic search is successfully delivering intent-matched traffic to conversion-relevant pages. The concentration of events on a small number of pages implies the account's demand capture is narrow enough that improving even one underperforming page could meaningfully expand total conversions.`,
        dataSource: "GA4",
      });
    }
  }

  // P3: Fallback — when neither call tracking nor GA4 conversions are available,
  // acknowledge the gap explicitly rather than fabricating source labels from page types.
  if (topConvertingSources.length === 0) {
    if (moneyPages.length > 0) {
      topConvertingSources.push({
        source: "Priority Pages (Configured)",
        whatsConverting: `${moneyPages.length} priority page${moneyPages.length !== 1 ? "s" : ""} configured — no live tracking data`,
        notes: `Directional inference: Source attribution is not yet confirmed by live tracking data, but the configured priority pages suggest where conversion activity is most likely occurring. Until tracking is active, the source mix cannot be quantified — meaning any channel that is actually driving conversions remains invisible in the data and its relative contribution is being undervalued.`,
        dataSource: "Manual entry needed",
      });
    } else {
      topConvertingSources.push({
        source: ME,
        whatsConverting: "No call tracking or GA4 conversion source data available for this account",
        notes: `Directional inference: The absence of source data means conversion attribution is entirely blind at this stage — the account may be generating admissions-intent activity across multiple channels, but without tracking in place, there is no signal to distinguish which sources are performing and which are incidental. This creates a planning blind spot that affects both prioritisation and investment decisions.`,
        dataSource: "Manual entry needed",
      });
    }
  }

  // Trim sources to exactly top 2 (QSSB requirement)
  const finalSources = topConvertingSources.slice(0, 2);

  const allNotes = [...topConvertingPages.map(p => p.notes), ...finalSources.map(s => s.notes)].join(" ").toLowerCase();
  const hasGaps = TRACKING_GAP_PHRASES.some(phrase => allNotes.includes(phrase));
  const trackingDisclaimer = hasGaps
    ? "Direct admit attribution remains partially inferred where tracking is incomplete, so some Section 2 conclusions are confidence-weighted rather than fully verified."
    : undefined;

  return { topConvertingPages, topConversionPatterns, topConvertingSources: finalSources, trackingDisclaimer };
}

function clientReadableType(internalType: string): string {
  const map: Record<string, string> = {
    "Verify Insurance": "Verify Insurance",
    "Contact / Admissions": "Contact / Admissions",
    "Detox": "Level of Care",
    "Residential / Inpatient": "Level of Care",
    "PHP / IOP": "Level of Care",
    "Outpatient": "Level of Care",
    "Dual Diagnosis": "Level of Care",
    "Therapies": "Level of Care",
    "Conditions": "Level of Care",
    "Homepage": "Homepage",
    "Staff / Team": "Staff Page",
    "Blog / Resource": "Blog / Resource",
    "FAQ": "FAQ Page",
    "Local Treatment Intent": "Level of Care",
    "Branded Navigation": "Homepage",
    "Substance-Specific": "Blog / Resource",
    "Informational / Education": "Blog / Resource",
  };
  return map[internalType] ?? "Level of Care";
}

function buildPagePattern(page: string, internalType: string, dataSource: string): string {
  const clean = shortUrl(page);
  let action = "";
  if (dataSource === "CallRail" || dataSource === "CTM" || dataSource === "Nimbata") {
    action = "Phone Clicks";
  } else if (dataSource === "GA4") {
    if (internalType === "Verify Insurance") action = "VOB Form Start";
    else if (internalType === "Contact / Admissions") action = "Contact Form Start";
    else action = "Conversion Event";
  }
  return action ? `${clean} — ${action}` : clean;
}

function buildConvertingPageNote(internalType: string, dataSource: string, conversions: number, sessions: number): string {
  const isCallTracking = ["CallRail", "CTM", "Nimbata", "CallTrackingMetrics"].includes(dataSource);
  const isGA4 = dataSource === "GA4";
  const isGSC = dataSource === "GSC";
  const cvr = isGA4 && sessions > 0 ? ` ${(conversions / sessions * 100).toFixed(1)}% CVR.` : "";

  if (isGA4) {
    if (internalType === "Verify Insurance") return `Strongest trackable on-site conversion path — VOB form activity directly precedes admissions intake.${cvr}`;
    if (internalType === "Contact / Admissions") return `Primary on-site form conversion point — users submitting here are actively requesting contact from admissions.${cvr}`;
    if (internalType === "Homepage") return `Homepage conversion events detected — validate GA4 event type to confirm these are admit-aligned actions vs navigational clicks.${cvr}`;
    if (internalType === "Staff Page" || internalType === "Staff / Team") return `Conversion event on staff page — users evaluating clinical credibility before taking action. Strong trust signal.${cvr}`;
    return `On-site conversion event detected — confirm the GA4 event name to validate alignment with admissions pathway.${cvr}`;
  }

  if (isCallTracking) {
    if (internalType === "Homepage") return "Primary call-driver and likely local-entry page — phone intent is concentrated here. Verify organic vs paid attribution segmentation for call quality.";
    if (internalType === "Staff / Team" || internalType === "Staff Page") return "Trust and credibility research before calling — users evaluating the clinical team as part of their admissions decision.";
    if (internalType === "FAQ" || internalType === "FAQ Page") return "Pre-call evaluation behavior — users validating fit before committing. Strong intent signal even without a form conversion.";
    if (internalType === "Blog / Resource" || internalType === "Substance-Specific" || internalType === "Informational / Education") return "Pre-call research path — informational content is generating awareness that converts to phone contact. Monitor call quality to confirm admit alignment.";
    if (internalType === "Verify Insurance") return "Insurance page is driving direct call behavior — users checking coverage before calling admissions. One of the clearest non-homepage conversion paths.";
    if (internalType === "Contact / Admissions") return "Direct admissions contact page generating phone clicks — users landing here are actively seeking intake contact.";
    return "One of the clearest non-homepage conversion paths — users are moving from service evaluation to direct action.";
  }

  if (isGSC) {
    if (internalType === "Verify Insurance") return "Insurance page with organic visibility — add Verify Insurance / VOB form submit tracking to confirm direct admit contribution.";
    if (internalType === "Contact / Admissions") return "Contact page receiving organic traffic — verify contact form submit tracking is active to capture admission-driving events.";
    if (internalType === "Homepage") return "Homepage is the top organic entry point — brand and direct traffic dominate here; validate quality of organic sessions reaching admissions.";
    if (internalType === "Service Page" || ["Detox", "Residential / Inpatient", "PHP / IOP", "Outpatient", "Dual Diagnosis", "Therapies"].includes(internalType)) return "High-visibility program page with likely support value — direct conversion attribution is limited; add call or form tracking to confirm.";
    return "High-visibility page with likely support value, but direct conversion attribution is limited. Add event tracking to validate whether this page contributes to admits.";
  }

  return "Strategic page identified for conversion contribution — manual tracking validation recommended.";
}

function classifyTrafficPageConnection(pageType: string, url: string): string {
  const path = url.toLowerCase();
  switch (pageType) {
    case "Verify Insurance":
    case "Contact / Admissions":
    case "Detox":
    case "Residential / Inpatient":
    case "PHP / IOP":
      return "High";
    case "Substance-Specific":
    case "Conditions":
    case "Dual Diagnosis":
    case "Therapies":
    case "Outpatient":
    case "Population-Specific":
    case "Location":
    case "Aftercare / Alumni":
    case "Homepage":
    case "About / Team":
      return "Medium";
    case "Blog / Resource":
      return "Low";
    default:
      if (/meet|\/team|\/staff|\/about|\/who-we-are|\/leadership/.test(path)) return "Medium";
      if (/\/review|\/testimonial/.test(path)) return "Medium";
      return "Low";
  }
}

function buildTrafficPageInsight(pageType: string, url: string, clicksStr: string): string {
  const path = url.toLowerCase();
  const clicks = parseInt(clicksStr.replace(/,/g, "")) || 0;
  const hiVol = clicks > 200;

  switch (pageType) {
    case "Verify Insurance":
      return "High-intent admissions entry point — users here are actively seeking insurance verification before intake. Primary conversion surface; friction on this page directly impacts admits.";
    case "Contact / Admissions":
      return "Primary admissions contact page. Traffic signals users in final decision-making stage — page clarity and response speed have the highest direct impact on admits.";
    case "Detox":
      return "Core Levels of Care page for high-intent detox-seekers. Visitors are actively evaluating programs — page quality and admissions CTA directly influence intake conversion.";
    case "Residential / Inpatient":
      return "Residential Levels of Care page. Traffic here signals users comparing inpatient programs — differentiation and a clear admissions path are the priority.";
    case "PHP / IOP":
      return "Step-down or flexible care Levels of Care page. Users are weighing level-of-care options — a clear admissions path can improve conversion from this already-evaluated segment.";
    case "Substance-Specific": {
      if (/alcohol/.test(path)) return `${hiVol ? "High-volume" : "Moderate-volume"} alcohol-awareness content. Entry-stage traffic that needs a clear route from educational content to detox or treatment program pages.`;
      if (/opioid|heroin|fentanyl/.test(path)) return "Opioid-specific informational entry point. Early-funnel users researching substances — internal links to detox and residential pages capture the highest conversion value.";
      if (/meth/.test(path)) return "Methamphetamine-specific awareness content. Mostly early-funnel — route toward detox and dual-diagnosis pages where appropriate.";
      if (/cocaine|coke/.test(path)) return "Cocaine-specific awareness content. Educational traffic that supports later conversion when paired with clear internal links to Levels of Care pages.";
      if (/benzo/.test(path)) return "Benzodiazepine-specific information page. Medical detox intent is elevated for this substance — route users toward detox and residential program pages.";
      return `${hiVol ? "High-volume" : "Moderate-volume"} substance-specific awareness content. Educational entry point that needs targeted internal links to appropriate Levels of Care pages to convert traffic.`;
    }
    case "Conditions":
      return "Condition-specific content attracting users researching symptoms or mental health concerns. Should route toward dual-diagnosis or appropriate treatment program pages.";
    case "Dual Diagnosis":
      return "Dual diagnosis content attracting users with complex or co-occurring treatment needs. Higher conversion intent than general conditions traffic — route toward program details and admissions.";
    case "Therapies":
      return "Therapy and modalities content that supports program differentiation. Trust-building for users actively comparing programs — reinforce with links to service and admissions pages.";
    case "Population-Specific":
      if (/women|female/.test(path)) return "Women's program content targeting a defined audience. Evaluation-stage traffic from users assessing program fit — route toward program details and admissions.";
      if (/men|male/.test(path)) return "Men's program content attracting a specific audience segment. Route toward program details and admissions to capture high-intent users.";
      return "Audience-segmented content attracting a defined population. Evaluation-stage traffic that needs clear routing to relevant program and admissions pages.";
    case "About / Team":
      return "Trust-building page supporting late-stage evaluation. Users here are assessing credibility before committing — strong links to admissions pages can convert this high-consideration intent.";
    case "Aftercare / Alumni":
      return "Aftercare and alumni content that demonstrates outcomes and builds credibility. Influences prospective clients and families during program evaluation — trust-building before admissions.";
    case "Blog / Resource":
      return `Informational content entry point with ${hiVol ? "high" : "lower"} organic volume. Awareness-stage traffic — targeted internal links toward service and admissions pages are the highest-ROI improvement.`;
    case "Location":
      return "Location or facility page attracting geo-targeted traffic. Local intent users searching for nearby treatment — important for admissions volume from the primary service area.";
    case "Outpatient":
      return "Outpatient program page attracting users seeking flexible or lower-acuity care. Assisted admission path — users may be open to stepping up to higher levels of care if properly guided.";
    case "Homepage":
      return "Primary branded entry point serving a mix of direct, branded, and first-time visitors. Should route efficiently to Levels of Care pages and the admissions path for maximum conversion.";
    default: {
      if (/meet|\/team|\/staff/.test(path)) return "Trust-building page that supports credibility evaluation. Late-stage visitors — internal links to admissions and program pages can convert this research intent.";
      if (/\/review|\/testimonial|\/alumni/.test(path)) return "Social proof content that builds confidence in the program. Can move hesitant users toward admissions contact when paired with clear CTAs.";
      if (/\/faq|\/guide/.test(path)) return "FAQ or guide attracting users with specific treatment questions. Informational stage — structured links to relevant service and admissions pages improve conversion.";
      return `${hiVol ? "High-volume" : "Moderate-volume"} informational entry point with limited direct admit linkage. Awareness-stage content — internal links to Levels of Care pages are the highest-ROI improvement for this traffic.`;
    }
  }
}

function pctDeltaStr(current: number, previous: number): string {
  if (previous === 0 && current === 0) return "0%";
  if (previous === 0) return "+100%";
  const delta = ((current - previous) / previous) * 100;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function generateSection3(
  gscQueries: any[],
  gscPages: any[],
  ga4Landing: any[],
  client: Client,
  gscPrevQueries: any[] = [],
  prevGscPages?: any[],
  gscQueryPageRows?: any[],
  prevGscQueryPageRows?: any[]
): Section3Traffic {
  const topTrafficTopics: TrafficTopicRow[] = [];
  const topTrafficPages: TrafficPageRow[] = [];

  if (gscQueries.length > 0) {
    const queryData = gscQueries.map(r => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));

    const clusters = clusterQueriesByTopic(queryData, client);

    const prevClusters = new Map<string, { queryCount: number; impressions: number }>();
    if (gscPrevQueries.length > 0) {
      const prevQueryData = gscPrevQueries.map(r => ({
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

    const topicSummaries = [...clusters.entries()]
      .map(([topic, queries]) => ({
        topic,
        queryCount: queries.length,
        totalClicks: queries.reduce((s, q) => s + q.clicks, 0),
        totalImpressions: queries.reduce((s, q) => s + q.impressions, 0),
        avgCtr: queries.length > 0 ? queries.reduce((s, q) => s + q.ctr, 0) / queries.length : 0,
        examples: queries.sort((a, b) => b.clicks - a.clicks).slice(0, 3).map(q => q.query),
      }))
      .sort((a, b) => b.queryCount - a.queryCount)
      .slice(0, 8);

    const totalClicks = gscQueries.reduce((s: number, r: any) => s + (r.clicks ?? 0), 0);

    for (const ts of topicSummaries) {
      const connection = topicAdmitConnection(ts.topic);
      let insight = "";
      const clickShare = totalClicks > 0 ? (ts.totalClicks / totalClicks * 100).toFixed(0) : "—";
      if (ts.topic === "Branded Navigation") {
        insight = `${clickShare}% of clicks are branded — ${ts.totalClicks > totalClicks * 0.5 ? "heavy reliance on brand traffic" : "healthy brand presence"}`;
      } else if (connection === "High") {
        insight = `${clickShare}% of clicks. High-intent service traffic — directly tied to admissions.`;
      } else if (connection === "Medium") {
        insight = `${clickShare}% of clicks. Supporting traffic that assists conversion pathway.`;
      } else {
        insight = `${clickShare}% of clicks. Low admit connection — mostly informational.`;
      }

      const prev = prevClusters.get(ts.topic);
      const queryCountDelta = prev ? pctDeltaStr(ts.queryCount, prev.queryCount) : undefined;
      const impressionsDelta = prev ? pctDeltaStr(ts.totalImpressions, prev.impressions) : undefined;

      topTrafficTopics.push({
        topic: ts.topic,
        exampleQueries: ts.examples.join(", "),
        connectionToAdmits: connection,
        insight,
        dataSource: "GSC",
        queryCount: ts.queryCount,
        queryCountDelta,
        impressions: ts.totalImpressions,
        impressionsDelta,
      });
    }
  }

  if (gscPages.length > 0) {
    const topPages = [...gscPages]
      .sort((a: any, b: any) => (b.clicks ?? 0) - (a.clicks ?? 0))
      .slice(0, 10);

    const totalConversions = ga4Landing.reduce((s, r) => s + (r.conversions ?? 0), 0);

    const prevPageMap = new Map<string, any>();
    if (prevGscPages && prevGscPages.length > 0) {
      for (const r of prevGscPages) {
        const key = r.keys?.[0] ?? "";
        prevPageMap.set(key, r);
      }
    }

    const queryCountByPage = new Map<string, number>();
    if (gscQueryPageRows && gscQueryPageRows.length > 0) {
      for (const r of gscQueryPageRows) {
        const pg = r.keys?.[1] ?? "";
        queryCountByPage.set(pg, (queryCountByPage.get(pg) ?? 0) + 1);
      }
    }
    const prevQueryCountByPage = new Map<string, number>();
    if (prevGscQueryPageRows && prevGscQueryPageRows.length > 0) {
      for (const r of prevGscQueryPageRows) {
        const pg = r.keys?.[1] ?? "";
        prevQueryCountByPage.set(pg, (prevQueryCountByPage.get(pg) ?? 0) + 1);
      }
    }

    for (const row of topPages) {
      const page = row.keys?.[0] ?? "";
      const pageType = classifyPageType(page);
      const clicksFormatted = fmtNum(row.clicks ?? 0);
      const connection = classifyTrafficPageConnection(pageType, page);
      const insight = buildTrafficPageInsight(pageType, page, clicksFormatted);

      const prev = prevPageMap.get(page);
      const prevClicks = prev?.clicks ?? 0;
      const prevImpressions = prev?.impressions ?? 0;
      const currImpressions = row.impressions ?? 0;
      const currQueries = queryCountByPage.get(page) ?? 0;
      const prevQueries = prevQueryCountByPage.get(page) ?? 0;

      const clicksDelta = prevClicks > 0 ? pctDeltaLocal(row.clicks ?? 0, prevClicks) : undefined;
      const impressionsDelta = prevImpressions > 0 ? pctDeltaLocal(currImpressions, prevImpressions) : undefined;
      const queriesDelta = prevQueries > 0 ? pctDeltaLocal(currQueries, prevQueries) : undefined;

      topTrafficPages.push({
        page: shortUrl(page),
        clicks: clicksFormatted,
        clicksDelta,
        impressions: fmtNum(currImpressions),
        impressionsDelta,
        queries: currQueries > 0 ? String(currQueries) : undefined,
        queriesDelta,
        ctr: fmtPct(row.ctr ?? 0),
        connectionToAdmits: connection,
        insight,
        dataSource: "",
      });
    }
  }

  if (topTrafficTopics.length === 0) {
    topTrafficTopics.push({
      topic: ME,
      exampleQueries: ME,
      connectionToAdmits: ME,
      insight: `${ME}: GSC query data unavailable`,
      dataSource: "Manual entry needed",
    });
  }

  if (topTrafficPages.length === 0) {
    topTrafficPages.push({
      page: ME,
      clicks: "—",
      ctr: "—",
      connectionToAdmits: ME,
      insight: `${ME}: GSC page data unavailable`,
      dataSource: "Manual entry needed",
    });
  }

  return { topTrafficTopics, topTrafficPages };
}

// ── Section 4 URL filtering helpers ──────────────────────────────────────────

const S4_REJECT_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|ico|js|css|json|xml|pdf|zip|woff|woff2|ttf|mp4|mp3|avi|mov|eot|otf|map|txt|csv|rss|atom)(\?|#|$)/i;

const S4_REJECT_PATH_SEGMENTS = [
  /\/wp-content\//i,
  /\/wp-includes\//i,
  /\/wp-admin\//i,
  /\/wp-json\//i,
  /\/xmlrpc\.php/i,
  /\/feed\//i,
  /\/\?feed=/i,
  /\/tag\//i,
  /\/author\//i,
  /\/page\/\d+/i,
  /\/attachment\//i,
  /\?replytocom=/i,
  /[?&]amp\b/i,
  /[?&]ver=/i,
  /\/sitemap/i,
  /\/robots\.txt/i,
  /\/cron\.php/i,
  /\/__trashed\//i,
  /\/embed\//i,
  /\/trackback\//i,
  /\/comment-page-/i,
];

function isValidPageUrl(url: string): boolean {
  if (!url || url.trim() === "") return false;
  // Must look like a URL path (absolute or relative starting with /)
  const path = url.includes("://") ? (() => { try { return new URL(url).pathname + new URL(url).search; } catch { return url; } })() : url;
  if (S4_REJECT_EXTENSIONS.test(path)) return false;
  if (S4_REJECT_PATH_SEGMENTS.some(re => re.test(path))) return false;
  return true;
}

function scorePage4Url(url: string): number {
  // Prefer shorter clean slugs and paths that end with /
  let score = 0;
  const path = shortUrl(url);
  // Penalize very long paths (deep nesting)
  const depth = (path.match(/\//g) ?? []).length;
  score -= depth * 2;
  // Penalize long slugs
  score -= Math.floor(path.length / 10);
  // Prefer paths ending with /
  if (path.endsWith("/")) score += 3;
  // Prefer paths that are clearly a direct service page (short slug with one keyword)
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 2) score += 5;
  return score;
}

function generateSection4(
  sfData: Record<string, any>[],
  sfHeaders: string[],
  client: Client,
  livePageOverrides: Record<string, string> = {},
  verificationRan: boolean = false,
  sfIsUrlCrawl: boolean = false
): Section4Services {
  // When SF is Issues format (no URL crawl), we can only assert a page is missing
  // if HTTP verification positively found it elsewhere. Otherwise "Manual entry needed".
  // Only URL-crawl SF data gives us comprehensive coverage to say "Not found on site".
  const missingPageLabel = sfIsUrlCrawl ? NOT_FOUND : ME;
  const services: ServiceRow[] = [];
  const urlCol = sfHeaders.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? sfHeaders[0] ?? "";

  // Contact / Admissions handled separately below via isUtilityAdmissionsPage().
  const serviceTargets = [
    { service: "Detox", pattern: /\/detox/i },
    { service: "Residential / Inpatient", pattern: /\/residential|\/inpatient|\/treatment[-\/]|\/long-?term[-\/]|\/recovery[-_]program|\/rehab[-\/]/i },
    { service: "PHP / IOP", pattern: /\/php(?!p)|\/iop|\/partial.?hospital|\/intensive.?out/i },
    { service: "Outpatient", pattern: /\/outpatient(?!.*intensive)/i },
    { service: "Dual Diagnosis", pattern: /\/dual.?diagnosis|\/co.?occurring/i },
    { service: "Verify Insurance", pattern: /\/verify.?insur|\/vob\b|\/insurance.?verif|\/check.?insur/i },
    { service: "Primary Location", pattern: /\/location\b|\/campus\b|\/facility\b|\/our.?location/i },
    { service: "Therapies", pattern: /\/therap(y|ies)\b|\/treatment.?modalities|\/modalities/i },
    { service: "Conditions", pattern: /\/conditions\b|\/mental.?health\b|\/disorders\b/i },
  ];

  // Insurance landing pages (common but broad) — allow as fallback for Verify Insurance
  const insuranceBroadPattern = /\/insurance\b/i;

  if (sfData.length > 0 && urlCol) {
    const statusColHeader4 = sfHeaders.find(h => /^status code$/i.test(h) || /^status$/i.test(h));
    const liveSfData4 = statusColHeader4
      ? sfData.filter(r => { const s = Number(r[statusColHeader4]); return !(s >= 300 && s < 400); })
      : sfData;
    const allUrls = liveSfData4.map(r => String(r[urlCol] ?? ""));
    // Filter to only valid, non-redirect page URLs before any matching
    const pageUrls = allUrls.filter(isValidPageUrl);

    console.log(`[Section4] Total SF URLs: ${allUrls.length} (after redirect filter), valid page URLs after filtering: ${pageUrls.length}`);

    // Contact / Admissions — strict first-segment utility check (no broad regex)
    const contactCandidates4 = pageUrls.filter(u => isUtilityAdmissionsPage(u));
    if (contactCandidates4.length > 0) {
      contactCandidates4.sort((a, b) => scorePage4Url(b) - scorePage4Url(a));
      const best = contactCandidates4[0];
      console.log(`[Section4] Contact / Admissions → ${shortUrl(best)} (${contactCandidates4.length} candidates)`);
      services.push({ service: "Contact / Admissions", examplePage: shortUrl(best) });
    }

    for (const target of serviceTargets) {
      // Collect all candidates for this service
      let candidates = pageUrls.filter(u => target.pattern.test(u));

      // Fallback for Verify Insurance: allow the broader /insurance/ path if no specific match
      if (candidates.length === 0 && target.service === "Verify Insurance") {
        candidates = pageUrls.filter(u => insuranceBroadPattern.test(u));
      }

      if (candidates.length > 0) {
        // Sort by score — best candidate first
        candidates.sort((a, b) => scorePage4Url(b) - scorePage4Url(a));
        const best = candidates[0];
        console.log(`[Section4] ${target.service} → ${shortUrl(best)} (${candidates.length} candidates, rejected ${pageUrls.length === 0 ? 0 : allUrls.filter(u => target.pattern.test(u) && !isValidPageUrl(u)).length} assets)`);
        services.push({ service: target.service, examplePage: shortUrl(best) });
      } else {
        const rejectedCount = allUrls.filter(u => target.pattern.test(u) && !isValidPageUrl(u)).length;
        if (rejectedCount > 0) {
          console.log(`[Section4] ${target.service} → ${ME} (${rejectedCount} asset matches rejected, no valid page found)`);
        }
      }
    }
  }

  // Ensure Contact / Admissions is always added first (it has priority for Tier 1 scoring)
  // before the generic serviceTargets fill loop consumes all 8 slots.
  if (!services.find(s => s.service === "Contact / Admissions")) {
    if (livePageOverrides["Contact / Admissions"]) {
      services.push({ service: "Contact / Admissions", examplePage: livePageOverrides["Contact / Admissions"] });
    } else {
      services.push({ service: "Contact / Admissions", examplePage: missingPageLabel });
    }
  } else if (livePageOverrides["Contact / Admissions"]) {
    // SF found something but live verification found a cleaner resolved path — prefer live
    const idx = services.findIndex(s => s.service === "Contact / Admissions");
    if (idx >= 0 && (services[idx].examplePage === ME || services[idx].examplePage === NOT_FOUND)) {
      services[idx] = { ...services[idx], examplePage: livePageOverrides["Contact / Admissions"] };
    }
  }

  // Fill remaining missing services with live overrides or missingPageLabel up to 8 rows
  for (const target of serviceTargets) {
    if (services.length >= 8) break;
    if (!services.find(s => s.service === target.service)) {
      if (livePageOverrides[target.service]) {
        services.push({ service: target.service, examplePage: livePageOverrides[target.service] });
      } else {
        services.push({ service: target.service, examplePage: missingPageLabel });
      }
    }
  }

  // Compute SEO score and notes for each service row
  const tier1CriticalServices = new Set([
    "Detox", "Residential / Inpatient", "Verify Insurance", "Contact / Admissions",
  ]);
  const scoredServices: ServiceRow[] = services.slice(0, 8).map(s => {
    const notFound = s.examplePage === ME || s.examplePage === NOT_FOUND || /manual entry needed/i.test(s.examplePage);
    const isCritical = tier1CriticalServices.has(s.service);

    if (notFound) {
      return {
        ...s,
        seoScore: isCritical ? 1 : 2,
        notes: isCritical
          ? `No dedicated ${s.service} page was confirmed in the crawl — this is a Tier 1 conversion gap. A clear, dedicated page is needed before other optimization will compound.`
          : `No dedicated ${s.service} page was found in the crawl. Adding a dedicated page would improve topical authority and user navigation.`,
      };
    }

    const pathParts = s.examplePage.split("/").filter(Boolean);
    const depth = pathParts.length;
    let score = depth <= 1 ? 7 : depth === 2 ? 6 : 5;
    if (isCritical) score = Math.min(score, 6);

    const urlNote = depth >= 3
      ? `Nested URL (${s.examplePage}) — a flatter path may improve authority flow and user clarity.`
      : `URL structure is reasonable (${s.examplePage}).`;

    const qualityNote = isCritical
      ? `Inference: Content depth, CTA placement, and internal linking to this page should be verified before claiming full conversion readiness.`
      : `Inference: Content quality and internal linking effectiveness need manual review to confirm above-baseline performance.`;

    return {
      ...s,
      seoScore: score,
      notes: `${urlNote} ${qualityNote}`,
    };
  });

  return { services: scoredServices };
}

function buildTierScorecard(tierInput: TierDiagnosisInput): TierScorecardEntry[] {
  const t1Pass = tierInput.hasVobPage && tierInput.hasContactPage
    && tierInput.hasDetoxPage && tierInput.hasResidentialPage
    && tierInput.highIntentTrafficLandsOnClearUrls;

  const t1Status: TierScorecardEntry["status"] = t1Pass ? "Pass"
    : (!tierInput.hasDetoxPage && !tierInput.hasResidentialPage) ? "Blocked"
    : "Partial";

  const nav = tierInput.navAccessibility;

  function vobAccessLabel(): string {
    if (!tierInput.hasVobPage) return "Not confirmed — no dedicated insurance verification page found at standard paths; verify with AM and provide URL";
    if (!nav?.dataAvailable) return "Confirmed present — nav/footer accessibility not verified (homepage fetch unavailable)";
    if (nav.vobInNav) return "Confirmed present — linked from main navigation (Fact)";
    if (nav.vobInFooter) return "Confirmed present — linked from footer, not main nav (Fact)";
    return "Confirmed present — not found in main navigation or footer (Inference: may be accessible only via internal links or direct URL)";
  }

  function contactAccessLabel(): string {
    if (!tierInput.hasContactPage) return "Not confirmed — no dedicated contact/admissions page found at standard paths; verify with AM and provide URL";
    if (!nav?.dataAvailable) return "Confirmed present — nav/footer accessibility not verified (homepage fetch unavailable)";
    if (nav.contactInNav) return "Confirmed present — linked from main navigation (Fact)";
    if (nav.contactInFooter) return "Confirmed present — linked from footer, not main nav (Fact)";
    return "Confirmed present — not found in main navigation or footer (Inference: may be accessible only via internal links or direct URL)";
  }

  const t1Findings = [
    `Verify Insurance / VOB page: ${vobAccessLabel()}`,
    `Contact / Admissions page: ${contactAccessLabel()}`,
    `Detox service page: ${tierInput.hasDetoxPage ? "Confirmed present" : "Not confirmed — no dedicated detox page found at standard paths; verify with AM and provide URL"}`,
    `Residential page: ${tierInput.hasResidentialPage ? "Confirmed present" : "Not confirmed — no dedicated residential page found at standard paths; verify with AM and provide URL"}`,
  ].join(". ");

  const t1Inferences = tierInput.highIntentTrafficLandsOnClearUrls
    ? "High-intent traffic appears to land on clear primary URLs — conversion path alignment is directionally sound (Inference from GSC data). Content depth, CTA clarity, and form functionality still require manual verification."
    : "High-intent traffic may not be landing on clear primary service URLs (Inference from GSC data) — review which pages are capturing service-intent queries and whether they are conversion-optimized.";

  const t2Pass = tierInput.hasConditionsHub && tierInput.hasTherapiesHub && tierInput.missingH1s <= 10;
  const t2Status: TierScorecardEntry["status"] = t2Pass ? "Pass"
    : (!tierInput.hasConditionsHub && !tierInput.hasTherapiesHub) ? "Blocked"
    : "Partial";

  const t2Findings = [
    `Conditions hub: ${tierInput.hasConditionsHub ? "Structure detected" : "Not detected in crawl"}`,
    `Therapies hub: ${tierInput.hasTherapiesHub ? "Structure detected" : "Not detected in crawl"}`,
    tierInput.missingH1s > 10 ? `${tierInput.missingH1s} pages with missing H1 tags detected` : "H1 coverage appears adequate",
  ].join(". ");

  const t2Inferences = !tierInput.hasConditionsHub || !tierInput.hasTherapiesHub
    ? "Without hub structures, condition and therapy pages may be fragmenting authority rather than consolidating it into Levels of Care pages. Hub pages create a topical map that Google uses to distribute ranking signals."
    : "Hub structures appear present. Internal linking quality and depth within the hub require manual review to confirm authority flow is functioning.";

  const hasT3Issues = tierInput.duplicateServicePages > 3 || tierInput.thinPages > 15
    || tierInput.errors4xx5xx > 10 || tierInput.redirects > (tierInput.totalUrls * 0.15);
  const t3Status: TierScorecardEntry["status"] = hasT3Issues ? "Partial" : "Pass";

  const t3Findings = [
    tierInput.errors4xx5xx > 0 ? `${tierInput.errors4xx5xx} error pages (4xx/5xx) detected` : "No significant error pages detected",
    tierInput.thinPages > 0 ? `${tierInput.thinPages} thin pages flagged in crawl` : "Thin page count within acceptable range",
    tierInput.duplicateServicePages > 0 ? `${tierInput.duplicateServicePages} duplicate or overlapping service pages detected` : "No significant service page duplication",
    tierInput.redirects > 0 ? `${tierInput.redirects} redirects detected` : null,
  ].filter(Boolean).join(". ");

  const t3Inferences = tierInput.thinPages > 10
    ? "Thin pages suppress crawl efficiency and dilute domain quality signals. Consolidate or strengthen pages with fewer than ~300 words of meaningful content."
    : tierInput.errors4xx5xx > 10
    ? "Error pages create structural drag on crawl budget — crawlers may be wasting capacity on dead URLs instead of priority Levels of Care pages."
    : "Technical indicators are within a manageable range. Spot-check error pages and redirect chains for any suppression on key conversion pages.";

  const t4Present = tierInput.hasAboutPage && tierInput.hasTeamPage;
  const t4Status: TierScorecardEntry["status"] = t4Present && tierInput.hasAlumniPage ? "Pass"
    : t4Present ? "Partial"
    : "Unknown";

  const t4Findings = [
    `About page: ${tierInput.hasAboutPage ? "Present" : "Not confirmed in crawl"}`,
    `Team / leadership page: ${tierInput.hasTeamPage ? "Present" : "Not confirmed in crawl"}`,
    `Alumni / aftercare page: ${tierInput.hasAlumniPage ? "Present" : "Not confirmed in crawl"}`,
  ].join(". ");

  const t4Inferences = !tierInput.hasAlumniPage
    ? "Alumni and aftercare content is a differentiator in competitive treatment markets — its absence limits E-E-A-T signals in comparison-stage searches where multiple facilities are evaluated side-by-side."
    : "Authority-stage pages are present. External credibility signals (reviews, accreditation mentions, directory listings) determine the ceiling beyond this point.";

  return [
    {
      tierNumber: 1,
      tierName: "Trust & Eligibility",
      status: t1Status,
      findings: t1Findings,
      inferences: t1Inferences,
      whyItMatters: "Tier 1 pages are the foundation of organic admissions conversion. Without a clear VOB page, contact path, and primary Levels of Care pages, all higher-tier work cannot compound.",
      source: "Screaming Frog",
    },
    {
      tierNumber: 2,
      tierName: "Structural Authority",
      status: t2Status,
      findings: t2Findings,
      inferences: t2Inferences,
      whyItMatters: "Service architecture determines how authority flows between pages. Hub structures allow Google to map topical expertise and pass ranking power into Levels of Care and program pages.",
      source: "Screaming Frog",
    },
    {
      tierNumber: 3,
      tierName: "Consolidation & Cleanup",
      status: t3Status,
      findings: t3Findings,
      inferences: t3Inferences,
      whyItMatters: "Technical drag (errors, thin content, duplication) reduces crawl efficiency and can suppress rankings across all pages — including core conversion pages.",
      source: "Screaming Frog + GSC",
    },
    {
      tierNumber: 4,
      tierName: "Conversion & Differentiation",
      status: t4Status,
      findings: t4Findings,
      inferences: t4Inferences,
      whyItMatters: "Authority depth signals real expertise and community trust — factors that increasingly influence Google rankings for health-related (YMYL) content.",
      source: "Screaming Frog",
    },
  ];
}

function checkHighIntentLanding(gscPages: any[], sfData: Record<string, any>[], sfHeaders: string[]): boolean {
  if (gscPages.length === 0) return true;
  const topPages = gscPages.slice(0, 20);
  let highIntentOnClearUrl = 0;
  for (const row of topPages) {
    const page = row.keys?.[0] ?? "";
    const type = classifyPageType(page);
    if (["Verify Insurance", "Contact / Admissions", "Detox", "Residential / Inpatient", "PHP / IOP"].includes(type)) {
      highIntentOnClearUrl++;
    }
  }
  return highIntentOnClearUrl >= 3;
}

interface AmContext {
  sentimentKey: string | null;
  hypothesisSignals: string[];
  hypothesisSummary: string | null;
  auditSignals: string[];
  auditSummary: string | null;
}

function parseAmContext(sentiment?: string, hypothesis?: string, auditNotes?: string): AmContext {
  const hypothesisSignals: string[] = [];
  const hypothesisSummary = hypothesis?.trim() ? hypothesis.trim().slice(0, 160) : null;

  if (hypothesis) {
    const h = hypothesis.toLowerCase();
    if (/admissions|vob|insurance.*verif|contact form|conversion path/.test(h)) hypothesisSignals.push("admissions_path");
    if (/service.?page|program page|trust/.test(h)) hypothesisSignals.push("service_page");
    if (/convert|cvr|conversion rate|cta/.test(h)) hypothesisSignals.push("conversion");
    if (/internal.?link/.test(h)) hypothesisSignals.push("internal_linking");
    if (/local|gbp|google business|map pack|location page/.test(h)) hypothesisSignals.push("local");
    if (/content|blog|refresh|article|copywrite/.test(h)) hypothesisSignals.push("content");
    if (/technical|crawl|site.?speed|core web|performance|site.?health/.test(h)) hypothesisSignals.push("technical");
    if (/cannibali|duplicate.?content/.test(h)) hypothesisSignals.push("cannibalization");
    if (/keyword|rank|position|serp/.test(h)) hypothesisSignals.push("rankings");
  }

  const auditSignals: string[] = [];
  const auditSummary = auditNotes?.trim() ? auditNotes.trim().slice(0, 200) : null;

  if (auditNotes) {
    const a = auditNotes.toLowerCase();
    if (/title|meta desc|h1|heading tag/.test(a)) auditSignals.push("metadata");
    if (/internal.?link/.test(a)) auditSignals.push("internal_linking");
    if (/thin content|thin pages|duplicate|cannibali/.test(a)) auditSignals.push("thin_content");
    if (/redirect|404|broken link|error page/.test(a)) auditSignals.push("crawl_errors");
    if (/noindex|non.?indexable|indexability/.test(a)) auditSignals.push("noindex");
    if (/speed|core web vitals|lcp|cls|fid|page speed/.test(a)) auditSignals.push("page_speed");
    if (/admissions|vob|contact|conversion/.test(a)) auditSignals.push("admissions_path");
    if (/service.?page|program page/.test(a)) auditSignals.push("service_page");
    if (/schema|structured data/.test(a)) auditSignals.push("schema");
  }

  return {
    sentimentKey: sentiment ?? null,
    hypothesisSignals,
    hypothesisSummary,
    auditSignals,
    auditSummary,
  };
}

function enrichWithAmContext(priorities: PriorityRow[], amCtx: AmContext): void {
  for (const p of priorities) {
    const initLower = p.initiative.toLowerCase();

    if (amCtx.hypothesisSignals.includes("admissions_path") &&
      /admissions|conversion path|vob/.test(initLower) && amCtx.hypothesisSummary) {
      p.reason += ` AM focus area aligns: ${amCtx.hypothesisSummary.slice(0, 90).replace(/\.$/, "")}.`;
    }
    if (amCtx.hypothesisSignals.includes("service_page") &&
      /service page|service foundation/.test(initLower) && amCtx.hypothesisSummary) {
      p.reason += ` AM focus area aligns: ${amCtx.hypothesisSummary.slice(0, 90).replace(/\.$/, "")}.`;
    }
    if (amCtx.hypothesisSignals.includes("internal_linking") &&
      /internal link/.test(initLower) && amCtx.hypothesisSummary) {
      p.reason += ` AM context: ${amCtx.hypothesisSummary.slice(0, 80).replace(/\.$/, "")}.`;
    }
    if (amCtx.hypothesisSignals.includes("content") &&
      /content refresh/.test(initLower) && amCtx.hypothesisSummary) {
      p.reason += ` AM context: ${amCtx.hypothesisSummary.slice(0, 80).replace(/\.$/, "")}.`;
    }
    if (amCtx.hypothesisSignals.includes("technical") &&
      /technical cleanup/.test(initLower) && amCtx.hypothesisSummary) {
      p.reason += ` AM focus area aligns: ${amCtx.hypothesisSummary.slice(0, 80).replace(/\.$/, "")}.`;
    }

  }
}

function addNetNewAmPriorities(
  priorities: PriorityRow[],
  amCtx: AmContext,
  section5: Section5Diagnosis
): void {
  const covered = priorities.map(p => p.initiative.toLowerCase());

  if (amCtx.hypothesisSignals.includes("local") &&
    !covered.some(c => /local|gbp/.test(c)) &&
    priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Local Presence Optimization",
      tier: "Tier 3",
      action: "Strengthen Google Business Profile signals and local service-area content to improve map-pack visibility in the primary target market",
      reason: amCtx.hypothesisSummary
        ? `Strategic focus this quarter: ${amCtx.hypothesisSummary.slice(0, 100).replace(/\.$/, "")}. Local signals are a compounding factor for treatment center visibility in geo-targeted searches.`
        : "Local presence improvements compound with organic rankings — GBP signals, local citations, and location content reinforce market-area authority",
      source: "Manual entry needed",
    });
  }

  if (amCtx.hypothesisSignals.includes("rankings") &&
    !covered.some(c => /keyword rank|ranking accel/.test(c)) &&
    priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Keyword Ranking Acceleration",
      tier: `Tier ${Math.min(section5.tier, 3)}`,
      action: "Identify the 10–15 highest-value keywords where the site ranks on page 2 and build targeted content and link equity to push them to page 1",
      reason: amCtx.hypothesisSummary
        ? `Strategic direction: ${amCtx.hypothesisSummary.slice(0, 100).replace(/\.$/, "")}. Page 2 keywords are the fastest path to meaningful organic traffic gains without new content investment.`
        : "Page 2 rankings represent ready-to-capture traffic — closing that gap is higher ROI than launching net-new content",
      source: "GSC",
    });
  }

  if (amCtx.auditSignals.includes("page_speed") &&
    !covered.some(c => /speed|core web|performance/.test(c)) &&
    priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Core Web Vitals / Page Speed",
      tier: "Tier 3",
      action: "Audit and improve LCP, CLS, and FID scores on primary service and admissions pages to meet Google's performance threshold",
      reason: "Slow load times on high-intent pages suppress both rankings and on-site conversion rates — LCP, CLS, and FID improvements directly impact user experience signals.",
      source: "Manual entry needed",
    });
  }

  if (amCtx.auditSignals.includes("schema") &&
    !covered.some(c => /schema|structured data/.test(c)) &&
    priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Schema Markup Implementation",
      tier: "Tier 3",
      action: "Implement LocalBusiness, MedicalOrganization, and FAQ schema on core service and admissions pages",
      reason: "Schema markup improves SERP feature eligibility and helps Google confirm treatment center entity context across service and admissions pages.",
      source: "Manual entry needed",
    });
  }

  if (amCtx.auditSignals.includes("noindex") &&
    !covered.some(c => /noindex|non.?index|indexability/.test(c)) &&
    !((tierInput.nonIndexable ?? 0) > 5) &&
    priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Indexability Audit",
      tier: "Tier 3",
      action: "Audit non-indexable pages — identify any service, location, or content pages accidentally excluded from Google's index and remove incorrect noindex tags",
      reason: "Non-indexable pages cannot rank regardless of content quality. A single service page accidentally noindexed represents zero organic traffic potential",
      source: "Manual entry needed",
    });
  }

  if (amCtx.hypothesisSignals.includes("cannibalization") &&
    !covered.some(c => /cannibali|consolidat/.test(c)) &&
    priorities.length < 7) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Keyword Cannibalization Cleanup",
      tier: "Tier 3",
      action: "Identify pages competing for the same service and condition keywords and consolidate or differentiate them to protect primary ranking pages",
      reason: amCtx.hypothesisSummary
        ? `AM focus area: ${amCtx.hypothesisSummary.slice(0, 90).replace(/\.$/, "")}. Cannibalization dilutes authority on core Levels of Care pages.`
        : "Pages competing for the same keywords split ranking signals — consolidation protects the primary Levels of Care page hierarchy",
      source: "Manual entry needed",
    });
  }
}

function hasTrackingGaps(section2: Section2Conversions): boolean {
  const allNotes = [
    ...section2.topConvertingPages.map(p => p.notes),
    ...section2.topConvertingSources.map(s => s.notes),
  ].join(" ").toLowerCase();
  return TRACKING_GAP_PHRASES.some(phrase => allNotes.includes(phrase));
}

const S6_BUSINESS_ORDER: string[] = [
  "Tracking & Attribution Setup",
  "Admissions Pathway Clarity",
  "Core Service Page Foundation",
  "Conversion Path Audit",
  "Internal Linking — High-Traffic to Conversion",
  "Content Refresh — Highest-Traffic Assisted Pages",
  "Title & Meta Optimization",
  "Conditions Hub Structure",
  "Therapies Architecture",
  "Technical Cleanup",
  "Location Consolidation",
  "Organic Channel Health Review",
];

function sortByBusinessOrder(priorities: PriorityRow[]): void {
  priorities.sort((a, b) => {
    const ai = S6_BUSINESS_ORDER.indexOf(a.initiative);
    const bi = S6_BUSINESS_ORDER.indexOf(b.initiative);
    const aIdx = ai >= 0 ? ai : S6_BUSINESS_ORDER.length;
    const bIdx = bi >= 0 ? bi : S6_BUSINESS_ORDER.length;
    return aIdx - bIdx;
  });
  priorities.forEach((p, i) => { p.priority = i + 1; });
}

/** generateSection6 — content credit cap is enforced against `monthlyCredits` (passed from
 *  routes.ts CLIENT_CREDIT_MAP, the canonical source per data-handling-rules skill).
 *  Default of 5 applies only when the client is unknown. */
function generateSection6(
  section1: Section1Goals,
  section2: Section2Conversions,
  section3: Section3Traffic,
  section4: Section4Services,
  section5: Section5Diagnosis,
  tierInput: TierDiagnosisInput,
  completedWork: string[],
  sentiment?: string,
  hypothesis?: string,
  auditNotes?: string,
  monthlyCredits: number = 5,
  strategyBankEntries: Array<{ service: string; description: string }> = [],
  strategyBankFetchFailed: boolean = false
): Section6Priorities {
  const priorities: PriorityRow[] = [];
  const completedLower = completedWork.map(w => w.toLowerCase());

  function isAlreadyDone(keyword: string): boolean {
    return completedLower.some(w => w.includes(keyword.toLowerCase()));
  }

  if (hasTrackingGaps(section2) && !isAlreadyDone("tracking") && !isAlreadyDone("attribution")) {
    priorities.push({
      priority: 1,
      initiative: "Tracking & Attribution Setup",
      tier: "Tier 1",
      action: "Implement or verify GA4 and call-tracking instrumentation on key admissions-path pages — track contact form submits separately from Verify Insurance / VOB form submits, starting with Contact, Verify Insurance, and highest-intent Levels of Care pages.",
      reason: "Reporting confidence is limited where conversion tracking is missing. Instrumentation must be in place before page-level admit connection can be quantified reliably.",
      source: "Multi-source",
    });
  }

  if (section5.tier <= 1) {
    if (!tierInput.hasDetoxPage || !tierInput.hasResidentialPage) {
      if (!isAlreadyDone("service page") && !isAlreadyDone("level of care") && !isAlreadyDone("detox") && !isAlreadyDone("residential")) {
        const missingLocs: string[] = [];
        if (!tierInput.hasDetoxPage) missingLocs.push("detox/detoxification");
        if (!tierInput.hasResidentialPage) missingLocs.push("residential/inpatient");
        priorities.push({
          priority: priorities.length + 1,
          initiative: "Levels of Care Page Foundation",
          tier: "Tier 1",
          action: `Confirm whether dedicated ${missingLocs.join(" and ")} Level of Care pages exist in the crawl. If present, verify they are indexable and nav-accessible. If absent, create dedicated pages with a clear slug (e.g. /detox, /residential-treatment), proper H1, conversion CTA, and internal links from the homepage and admissions path.`,
          reason: `Levels of Care pages (${missingLocs.join(", ")}) are not confirmed in the crawl — these are Tier 1 conversion assets. Without a clearly indexed, nav-accessible page for each Level of Care, high-intent search traffic cannot land on a conversion-ready URL.`,
          source: "Multi-source",
        });
      }
    }
    if (!tierInput.hasVobPage || !tierInput.hasContactPage) {
      if (!isAlreadyDone("insurance") && !isAlreadyDone("vob") && !isAlreadyDone("admissions")) {
        const missing: string[] = [];
        if (!tierInput.hasVobPage) missing.push("Verify Insurance / VOB");
        if (!tierInput.hasContactPage) missing.push("Contact / Admissions");
        priorities.push({
          priority: priorities.length + 1,
          initiative: "Admissions Pathway — Verify Insurance & Contact",
          tier: "Tier 1",
          action: `Add persistent ${missing.join(" and ")} links to the main navigation and footer if absent. Add direct internal links from all top organic landing pages to the ${missing.join(" and ")} page(s). Verify the ${missing.join("/")} form(s) have GA4 event tracking and/or call-tracking attribution active so conversion actions from organic traffic are measurable.`,
          reason: `${missing.join(" and ")} page(s) are the last digital step before a user contacts admissions. Every organic landing that reaches this stage without a clear path to ${missing.length > 1 ? "these pages" : "this page"} is a measurable conversion leak. Navigation and footer placement are the lowest-cost fix.`,
          source: "Multi-source",
        });
      }
    }
  }

  if (section5.tier <= 2 && priorities.length < 8) {
    if (!tierInput.hasConditionsHub && !isAlreadyDone("conditions hub")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Conditions Hub — Topical Authority Structure",
        tier: "Tier 2",
        action: "Create a /mental-health or /conditions hub page with internal links to individual condition pages (depression, anxiety, PTSD, trauma, etc.). Each condition page should link back to the hub and forward to relevant Levels of Care pages, creating a clear topical cluster for Google to index.",
        reason: "Without a conditions hub, each condition page competes independently for authority. A hub structure consolidates topical signals, passes authority to Levels of Care pages, and gives Google a clear taxonomy — all three effects improve rankings on condition-specific queries.",
        source: "Multi-source",
      });
    }
    if (!tierInput.hasTherapiesHub && !isAlreadyDone("therapies hub") && !isAlreadyDone("therapy hub")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Therapies Hub — Treatment Modality Architecture",
        tier: "Tier 2",
        action: "Create a /therapies or /treatment-modalities hub page listing all therapy types (CBT, DBT, EMDR, trauma-informed care, etc.) with links to individual therapy pages. Link each therapy page back to the hub and cross-link to relevant Levels of Care pages (e.g., CBT → IOP, Trauma → PHP/Residential).",
        reason: "Therapy pages are strong E-E-A-T differentiators but they generate authority in isolation without a hub. Organizing them under a hub page lets Google understand the program's clinical depth, improves rankings on therapy-specific searches, and strengthens internal authority flow to conversion pages.",
        source: "Multi-source",
      });
    }
  }

  if (section5.tier <= 3 && priorities.length < 7) {
    if (tierInput.errors4xx5xx > 10 && !isAlreadyDone("404") && !isAlreadyDone("error")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Technical Cleanup",
        tier: "Tier 3",
        action: `Resolve ${tierInput.errors4xx5xx} error pages (4xx/5xx) and clean up redirect chains suppressing crawl efficiency`,
        reason: "Error pages create structural drag — cleaning them improves crawl budget allocation to revenue pages",
        source: "Multi-source",
      });
    }
    if ((tierInput.nonIndexable ?? 0) > 5 && !isAlreadyDone("noindex") && !isAlreadyDone("non-index") && !isAlreadyDone("indexability") && priorities.length < 7) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Indexability Audit",
        tier: "Tier 3",
        action: `Audit ${tierInput.nonIndexable} non-indexable pages — identify any service, location, or content pages accidentally excluded from Google's index and remove incorrect noindex tags`,
        reason: "Non-indexable pages cannot rank regardless of content quality. A single service page accidentally noindexed represents zero organic traffic potential",
        source: "Screaming Frog",
      });
    }
    if (tierInput.overlapGeoPages > 5 && !isAlreadyDone("geo") && !isAlreadyDone("location")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Location Consolidation",
        tier: "Tier 3",
        action: "Retire overlapping near-me and legacy geo pages into the primary location architecture",
        reason: "Duplicate geo pages dilute authority and confuse Google about the primary service area",
        source: "Multi-source",
      });
    }
  }

  const unclearTrafficPages = section3.topTrafficPages.filter(p =>
    p.connectionToAdmits === "Low" || p.connectionToAdmits === "Medium"
  );
  const topUnclearPage = unclearTrafficPages[0];
  const goalBehind = section1.rows.some(r => r.goalShift === "-5%");
  const hasMissingH1s = tierInput.missingH1s > 10;
  const hasThinPages = tierInput.thinPages > 15;
  const topTrafficTopic = section3.topTrafficTopics.find(t => t.connectionToAdmits === "Low" || t.connectionToAdmits === "Medium");
  const thinPagesNote = hasThinPages ? ` (${tierInput.thinPages} thin pages detected in crawl)` : "";

  // Build a short list of actual page slugs for tactical recommendations (3–6 pages)
  function examplePageList(pages: typeof unclearTrafficPages, max = 5): string {
    const slugs = pages.slice(0, max).map(p => p.page.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || p.page);
    if (slugs.length === 0) return "";
    return `: ${slugs.join(", ")}`;
  }

  // Cluster notation helper: "Topic Name (N queries) (X% of clicks)"
  // insight already contains the click share as its first token (e.g. "12% of clicks...")
  function clusterRef(topic: typeof topTrafficTopic): string {
    if (!topic) return "";
    const queryCount = topic.queryCount ?? 0;
    // Extract click share from insight string — format is "NN% of clicks..."
    const clickShareMatch = topic.insight.match(/^(\d+(?:\.\d+)?%\s+of\s+clicks)/i);
    const clickStr = clickShareMatch ? ` (${clickShareMatch[1]})` : "";
    return `"${topic.topic}" cluster (${queryCount} queries)${clickStr}`;
  }

  // For internal linking: use up to 5 unclear pages for richer examples
  const internalLinkExamples = examplePageList(unclearTrafficPages, 5);
  // For content refresh: also pull top traffic pages as refresh targets
  const refreshExamples = examplePageList(
    section3.topTrafficPages.filter(p => p.connectionToAdmits !== "High").slice(0, 5),
    5
  );

  const evidenceFillers: Array<{ initiative: string; tier: string; action: string; reason: string; condition: boolean; source: string }> = [
    {
      initiative: "Internal Linking — High-Traffic to Conversion",
      tier: `Tier ${Math.min(section5.tier, 3)}`,
      action: unclearTrafficPages.length > 0
        ? `Add internal links from high-traffic pages with low admit connection to primary service and VOB pages${internalLinkExamples}`
        : "Add internal links from high-traffic informational pages to primary service and VOB pages",
      reason: topUnclearPage
        ? `${unclearTrafficPages.length} page${unclearTrafficPages.length > 1 ? "s" : ""} (led by ${topUnclearPage.page}, ${topUnclearPage.clicks} clicks) carry organic traffic with limited path to admissions — targeted internal links to service and VOB pages are the lowest-cost lever to convert that existing traffic`
        : "Traffic data shows high-volume informational pages with weak admit connection — internal linking is the lowest-cost conversion lever",
      condition: unclearTrafficPages.length > 0 && !priorities.find(p => p.initiative.includes("Internal Link")),
      source: "GSC",
    },
    {
      initiative: "Conversion Path Audit",
      tier: `Tier ${Math.min(section5.tier, 4)}`,
      action: goalBehind
        ? `Audit and repair the organic-to-VOB path — goal is behind pace and conversion leakage is the most likely cause`
        : "Audit and strengthen the path from organic landing pages to VOB/contact submission",
      reason: goalBehind
        ? `Organic sessions are behind Q pace — improving conversion rate on existing traffic is higher ROI than acquiring new traffic`
        : "Conversion path gaps compound slowly; fixing them now avoids a larger gap by end of quarter (lower confidence without GA4 data)",
      condition: !priorities.find(p => p.initiative.includes("Conversion")),
      source: "GA4",
    },
    {
      initiative: "Content Refresh — Highest-Traffic Assisted Pages",
      tier: `Tier ${Math.min(section5.tier + 1, 5)}`,
      action: topTrafficTopic
        ? `Refresh content in the ${clusterRef(topTrafficTopic)} to improve engagement and strengthen links to Levels of Care pages${refreshExamples}`
        : `Refresh highest-traffic assisted-conversion pages${thinPagesNote}${refreshExamples}`,
      reason: topTrafficTopic
        ? `The ${clusterRef(topTrafficTopic)} drives meaningful traffic but shows ${topTrafficTopic.connectionToAdmits.toLowerCase()} admit connection — refreshed content with stronger CTAs and internal links captures more value from existing impressions`
        : `Existing high-traffic pages${hasThinPages ? ` and ${tierInput.thinPages} detected thin pages` : ""} are the fastest path to improving organic conversion without new content investment`,
      condition: !priorities.find(p => p.initiative.includes("Content Refresh")) && !isAlreadyDone("content refresh"),
      source: "GSC",
    },
    {
      initiative: "Title & Meta Optimization",
      tier: "Tier 1",
      action: hasMissingH1s
        ? `Fix ${tierInput.missingH1s} pages with missing H1 tags and audit meta descriptions on top-traffic pages to improve CTR${examplePageList(section3.topTrafficPages.slice(0, 4), 4)}`
        : `Audit title tags and meta descriptions on highest-impression pages to improve organic CTR${examplePageList(section3.topTrafficPages.slice(0, 4), 4)}`,
      reason: hasMissingH1s
        ? `Crawl shows ${tierInput.missingH1s} pages without H1 tags — these pages are structurally weak and likely suppressed in rankings; fixing them requires low effort for potentially high impact`
        : "CTR improvements on existing impression volume require no new traffic — they are free growth on what the site already earns",
      condition: !priorities.find(p => p.initiative.includes("Title") || p.initiative.includes("Meta")),
      source: "Multi-source",
    },
  ];

  for (const f of evidenceFillers) {
    if (priorities.length >= 8) break;
    if (f.condition) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: f.initiative,
        tier: f.tier,
        action: f.action,
        reason: f.reason,
        source: f.source,
      });
    }
  }

  if (priorities.length < 4) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Organic Channel Baseline Audit",
      tier: `Tier ${section5.tier}`,
      action: "Pull QoQ GSC and GA4 data for organic channel: compare sessions, conversions, and impressions quarter-over-quarter. Identify the 3 pages with the largest positive and largest negative movement. Use this baseline to set data-backed Q2 targets before committing to new content or structural work.",
      reason: "Directional strategy decisions without a clean QoQ baseline lead to misallocated credits. A one-time baseline review prevents that and sharpens every downstream recommendation.",
      source: "GA4",
    });
  }

  const amCtx = parseAmContext(sentiment, hypothesis, auditNotes);

  enrichWithAmContext(priorities, amCtx);

  addNetNewAmPriorities(priorities, amCtx, section5);

  if (amCtx.sentimentKey === "concerned" || amCtx.sentimentKey === "frustrated") {
    if (priorities.length > 0) {
      priorities[0].reason = `Given the current client situation, this is the highest-leverage action to address performance concerns. ${priorities[0].reason}`;
    }
  } else if (amCtx.sentimentKey === "happy") {
    if (priorities.length > 0) {
      priorities[0].reason = `Building on current momentum, ${priorities[0].reason.charAt(0).toLowerCase() + priorities[0].reason.slice(1)}`;
    }
  }

  sortByBusinessOrder(priorities);

  // Apply content credit capacity cap.
  // quarterlyCapacity = monthlyCredits × 3 months. Content-type initiatives (new pages, refresh)
  // count against this budget. Non-content (technical, tracking) are uncapped.
  const CONTENT_INITIATIVE_KEYWORDS = ["content refresh", "service page", "hub structure", "admissions pathway", "conditions hub", "therapies hub", "location page"];
  const quarterlyCapacity = monthlyCredits * 3;
  let contentInitiativeCount = 0;
  const cappedPriorities = priorities.filter(p => {
    const isContent = CONTENT_INITIATIVE_KEYWORDS.some(kw => p.initiative.toLowerCase().includes(kw.toLowerCase()));
    if (isContent) {
      if (contentInitiativeCount >= quarterlyCapacity) return false;
      contentInitiativeCount++;
    }
    return true;
  });

  // Audit missing flag — surface when no audit context was provided
  const auditMissing = !auditNotes?.trim();

  // Cross-sell / upsell preview from Strategy Bank.
  // ONLY emits items where at least one account-condition signal confirms relevance.
  // Generic keyword matches without a matching account condition are excluded.
  const crossSellPreview: CrossSellPreviewItem[] = [];
  if (strategyBankEntries.length > 0) {
    const hasTrackingGap = hasTrackingGaps(section2);
    const hasTierIssues = section5.tier <= 2;
    const hasLocalOpportunity = section4.services.some(s => s.service === "Primary Location");
    const hasHighErrorCount = tierInput.errors4xx5xx > 10;

    for (const entry of strategyBankEntries) {
      if (crossSellPreview.length >= 3) break;
      const combined = `${entry.service} ${entry.description}`.toLowerCase();

      // Build a specific, condition-backed relevance string.
      // If no account condition fires, the entry is skipped — no generic fallback allowed.
      let relevance = "";
      let suggestedCategory: "upsell" | "cross-sell" = "cross-sell";

      if ((combined.includes("call tracking") || combined.includes("attribution")) && hasTrackingGap) {
        relevance = `Section 2 conversion data is partially inferred due to attribution gaps — call tracking setup would directly close this measurement blind spot.`;
        suggestedCategory = "upsell";
      } else if ((combined.includes("technical") || combined.includes("core web vitals") || combined.includes("page speed") || combined.includes("schema")) && hasTierIssues) {
        relevance = `Tier ${section5.tier} site health diagnosis indicates unresolved technical drag — a dedicated technical sprint would address crawl efficiency and page-quality issues affecting conversion pages.`;
        suggestedCategory = "cross-sell";
      } else if ((combined.includes("technical") || combined.includes("404") || combined.includes("redirect")) && hasHighErrorCount) {
        relevance = `${tierInput.errors4xx5xx} error pages detected in site crawl — technical remediation sprint aligns directly with identified structural issues.`;
        suggestedCategory = "cross-sell";
      } else if ((combined.includes("local seo") || combined.includes("local expansion") || combined.includes("gbp")) && hasLocalOpportunity) {
        relevance = `Site has a configured location presence with local organic potential — local SEO expansion would compound existing geographic authority.`;
        suggestedCategory = "cross-sell";
      } else if ((combined.includes("cro") || combined.includes("conversion rate") || combined.includes("landing page")) && hasTrackingGap) {
        relevance = `With conversion tracking gaps in Section 2, CRO-level improvements to landing pages could have an outsized impact once measurement is fully instrumented.`;
        suggestedCategory = "upsell";
      } else if ((combined.includes("paid media") || combined.includes("retargeting") || combined.includes("display ads")) && !hasTrackingGap && section5.tier >= 3) {
        relevance = `Site structure is at Tier ${section5.tier} with established organic foundations — paid media amplification could accelerate lead volume while organic compounds.`;
        suggestedCategory = "upsell";
      }
      // No generic fallback: if none of the above conditions matched, skip this entry
      if (!relevance) continue;

      crossSellPreview.push({ opportunity: entry.service, relevance, suggestedCategory });
    }
  }

  // Assign actionType and impact to each priority row
  function inferActionType(p: PriorityRow): string {
    const init = p.initiative.toLowerCase();
    if (/tracking|attribution|analytics|ga4|call track/.test(init)) return "Tracking / Analytics";
    if (/technical|crawl|indexab|404|error|redirect|speed|noindex/.test(init)) return "Technical SEO";
    if (/internal.?link/.test(init)) return "Internal Linking";
    if (/admissions|vob|insurance|conversion path|cro|contact/.test(init)) return "CRO";
    if (/local|gbp|location/.test(init)) return "Local SEO";
    if (/service page|service foundation|detox|residential/.test(init)) return "Content";
    if (/hub|conditions|therapies|architecture/.test(init)) return "IA / Architecture";
    if (/content refresh|refresh|blog|article/.test(init)) return "Content";
    if (/link.?build|backlink|pr|authority/.test(init)) return "Link Building";
    return "Content";
  }

  function inferImpact(p: PriorityRow): string {
    const t = p.tier?.toLowerCase() ?? "";
    if (t.includes("1")) return "High";
    if (t.includes("2")) return "High";
    if (t.includes("3")) return "Medium";
    return "Medium";
  }

  const finalPriorities = cappedPriorities.slice(0, 10).map(p => ({
    ...p,
    actionType: p.actionType ?? inferActionType(p),
    impact: p.impact ?? inferImpact(p),
  }));

  // Generate short summary bullets (3–5 bullets distilling the top actions)
  const shortSummary: string[] = [];
  if (finalPriorities.length > 0) {
    shortSummary.push(`Tier ${section5.tier} diagnosis: ${section5.tierName} — ${section5.tier <= 2 ? "foundational gaps must be resolved before content or authority work will compound" : section5.tier === 3 ? "consolidation and cleanup will remove structural drag on growth" : "differentiation and authority expansion are the next levers"}.`);
  }
  const highPriorities = finalPriorities.filter(p => p.impact === "High").slice(0, 2);
  for (const p of highPriorities) {
    shortSummary.push(`${p.initiative}: ${p.action.split(".")[0].slice(0, 110)}.`);
  }
  const medPriorities = finalPriorities.filter(p => p.impact === "Medium").slice(0, 2);
  for (const p of medPriorities) {
    shortSummary.push(`${p.initiative}: ${p.action.split(".")[0].slice(0, 110)}.`);
  }

  return {
    priorities: finalPriorities,
    crossSellPreview: crossSellPreview.length > 0 ? crossSellPreview : undefined,
    auditMissing: auditMissing || undefined,
    strategyBankFetchFailed: strategyBankFetchFailed || undefined,
    shortSummary: shortSummary.length > 0 ? shortSummary : undefined,
  };
}

interface Section7EvidenceFlags {
  ga4Active: boolean;   // GA4 returned usable data (landing rows OR funnel)
  gscActive: boolean;   // GSC returned usable query/page rows
  callActive: boolean;  // Call tracking (CallRail/CTM) returned usable rows
  gbpActive: boolean;   // GBP data available
}

function generateSection7(section6: Section6Priorities, section5: Section5Diagnosis, evidence: Section7EvidenceFlags): Section7Tracking {
  const tracking: TrackingRow[] = [];

  const { ga4Active, gscActive, callActive } = evidence;

  function inferStatus(source: string): string {
    const s = source.toLowerCase();
    if (s.includes("ga4") || s.includes("google analytics")) return ga4Active ? "Live" : "Missing Setup";
    if (s.includes("call tracking") || s.includes("callrail") || s.includes("ctm") || s.includes("nimbata")) return callActive ? "Live" : "Missing Setup";
    if (s.includes("gsc") || s.includes("google search console") || s.includes("search console")) return gscActive ? "Live" : "Missing Setup";
    if (s.includes("multi-source")) return "Needs Verification";
    if (s.includes("gbp")) return "Needs Verification";
    return "Needs Verification";
  }

  const metricMap: Record<string, TrackingRow> = {
    "Tracking & Attribution Setup": {
      focusArea: "Admissions Conversions",
      metric: "Verify Insurance / VOB form submits + contact form submits + qualified organic calls",
      source: "GA4 / Call Tracking",
      status: ga4Active && callActive ? "Needs Verification" : "Missing Setup",
      whyItMatters: "Directly measures admission-driving actions from organic traffic",
    },
    "Core Service Page Foundation": {
      focusArea: "Service Page Visibility",
      metric: "GSC clicks to primary Levels of Care pages (detox, residential, PHP/IOP)",
      source: "Google Search Console",
      status: inferStatus("Google Search Console"),
      whyItMatters: "Measures whether core pages are capturing high-intent search demand",
    },
    "Admissions Pathway Clarity": {
      focusArea: "Admissions Conversions",
      metric: "Verify Insurance / VOB form submits + contact form submits + qualified organic calls",
      source: "GA4 + Call Tracking",
      status: ga4Active && callActive ? "Live" : "Missing Setup",
      whyItMatters: "Directly measures admission-driving actions from organic traffic",
    },
    "Conditions Hub Structure": {
      focusArea: "Authority Coverage",
      metric: "Organic sessions to conditions hub pages",
      source: "GA4",
      status: inferStatus("GA4"),
      whyItMatters: "Tracks whether hub structure is attracting topical authority traffic",
    },
    "Therapies Architecture": {
      focusArea: "Therapy Page Performance",
      metric: "GSC impressions and clicks for therapy-related queries",
      source: "Google Search Console",
      status: inferStatus("Google Search Console"),
      whyItMatters: "Measures whether therapy content is capturing differentiation searches",
    },
    "Technical Cleanup": {
      focusArea: "Crawl Health",
      metric: "Reduction in 4xx/5xx errors and redirect chains",
      source: "Multi-source",
      status: "Live",
      whyItMatters: "Fewer errors = better crawl budget allocation to revenue pages",
    },
    "Location Consolidation": {
      focusArea: "Local Visibility",
      metric: "GBP calls + direction requests + local organic sessions",
      source: "GBP + GA4",
      status: "Needs Verification",
      whyItMatters: "Validates that location consolidation improves local conversion signals",
    },
    "Conversion Path Audit": {
      focusArea: "Conversion Rate",
      metric: "Organic conversion rate on top landing pages",
      source: "GA4",
      status: ga4Active ? "Live" : "Missing Setup",
      whyItMatters: "Higher CVR on existing traffic is the most capital-efficient growth lever",
    },
    "Conversion Path Optimization": {
      focusArea: "Conversion Rate",
      metric: "Organic conversion rate on top landing pages",
      source: "GA4",
      status: ga4Active ? "Live" : "Missing Setup",
      whyItMatters: "Higher CVR on existing traffic is the most capital-efficient growth lever",
    },
    "Internal Linking — High-Traffic to Conversion": {
      focusArea: "Internal Link Effectiveness",
      metric: "Click-through from informational pages to service/VOB pages",
      source: "GA4",
      status: ga4Active ? "Inferred Only" : "Missing Setup",
      whyItMatters: "Measures whether internal linking strategy converts existing traffic to admissions pages",
    },
    "Content Refresh — Highest-Traffic Assisted Pages": {
      focusArea: "Content Performance",
      metric: "CTR improvement on high-impression non-brand queries",
      source: "Google Search Console",
      status: inferStatus("Google Search Console"),
      whyItMatters: "CTR gains on existing impressions drive incremental traffic without new content",
    },
    "Content Refresh — Highest-Value Pages": {
      focusArea: "Content Performance",
      metric: "CTR improvement on high-impression non-brand queries",
      source: "Google Search Console",
      status: inferStatus("Google Search Console"),
      whyItMatters: "CTR gains on existing impressions drive incremental traffic without new content",
    },
  };

  for (const priority of section6.priorities) {
    const mapped = metricMap[priority.initiative];
    if (mapped && !tracking.find(t => t.focusArea === mapped.focusArea)) {
      tracking.push(mapped);
    }
  }

  const defaults: TrackingRow[] = [
    {
      focusArea: "Organic Sessions",
      metric: "Total organic sessions (QoQ)",
      source: "GA4",
      status: ga4Active ? "Live" : "Missing Setup",
      whyItMatters: "Primary volume indicator for organic channel health",
    },
    {
      focusArea: "Qualified Calls",
      metric: "Organic phone calls (answered, 60s+)",
      source: "Call Tracking",
      status: callActive ? "Live" : "Missing Setup",
      whyItMatters: "Strongest proxy for admits when direct admit tracking is unavailable",
    },
  ];

  for (const d of defaults) {
    if (tracking.length >= 7) break;
    if (!tracking.find(t => t.focusArea === d.focusArea)) {
      tracking.push(d);
    }
  }

  return { tracking: tracking.slice(0, 7) };
}

// ─── POST-PROCESSING: Additional Opportunities ────────────────────────────────
// Pipeline:
//   1. Extract raw report facts
//   2. Evaluate each signal against a standard-scope-first test
//   3. Escalation candidates only: classify as upsell vs cross-sell
//   4. Build a full Candidate including output text
//   5. Score each candidate on four dimensions (weighted 40/30/20/10)
//   6. Filter by minimum threshold (55/100), sort descending, cap at 3
//   7. Strip internal scoring fields before attaching to report
//
// Scoring dimensions:
//   businessImpact  (0–1, weight 40%): direct tie to admits / VOBs / calls / conversion quality
//   evidenceStrength(0–1, weight 30%): how clearly confirmed by report data
//   urgency         (0–1, weight 20%): quarter-timing / pace-to-goal / missed-demand risk
//   strategicFit    (0–1, weight 10%): alignment with client's tier, goals, and situation
//
//   total = bi*40 + es*30 + u*20 + sf*10  →  range 0–100
//   MINIMUM_THRESHOLD = 65 — candidates below this are suppressed entirely.
//   Raised from 55: eliminates weak on-pace paid-promotion noise and prevents
//   authority-building from firing on tier status alone.
//
// Pre-score gating: every signal must clear three hard gates before being scored.
//   gate 1 — businessRelevance: direct tie to admits / VOBs / leads / conversion quality
//   gate 2 — evidenceSufficient: the finding must be confirmed in report data
//   gate 3 — leverFit: the recommended channel or service must be the right answer
//   Any gate failure suppresses the candidate before scoring runs.
//
// Conversion / tracking gaps: intentionally NOT surfaced as upsells.
// Missing tracking is a foundational recommendation inside standard scope, not an
// Additional Opportunity, unless packaged as a distinct paid CRO project with
// clear client context — which is not determinable from report data alone.
function generateAdditionalOpportunities(report: QbrPrepReportData): AdditionalOpportunity[] {
  const MINIMUM_THRESHOLD = 65;

  // ── Raw report facts ──────────────────────────────────────────────────────
  const s1 = report.section1Goals;
  const s2 = report.section2Conversions;
  const s3 = report.section3Traffic;
  const s5 = report.section5Diagnosis;

  function parseClicks(val: string): number {
    return parseInt(String(val ?? "").replace(/[^0-9]/g, ""), 10) || 0;
  }

  const tier = s5.tier;
  const tierName = s5.tierName;

  const primaryRow = s1.rows.find(r => r.goalType.toLowerCase().includes("primary"));
  const isBehindPace = !!primaryRow && (
    primaryRow.goalShift === "-5%" ||
    (primaryRow.reason ?? "").toLowerCase().includes("behind pace")
  );

  const hasGA4Conversions = s2.topConvertingPages.some(p => p.dataSource === "GA4");
  const hasCallTracking = s2.topConvertingPages.some(p =>
    ["CallRail", "CTM", "Nimbata", "CallTrackingMetrics"].includes(p.dataSource ?? "")
  );
  const hasConversionTracking = hasGA4Conversions || hasCallTracking;

  const allTopics = s3.topTrafficTopics;
  const highAdmitTopics = allTopics.filter(t => t.connectionToAdmits === "High");
  const topPages = s3.topTrafficPages;
  const lowMidPages = topPages.filter(p =>
    p.connectionToAdmits === "Low" || p.connectionToAdmits === "Medium"
  );
  const totalInfoClicks = lowMidPages.reduce((sum, p) => sum + parseClicks(p.clicks), 0);

  // ── Internal candidate shape (score fields stripped before output) ─────────
  interface ScoredCandidate extends AdditionalOpportunity {
    _scores: { bi: number; es: number; u: number; sf: number; total: number };
  }

  function candidate(
    opp: AdditionalOpportunity,
    bi: number, es: number, u: number, sf: number
  ): ScoredCandidate {
    const total = bi * 40 + es * 30 + u * 20 + sf * 10;
    return { ...opp, _scores: { bi, es, u, sf, total } };
  }

  const pool: ScoredCandidate[] = [];

  // ══════════════════════════════════════════════════════════════════════════
  // SIGNAL A — Authority gap (Tier 1–2 diagnosis)
  //
  // Standard-scope test: content and CRO improve positions on Tier 3+ sites over
  // time. On Tier 1–2, domain authority is the hard ceiling — standard content
  // cannot break through it alone. Fails standard-scope test.
  //
  // Classification: UPSELL — link acquisition / digital PR is more SEO depth.
  //
  // PRE-SCORE GATES (all three must pass or candidate is suppressed):
  //   gate 1 — businessRelevance: must have a confirmed demand signal (≥1 high-intent
  //             cluster) OR a pace risk (isBehindPace). Tier status alone is not enough.
  //   gate 2 — evidenceSufficient: ≥1 confirmed high-intent topic cluster required.
  //             Without a confirmed demand signal, the authority gap is theoretical.
  //   gate 3 — leverFit: tier must be 1 or 2 (authority is the bottleneck).
  //
  // "On pace + zero confirmed high-intent clusters" → all three gates fail → suppressed.
  // ══════════════════════════════════════════════════════════════════════════
  {
    const gateBusinessRelevance = highAdmitTopics.length >= 1 || isBehindPace;
    const gateEvidenceSufficient = highAdmitTopics.length >= 1;
    const gateLeverFit = tier <= 2;

    if (gateBusinessRelevance && gateEvidenceSufficient && gateLeverFit) {
      const bi = tier === 1 ? 1.0 : 0.85;
      const es = highAdmitTopics.length >= 2 ? 0.9 : 0.75;
      const u  = isBehindPace ? 1.0 : (tier === 1 ? 0.78 : 0.60);
      const sf = 0.85;

      const evidenceItems: string[] = [
        `Tier ${tier} site diagnosis (${tierName}) — domain authority is the primary constraint on Levels of Care page rankings, which content production alone cannot break through`,
      ];
      if (isBehindPace && primaryRow) {
        evidenceItems.push(`Primary goal (${primaryRow.goal}) is behind pace — standard content-only work cannot close the authority gap that limits Levels of Care page rankings this cycle`);
      } else {
        evidenceItems.push(`${highAdmitTopics.length} confirmed high-intent topic cluster${highAdmitTopics.length > 1 ? "s" : ""} identified — authority, not content volume, is the primary ranking constraint on these terms`);
      }

      pool.push(candidate({
        type: "upsell",
        title: "Custom Authority-Building Initiative",
        why_now: `Site is at Tier ${tier} — Levels of Care page rankings on high-value treatment terms are constrained by domain authority. The standard content roadmap addresses what to publish, not the ceiling that prevents those pages from ranking.`,
        evidence: evidenceItems,
        recommendation: "A focused link acquisition or digital PR program targeting high-intent Levels of Care pages. This is a deeper SEO investment than the standard monthly retainer covers, designed to remove the authority ceiling that content production alone cannot lift.",
        framing: "Recommended when authority — not content output or keyword strategy — is the confirmed bottleneck. Link acquisition and digital PR address a constraint that standard scope cannot resolve.",
      }, bi, es, u, sf));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIGNAL B — High-intent demand confirmed, primary goal behind pace
  //
  // Standard-scope test: organic content addresses demand over time. But when
  // the primary goal is demonstrably behind pace AND treatment-intent demand is
  // confirmed in organic search data, organic timelines become the constraint —
  // paid search captures the same demand now. Fails standard-scope test.
  //
  // Classification: CROSS-SELL — paid search is a different channel, faster-to-lead.
  //
  // PRE-SCORE GATES:
  //   gate 1 — businessRelevance: isBehindPace (primary goal at risk this quarter)
  //   gate 2 — evidenceSufficient: ≥1 confirmed high-intent organic cluster
  //   gate 3 — leverFit: paid search can capture the confirmed demand immediately
  // ══════════════════════════════════════════════════════════════════════════
  if (isBehindPace && highAdmitTopics.length >= 1) {
    const topTopic = highAdmitTopics[0];

    const bi = 0.95;
    const es = highAdmitTopics.length >= 3 ? 0.95 : (highAdmitTopics.length >= 2 ? 0.85 : 0.7);
    const u  = 1.0;
    const sf = hasConversionTracking ? 0.9 : 0.65;

    pool.push(candidate({
      type: "cross_sell",
      title: "Paid Search Demand Capture",
      why_now: `Primary goal is behind pace while organic search data confirms treatment-intent demand — paid search reaches the same audience on a faster timeline than organic rankings can deliver this quarter.`,
      evidence: [
        `Primary goal (${primaryRow!.goal}) is behind pace — organic growth alone is unlikely to close the gap before the quarter ends`,
        `${highAdmitTopics.length} confirmed high-intent organic cluster${highAdmitTopics.length > 1 ? "s" : ""} — treatment-intent demand is active in search data and paid search can reach it on a shorter timeline`,
      ],
      recommendation: `Targeted paid search on confirmed high-intent service terms (${topTopic.topic} and related treatment clusters) to generate qualified leads on a timeline that organic rankings cannot match this quarter.`,
      framing: "Paid search is additive, not a replacement — it reaches the same intent the organic program is building toward, just through a faster channel.",
    }, bi, es, u, sf));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIGNAL C — Multiple confirmed high-intent clusters, content volume is the bottleneck
  //
  // Standard-scope test: content planning is inside standard scope. However,
  // when a site already shows organic traction (Tier 3+) and organic data
  // confirms 3+ distinct high-intent clusters competing for the same limited
  // monthly content output, production VOLUME — not strategy — is the constraint.
  // More content production capacity is more SEO depth. Fails standard-scope test.
  //
  // Classification: UPSELL — expanded content production initiative.
  //
  // Guard: does NOT fire at Tier 1–2 (authority, not content, is the bottleneck).
  // Guard: based directly on report topic data — no dependency on S6 wording.
  // Business connection: more high-intent content pages directly feeds the
  //   organic-to-admit funnel on confirmed demand signals.
  // ══════════════════════════════════════════════════════════════════════════
  if (highAdmitTopics.length >= 3 && tier >= 3) {
    const bi = highAdmitTopics.length >= 5 ? 0.85 : 0.7;
    const es = 0.85;
    const u  = isBehindPace ? 0.75 : 0.5;
    const sf = 0.8;

    pool.push(candidate({
      type: "upsell",
      title: "Expanded Content Production Initiative",
      why_now: `${highAdmitTopics.length} high-intent topic clusters are confirmed in organic search data, but current monthly content output cannot build all of them to competitive depth in a single planning cycle.`,
      evidence: [
        `High-admit-connection clusters: ${highAdmitTopics.slice(0, 3).map(t => `"${t.topic}"`).join(", ")}`,
        `Full cluster coverage at competitive depth would require a production volume beyond what the standard monthly allocation supports`,
      ],
      recommendation: "An expanded content production program to systematically build out Levels of Care page clusters, topic hubs, and conversion-path pages across all confirmed high-intent areas — more output capacity applied to confirmed demand signals.",
      framing: "Relevant when production capacity — not strategy, authority, or keyword targeting — is the reason high-intent clusters remain underdeveloped.",
    }, bi, es, u, sf));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIGNAL D — Substantial informational traffic not converting to admits
  //
  // Standard-scope test: CTAs, internal links, journey fixes are standard scope.
  // Retargeting is a paid channel — not SEO. Fails standard-scope test.
  //
  // Classification: CROSS-SELL — retargeting / audience building.
  //
  // PRE-SCORE GATES (all three must pass):
  //   gate 1 — businessRelevance: isBehindPace OR totalInfoClicks ≥ 750.
  //             "On pace + only 400 clicks" is too soft a business case for
  //             retargeting — suppress those cases.
  //   gate 2 — evidenceSufficient: conversion tracking confirmed, ≥400 clicks,
  //             ≥2 low/mid pages. Without tracking the gap is unconfirmed.
  //   gate 3 — leverFit: retargeting is the right lever (organic already earns traffic).
  // ══════════════════════════════════════════════════════════════════════════
  {
    const gateBusinessRelevance = isBehindPace || totalInfoClicks >= 750;
    const gateEvidenceSufficient = hasConversionTracking && totalInfoClicks >= 400 && lowMidPages.length >= 2;
    const gateLeverFit = true;

    if (gateBusinessRelevance && gateEvidenceSufficient && gateLeverFit) {
      const bi = totalInfoClicks >= 1000 ? 0.75 : 0.6;
      const es = 0.8;
      const u  = isBehindPace ? 0.75 : 0.5;
      const sf = 0.7;

      pool.push(candidate({
        type: "cross_sell",
        title: "Organic Audience Retargeting",
        why_now: `${totalInfoClicks.toLocaleString()} confirmed organic clicks are reaching informational pages with low-to-medium admit connection — the audience is being built through SEO, but organic paths alone are not converting it to admissions activity.`,
        evidence: [
          `${lowMidPages.length} informational pages with ${totalInfoClicks.toLocaleString()} combined organic clicks and low-to-medium admit connection — confirmed via GA4 or call tracking`,
          "The gap between organic visit volume on informational pages and downstream admissions activity indicates these users need an additional touchpoint to progress toward intake",
        ],
        recommendation: "A retargeting program to re-engage confirmed organic visitors who did not convert — delivering service-focused messaging to move them from research to direct admissions contact.",
        framing: "Retargeting works on audience already earned through SEO. No new rankings or content are required to reach these users again.",
      }, bi, es, u, sf));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIGNAL E — Content outpacing organic visibility
  //
  // Standard-scope test: technical SEO and metadata optimization address
  // indexing lag. Paid social promotion is a different channel. Fails standard-scope.
  //
  // Classification: CROSS-SELL — paid social / content promotion.
  //
  // PRE-SCORE GATES (all three must pass — tighter than prior version):
  //   gate 1 — businessRelevance: isBehindPace required. "On pace" cases are not
  //             strong enough — content distribution lag is not a quarter-defining gap
  //             without an active goal-pace risk.
  //   gate 2 — evidenceSufficient: ≥3 low-reach clusters (not just 2).
  //             Two clusters is too thin an evidence base for a cross-sell recommendation.
  //   gate 3 — leverFit: Tier 3+ only (Tier 1–2 sites should fix authority first).
  //
  // Note: with threshold = 65 and the gates above, Signal E only fires in the
  // narrow case of: behind pace + 3+ clusters with low reach + Tier 3+ site.
  // This is intentional — it is a strong signal case.
  // ══════════════════════════════════════════════════════════════════════════
  {
    const lowReachClusters = allTopics.filter(t => {
      const imp = t.impressions ?? 0;
      return imp > 0 && imp < 1000;
    });

    const gateBusinessRelevance = isBehindPace;
    const gateEvidenceSufficient = lowReachClusters.length >= 3;
    const gateLeverFit = tier >= 3;

    if (gateBusinessRelevance && gateEvidenceSufficient && gateLeverFit) {
      const bi = 0.70;
      const es = 0.75;
      const u  = 0.70;
      const sf = 0.65;

      pool.push(candidate({
        type: "cross_sell",
        title: "Paid Social Content Amplification",
        why_now: `${lowReachClusters.length} topic clusters have confirmed content but limited organic reach, and the primary goal is behind pace — content is being produced faster than organic indexing is distributing it.`,
        evidence: [
          `${lowReachClusters.length} clusters with confirmed search activity but sub-1,000 organic impressions — distribution is lagging behind content output`,
          "Primary goal is behind pace and organic indexing speed alone is unlikely to close the distribution gap before the quarter ends",
        ],
        recommendation: "A paid social or content promotion campaign to amplify treatment-relevant content that is already published but not yet reaching its full audience through organic channels.",
        framing: "Applies when content output is outpacing organic indexing and pace risk makes waiting on rankings impractical — paid amplification closes the distribution gap without requiring new content.",
      }, bi, es, u, sf));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIGNAL F — Broader scan: behind pace but no high-intent organic demand confirmed
  //
  // This is a broader issue scan pass. It catches accounts where organic traffic
  // exists (some topics are present) but NONE are classified as High admit connection,
  // AND the primary goal is behind pace. This is a structural demand-capture gap —
  // the organic program is not positioned against the highest-value treatment terms.
  //
  // Standard-scope test: service page targeting and keyword strategy are inside
  // standard scope. But paid search can capture intent-matched demand NOW without
  // waiting for organic positioning to shift. Fails standard-scope test for immediacy.
  //
  // Classification: CROSS-SELL — paid search demand capture on terms not yet ranked.
  //
  // Guard: only fires when there IS some organic activity (allTopics > 0) — otherwise
  // there is no evidence of demand at all, and a paid recommendation would be
  // too speculative.
  //
  // This does NOT fire when Signal B is already firing (which covers the same lever
  // with stronger evidence — high-intent organic confirmed + behind pace). Signal B
  // takes priority; Signal F only fires when Signal B could not.
  // ══════════════════════════════════════════════════════════════════════════
  {
    const signalBAlreadyFired = isBehindPace && highAdmitTopics.length >= 1;

    const gateBusinessRelevance = isBehindPace;
    const gateEvidenceSufficient = highAdmitTopics.length === 0 && allTopics.length > 0;
    const gateLeverFit = !signalBAlreadyFired;

    if (gateBusinessRelevance && gateEvidenceSufficient && gateLeverFit) {
      const mediumTopics = allTopics.filter(t => t.connectionToAdmits === "Medium");
      const topTopic = mediumTopics[0] ?? allTopics[0];

      const bi = 0.80;
      const es = allTopics.length >= 3 ? 0.70 : 0.60;
      const u  = 0.90;
      const sf = hasConversionTracking ? 0.75 : 0.60;

      pool.push(candidate({
        type: "cross_sell",
        title: "Paid Search Demand Capture",
        why_now: `Primary goal is behind pace and organic search data does not yet confirm any high-intent treatment clusters — paid search can target priority treatment terms directly while the organic program works toward positioning on those terms.`,
        evidence: [
          `Primary goal is behind pace with no confirmed high-intent organic clusters — organic coverage has not yet reached the highest-value treatment search terms`,
          `${allTopics.length} topic cluster${allTopics.length > 1 ? "s" : ""} tracked organically${topTopic ? ` (strongest: "${topTopic.topic}")` : ""} — none classified as High admit connection`,
        ],
        recommendation: `Targeted paid search on priority treatment terms (detox, residential, PHP/IOP, insurance verification) to reach admit-intent demand on terms the organic program has not yet ranked for.`,
        framing: "Applies when the organic program lacks confirmed high-intent positioning and pace risk makes waiting on organic timelines impractical this quarter.",
      }, bi, es, u, sf));
    }
  }

  // ── Score → threshold → sort → cap → strip internal fields ──────────────
  return pool
    .filter(c => c._scores.total >= MINIMUM_THRESHOLD)
    .sort((a, b) => b._scores.total - a._scores.total)
    .slice(0, 3)
    .map(({ type, title, why_now, evidence, recommendation, framing }) => ({
      type, title, why_now, evidence, recommendation, framing,
    }));
}

// ─── Suggested Keywords for Next Quarter ────────────────────────────────────

const BRANDED_SIGNALS = /\b(anchored tides|bliss recovery|heartland|sol women|williamsburg house|horseshoe ridge|iris healing|webserv)\b/i;

function isNonBranded(query: string): boolean {
  return !BRANDED_SIGNALS.test(query.toLowerCase());
}

/**
 * Strategic keyword filter — requires treatment / care-intent / location signal.
 * Filters out generic informational queries that cannot be mapped to actionable
 * service, program, condition, or location pages within the quarter.
 */
const STRATEGIC_KW_RE = /\b(detox|detoxification|residential|inpatient|outpatient|php|partial hospitalization|iop|intensive outpatient|rehab|rehabilitation|treatment|recovery|sober|sobriety|addiction|substance use|alcohol|drug|opioid|heroin|meth(?:amphetamine)?|cocaine|fentanyl|benzo|benzodiazepine|mental health|depression|anxiety|trauma|ptsd|dual diagnosis|co.occurring|eating disorder|behavioral health|withdrawal|relapse|medication.assisted|mat|suboxone|methadone|vivitrol|emdr|cbt|dbt|therapy|counseling|program|center|facility|clinic|near me|in \w{3,}|near \w{3,})\b/i;

function isStrategicKeyword(q: string): boolean {
  return STRATEGIC_KW_RE.test(q);
}

function normalizePath(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/$/, "") || "/";
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/";
  }
}

/** Extract all live indexed URL paths from SF crawl data */
function extractSfPaths(sfData: Record<string, any>[], sfHeaders: string[]): Set<string> {
  const urlCol = sfHeaders.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? sfHeaders[0] ?? "";
  const statusCol = sfHeaders.find(h => /^status code$/i.test(h) || /^status$/i.test(h));
  const paths = new Set<string>();
  if (!urlCol) return paths;
  const liveRows = statusCol
    ? sfData.filter(r => { const s = Number(r[statusCol]); return s === 200 || (!s && true); })
    : sfData;
  for (const row of liveRows) {
    const url = String(row[urlCol] ?? "");
    if (url.startsWith("http")) {
      paths.add(normalizePath(url));
    }
  }
  return paths;
}

/** Find the best existing page for a query from GSC query+page dimension data */
function findBestGscPage(query: string, gscQueryPageRows: any[]): string | null {
  const matching = gscQueryPageRows
    .filter((r: any) => r.keys?.[0]?.toLowerCase() === query.toLowerCase())
    .sort((a: any, b: any) => (b.impressions ?? 0) - (a.impressions ?? 0));
  if (!matching.length) return null;
  const url = matching[0].keys?.[1];
  return url ? normalizePath(url) : null;
}

/** Map recommendation type to a human-readable label */
function recTypeLabel(type: SuggestedKeywordRow["recommendationType"]): string {
  switch (type) {
    case "optimize-existing": return "Optimize existing page";
    case "refresh-existing": return "Refresh existing page";
    case "create-new": return "Create new content";
    case "cro-update": return "CRO / supporting update";
    case "internal-linking": return "Internal linking support";
  }
}

/**
 * Classify the recommendation type based on whether a page exists and its performance signals.
 */
function classifyRecType(
  pagePath: string | null,
  sfPaths: Set<string>,
  query: string,
  impressions: number,
  clicks: number,
): SuggestedKeywordRow["recommendationType"] {
  if (!pagePath) return "create-new";
  const inSf = sfPaths.has(pagePath);
  if (!inSf) return "create-new";
  const ctr = impressions > 0 ? clicks / impressions : 0;
  // Low CTR on an existing indexed page → optimize/CRO
  if (impressions > 100 && ctr < 0.03) return "cro-update";
  // Reasonable impressions but low clicks → refresh
  if (impressions > 50 && clicks < 5) return "refresh-existing";
  return "optimize-existing";
}

/**
 * Build a concise "why it's recommended" reason from available GSC signals.
 */
function buildKeywordReason(
  query: string,
  impressions: number,
  clicks: number,
  pagePath: string | null,
  recType: SuggestedKeywordRow["recommendationType"],
  sfPaths: Set<string>,
): string {
  const impStr = impressions > 1000 ? `${Math.round(impressions / 1000)}k` : String(Math.round(impressions));
  const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : "0.0";
  switch (recType) {
    case "create-new":
      return `${impStr} impressions this quarter with no existing page capturing this query — new content would close the gap between search demand and site coverage.`;
    case "cro-update":
      return `${impStr} impressions but only ${ctr}% CTR on ${pagePath ?? "this page"} — conversion path or meta optimization can significantly increase click capture without new content.`;
    case "refresh-existing":
      return `${impStr} impressions with only ${clicks} clicks — refreshing ${pagePath ?? "the existing page"} with stronger topical relevance and CTAs should improve ranking position and click volume.`;
    case "optimize-existing":
      return `${impStr} impressions with strong existing page at ${pagePath ?? "this URL"} — on-page optimization and internal linking can strengthen rankings further.`;
    case "internal-linking":
      return `Site has a relevant page at ${pagePath ?? "this URL"} but lacks strong internal linking support — improving internal links will pass authority to this page and improve its rankings.`;
  }
}

// ── Semantic keyword clustering ───────────────────────────────────────────────

const CLUSTER_STOPWORDS = new Set([
  "a","an","the","of","for","is","in","to","and","or","what","how","why","when",
  "does","do","can","are","vs","between","from","with","on","at","by","as","its",
  "it","this","that","these","those","be","been","being","have","has","had","will",
  "would","could","should","may","might","i","you","we","they","my","your","our",
  "their","which","who","after","before","during","about","into","onto","upon",
  "mean","means","meaning","define","defined","definition",
]);

function normalizeQueryForCluster(q: string): string[] {
  return q.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !CLUSTER_STOPWORDS.has(w))
    .sort();
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersect = [...setA].filter(x => setB.has(x)).length;
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersect / unionSize;
}

interface QueryCandidate {
  query: string;
  impressions: number;
  clicks: number;
}

// Generic behavioral-health terms that should NOT be treated as primary anchor terms
// (too common to define a meaningful cluster by themselves)
const GENERIC_BH_TERMS = new Set([
  "addiction", "recovery", "treatment", "rehab", "rehabilitation", "therapy",
  "drug", "substance", "alcohol", "mental", "health", "help", "center", "program",
  "sober", "sobriety", "clean", "detox", "residential", "inpatient", "outpatient",
  "withdrawal", "symptoms", "side", "effects", "signs", "abuse", "disorder",
  "near", "best", "top", "local", "find", "get", "need",
]);

/**
 * Returns true if the two normalized token sets share a specific non-generic anchor term.
 * This ensures "molly drug" + "molly and alcohol" + "what is molly" all cluster together
 * because they share "molly", which is not in the generic BH terms list.
 */
function sharesPrimaryAnchor(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  for (const w of setA) {
    if (w.length > 3 && !GENERIC_BH_TERMS.has(w) && setB.has(w)) return true;
  }
  return false;
}

function clusterCandidatesByIntent(candidates: QueryCandidate[]): QueryCandidate[][] {
  const assigned = new Array<boolean>(candidates.length).fill(false);
  const clusters: QueryCandidate[][] = [];

  for (let i = 0; i < candidates.length; i++) {
    if (assigned[i]) continue;
    const cluster: QueryCandidate[] = [candidates[i]];
    assigned[i] = true;
    const wordsI = normalizeQueryForCluster(candidates[i].query);

    for (let j = i + 1; j < candidates.length; j++) {
      if (assigned[j]) continue;
      const wordsJ = normalizeQueryForCluster(candidates[j].query);
      // Cluster if Jaccard similarity is high OR if they share a specific anchor term
      if (jaccardSimilarity(wordsI, wordsJ) >= 0.65 || sharesPrimaryAnchor(wordsI, wordsJ)) {
        cluster.push(candidates[j]);
        assigned[j] = true;
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

export function generateSuggestedKeywords(
  gscQueryRows: any[],
  gscQueryPageRows: any[],
  sfData: Record<string, any>[],
  sfHeaders: string[],
  section3: Section3Traffic,
  section4: Section4Services,
  section2: Section2Conversions,
  monthlyCredits: number,
): SectionSuggestedKeywords {
  const maxRecommendations = Math.min(monthlyCredits * 2, 48);

  // Build SF page inventory
  const sfPaths = extractSfPaths(sfData, sfHeaders);

  // Supplement SF paths with known pages from Section 3 and Section 4
  for (const p of section3.topTrafficPages) {
    if (p.page) sfPaths.add(normalizePath(p.page));
  }
  for (const s of section4.services) {
    if (s.examplePage && s.examplePage !== "—" && s.examplePage.startsWith("/")) {
      sfPaths.add(s.examplePage.replace(/\/$/, "") || s.examplePage);
    }
  }
  // Also pull converting pages from Section 2
  for (const p of section2.topConvertingPages) {
    if (p.page && p.page.startsWith("/")) sfPaths.add(p.page.replace(/\/$/, "") || p.page);
  }

  // Get non-branded, strategically relevant queries sorted by impressions desc
  const rawCandidates: QueryCandidate[] = gscQueryRows
    .filter((r: any) => {
      const q = r.keys?.[0] ?? "";
      return q.length > 2 && isNonBranded(q) && isStrategicKeyword(q) && (r.impressions ?? 0) >= 5;
    })
    .sort((a: any, b: any) => (b.impressions ?? 0) - (a.impressions ?? 0))
    .map((r: any) => ({ query: r.keys?.[0] ?? "", impressions: r.impressions ?? 0, clicks: r.clicks ?? 0 }));

  // Cluster close variants by intent (Jaccard ≥ 0.70 on normalized tokens)
  const clusters = clusterCandidatesByIntent(rawCandidates);

  // Deduplicate by path — only one recommendation per target page
  const usedPaths = new Set<string>();
  const rows: SuggestedKeywordRow[] = [];

  for (const cluster of clusters) {
    if (rows.length >= maxRecommendations) break;

    // Representative = highest-impression member
    const rep = cluster[0];
    const query = rep.query;
    const impressions = rep.impressions;
    const clicks = rep.clicks;

    // Build variant label (exclude representative) — show ALL variants in the cluster
    const variants = cluster.slice(1).map(c => c.query);
    const keywordDisplay = variants.length > 0
      ? `${query} / ${variants.join(" / ")}`
      : query;

    // Find best associated page from GSC query+page data
    const bestPage = findBestGscPage(query, gscQueryPageRows);
    const inSf = bestPage ? sfPaths.has(bestPage) : false;
    const targetPath = inSf ? bestPage! : (bestPage ?? null);

    // Deduplicate by page path (applies to all rec types including create-new within same cluster)
    const recType = classifyRecType(targetPath, sfPaths, query, impressions, clicks);
    if (targetPath && usedPaths.has(targetPath)) continue;
    if (targetPath) usedPaths.add(targetPath);

    // For create-new, propose a concrete slug based on the representative query
    const proposedSlug = "/blog/" + query
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "");
    const targetPageDisplay = recType === "create-new"
      ? proposedSlug
      : (targetPath ?? proposedSlug);

    const whyRecommended = buildKeywordReason(query, impressions, clicks, targetPath, recType, sfPaths);

    // Determine sources used
    const sources: string[] = ["GSC"];
    if (inSf) sources.push("Screaming Frog");

    rows.push({
      keyword: keywordDisplay,
      recommendationType: recType,
      targetPage: targetPageDisplay,
      whyRecommended,
      sources,
    });
  }

  // If GSC had no data, fall back to Section 3 traffic topics as keyword proxies
  if (rows.length === 0 && section3.topTrafficTopics.length > 0) {
    const fallbackSources = sfData.length > 0 ? ["GSC", "Screaming Frog"] : ["GSC"];
    for (const topic of section3.topTrafficTopics.slice(0, Math.min(maxRecommendations, 12))) {
      const exampleQuery = topic.exampleQueries.split(",")[0]?.trim() || topic.topic;
      const matchingPage = section3.topTrafficPages.find(p =>
        p.connectionToAdmits === "High" && p.insight.toLowerCase().includes(topic.topic.toLowerCase())
      );
      const targetPage = matchingPage
        ? normalizePath(matchingPage.page)
        : "New content needed";
      const recType: SuggestedKeywordRow["recommendationType"] =
        matchingPage ? "optimize-existing" : "create-new";

      rows.push({
        keyword: exampleQuery,
        recommendationType: recType,
        targetPage,
        whyRecommended: `Topic cluster "${topic.topic}" drives organic traffic with ${topic.connectionToAdmits.toLowerCase()} admit connection — prioritizing this keyword will strengthen rankings for this cluster.`,
        sources: fallbackSources,
      });
      if (rows.length >= maxRecommendations) break;
    }
  }

  return { rows, quarterlyCreditCap: maxRecommendations, monthlyCredits };
}

// ─── Section 7 Credits: auto-generated content-credit allocation ──────────────

const QUARTER_MONTH_NAMES: Record<number, [string, string, string]> = {
  1: ["January", "February", "March"],
  2: ["April", "May", "June"],
  3: ["July", "August", "September"],
  4: ["October", "November", "December"],
};

const TECHNICAL_CREDIT_PATTERNS = /\b(technical seo|schema|metadata audit|page speed|core web vital|crawl|indexab|index audit|sitemap|robots\.txt|redirect|canonical|structured data|hreflang|tracking setup|analytics setup|tag manager|gtm|dev support|javascript error|accessibility audit|link building|backlink|off-?page|internal link audit)\b/i;
const CONTENT_SIGNAL_PATTERNS = /\b(content|refresh|creat|new page|service page|support page|local page|cluster|topic|rewrite|update|expand|conversion page|landing page|blog|article)\b/i;

function isContentOnlyPriority(row: PriorityRow): boolean {
  const combined = `${row.initiative} ${row.action} ${row.tier}`;
  if (TECHNICAL_CREDIT_PATTERNS.test(combined)) return false;
  return CONTENT_SIGNAL_PATTERNS.test(combined);
}

function buildCreditActionPool(
  section2: Section2Conversions,
  section3: Section3Traffic,
  section4: Section4Services,
  section6: Section6Priorities,
): Array<{ credits: number; activity: string; weight: number }> {
  const pool: Array<{ credits: number; activity: string; weight: number }> = [];

  // 1. Section 6 content-only priorities (highest priority — data-driven)
  const contentPriorities = section6.priorities.filter(isContentOnlyPriority);
  for (const p of contentPriorities) {
    let activity = p.action.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
    if (activity.length > 110) activity = activity.substring(0, 110).trim();
    pool.push({ credits: 1, activity, weight: 12 - p.priority });
  }

  // 2. Section 4 missing service pages (content creation)
  const missingSvcPages = section4.services.filter(
    s => !s.examplePage || s.examplePage === "—" || /need|manual|tbd|missing/i.test(s.examplePage)
  ).slice(0, 3);
  for (const svc of missingSvcPages) {
    pool.push({ credits: 1, activity: `Create ${svc.service} Levels of Care page to fill coverage gap`, weight: 6 });
  }

  // 3. Section 3 high-traffic topics with weak admit connection
  for (const topic of section3.topTrafficTopics.slice(0, 4)) {
    if (/weak|poor|indirect|no\s*clear|low/i.test(topic.connectionToAdmits)) {
      pool.push({ credits: 1, activity: `Refresh "${topic.topic}" content to strengthen admissions connection`, weight: 5 });
    }
  }

  // 4. Section 3 top pages with weak insight / conversion signal
  for (const page of section3.topTrafficPages.slice(0, 3)) {
    if (/weak|poor|low|no\s*conversion|informational/i.test(page.insight)) {
      const shortPage = page.page.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || page.page;
      const label = shortPage.length > 50 ? shortPage.substring(0, 50) : shortPage;
      pool.push({ credits: 1, activity: `Update ${label} page content to improve conversion intent alignment`, weight: 3 });
    }
  }

  // Sort descending by weight
  return pool.sort((a, b) => b.weight - a.weight);
}

export function generateSection7Credits(
  quarter: QuarterInfo,
  monthlyCredits: number,
  section2: Section2Conversions,
  section3: Section3Traffic,
  section4: Section4Services,
  section6: Section6Priorities,
): Section7Credits {
  const monthNames = QUARTER_MONTH_NAMES[quarter.planningQ] ?? ["Month 1", "Month 2", "Month 3"];
  const year = quarter.planningYear;

  const pool = buildCreditActionPool(section2, section3, section4, section6);

  // Generic fallbacks to ensure we always have enough items
  const GENERIC_FALLBACKS = [
    "Refresh one high-traffic informational page with weak admit connection",
    "Create one new care-access-supporting content piece",
    "Refresh one Levels of Care page to improve conversion intent alignment",
    "Expand cluster content for top organic query topic",
    "Create one locally-targeted content piece to support program discovery",
    "Refresh one underperforming money page with updated admissions messaging",
    "Create one FAQ-style support content piece around treatment access",
    "Refresh one blog/informational page to add admissions call-to-action",
    "Create one new content piece targeting an unaddressed high-intent query",
  ];

  // Pad pool with varied fallbacks if sparse
  let fbIdx = 0;
  while (pool.length < monthlyCredits * 3) {
    pool.push({ credits: 1, activity: GENERIC_FALLBACKS[fbIdx % GENERIC_FALLBACKS.length], weight: 1 });
    fbIdx++;
  }

  // Allocate across 3 months — each month must sum to exactly monthlyCredits
  const months: CreditMonthBlock[] = [];
  let poolIdx = 0;

  for (let mi = 0; mi < 3; mi++) {
    const monthLabel = `${monthNames[mi]} ${year}`;
    const rows: CreditRowData[] = [];
    let used = 0;

    while (used < monthlyCredits) {
      const remaining = monthlyCredits - used;
      if (poolIdx >= pool.length) {
        // Safety pad
        rows.push({
          credits: remaining,
          activity: remaining === 1
            ? "Refresh one priority content page"
            : `Refresh ${remaining} priority content pages`,
        });
        used = monthlyCredits;
        break;
      }
      const item = pool[poolIdx];
      if (item.credits <= remaining) {
        rows.push({ credits: item.credits, activity: item.activity });
        used += item.credits;
        poolIdx++;
      } else {
        // Partial: split the item
        rows.push({ credits: remaining, activity: item.activity });
        pool[poolIdx] = { ...item, credits: item.credits - remaining };
        used = monthlyCredits;
      }
    }

    months.push({ month: monthLabel, rows });
  }

  return { months };
}
