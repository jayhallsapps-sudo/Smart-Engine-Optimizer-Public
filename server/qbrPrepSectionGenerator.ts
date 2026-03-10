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
  SectionQssb,
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
} from "./qbrPrepHelpers";

const ME = "Manual entry needed";

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
  auditNotes?: string;
  clientNotes?: string;
  forwardLooking?: boolean;
  gapAnswers?: import("@shared/schema").GapAnswer[];
  /** Monthly content credits resolved in routes.ts from CLIENT_CREDIT_MAP (the canonical source).
   *  Defaults to 5 if not supplied. */
  monthlyCredits?: number;
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
  try {
    const now = new Date(quarter.analysisEnd || new Date());
    const month = now.getMonth() + 1;
    const currYear = now.getFullYear();
    const currQ = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
    const prevQ = currQ === 1 ? 4 : currQ - 1;
    const prevYear = currQ === 1 ? currYear - 1 : currYear;
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
    const analysisDays = Math.round((new Date(quarter.analysisEnd).getTime() - new Date(quarter.analysisStart).getTime()) / 86400000);
    const prevEnd = new Date(new Date(quarter.analysisStart).getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - analysisDays * 86400000);
    const prevStartStr = prevStart.toISOString().slice(0, 10);
    const prevEndStr = prevEnd.toISOString().slice(0, 10);

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

  const section1 = generateSection1(nsmData, ga4FunnelCurr, quarter, client, callTrackingSources, prevNsmData);
  const section2 = generateSection2(ga4LandingRows, gscPageRows, client, callTrackingLandingPages, callTrackingSources);
  const section3 = generateSection3(gscQueryRows, gscPageRows, ga4LandingRows, client, gscPrevQueryRows, gscPrevPageRows, gscQueryPageRows, gscPrevQueryPageRows);
  const section4 = generateSection4(sfData, sfHeaders, client);

  // T003: Post-process tertiary goal reason with actual traffic data from section3
  const tertiaryIdx = section1.rows.findIndex(r => r.goalType === "Tertiary Goal");
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
    hasVobPage: sfTierInput.hasVobPage ?? false,
    hasContactPage: sfTierInput.hasContactPage ?? false,
    hasDetoxPage: sfTierInput.hasDetoxPage ?? false,
    hasResidentialPage: sfTierInput.hasResidentialPage ?? false,
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
  };

  const tierDiagnosis = diagnoseTier(tierInput);
  const section5: Section5Diagnosis = {
    tier: tierDiagnosis.tier,
    tierName: tierDiagnosis.tierName,
    diagnosis: tierDiagnosis.diagnosis,
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
    const primaryRow = section1.rows.find(r => r.goalType === "Primary Goal");
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
      insights.push({ question: `Your main service pages cover ${services.join(", ")}. Are there any new programs or treatment modalities you're planning to launch or expand that we should be building content around?` });
    }

    // 4. Sessions goal question
    const tertiaryRow = section1.rows.find(r => r.goalType === "Tertiary Goal");
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
      priorityChecks: input.auditNotes,
      clientNotes: (input as any).clientNotes ?? "",
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

  const hasWomens = urls.some(u => /women|woman|female/i.test(u.url) || /women|woman|female/i.test(u.title));
  const hasMens = urls.some(u => /\bmen\b|male/i.test(u.url) || /\bmen\b|male/i.test(u.title));
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

function computeGoalShiftPct(currentGoal: string, prevGoal: string): string {
  const curr = parseInt(String(currentGoal).replace(/[^0-9]/g, ""), 10);
  const prev = parseInt(String(prevGoal).replace(/[^0-9]/g, ""), 10);
  if (isNaN(curr) || isNaN(prev) || prev === 0) return "—";
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct === 0) return "0%";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function generateSection1(nsmData: any, ga4Funnel: any, quarter: QuarterInfo, client: Client, callTrackingSources: Array<{ source: string; calls: number }> = [], prevNsmData: any = null): Section1Goals {
  const rows: GoalRow[] = [];

  const callTrackingProvider = detectCallTrackingProvider(client);

  console.log(`[Section1] client=${client.name}`);
  console.log(`[Section1] callTrackingProvider=${callTrackingProvider ?? "none"}`);
  console.log(`[Section1] nsmData present=${!!nsmData}, prevNsmData present=${!!prevNsmData}, ga4Funnel present=${!!ga4Funnel}`);

  const primaryKpiLabel = nsmData ? normalizeKpiLabel(nsmData.mvpType) : "Admits";
  console.log(`[Section1] Primary KPI label from mvpType: "${primaryKpiLabel}" (raw mvpType: "${nsmData?.mvpType ?? "—"}")`);

  let admitsGoalDisplay: string = primaryKpiLabel;
  let admitsShift = "—";
  let admitsSource = callTrackingProvider ?? "Source pending confirmation";
  let admitsReason = callTrackingProvider
    ? `${primaryKpiLabel} is the strategic primary KPI. ${callTrackingProvider} call data is used as the operational tracking source for admissions-intent activity.`
    : `${primaryKpiLabel} is the strategic primary KPI. Reporting source is not yet confirmed — this goal will be updated once a tracking source is connected.`;

  let nsmMvpActNum: number | null = null;
  let nsmMvpGoalNum: number | null = null;

  if (nsmData) {
    const mvpGoal = nsmData.mvpGoal !== "—" ? nsmData.mvpGoal : null;
    const mvpActual = nsmData.mvpActual !== "—" ? nsmData.mvpActual : null;
    if (mvpGoal) {
      const goalN = parseInt(String(mvpGoal).replace(/[^0-9]/g, ""), 10);
      if (!isNaN(goalN) && goalN > 0) nsmMvpGoalNum = goalN;
    }
    if (mvpActual) {
      const actN = parseInt(String(mvpActual).replace(/[^0-9]/g, ""), 10);
      if (!isNaN(actN)) nsmMvpActNum = actN;
    }
  }

  if (nsmMvpGoalNum !== null) {
    admitsSource = callTrackingProvider ?? "NSM Tracker";
    const kpiLower = primaryKpiLabel.toLowerCase();

    // Compute goal shift vs previous quarter using actual goal-to-goal comparison
    if (prevNsmData && prevNsmData.mvpGoal && prevNsmData.mvpGoal !== "—") {
      admitsShift = computeGoalShiftPct(String(nsmMvpGoalNum), prevNsmData.mvpGoal);
    }

    if (nsmMvpActNum !== null) {
      // Both goal and actual available — use pacing-based display
      const pacing = nsmMvpActNum / nsmMvpGoalNum!;
      const nextTarget = pacing >= 0.9
        ? Math.round(nsmMvpGoalNum! * 1.05)
        : pacing >= 0.7
          ? nsmMvpGoalNum!
          : Math.round(nsmMvpGoalNum! * 0.95);
      admitsGoalDisplay = `${fmtNum(nextTarget)} ${kpiLower}`;
      if (admitsShift === "—") {
        admitsShift = pacing >= 0.9 ? "+5%" : pacing >= 0.7 ? "0%" : "-5%";
      }
      admitsReason = pacing >= 0.9
        ? `${primaryKpiLabel} on pace (${nsmMvpActNum}/${nsmMvpGoalNum}). Slight increase is achievable given current trajectory. Calls are tracked via ${callTrackingProvider ?? "call tracking"}.`
        : pacing >= 0.7
          ? `${primaryKpiLabel} tracking at ${nsmMvpActNum}/${nsmMvpGoalNum} (${nsmData.mvpPercent !== "—" ? nsmData.mvpPercent : "partial"}). Maintaining goal while improving conversion paths.`
          : `${primaryKpiLabel} behind pace (${nsmMvpActNum}/${nsmMvpGoalNum}). Modest adjustment reflects realistic expectations while improving admissions path quality.`;
    } else {
      // Only goal available (actual not yet reported)
      admitsGoalDisplay = `${fmtNum(nsmMvpGoalNum!)} ${kpiLower} (Q target)`;
      if (admitsShift === "—") admitsShift = "—";
      admitsReason = `${primaryKpiLabel} Q target is ${fmtNum(nsmMvpGoalNum!)} — tracking has not yet been recorded for this quarter. ${callTrackingProvider ? `${callTrackingProvider} is the measurement source.` : "Connect a call tracking source to begin tracking actuals."}`;
    }
  }

  console.log(`[Section1] Primary Goal=${primaryKpiLabel}, goal=${admitsGoalDisplay}, source=${admitsSource}, shift=${admitsShift}`);

  rows.push({
    goalType: "Primary Goal",
    goal: admitsGoalDisplay,
    measurementSource: admitsSource,
    goalShift: admitsShift,
    reason: admitsReason,
  });

  // ── Secondary Goal: Calls ──────────────────────────────────────────────
  const callsSource = callTrackingProvider ?? ME;
  let callsGoal: string = ME;
  let callsShift = "Maintain";
  let callsReason = callTrackingProvider
    ? `Qualified organic calls tracked via ${callTrackingProvider}. Calls serve as the primary operational proxy for ${primaryKpiLabel.toLowerCase()} until a direct tracking source is confirmed.`
    : `${ME}: Call tracking provider not configured`;

  if (callTrackingSources.length > 0) {
    const totalCalls = callTrackingSources.reduce((s, r) => s + r.calls, 0);
    callsGoal = `${fmtNum(totalCalls)} tracked calls (QTD)`;
    callsReason = `${fmtNum(totalCalls)} organic calls tracked via ${callTrackingProvider ?? "call tracking"} this quarter. Calls are the primary measurable operational proxy for ${primaryKpiLabel.toLowerCase()}.`;
  }

  console.log(`[Section1] Secondary Goal=Calls, source=${callsSource}, shift=${callsShift}`);

  rows.push({
    goalType: "Secondary Goal",
    goal: callsGoal,
    measurementSource: callsSource,
    goalShift: callsShift,
    reason: callsReason,
  });

  // ── Tertiary Goal: Organic Sessions ────────────────────────────────────
  let sessRecommended: string = ME;
  let sessShift = "—";
  let sessReason = ME;

  if (nsmData) {
    const sessGoal = nsmData.sessionsGoal !== "—" ? nsmData.sessionsGoal : null;
    const sessActual = nsmData.sessionsActual !== "—" ? nsmData.sessionsActual : null;
    const sessPct = nsmData.sessionsPercent !== "—" ? nsmData.sessionsPercent : null;

    sessRecommended = sessGoal ?? ME;

    // Compute actual goal shift vs previous quarter
    if (prevNsmData && prevNsmData.sessionsGoal && prevNsmData.sessionsGoal !== "—" && sessGoal) {
      sessShift = computeGoalShiftPct(sessGoal, prevNsmData.sessionsGoal);
    }

    if (sessGoal && sessActual && sessPct) {
      const actualNum = parseInt(String(sessActual).replace(/[^0-9]/g, ""), 10);
      const goalNum = parseInt(String(sessGoal).replace(/[^0-9]/g, ""), 10);
      if (!isNaN(actualNum) && !isNaN(goalNum) && goalNum > 0) {
        const pacing = actualNum / goalNum;
        if (pacing >= 0.9) {
          sessRecommended = fmtNum(Math.round(goalNum * 1.05));
          if (sessShift === "—") sessShift = "+5%";
          sessReason = `On pace at ${sessPct} through current quarter. Modest increase is realistic given current trajectory.`;
        } else if (pacing >= 0.7) {
          sessRecommended = fmtNum(goalNum);
          if (sessShift === "—") sessShift = "0%";
          sessReason = `Tracking at ${sessPct} — maintaining current goal is realistic while addressing site improvements.`;
        } else {
          sessRecommended = fmtNum(Math.round(goalNum * 0.95));
          if (sessShift === "—") sessShift = "-5%";
          sessReason = `Behind pace at ${sessPct}. Slight reduction reflects realistic expectations while focusing on site fundamentals.`;
        }
      }
    } else if (sessGoal) {
      sessRecommended = fmtNum(parseInt(String(sessGoal).replace(/[^0-9]/g, ""), 10));
      sessReason = `Sessions Q target is ${sessRecommended}. Actuals not yet available for this quarter.`;
    }
  } else if (ga4Funnel) {
    sessRecommended = `${fmtNum(ga4Funnel.sessions)} organic sessions (QTD baseline)`;
    sessReason = `${fmtNum(ga4Funnel.sessions)} organic sessions recorded QTD via GA4. Sessions are the key top-of-funnel indicator reflecting organic traffic volume and content reach. Goal target to be validated against prior quarter baseline.`;
  } else {
    sessReason = `Organic sessions via GA4 and GSC are the primary top-of-funnel indicator, reflecting organic traffic volume and content reach driving admissions pipeline.`;
  }

  // Fallback reason when NSM data exists but session sub-fields are incomplete
  if (sessReason === ME) {
    sessReason = ga4Funnel
      ? `${fmtNum(ga4Funnel.sessions)} organic sessions recorded QTD via GA4. Organic sessions are the top-of-funnel leading indicator for pipeline quality and content reach — higher organic traffic means more qualified admissions inquiries.`
      : `Organic sessions via GA4 and GSC are the top-of-funnel leading indicator for pipeline quality. Increasing organic traffic directly drives more qualified admissions inquiries.`;
  }

  console.log(`[Section1] Tertiary Goal=Organic Sessions, target=${sessRecommended}, source=GA4 / GSC, shift=${sessShift}`);

  rows.push({
    goalType: "Tertiary Goal",
    goal: sessRecommended !== ME ? `${sessRecommended} organic sessions` : ME,
    measurementSource: "GA4 / GSC",
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

function generateSection2(
  ga4Landing: any[],
  gscPages: any[],
  client: Client,
  callLandingPages: Array<{ page: string; calls: number }> = [],
  callSources: Array<{ source: string; calls: number }> = []
): Section2Conversions {
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

  // Final fallback — only reached when no GA4 conversion rows and no call-tracking rows exist
  if (topConvertingPages.length === 0) {
    topConvertingPages.push({
      type: "No qualified data yet",
      page: "No qualifying conversion page identified",
      conversionSource: "GA4 / Call Tracking not detected",
      notes: "No GA4 conversion events or call-tracking landing-page data found. Connect GA4 event tracking or a call tracking provider to populate this table.",
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
      pattern: "Admissions-Gated Entry Points",
      whyItMatters: "Direct contact, intake, and insurance-verification pages are the last digital step before a prospective client reaches the admissions team. Conversion friction on these pages costs admits directly.",
      evidence: hasGA4Signal
        ? "GA4 conversion events confirm on-site form activity on admissions-path pages."
        : `${callTrackingSource} landing-page data shows call volume attributable to admissions or VOB pages.`,
    });
  }

  if (hasVob && !hasAdmissions) {
    candidatePatterns.push({
      pattern: "Insurance Verification Pathway",
      whyItMatters: "VOB pages are the clearest digital pre-admission signal — completing a benefits check substantially increases the probability of an intake conversation.",
      evidence: hasGA4Signal
        ? "GA4 shows Verify Insurance page driving the largest share of on-site conversion events."
        : `${callTrackingSource} data confirms call activity originating from the insurance verification page.`,
    });
  }

  if (hasServicePage) {
    candidatePatterns.push({
      pattern: "Service Page Conversion Capture",
      whyItMatters: "Core service pages (Detox, Residential, PHP/IOP) are the primary entry point for treatment-intent searches. Visitors landing here are actively evaluating fit — page quality and clear conversion paths determine whether they move toward admissions.",
      evidence: hasCallSignal
        ? `${callTrackingSource} confirms service pages are driving qualified inbound calls.`
        : "GA4 conversion data shows service page sessions converting at measurable rates.",
    });
  }

  if (hasInfoPage) {
    candidatePatterns.push({
      pattern: "Informational Assist to Conversion",
      whyItMatters: "Educational and resource content plays a supporting role in the patient decision journey — high-ranking informational pages build trust and often precede direct admit actions. Internal linking from these pages toward conversion pages amplifies their value.",
      evidence: hasCallSignal
        ? `${callTrackingSource} shows informational pages generating pre-call engagement that converts to inbound contact.`
        : "GA4 session data shows informational pages participating in the conversion path before admission-intent actions.",
    });
  }

  if (hasHomepage && candidatePatterns.length < 2) {
    candidatePatterns.push({
      pattern: "Homepage as Brand Verification Signal",
      whyItMatters: "Homepage conversion events or direct traffic through the homepage indicates strong brand recall or referral-driven behavior — users who already know the brand and are returning to take action.",
      evidence: hasGA4Signal
        ? "GA4 shows homepage sessions contributing to conversion events — confirm these are admit-aligned actions."
        : `${callTrackingSource} data shows inbound calls attributed to homepage sessions.`,
    });
  }

  // Fallback pattern if pool is empty (no GA4 or call tracking data available)
  if (candidatePatterns.length === 0) {
    candidatePatterns.push({
      pattern: "High-Intent Organic Traffic Capture",
      whyItMatters: "Treatment-intent organic queries (e.g., detox near me, rehab programs, insurance-covered treatment) represent the strongest mid-funnel intent. Pages ranking for these terms need optimized conversion paths to close the gap between clicks and contacts.",
      evidence: "GA4 event tracking is not yet confirmed on key pages — connect GA4 or call tracking to qualify conversion-driving pages.",
    });
  }
  if (candidatePatterns.length < 2) {
    candidatePatterns.push({
      pattern: "Tracking Gap as Conversion Floor",
      whyItMatters: "When conversion tracking is incomplete, high-value actions (form submits, call initiations, chat starts) go unattributed. This understates the true conversion rate and creates a systematic blind spot in reporting.",
      evidence: "GA4 conversion events are not yet confirmed on key admissions-path pages — call tracking or GA4 setup is needed to qualify these pages.",
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
    for (const src of callSources.sort((a, b) => b.calls - a.calls).slice(0, 4)) {
      if (topConvertingSources.length >= 4) break;
      const pct = totalCalls > 0 ? Math.round(src.calls / totalCalls * 100) : 0;
      const isPPC = PPC_KEYWORDS.test(src.source);
      topConvertingSources.push({
        source: src.source,
        whatsConverting: `${fmtNum(src.calls)} inbound calls (${pct}% of all tracked calls)`,
        notes: isPPC
          ? "Paid channel — verify call quality and cost-per-contact with admissions team"
          : "Organic / direct channel — confirm with admissions team that these are admission-qualified calls",
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
        notes: "GA4 tracks form submissions and goal completions — source/medium breakdown requires a separate channel report",
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
        notes: "Conversion source attribution is not yet available. Implement GA4 events and/or call tracking to get real source data.",
        dataSource: "Manual entry needed",
      });
    } else {
      topConvertingSources.push({
        source: ME,
        whatsConverting: "No call tracking or GA4 conversion source data available for this account",
        notes: "Implement call tracking (CallRail/CTM) and GA4 conversion events to unlock real source attribution",
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
    "Detox": "Service Page",
    "Residential / Inpatient": "Service Page",
    "PHP / IOP": "Service Page",
    "Outpatient": "Service Page",
    "Dual Diagnosis": "Service Page",
    "Therapies": "Service Page",
    "Conditions": "Service Page",
    "Homepage": "Homepage",
    "Staff / Team": "Staff Page",
    "Blog / Resource": "Blog / Resource",
    "FAQ": "FAQ Page",
    "Local Treatment Intent": "Service Page",
    "Branded Navigation": "Homepage",
    "Substance-Specific": "Blog / Resource",
    "Informational / Education": "Blog / Resource",
  };
  return map[internalType] ?? "Service Page";
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
    if (internalType === "Service Page" || ["Detox", "Residential / Inpatient", "PHP / IOP", "Outpatient", "Dual Diagnosis", "Therapies"].includes(internalType)) return "High-visibility service page with likely support value — direct conversion attribution is limited; add call or form tracking to confirm.";
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
      return "Core service page for high-intent detox-seekers. Visitors are actively evaluating programs — page quality and admissions CTA directly influence intake conversion.";
    case "Residential / Inpatient":
      return "Residential treatment service page. Traffic here signals users comparing inpatient programs — differentiation and a clear admissions path are the priority.";
    case "PHP / IOP":
      return "Step-down or flexible care service page. Users are weighing level-of-care options — a clear admissions path can improve conversion from this already-evaluated segment.";
    case "Substance-Specific": {
      if (/alcohol/.test(path)) return `${hiVol ? "High-volume" : "Moderate-volume"} alcohol-awareness content. Entry-stage traffic that needs a clear route from educational content to detox or treatment program pages.`;
      if (/opioid|heroin|fentanyl/.test(path)) return "Opioid-specific informational entry point. Early-funnel users researching substances — internal links to detox and residential pages capture the highest conversion value.";
      if (/meth/.test(path)) return "Methamphetamine-specific awareness content. Mostly early-funnel — route toward detox and dual-diagnosis pages where appropriate.";
      if (/cocaine|coke/.test(path)) return "Cocaine-specific awareness content. Educational traffic that supports later conversion when paired with clear internal links to service pages.";
      if (/benzo/.test(path)) return "Benzodiazepine-specific information page. Medical detox intent is elevated for this substance — route users toward detox and residential program pages.";
      return `${hiVol ? "High-volume" : "Moderate-volume"} substance-specific awareness content. Educational entry point that needs targeted internal links to appropriate service pages to convert traffic.`;
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
      return "Primary branded entry point serving a mix of direct, branded, and first-time visitors. Should route efficiently to service pages and the admissions path for maximum conversion.";
    default: {
      if (/meet|\/team|\/staff/.test(path)) return "Trust-building page that supports credibility evaluation. Late-stage visitors — internal links to admissions and program pages can convert this research intent.";
      if (/\/review|\/testimonial|\/alumni/.test(path)) return "Social proof content that builds confidence in the program. Can move hesitant users toward admissions contact when paired with clear CTAs.";
      if (/\/faq|\/guide/.test(path)) return "FAQ or guide attracting users with specific treatment questions. Informational stage — structured links to relevant service and admissions pages improve conversion.";
      return `${hiVol ? "High-volume" : "Moderate-volume"} informational entry point with limited direct admit linkage. Awareness-stage content — internal links to service pages are the highest-ROI improvement for this traffic.`;
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
  client: Client
): Section4Services {
  const services: ServiceRow[] = [];
  const urlCol = sfHeaders.find(h => /^address$/i.test(h) || /^url$/i.test(h)) ?? sfHeaders[0] ?? "";

  // Contact / Admissions handled separately below via isUtilityAdmissionsPage().
  const serviceTargets = [
    { service: "Detox", pattern: /\/detox/i },
    { service: "Residential / Inpatient", pattern: /\/residential|\/inpatient/i },
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

  // Fill missing services with ME up to 8 rows
  for (const target of serviceTargets) {
    if (services.length >= 8) break;
    if (!services.find(s => s.service === target.service)) {
      services.push({ service: target.service, examplePage: ME });
    }
  }

  return { services: services.slice(0, 8) };
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

    if (amCtx.auditSignals.includes("metadata") && /title|meta/.test(initLower)) {
      p.reason += " Manual audit confirms: metadata gaps present — title and description optimization will improve click-through on current impressions.";
    }
    if (amCtx.auditSignals.includes("internal_linking") && /internal link/.test(initLower)) {
      p.reason += " Manual audit confirms: internal linking gaps identified — high-traffic pages are not passing authority to conversion pages.";
    }
    if (amCtx.auditSignals.includes("thin_content") && /content refresh/.test(initLower)) {
      p.reason += " Manual audit confirms: thin or duplicate content detected — refreshing these pages directly improves crawl quality and topical authority.";
    }
    if (amCtx.auditSignals.includes("crawl_errors") && /technical cleanup/.test(initLower)) {
      p.reason += " Manual audit confirms: redirect chains and error pages identified — resolving these improves crawl efficiency and page equity flow.";
    }
    if (amCtx.auditSignals.includes("admissions_path") && /admissions|conversion path|vob/.test(initLower)) {
      p.reason += " Manual audit flags the admissions/VOB path as a friction point — aligns with this initiative.";
    }
    if (amCtx.auditSignals.includes("service_page") && /service page|service foundation/.test(initLower)) {
      p.reason += " Manual audit flagged service page gaps — consolidation and refresh are confirmed priorities.";
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
      reason: "Manual audit flagged page speed as an issue — slow load times on high-intent pages suppress both rankings and on-site conversion rates",
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
      reason: "Manual audit identified missing structured data — schema markup improves SERP feature eligibility and helps Google confirm treatment center entity context",
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
        ? `AM focus area: ${amCtx.hypothesisSummary.slice(0, 90).replace(/\.$/, "")}. Cannibalization dilutes authority on core service pages.`
        : "Pages competing for the same keywords split ranking signals — consolidation protects the primary service page hierarchy",
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
      action: "Implement or verify GA4 and call-tracking instrumentation on key admissions-path pages — track contact form submits separately from Verify Insurance / VOB form submits, starting with Contact, Verify Insurance, and highest-intent service pages.",
      reason: "Reporting confidence is limited where conversion tracking is missing. Instrumentation must be in place before page-level admit connection can be quantified reliably.",
      source: "Multi-source",
    });
  }

  if (section5.tier <= 1) {
    if (!tierInput.hasDetoxPage || !tierInput.hasResidentialPage) {
      if (!isAlreadyDone("service page") && !isAlreadyDone("detox") && !isAlreadyDone("residential")) {
        priorities.push({
          priority: priorities.length + 1,
          initiative: "Core Service Page Foundation",
          tier: "Tier 1",
          action: "Refresh and consolidate primary detox and residential intent so Google sees one clear service path per treatment level",
          reason: "Core service pages are the foundation for search trust — without clear primary URLs, nothing else compounds",
          source: "Multi-source",
        });
      }
    }
    if (!tierInput.hasVobPage || !tierInput.hasContactPage) {
      if (!isAlreadyDone("insurance") && !isAlreadyDone("vob") && !isAlreadyDone("admissions")) {
        priorities.push({
          priority: priorities.length + 1,
          initiative: "Admissions Pathway Clarity",
          tier: "Tier 1",
          action: "Strengthen Verify Insurance and admissions entry points to reduce friction on high-intent traffic",
          reason: "VOB and contact pages are the primary conversion mechanism — unclear pathways lose admits",
          source: "Multi-source",
        });
      }
    }
  }

  if (section5.tier <= 2 && priorities.length < 7) {
    if (!tierInput.hasConditionsHub && !isAlreadyDone("conditions hub")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Conditions Hub Structure",
        tier: "Tier 2",
        action: "Build a conditions hub to support authority flow into existing service pages",
        reason: "Hub structure lets Google understand topical relationships and pass authority to conversion pages",
        source: "Multi-source",
      });
    }
    if (!tierInput.hasTherapiesHub && !isAlreadyDone("therapies hub") && !isAlreadyDone("therapy hub")) {
      priorities.push({
        priority: priorities.length + 1,
        initiative: "Therapies Architecture",
        tier: "Tier 2",
        action: "Organize treatment modalities into a therapies hub that reinforces service page authority",
        reason: "Therapy pages support E-E-A-T and differentiate the program in competitive searches",
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

  const evidenceFillers: Array<{ initiative: string; tier: string; action: string; reason: string; condition: boolean; source: string }> = [
    {
      initiative: "Internal Linking — High-Traffic to Conversion",
      tier: `Tier ${Math.min(section5.tier, 3)}`,
      action: topUnclearPage
        ? `Add internal links from "${topUnclearPage.page}" (${topUnclearPage.clicks} clicks, ${topUnclearPage.connectionToAdmits.toLowerCase()} admit connection) to primary service and VOB pages`
        : "Add internal links from high-traffic informational pages to primary service and VOB pages",
      reason: topUnclearPage
        ? `${topUnclearPage.clicks} organic clicks land on a page with limited path to admissions — targeted internal links to service and VOB pages are the lowest-cost lever to convert that existing traffic`
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
        ? `Refresh content in the "${topTrafficTopic.topic}" cluster (${topTrafficTopic.insight.split(".")[0]}) to improve engagement and strengthen links to service pages`
        : `Refresh highest-traffic assisted-conversion pages${thinPagesNote}`,
      reason: topTrafficTopic
        ? `The "${topTrafficTopic.topic}" topic drives meaningful traffic but shows ${topTrafficTopic.connectionToAdmits.toLowerCase()} admit connection — refreshed content with stronger CTAs and internal links captures more value from existing impressions`
        : `Existing high-traffic pages${hasThinPages ? ` and ${tierInput.thinPages} detected thin pages` : ""} are the fastest path to improving organic conversion without new content investment`,
      condition: !priorities.find(p => p.initiative.includes("Content Refresh")) && !isAlreadyDone("content refresh"),
      source: "GSC",
    },
    {
      initiative: "Title & Meta Optimization",
      tier: "Tier 1",
      action: hasMissingH1s
        ? `Fix ${tierInput.missingH1s} pages with missing H1 tags and audit meta descriptions on top-traffic pages to improve CTR`
        : "Audit title tags and meta descriptions on highest-impression pages to improve organic CTR",
      reason: hasMissingH1s
        ? `Crawl shows ${tierInput.missingH1s} pages without H1 tags — these pages are structurally weak and likely suppressed in rankings; fixing them requires low effort for potentially high impact`
        : "CTR improvements on existing impression volume require no new traffic — they are free growth on what the site already earns",
      condition: !priorities.find(p => p.initiative.includes("Title") || p.initiative.includes("Meta")),
      source: "Multi-source",
    },
  ];

  for (const f of evidenceFillers) {
    if (priorities.length >= 5) break;
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

  if (priorities.length < 5) {
    priorities.push({
      priority: priorities.length + 1,
      initiative: "Organic Channel Health Review",
      tier: `Tier ${section5.tier}`,
      action: "Review organic channel baseline metrics QoQ to identify acceleration or decay signals before setting Q3 strategy",
      reason: "Establishing a clean QoQ baseline is prerequisite to any growth investment — without it, directional decisions are made without evidence",
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

  return {
    priorities: cappedPriorities.slice(0, 7),
    crossSellPreview: crossSellPreview.length > 0 ? crossSellPreview : undefined,
    auditMissing: auditMissing || undefined,
    strategyBankFetchFailed: strategyBankFetchFailed || undefined,
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
      metric: "GSC clicks to primary service pages (detox, residential, PHP/IOP)",
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
        `Tier ${tier} site diagnosis (${tierName}) — domain authority is the primary constraint on service-page rankings, which content production alone cannot break through`,
      ];
      if (isBehindPace && primaryRow) {
        evidenceItems.push(`Primary goal (${primaryRow.goal}) is behind pace — standard content-only work cannot close the authority gap that limits service-page rankings this cycle`);
      } else {
        evidenceItems.push(`${highAdmitTopics.length} confirmed high-intent topic cluster${highAdmitTopics.length > 1 ? "s" : ""} identified — authority, not content volume, is the primary ranking constraint on these terms`);
      }

      pool.push(candidate({
        type: "upsell",
        title: "Custom Authority-Building Initiative",
        why_now: `Site is at Tier ${tier} — service-page rankings on high-value treatment terms are constrained by domain authority. The standard content roadmap addresses what to publish, not the ceiling that prevents those pages from ranking.`,
        evidence: evidenceItems,
        recommendation: "A focused link acquisition or digital PR program targeting high-intent service pages. This is a deeper SEO investment than the standard monthly retainer covers, designed to remove the authority ceiling that content production alone cannot lift.",
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
      recommendation: "An expanded content production program to systematically build out service page clusters, topic hubs, and conversion-path pages across all confirmed high-intent areas — more output capacity applied to confirmed demand signals.",
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
