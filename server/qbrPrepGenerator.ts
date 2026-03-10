import { storage } from "./storage";
import { getGoogleAccessToken } from "./googleToken";
import { decrypt } from "./encryption";
import type { Client, GapAnswer } from "@shared/schema";
import { type GapContext, buildGapContext } from "./gapAnswerContext";

export type PastQuarter =
  | "Q1" | "Q2" | "Q3" | "Q4"
  | "Q1_TODATE" | "Q2_TODATE" | "Q3_TODATE" | "Q4_TODATE";
export type FutureQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export interface QbrPrepInput {
  clientId: number;
  pastQuarter: PastQuarter;
  futureQuarter: FutureQuarter;
  includeContent: boolean;
  includeTechnical: boolean;
  includeLocal: boolean;
  includeCro: boolean;
  includeAuthority: boolean;
  includeTracking: boolean;
  opportunityCapPerCategory: number;
  timezone: string;
  sfReportId?: number;
  gapAnswers?: GapAnswer[];
}

export interface Opportunity {
  opportunity_title: string;
  priority: "P0" | "P1" | "P2";
  impact: "High" | "Med" | "Low";
  effort: "S" | "M" | "L";
  kpi_affected: string;
  urls: string[];
  evidence: string;
  problem: string;
  opportunity: string;
  why_it_matters: string;
  recommended_next_step: string;
}

export interface OpportunityCategory {
  category_name: string;
  opportunities: Opportunity[];
}

export interface Win {
  title: string;
  evidence: string;
  source: string;
}

export interface TopOpportunity {
  title: string;
  category: string;
  priority: string;
  impact: string;
  kpi: string;
}

export interface QbrPrepJson {
  report_title: string;
  client_name: string;
  past_window_label: string;
  past_start: string;
  past_end: string;
  future_window_label: string;
  generated_at: string;
  executive_summary: {
    wins: Win[];
    top_opportunities: TopOpportunity[];
  };
  opportunity_backlog: OpportunityCategory[];
}

export interface QbrPrepOutput {
  json: QbrPrepJson;
  markdown: string;
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function quarterBounds(q: number, year: number): { start: Date; end: Date } {
  const starts = [0, 3, 6, 9];
  const ends   = [2, 5, 8, 11];
  const lastDays = [31, 30, 30, 31];
  const m = starts[q - 1];
  const em = ends[q - 1];
  return {
    start: new Date(year, m, 1),
    end:   new Date(year, em, lastDays[q - 1]),
  };
}

function prevQuarterBounds(q: number, year: number): { start: Date; end: Date } {
  let pq = q - 1;
  let py = year;
  if (pq < 1) { pq = 4; py = year - 1; }
  return quarterBounds(pq, py);
}

export function computeWindow(pastQuarter: PastQuarter, timezone: string): {
  pastStart: string;
  pastEnd: string;
  prevStart: string;
  prevEnd: string;
  pastWindowLabel: string;
  qNum: number;
  qYear: number;
} {
  const isToDate = pastQuarter.endsWith("_TODATE");
  const qNum = parseInt(pastQuarter.replace("_TODATE", "").replace("Q", "")) as 1 | 2 | 3 | 4;

  const nowLocal = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone || "America/Los_Angeles" })
  );
  const currentYear = nowLocal.getFullYear();
  const currentMonth = nowLocal.getMonth() + 1;
  const currentQNum = Math.ceil(currentMonth / 3);

  let qYear: number;
  if (isToDate) {
    qYear = currentYear;
    const bounds = quarterBounds(qNum, qYear);
    const prev = prevQuarterBounds(qNum, qYear);
    return {
      pastStart: fmt(bounds.start),
      pastEnd: fmt(nowLocal),
      prevStart: fmt(prev.start),
      prevEnd: fmt(prev.end),
      pastWindowLabel: `Q${qNum} ${qYear} (To Date: ${fmt(nowLocal)})`,
      qNum,
      qYear,
    };
  }

  qYear = currentYear;
  const { end } = quarterBounds(qNum, currentYear);
  if (nowLocal <= end) {
    qYear = currentYear - 1;
  }

  const bounds = quarterBounds(qNum, qYear);
  const prev = prevQuarterBounds(qNum, qYear);
  return {
    pastStart: fmt(bounds.start),
    pastEnd: fmt(bounds.end),
    prevStart: fmt(prev.start),
    prevEnd: fmt(prev.end),
    pastWindowLabel: `Q${qNum} ${qYear}`,
    qNum,
    qYear,
  };
}

async function gscFetch(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 200,
  filters?: any[]
): Promise<any[]> {
  const body: any = { startDate, endDate, dimensions, rowLimit };
  if (filters) body.dimensionFilterGroups = [{ filters }];
  try {
    const resp = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await resp.json() as any;
    if (!resp.ok) {
      console.error("[QBR Prep] GSC error:", data.error?.message);
      return [];
    }
    return data.rows ?? [];
  } catch (e: any) {
    console.error("[QBR Prep] GSC fetch error:", e.message);
    return [];
  }
}

async function ga4Fetch(
  accessToken: string,
  propertyId: string,
  body: any
): Promise<any> {
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
    if (!resp.ok) {
      console.error("[QBR Prep] GA4 error:", data.error?.message);
      return null;
    }
    return data;
  } catch (e: any) {
    console.error("[QBR Prep] GA4 fetch error:", e.message);
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

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return n / d;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function fmtPctChange(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? "+∞%" : "—";
  const ch = ((curr - prev) / prev) * 100;
  return `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%`;
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function scoreOpps(opps: Opportunity[]): Opportunity[] {
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };
  const impactOrder = { High: 0, Med: 1, Low: 2 };
  return opps.sort((a, b) => {
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pd !== 0) return pd;
    return impactOrder[a.impact] - impactOrder[b.impact];
  });
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "") || "/";
}

function normUrl(url: string): string {
  if (!url) return "";
  try {
    const lower = url.toLowerCase().trim();
    const u = new URL(lower.startsWith("http") ? lower : `https://${lower}`);
    u.hash = "";
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    u.pathname = path;
    return u.origin + u.pathname + u.search;
  } catch {
    return url.toLowerCase().trim().replace(/\/$/, "") || "/";
  }
}

function baseDomain(siteUrl: string): string {
  if (!siteUrl) return "";
  if (siteUrl.startsWith("sc-domain:")) return `https://${siteUrl.replace("sc-domain:", "")}`;
  try {
    const u = new URL(siteUrl);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return siteUrl.replace(/\/$/, "");
  }
}

function ga4PathToNorm(path: string, siteUrl: string): string {
  if (!path || path === "(not set)") return "";
  if (path.startsWith("http")) return normUrl(path);
  const base = baseDomain(siteUrl);
  return normUrl(`${base}${path.startsWith("/") ? path : "/" + path}`);
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export async function generateQbrPrep(input: QbrPrepInput): Promise<QbrPrepOutput> {
  const client = await storage.getClient(input.clientId);
  if (!client) throw new Error("Client not found");

  const tz = input.timezone || "America/Los_Angeles";
  const { pastStart, pastEnd, prevStart, prevEnd, pastWindowLabel, qNum, qYear } = computeWindow(
    input.pastQuarter as PastQuarter,
    tz
  );
  const futureLabel = `Q${input.futureQuarter.replace("Q", "")}`;
  const cap = input.opportunityCapPerCategory;

  console.log(`[QBR Prep] Generating for ${client.name} | ${pastWindowLabel} | ${pastStart} → ${pastEnd}`);

  const [gscToken, ga4Token] = await Promise.all([
    getGoogleAccessToken("google_search_console"),
    getGoogleAccessToken("google_analytics_4"),
  ]);

  const gscAvailable = !!(gscToken && client.gscSiteUrl);
  const ga4Available = !!(ga4Token && client.ga4PropertyId);

  console.log(`[QBR Prep] GSC available: ${gscAvailable}, GA4 available: ${ga4Available}`);

  const allSfReports = await storage.getSfReports(client.id).catch(() => []);
  const sfAvailable = allSfReports.length > 0;

  const callrailCreds = await storage.getApiCredentialsByService("callrail").catch(() => []);
  const ctmCreds = await storage.getApiCredentialsByService("ctm").catch(() => []);
  const callTrackingAvailable = (callrailCreds.length > 0 && !!client.callrailCompanyId) ||
    (ctmCreds.length > 0 && !!(client as any).ctmAccountId);

  const gapContext = buildGapContext(input.gapAnswers ?? []);

  const ctReports = await storage.getCallTrackingReports(client.id).catch(() => []);
  const ctReportAvailable = ctReports.length > 0;

  const allCategories: OpportunityCategory[] = [];
  const allWins: Win[] = [];

  let gscPageRows: any[] = [];
  let gscPrevPageRows: any[] = [];
  let gscQueryRows: any[] = [];
  let gscPrevQueryRows: any[] = [];
  let ga4LandingRows: any[] = [];
  let ga4PrevLandingRows: any[] = [];
  let ga4Funnel: { sessions: number; conversions: number } | null = null;
  let ga4PrevFunnel: { sessions: number; conversions: number } | null = null;
  let ga4DeviceRows: any[] = [];
  let sfData: Record<string, any>[] = [];
  let sfHeaders: string[] = [];
  let sfCol: Record<string, string> = {};

  if (gscAvailable) {
    console.log(`[QBR Prep] Fetching GSC data...`);
    [gscPageRows, gscPrevPageRows, gscQueryRows, gscPrevQueryRows] = await Promise.all([
      gscFetch(gscToken!, client.gscSiteUrl!, pastStart, pastEnd, ["page"], 500),
      gscFetch(gscToken!, client.gscSiteUrl!, prevStart, prevEnd, ["page"], 500),
      gscFetch(gscToken!, client.gscSiteUrl!, pastStart, pastEnd, ["query"], 500),
      gscFetch(gscToken!, client.gscSiteUrl!, prevStart, prevEnd, ["query"], 500),
    ]);
    console.log(`[QBR Prep] GSC: ${gscPageRows.length} pages, ${gscQueryRows.length} queries`);
  }

  if (ga4Available) {
    console.log(`[QBR Prep] Fetching GA4 data...`);
    const leadEvents = client.leadEvents ?? [];
    const [landingData, prevLandingData, funnelData, prevFunnelData, deviceData] = await Promise.all([
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: pastStart, endDate: pastEnd }],
        dimensions: [{ name: "landingPage" }],
        metrics: [
          { name: "sessions" }, { name: "conversions" },
          { name: "averageSessionDuration" }, { name: "engagementRate" },
          { name: "bounceRate" },
        ],
        dimensionFilter: organicFilter(),
        limit: 200,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: prevStart, endDate: prevEnd }],
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
        limit: 200,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [
          { startDate: pastStart, endDate: pastEnd },
          { startDate: prevStart, endDate: prevEnd },
        ],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: prevStart, endDate: prevEnd }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        dimensionFilter: organicFilter(),
      }),
      ga4Fetch(ga4Token!, client.ga4PropertyId!, {
        dateRanges: [{ startDate: pastStart, endDate: pastEnd }],
        dimensions: [{ name: "landingPage" }, { name: "deviceCategory" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "engagementRate" }],
        dimensionFilter: organicFilter(),
        limit: 300,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
    ]);

    if (landingData?.rows) {
      ga4LandingRows = landingData.rows.map((r: any) => ({
        page: r.dimensionValues?.[0]?.value ?? "",
        sessions: parseFloat(r.metricValues?.[0]?.value ?? "0"),
        conversions: parseFloat(r.metricValues?.[1]?.value ?? "0"),
        avgDuration: parseFloat(r.metricValues?.[2]?.value ?? "0"),
        engagementRate: parseFloat(r.metricValues?.[3]?.value ?? "0"),
        bounceRate: parseFloat(r.metricValues?.[4]?.value ?? "0"),
      }));
    }

    if (prevLandingData?.rows) {
      ga4PrevLandingRows = prevLandingData.rows.map((r: any) => ({
        page: r.dimensionValues?.[0]?.value ?? "",
        sessions: parseFloat(r.metricValues?.[0]?.value ?? "0"),
        conversions: parseFloat(r.metricValues?.[1]?.value ?? "0"),
      }));
    }

    if (funnelData?.rows) {
      const rows = funnelData.rows;
      const curr = rows.find((r: any) => r.dimensionValues?.[0]?.value === "date_range_0")
        ?? rows[0];
      const prev = rows.find((r: any) => r.dimensionValues?.[0]?.value === "date_range_1")
        ?? rows[1];
      if (curr) {
        ga4Funnel = {
          sessions: parseFloat(curr.metricValues?.[0]?.value ?? "0"),
          conversions: parseFloat(curr.metricValues?.[1]?.value ?? "0"),
        };
      }
      if (prev) {
        ga4PrevFunnel = {
          sessions: parseFloat(prev.metricValues?.[0]?.value ?? "0"),
          conversions: parseFloat(prev.metricValues?.[1]?.value ?? "0"),
        };
      }
    }

    if (deviceData?.rows) {
      ga4DeviceRows = deviceData.rows.map((r: any) => ({
        page: r.dimensionValues?.[0]?.value ?? "",
        device: r.dimensionValues?.[1]?.value ?? "",
        sessions: parseFloat(r.metricValues?.[0]?.value ?? "0"),
        conversions: parseFloat(r.metricValues?.[1]?.value ?? "0"),
        engagementRate: parseFloat(r.metricValues?.[2]?.value ?? "0"),
      }));
    }

    console.log(`[QBR Prep] GA4: ${ga4LandingRows.length} landing pages, funnel: ${JSON.stringify(ga4Funnel)}`);
  }

  let sfIsInternalAll = false;
  let sfIssueSummary: Map<string, number> = new Map();
  let sfTotalUrls = 0;

  if (sfAvailable) {
    const sfReport = input.sfReportId
      ? (await storage.getSfReport(input.sfReportId).catch(() => null)) ?? allSfReports[0]
      : allSfReports[0];
    sfHeaders = sfReport.headers ?? [];
    sfData = (sfReport.data ?? []) as Record<string, any>[];

    console.log(`[QBR Prep] SF: ${sfData.length} rows, headers: ${sfHeaders.slice(0, 8).join(" | ")}`);

    // ── Detect format ────────────────────────────────────────────────────
    const headersLower = sfHeaders.map(h => h.toLowerCase());
    sfIsInternalAll = headersLower.some(h => h === "address" || h === "status code" || h === "status");

    if (!sfIsInternalAll) {
      // Crawl Overview / summary format — extract issue counts
      console.log(`[QBR Prep] SF: Detected Crawl Overview format (not row-level Internal All)`);
      const col0 = sfHeaders[0] ?? "";
      const col1 = sfHeaders[1] ?? "";
      for (const row of sfData) {
        const key = String(row[col0] ?? "").trim();
        const val = String(row[col1] ?? "").trim();
        const num = parseInt(val.replace(/[^0-9]/g, ""), 10);
        if (key && !isNaN(num)) {
          sfIssueSummary.set(key.toLowerCase(), num);
          if (key.toLowerCase().includes("total") && key.toLowerCase().includes("url")) {
            sfTotalUrls = num;
          }
        }
      }
      // Also check for common summary keys
      if (sfTotalUrls === 0) {
        const totalKey = Array.from(sfIssueSummary.keys()).find(k => k.includes("total") || k.includes("crawled"));
        if (totalKey) sfTotalUrls = sfIssueSummary.get(totalKey) ?? sfData.length;
      }
      console.log(`[QBR Prep] SF Crawl Overview: ${sfTotalUrls} total URLs, ${sfIssueSummary.size} issue types parsed`);
    } else {
      // Internal All format — build column map (case-insensitive)
      const findCol = (...names: string[]) => {
        const lowerNames = names.map(n => n.toLowerCase());
        const idx = headersLower.findIndex(h => lowerNames.includes(h));
        return idx >= 0 ? sfHeaders[idx] : undefined;
      };
      sfCol = {
        url: findCol("address", "url") ?? sfHeaders[0] ?? "",
        status: findCol("status code", "status") ?? "",
        indexability: findCol("indexability") ?? "",
        indexabilityStatus: findCol("indexability status") ?? "",
        title: findCol("title 1", "title", "page title") ?? "",
        titleLen: findCol("title 1 length", "title length") ?? "",
        h1: findCol("h1-1", "h1") ?? "",
        h1Count: findCol("h1-1 count", "h1 count") ?? "",
        canonical: findCol("canonical link element 1", "canonical") ?? "",
        canonicalSelf: findCol("canonical link element match canonical?", "canonical match") ?? "",
        inlinks: findCol("inlinks", "internal inlinks") ?? "",
        outlinks: findCol("outlinks") ?? "",
        depth: findCol("crawl depth", "depth") ?? "",
        wordCount: findCol("word count") ?? "",
        metaDesc: findCol("meta description 1", "meta description") ?? "",
        metaDescLen: findCol("meta description 1 length", "meta description length") ?? "",
        contentType: findCol("content type") ?? "",
        response: findCol("response time") ?? "",
        size: findCol("size") ?? "",
      };
      sfTotalUrls = sfData.length;
      console.log(`[QBR Prep] SF Internal All: ${sfTotalUrls} URLs | urlCol="${sfCol.url}" statusCol="${sfCol.status}" indexCol="${sfCol.indexability}" wcCol="${sfCol.wordCount}" titleCol="${sfCol.title}"`);
    }
  }

  // ── Normalized join maps ─────────────────────────────────────────────────
  const siteBase = baseDomain(client.gscSiteUrl ?? "");

  const sfByNorm = new Map<string, Record<string, any>>();
  if (sfAvailable && sfCol.url) {
    for (const row of sfData) {
      const raw = String(row[sfCol.url] ?? "");
      if (raw) sfByNorm.set(normUrl(raw), row);
    }
  }

  const gscByNorm = new Map<string, any>();
  for (const row of gscPageRows) {
    const raw = String(row.keys?.[0] ?? "");
    if (raw) gscByNorm.set(normUrl(raw), row);
  }

  const ga4ByNorm = new Map<string, any>();
  for (const row of ga4LandingRows) {
    const norm = ga4PathToNorm(row.page, client.gscSiteUrl ?? "");
    if (norm) ga4ByNorm.set(norm, row);
  }

  // Coverage diagnostics (internal)
  const gscMatchesSf = gscPageRows.filter(r => sfByNorm.has(normUrl(String(r.keys?.[0] ?? "")))).length;
  const ga4MatchesSf = ga4LandingRows.filter(r => sfByNorm.has(ga4PathToNorm(r.page, client.gscSiteUrl ?? ""))).length;
  console.log(`[QBR Prep] Coverage: SF=${sfData.length} URLs | GSC=${gscPageRows.length} pages (${gscMatchesSf} match SF) | GA4=${ga4LandingRows.length} pages (${ga4MatchesSf} match SF)`);

  const totalGscClicks = gscPageRows.reduce((s: number, r: any) => s + (r.clicks ?? 0), 0);
  const totalGscImpressions = gscPageRows.reduce((s: number, r: any) => s + (r.impressions ?? 0), 0);
  const totalPrevGscClicks = gscPrevPageRows.reduce((s: number, r: any) => s + (r.clicks ?? 0), 0);
  const medianImpressions = gscPageRows.length > 0
    ? [...gscPageRows].sort((a: any, b: any) => (a.impressions ?? 0) - (b.impressions ?? 0))[Math.floor(gscPageRows.length / 2)]?.impressions ?? 0
    : 0;
  const medianCtr = totalGscImpressions > 0 ? totalGscClicks / totalGscImpressions : 0.03;
  const siteAvgCtr = medianCtr;

  const gscPrevPageMap = new Map<string, any>(gscPrevPageRows.map((r: any) => [r.keys?.[0], r]));
  const gscPrevQueryMap = new Map<string, any>(gscPrevQueryRows.map((r: any) => [r.keys?.[0], r]));

  const siteCvr = ga4Funnel && ga4Funnel.sessions > 0
    ? ga4Funnel.conversions / ga4Funnel.sessions
    : null;
  const prevSiteCvr = ga4PrevFunnel && ga4PrevFunnel.sessions > 0
    ? ga4PrevFunnel.conversions / ga4PrevFunnel.sessions
    : null;

  const ga4PrevMap = new Map<string, any>(ga4PrevLandingRows.map((r: any) => [r.page, r]));

  if (input.includeContent) {
    const contentOpps: Opportunity[] = [];
    const seenContentUrls = new Set<string>();

    const addContent = (o: Opportunity) => {
      const key = o.urls[0] ?? o.opportunity_title;
      if (!seenContentUrls.has(key)) { seenContentUrls.add(key); contentOpps.push(o); }
    };

    // ── PASS 1: GSC-driven opportunities ─────────────────────────────────
    if (gscAvailable && gscPageRows.length > 0) {
      const allImps = gscPageRows.map((r: any) => r.impressions ?? 0);
      const p75imp = percentile(allImps, 75);

      const highImpLowCtr = gscPageRows
        .filter((r: any) => (r.impressions ?? 0) >= Math.max(p75imp, 50) && (r.ctr ?? 0) < siteAvgCtr * 0.8)
        .sort((a: any, b: any) => ((b.impressions ?? 0) * (siteAvgCtr - (b.ctr ?? 0))) - ((a.impressions ?? 0) * (siteAvgCtr - (a.ctr ?? 0))))
        .slice(0, 6);

      for (const row of highImpLowCtr) {
        const page = row.keys?.[0] ?? "";
        const pageNorm = normUrl(page);
        const pos = (row.position ?? 0).toFixed(1);
        const ctr = fmtPct(row.ctr ?? 0);
        const imp = fmtNum(row.impressions ?? 0);
        const clicks = fmtNum(row.clicks ?? 0);
        const potentialClicks = Math.round((row.impressions ?? 0) * Math.max(siteAvgCtr - (row.ctr ?? 0), 0));
        const prev = gscPrevPageMap.get(page);
        const ctrChange = prev ? fmtPctChange(row.ctr ?? 0, prev.ctr ?? 0) : "no prior data";
        const ga4Row = ga4ByNorm.get(pageNorm);
        const sfRow = sfByNorm.get(pageNorm);
        const isInGA4Top20 = ga4Row && ga4LandingRows.indexOf(ga4Row) < 20;
        const priority: Opportunity["priority"] = (row.position ?? 100) <= 10 && (row.impressions ?? 0) > p75imp ? "P0" : (row.impressions ?? 0) >= p75imp ? "P1" : "P2";
        const impact: Opportunity["impact"] = isInGA4Top20 || (row.impressions ?? 0) > p75imp * 1.5 ? "High" : "Med";
        const sfNote = sfRow ? ` SF: ${sfRow[sfCol.wordCount] ? `${sfRow[sfCol.wordCount]} words,` : ""} ${sfRow[sfCol.title] ? `title="${String(sfRow[sfCol.title]).slice(0,60)}…"` : "no title data"}.` : "";
        addContent({
          opportunity_title: `Low CTR vs Impressions: ${shortUrl(page)}`,
          priority, impact, effort: "S", kpi_affected: "CTR, Rankings",
          urls: [page],
          evidence: `GSC (${pastWindowLabel}): ${imp} impressions, ${clicks} clicks, CTR ${ctr} (site avg ${fmtPct(siteAvgCtr)}), avg position ${pos}. CTR vs prior quarter: ${ctrChange}. ~${fmtNum(potentialClicks)} clicks lost vs site avg CTR.${sfNote}`,
          problem: `This page receives ${imp} impressions but converts at only ${ctr} CTR — well below the ${fmtPct(siteAvgCtr)} site average. The title/meta description is likely misaligned with search intent.`,
          opportunity: "Rewrite title tag and meta description to match dominant query intent. Add FAQ schema or review snippets to enhance the SERP listing. Adjust H2 structure to signal content relevance to top queries.",
          why_it_matters: `Closing the CTR gap to site average could generate roughly ${fmtNum(potentialClicks)} additional organic clicks per quarter.`,
          recommended_next_step: "Pull the top 10 queries driving impressions to this page via GSC. Rewrite the title with the primary query at the front. Update meta description to include a clear value proposition and CTA.",
        });
      }

      const strikingDistance = gscPageRows
        .filter((r: any) => { const pos = r.position ?? 100; return pos >= 4 && pos <= 15 && (r.impressions ?? 0) > 50; })
        .sort((a: any, b: any) => ((b.impressions ?? 0) / (b.position ?? 10)) - ((a.impressions ?? 0) / (a.position ?? 10)))
        .slice(0, 5);

      for (const row of strikingDistance) {
        const page = row.keys?.[0] ?? "";
        const pageNorm = normUrl(page);
        const pos = (row.position ?? 0).toFixed(1);
        const imp = fmtNum(row.impressions ?? 0);
        const clicks = fmtNum(row.clicks ?? 0);
        const prev = gscPrevPageMap.get(page);
        const posChange = prev ? ((prev.position ?? row.position) - row.position).toFixed(1) : null;
        const posNote = posChange ? (Number(posChange) > 0 ? ` (↑${posChange} positions gained QoQ)` : ` (↓${Math.abs(Number(posChange))} positions lost QoQ)`) : "";
        const sfRow = sfByNorm.get(pageNorm);
        const wc = sfRow && sfCol.wordCount ? Number(sfRow[sfCol.wordCount] ?? 0) : 0;
        const wcNote = wc > 0 ? ` SF word count: ${wc}.` : "";
        addContent({
          opportunity_title: `Striking Distance Page: ${shortUrl(page)}`,
          priority: (row.position ?? 100) <= 8 ? "P1" : "P2",
          impact: (row.impressions ?? 0) > percentile(allImps, 60) ? "High" : "Med",
          effort: "M", kpi_affected: "Rankings, CTR, Calls/Forms",
          urls: [page],
          evidence: `GSC (${pastWindowLabel}): avg position ${pos}${posNote}, ${imp} impressions, ${clicks} clicks.${wcNote}`,
          problem: `Page is at position ${pos} — within reach of top 3 but leaving significant click share on the table.`,
          opportunity: "Expand content depth, add internal link equity from hub/service pages, refresh with current statistics, and add schema/FAQ to improve SERP appearance.",
          why_it_matters: "Moving from position 4–15 to top 3 typically yields 2–5x more clicks for the same impression count.",
          recommended_next_step: "Run a content gap analysis against the top 3 ranking pages. Add 3–5 targeted internal links from related service/blog pages. Add authoritative FAQ section.",
        });
      }

      if (ga4Available && ga4LandingRows.length > 0 && siteCvr !== null) {
        const highTrafficLowCvr = ga4LandingRows
          .filter((r: any) => r.sessions > 15 && pct(r.conversions, r.sessions) < siteCvr * 0.65)
          .sort((a: any, b: any) => b.sessions - a.sessions)
          .slice(0, 4);

        for (const row of highTrafficLowCvr) {
          const pageNorm = ga4PathToNorm(row.page, client.gscSiteUrl ?? "");
          const fullUrl = pageNorm || row.page;
          const pageCvr = pct(row.conversions, row.sessions);
          const prev = ga4PrevMap.get(row.page);
          const sessionChange = prev ? fmtPctChange(row.sessions, prev.sessions) : "no prior data";
          const convChange = prev ? fmtPctChange(row.conversions, prev.conversions) : "no prior data";
          const isTop10 = ga4LandingRows.indexOf(row) < 10;
          const gscRow = gscByNorm.get(pageNorm);
          const gscNote = gscRow ? ` GSC: position ${(gscRow.position ?? 0).toFixed(1)}, ${fmtNum(gscRow.impressions ?? 0)} impressions.` : "";
          addContent({
            opportunity_title: `High Traffic, Low CVR: ${shortUrl(fullUrl)}`,
            priority: isTop10 && row.sessions > 80 ? "P1" : "P2",
            impact: isTop10 ? "High" : row.sessions > 50 ? "Med" : "Low",
            effort: "M", kpi_affected: "Forms, Calls",
            urls: [fullUrl],
            evidence: `GA4 (${pastWindowLabel}): ${fmtNum(row.sessions)} organic sessions, ${fmtNum(row.conversions)} conversions, CVR ${fmtPct(pageCvr)} vs site avg ${fmtPct(siteCvr)}. Sessions QoQ: ${sessionChange}, conversions QoQ: ${convChange}. Engagement rate: ${fmtPct(row.engagementRate)}.${gscNote}`,
            problem: `Page drives ${fmtNum(row.sessions)} organic sessions but converts at ${fmtPct(pageCvr)} — ${((1 - pageCvr / siteCvr) * 100).toFixed(0)}% below site average. Visitors are arriving but not taking action.`,
            opportunity: "Audit CTA placement, messaging, and form friction. Add trust signals above the fold. Ensure primary conversion path is visible on mobile without scrolling.",
            why_it_matters: `Closing the CVR gap to site average would produce ~${fmtNum(Math.round(row.sessions * Math.max(siteCvr - pageCvr, 0)))} additional conversions per quarter from existing traffic.`,
            recommended_next_step: "Install heatmap (Hotjar/similar) for 2 weeks. Rewrite CTA copy to be intent-specific (e.g., 'Get Your Free Insurance Verification' vs 'Contact Us').",
          });
        }

        const droppingConv = ga4LandingRows
          .filter((r: any) => r.sessions > 15)
          .filter((r: any) => {
            const prev = ga4PrevMap.get(r.page);
            if (!prev || prev.sessions < 5) return false;
            const currCvr = pct(r.conversions, r.sessions);
            const prevCvr = pct(prev.conversions, prev.sessions);
            return prevCvr > 0.001 && (prevCvr - currCvr) / prevCvr > 0.25;
          })
          .sort((a: any, b: any) => {
            const prevA = ga4PrevMap.get(a.page);
            const prevB = ga4PrevMap.get(b.page);
            const dropA = prevA ? (pct(prevA.conversions, prevA.sessions) - pct(a.conversions, a.sessions)) / pct(prevA.conversions, prevA.sessions) : 0;
            const dropB = prevB ? (pct(prevB.conversions, prevB.sessions) - pct(b.conversions, b.sessions)) / pct(prevB.conversions, prevB.sessions) : 0;
            return dropB - dropA;
          })
          .slice(0, 3);

        for (const row of droppingConv) {
          const prev = ga4PrevMap.get(row.page)!;
          const pageNorm = ga4PathToNorm(row.page, client.gscSiteUrl ?? "");
          const fullUrl = pageNorm || row.page;
          const currCvr = pct(row.conversions, row.sessions);
          const prevCvr = pct(prev.conversions, prev.sessions);
          const drop = ((prevCvr - currCvr) / prevCvr * 100).toFixed(0);
          addContent({
            opportunity_title: `Conversion Drop on ${shortUrl(fullUrl)}: CVR Down ${drop}% QoQ`,
            priority: "P1",
            impact: row.sessions > 80 ? "High" : "Med",
            effort: "M", kpi_affected: "Forms, Calls",
            urls: [fullUrl],
            evidence: `GA4 QoQ: CVR dropped from ${fmtPct(prevCvr)} to ${fmtPct(currCvr)} (−${drop}%). Sessions: ${fmtNum(row.sessions)} vs ${fmtNum(prev.sessions)} prior quarter. Conversions: ${fmtNum(row.conversions)} vs ${fmtNum(prev.conversions)}.`,
            problem: `Significant CVR decline QoQ despite stable traffic. Indicates content, UX, or competitive change is suppressing performance.`,
            opportunity: "Audit page for recent CMS changes, CTA modifications, or layout changes. Check SERP for competitor changes. Review A/B test results that may have landed on an underperforming variant.",
            why_it_matters: `A −${drop}% CVR drop represents an ongoing lead loss each week this goes unaddressed.`,
            recommended_next_step: "Review CMS revision history. Restore high-converting CTA placements or test new variant. Check GA4 DebugView to confirm form submission events fire correctly.",
          });
        }
      }
    }

    // ── PASS 2: SF-only fallback when < 8 content opportunities ─────────
    const CONTENT_MIN = 8;
    if (contentOpps.length < CONTENT_MIN && sfAvailable && sfData.length > 0) {
      console.log(`[QBR Prep] Content PASS 2: only ${contentOpps.length} opps, running SF-only fallback`);
      const htmlRows = sfCol.contentType ? sfData.filter(r => String(r[sfCol.contentType] ?? "").toLowerCase().includes("html")) : sfData;
      const indexableRows = sfCol.indexability ? htmlRows.filter(r => String(r[sfCol.indexability] ?? "").toLowerCase() === "indexable") : htmlRows;

      // Thin content (service/location pages)
      if (sfCol.wordCount && contentOpps.length < CONTENT_MIN) {
        const thin = indexableRows
          .filter(r => { const wc = Number(r[sfCol.wordCount] ?? 0); return wc > 0 && wc < 800; })
          .sort((a, b) => Number(a[sfCol.wordCount] ?? 0) - Number(b[sfCol.wordCount] ?? 0))
          .slice(0, 4);
        for (const r of thin) {
          if (contentOpps.length >= CONTENT_MIN) break;
          const url = String(r[sfCol.url] ?? "");
          const wc = Number(r[sfCol.wordCount] ?? 0);
          addContent({
            opportunity_title: `Thin Content: Expand ${shortUrl(url)} (${wc} words)`,
            priority: wc < 300 ? "P1" : "P2", impact: "Med", effort: "M",
            kpi_affected: "Rankings, CTR",
            urls: [url],
            evidence: `Screaming Frog: ${url} has only ${wc} words. Service/location pages under 800 words rarely rank for competitive queries in the recovery sector.`,
            problem: `At ${wc} words, this page provides insufficient depth to compete for valuable treatment-related queries. Thin content on service pages is a top reason for poor rankings.`,
            opportunity: "Expand to 900+ words covering: the specific service, who it's for, what to expect, insurance coverage, FAQs (5+), testimonial/proof block, and a clear CTA. Add schema markup (MedicalCondition, FAQPage).",
            why_it_matters: "Recovery pages under 700 words are routinely outranked by competitors with comprehensive content. Expanding once provides lasting ranking improvement.",
            recommended_next_step: "Prioritize by traffic potential (cross-reference with GSC). Write a brief for each thin page covering the 6 content blocks above. Target 900–1200 words for service pages.",
          });
        }
      }

      // Missing meta descriptions (content signal)
      if (sfCol.metaDesc && contentOpps.length < CONTENT_MIN) {
        const missingMeta = indexableRows.filter(r => !r[sfCol.metaDesc] || String(r[sfCol.metaDesc]).trim() === "").slice(0, 3);
        for (const r of missingMeta) {
          if (contentOpps.length >= CONTENT_MIN) break;
          const url = String(r[sfCol.url] ?? "");
          addContent({
            opportunity_title: `Missing Meta Description: ${shortUrl(url)}`,
            priority: "P2", impact: "Med", effort: "S",
            kpi_affected: "CTR",
            urls: [url],
            evidence: `Screaming Frog: Page has no meta description. Google auto-generates snippets — often pulling irrelevant text from the page body.`,
            problem: "Auto-generated meta descriptions are rarely compelling and don't include conversion-oriented language or keywords.",
            opportunity: "Write a unique, compelling meta description (140–160 chars) incorporating the primary keyword, a key benefit, and an implicit CTA ('Verify insurance instantly', 'Start healing today').",
            why_it_matters: "Well-written meta descriptions improve CTR by 2–5% even without ranking changes, generating more clicks from the same impression volume.",
            recommended_next_step: "Write meta descriptions for the top 20 pages by GSC impressions first. Use format: [Primary Service] in [Location] — [Key Benefit]. [Implicit CTA].",
          });
        }
      }

      // AEO / FAQ gaps from SF title analysis
      if (sfCol.title && contentOpps.length < CONTENT_MIN) {
        const noFaqTitle = indexableRows
          .filter(r => {
            const t = String(r[sfCol.title] ?? "").toLowerCase();
            const url = String(r[sfCol.url] ?? "").toLowerCase();
            return (url.includes("/blog") || url.includes("/resources") || url.includes("/faq")) && !t.includes("faq") && !t.includes("question");
          })
          .slice(0, 2);
        for (const r of noFaqTitle) {
          if (contentOpps.length >= CONTENT_MIN) break;
          const url = String(r[sfCol.url] ?? "");
          addContent({
            opportunity_title: `AEO Structure Gap: Add FAQ Section to ${shortUrl(url)}`,
            priority: "P2", impact: "Med", effort: "M",
            kpi_affected: "Rankings, CTR (Featured Snippets)",
            urls: [url],
            evidence: `Screaming Frog: Content page lacks FAQ/AEO structure signals in title. AI-generated search overviews increasingly favor pages with clear Q&A structure.`,
            problem: "Pages without FAQ sections miss out on Featured Snippet and AI Overview inclusion. For treatment queries ('Does insurance cover rehab?', 'How long is detox?'), FAQ schema drives significantly higher CTR.",
            opportunity: "Add 5–8 FAQ pairs targeting long-tail questions around this page's topic. Implement FAQPage schema markup. Structure questions around search intent: process, cost, insurance, and outcome queries.",
            why_it_matters: "FAQ schema can trigger rich results in SERP, increasing CTR by 20–30%. AEO structure is increasingly important for AI-generated search responses.",
            recommended_next_step: "Identify the top 8 questions users ask about this topic (use 'People Also Ask' in SERP). Write direct, concise answers (50–80 words each). Implement FAQPage schema via Yoast/RankMath or custom code.",
          });
        }
      }

      // Freshness opportunities from GSC (relaxed thresholds)
      if (gscAvailable && gscPageRows.length > 0 && contentOpps.length < CONTENT_MIN) {
        const freshnessCandidates = gscPageRows
          .filter((r: any) => {
            const imp = r.impressions ?? 0;
            const prev = gscPrevPageMap.get(r.keys?.[0]);
            const clickDrop = prev && (prev.clicks ?? 0) > 5 && (r.clicks ?? 0) < (prev.clicks ?? 0) * 0.75;
            const stale = imp > 50 && (r.ctr ?? 0) < 0.012;
            return clickDrop || stale;
          })
          .sort((a: any, b: any) => (b.impressions ?? 0) - (a.impressions ?? 0))
          .slice(0, 3);
        for (const row of freshnessCandidates) {
          if (contentOpps.length >= CONTENT_MIN) break;
          const page = row.keys?.[0] ?? "";
          const prev = gscPrevPageMap.get(page);
          const clickNote = prev ? ` Clicks: ${fmtNum(row.clicks ?? 0)} vs ${fmtNum(prev.clicks ?? 0)} prior quarter (${fmtPctChange(row.clicks ?? 0, prev.clicks ?? 0)}).` : "";
          addContent({
            opportunity_title: `Freshness Opportunity: Refresh ${shortUrl(page)}`,
            priority: "P2", impact: "Med", effort: "M",
            kpi_affected: "Rankings, CTR",
            urls: [page],
            evidence: `GSC (${pastWindowLabel}): ${fmtNum(row.impressions ?? 0)} impressions, ${fmtPct(row.ctr ?? 0)} CTR, avg position ${(row.position ?? 0).toFixed(1)}.${clickNote}`,
            problem: "Declining click performance despite impression stability often indicates content freshness issues — competitors have updated their pages and are now outperforming this one in SERP.",
            opportunity: "Update page with current year statistics, new research citations, refreshed treatment protocol descriptions, and recent testimonials. Update the page's publication/modified date in schema markup.",
            why_it_matters: "Google's freshness signal rewards recently updated content, especially for 'evergreen' queries like treatment options, insurance coverage, and detox processes.",
            recommended_next_step: "Review page content against top 3 current SERP competitors. Identify 3–5 sections with outdated information or missing content blocks. Update and republish.",
          });
        }
      }

      // Fallback: GSC relaxed-threshold impressions
      if (gscAvailable && gscPageRows.length > 0 && contentOpps.length < CONTENT_MIN) {
        const relaxed = gscPageRows
          .filter((r: any) => !seenContentUrls.has(r.keys?.[0]) && (r.impressions ?? 0) > 50 && (r.ctr ?? 0) < 0.015)
          .sort((a: any, b: any) => (b.impressions ?? 0) - (a.impressions ?? 0))
          .slice(0, CONTENT_MIN - contentOpps.length);
        for (const row of relaxed) {
          if (contentOpps.length >= CONTENT_MIN) break;
          const page = row.keys?.[0] ?? "";
          const pos = (row.position ?? 0).toFixed(1);
          addContent({
            opportunity_title: `CTR Optimization Opportunity: ${shortUrl(page)}`,
            priority: "P2", impact: "Low", effort: "S",
            kpi_affected: "CTR, Rankings",
            urls: [page],
            evidence: `GSC (${pastWindowLabel}): ${fmtNum(row.impressions ?? 0)} impressions, ${fmtPct(row.ctr ?? 0)} CTR, avg position ${pos}. Below-average CTR for this impression volume.`,
            problem: "Below-average CTR on a page with meaningful impression volume suggests title/meta description or rich result markup can be improved.",
            opportunity: "Test a more compelling title tag and meta description. Add structured data (FAQ, Review, HowTo) where applicable to enhance the SERP listing with rich results.",
            why_it_matters: "Improving CTR on pages with significant impression volume generates more organic visits without requiring any ranking improvement.",
            recommended_next_step: "Check current SERP for this page's primary query. Identify which top-3 results earn the most clicks (look at title/description patterns). Rewrite to match high-performing patterns.",
          });
        }
      }
    }

    // ── PASS 2: No GSC/GA4 — SF-only baseline content opps ──────────────
    if (contentOpps.length < CONTENT_MIN && !gscAvailable && !ga4Available && sfAvailable && sfData.length > 0) {
      contentOpps.push({
        opportunity_title: "Connect GSC + GA4 for Full Content Analysis",
        priority: "P0", impact: "High", effort: "S",
        kpi_affected: "CTR, Rankings, Tracking Integrity", urls: [],
        evidence: "GSC and GA4 not connected — content opportunity scoring requires real traffic and ranking data.",
        problem: "Without GSC impressions, CTR, and positioning data, content optimization is based on guesswork. We cannot identify which pages are close to page 1, which have poor CTR, or which are losing traffic.",
        opportunity: "Connect Google Search Console and GA4 in Setup → Analytics & Search to unlock full automated content opportunity detection.",
        why_it_matters: "Content optimization is the highest-ROI SEO activity. Real data allows precise identification of pages with the most upside.",
        recommended_next_step: "Connect GSC and GA4 credentials in Setup, then regenerate this report.",
      });
    }

    console.log(`[QBR Prep] Content: ${contentOpps.length} opportunities (min target: ${CONTENT_MIN})`);
    allCategories.push({
      category_name: "Content Opportunities",
      opportunities: scoreOpps(contentOpps).slice(0, cap),
    });
  }

  if (input.includeTechnical) {
    const techOpps: Opportunity[] = [];

    // ── BRANCH A: Crawl Overview (summary) format ──────────────────────
    if (sfAvailable && sfData.length > 0 && !sfIsInternalAll) {
      // Extract issue counts from summary data and produce evidence-backed opps
      const issueCount = (patterns: string[]): number => {
        for (const [k, v] of Array.from(sfIssueSummary.entries())) {
          if (patterns.some(p => k.includes(p.toLowerCase()))) return v;
        }
        return 0;
      };

      const n4xx = issueCount(["4xx", "client error", "broken"]);
      const n5xx = issueCount(["5xx", "server error"]);
      const nNoindex = issueCount(["noindex", "non-indexable", "not indexable"]);
      const nRedirect = issueCount(["3xx", "redirect"]);
      const nMissingTitle = issueCount(["missing title", "no title"]);
      const nDupTitle = issueCount(["duplicate title"]);
      const nMissingH1 = issueCount(["missing h1", "no h1"]);
      const nMissingMeta = issueCount(["missing meta description", "no meta description"]);
      const nOrphan = issueCount(["orphan", "no inlinks", "zero inlinks"]);
      const nThin = issueCount(["thin content", "low word count"]);

      const total = sfTotalUrls || sfData.length;
      techOpps.push({
        opportunity_title: `Technical Audit Summary: ${total.toLocaleString()} URLs Crawled — Upgrade to Internal All Export for URL-Level Detail`,
        priority: "P0", impact: "High", effort: "S",
        kpi_affected: "Indexation, Rankings, All",
        urls: [],
        evidence: `Screaming Frog Crawl Overview uploaded: ${total.toLocaleString()} total URLs. Issue summary parsed: ${[
          n4xx > 0 ? `${n4xx} 4xx errors` : "",
          n5xx > 0 ? `${n5xx} 5xx errors` : "",
          nNoindex > 0 ? `${nNoindex} non-indexable pages` : "",
          nRedirect > 0 ? `${nRedirect} redirects` : "",
          nMissingTitle > 0 ? `${nMissingTitle} missing titles` : "",
          nDupTitle > 0 ? `${nDupTitle} duplicate titles` : "",
          nMissingH1 > 0 ? `${nMissingH1} missing H1s` : "",
          nOrphan > 0 ? `${nOrphan} orphan pages` : "",
          nThin > 0 ? `${nThin} thin content pages` : "",
        ].filter(Boolean).join(", ") || "counts not parsed from this export format"}.`,
        problem: "A Crawl Overview export was uploaded instead of the Internal All export. Issue counts are visible but specific affected URLs cannot be identified for targeted remediation. All technical opportunities below are based on aggregate counts only.",
        opportunity: "Re-export from Screaming Frog using: Reports → Internal → All → Export (CSV). Upload this file to replace the current crawl. This unlocks URL-level evidence for every technical issue found.",
        why_it_matters: "URL-level data allows us to prioritize fixes by impact (e.g., which specific service pages have missing titles, which 4xx URLs have inlinks pointing to them). Without it, remediation is unguided.",
        recommended_next_step: "In Screaming Frog: Internal tab → select all → Export to CSV. Alternatively use: Bulk Export → All Inlinks, All Internal pages. Upload the resulting file in QBR Prep → Select Crawl.",
      });

      if (n4xx > 0) techOpps.push({
        opportunity_title: `Fix ${n4xx} 4xx Error Pages (URL List Available in Internal All Export)`,
        priority: "P0", impact: n4xx > 10 ? "High" : "Med", effort: n4xx > 30 ? "M" : "S",
        kpi_affected: "Indexation, Rankings, Link Equity", urls: [],
        evidence: `Screaming Frog Crawl Overview: ${n4xx} URLs returning 4xx status codes out of ${total.toLocaleString()} total.`,
        problem: `${n4xx} pages are returning client errors (4xx). Googlebot hits dead ends, wasting crawl budget and losing any link equity pointing to these URLs. Internal links to 4xx pages create a poor user experience.`,
        opportunity: "Redirect all 4xx URLs to the most relevant live page using 301 redirects. Update internal links pointing to dead URLs. Submit an updated sitemap after remediation.",
        why_it_matters: "4xx pages drain crawl budget and lose accumulated link equity. Upload the Internal All export to get the specific URLs and their inlink sources.",
        recommended_next_step: `Export Internal All from Screaming Frog. Filter by Status Code = 4xx. Export all ${n4xx} URLs. Categorize and implement 301 redirects.`,
      });

      if (nNoindex > 0) techOpps.push({
        opportunity_title: `Audit ${nNoindex} Non-Indexable Pages`,
        priority: "P1", impact: nNoindex > 5 ? "High" : "Med", effort: "M",
        kpi_affected: "Indexation, Rankings", urls: [],
        evidence: `Screaming Frog Crawl Overview: ${nNoindex} non-indexable pages detected.`,
        problem: `${nNoindex} pages are explicitly excluded from Google's index. Any service or content page accidentally marked noindex cannot rank regardless of content quality or backlinks.`,
        opportunity: "Upload Internal All export to identify exactly which pages are non-indexable and why (noindex tag, robots.txt block, canonical mismatch). Audit and correct any accidental exclusions.",
        why_it_matters: "One service page accidentally noindexed represents zero organic traffic potential. Fix is typically a one-line tag removal.",
        recommended_next_step: "Re-upload Internal All export. Filter by Indexability = Non-Indexable. Identify any service, blog, or location pages in the list. Remove incorrect noindex tags.",
      });

      if (nMissingTitle > 0 || nDupTitle > 0) techOpps.push({
        opportunity_title: `Title Tag Issues: ${nMissingTitle} Missing, ${nDupTitle} Duplicate`,
        priority: nMissingTitle > 5 ? "P0" : "P1", impact: "High", effort: "M",
        kpi_affected: "CTR, Rankings", urls: [],
        evidence: `Screaming Frog Crawl Overview: ${nMissingTitle} pages missing title tags, ${nDupTitle} pages with duplicate titles.`,
        problem: "Missing titles cause Google to auto-generate them (often poorly). Duplicate titles cause keyword cannibalization — Google cannot determine which page to rank for a given query.",
        opportunity: "Upload Internal All export to identify all affected pages. Write unique, keyword-targeted titles: [Primary Keyword] – [Secondary] | [Brand]. Resolve all duplicate title groups.",
        why_it_matters: "Title tags are the #1 on-page CTR signal and a primary ranking factor. Missing or duplicate titles are among the highest-ROI fixes in technical SEO.",
        recommended_next_step: "Re-upload Internal All export. Filter by 'Missing Title' and 'Duplicate Title'. Prioritize service and location pages. Write unique titles for all affected pages.",
      });

      if (nMissingH1 > 0) techOpps.push({
        opportunity_title: `Missing H1 Tags: ${nMissingH1} Pages Affected`,
        priority: "P1", impact: "Med", effort: "S",
        kpi_affected: "Rankings", urls: [],
        evidence: `Screaming Frog Crawl Overview: ${nMissingH1} pages have no H1 tag.`,
        problem: "H1 is a primary on-page relevance signal. Missing H1s send weaker keyword signals to Google and indicate disorganized page structure.",
        opportunity: "Add a single descriptive H1 incorporating the primary target keyword to each affected page. Ensure H1 is distinct from title tag but covers the same query intent.",
        why_it_matters: "H1 tags help Google understand the primary topic of a page. Easy fix with direct ranking benefit.",
        recommended_next_step: "Re-upload Internal All export. Filter Missing H1. Prioritize service/location pages. Add H1 with primary keyword + location modifier.",
      });

      if (nOrphan > 0) techOpps.push({
        opportunity_title: `${nOrphan} Orphan Pages with No Internal Links`,
        priority: "P1", impact: "High", effort: "M",
        kpi_affected: "Rankings, Indexation", urls: [],
        evidence: `Screaming Frog Crawl Overview: ${nOrphan} pages have zero internal inlinks — completely orphaned.`,
        problem: `Orphaned pages receive no link equity from the rest of the site and may be discovered only via the XML sitemap. They have minimal crawl priority and near-zero PageRank accumulation.`,
        opportunity: "Upload Internal All export to identify which pages are orphaned. Build an internal linking plan connecting orphaned service/blog pages to relevant hub pages and service pages.",
        why_it_matters: "Internal links are how PageRank flows through a site. A page with zero inlinks receives near-zero authority regardless of its content quality.",
        recommended_next_step: "Re-upload Internal All export. Filter by Inlinks = 0. For each important orphaned page, identify 3 relevant pages to link from. Add contextual links with keyword-rich anchor text.",
      });

      if (nRedirect > 0) techOpps.push({
        opportunity_title: `${nRedirect} Redirect Chains Found`,
        priority: "P2", impact: nRedirect > 20 ? "High" : "Med", effort: "S",
        kpi_affected: "Link Equity, Crawl Budget", urls: [],
        evidence: `Screaming Frog Crawl Overview: ${nRedirect} redirect URLs detected.`,
        problem: "Internal links pointing to redirect URLs waste crawl budget and pass diluted PageRank. Each redirect hop adds latency.",
        opportunity: "Update internal links to point directly to final 200 URLs instead of through redirect chains.",
        why_it_matters: "Redirect chains accumulate over time from site migrations. Cleaning them preserves link equity and improves crawl efficiency.",
        recommended_next_step: "Re-upload Internal All export. Filter by Status Code = 3xx. Update all internal links pointing to redirected URLs to use the final destination.",
      });

      if (nMissingMeta > 0) techOpps.push({
        opportunity_title: `${nMissingMeta} Pages Missing Meta Descriptions`,
        priority: "P2", impact: nMissingMeta > 20 ? "Med" : "Low", effort: "S",
        kpi_affected: "CTR", urls: [],
        evidence: `Screaming Frog Crawl Overview: ${nMissingMeta} pages missing meta descriptions.`,
        problem: "Auto-generated meta descriptions rarely include keyword-optimized or conversion-oriented language, reducing CTR.",
        opportunity: "Write unique 140–160 character meta descriptions for all service, location, and blog pages.",
        why_it_matters: "Well-written meta descriptions improve CTR by 2–5% without requiring ranking improvements.",
        recommended_next_step: "Re-upload Internal All export. Filter Missing Meta Description. Prioritize top pages by GSC impressions.",
      });

      if (nThin > 0) techOpps.push({
        opportunity_title: `${nThin} Thin Content Pages Detected`,
        priority: "P2", impact: "Med", effort: "L",
        kpi_affected: "Rankings", urls: [],
        evidence: `Screaming Frog Crawl Overview: ${nThin} pages flagged as thin content.`,
        problem: "Thin content pages dilute overall site quality and rarely rank for competitive queries.",
        opportunity: "Expand thin service/location pages to 900+ words. Thin blog posts should either be expanded to 1,200+ words or consolidated with similar content.",
        why_it_matters: "Google's helpful content system evaluates site quality holistically — thin content pages suppress ranking potential sitewide.",
        recommended_next_step: "Re-upload Internal All export. Filter by Word Count < 300. Categorize as expand, consolidate, or noindex.",
      });
    }

    // ── BRANCH B: Internal All (row-level) format ──────────────────────
    if (sfAvailable && sfData.length > 0 && sfIsInternalAll) {
      const { url: urlCol, status: statusCol, indexability: indexCol, indexabilityStatus: indexStatusCol,
        title: titleCol, titleLen: titleLenCol, h1: h1Col, h1Count: h1CountCol,
        canonical: canonicalCol, canonicalSelf: canonicalSelfCol,
        inlinks: inlinksCol, depth: depthCol, wordCount: wordCol,
        metaDesc: metaCol, metaDescLen: metaLenCol, contentType: ctypeCol } = sfCol;

      const isHtml = (r: Record<string, any>) =>
        !ctypeCol || String(r[ctypeCol] ?? "").toLowerCase().includes("html");

      const htmlRows = ctypeCol ? sfData.filter(isHtml) : sfData;
      const total = sfData.length;
      const htmlTotal = htmlRows.length;

      const errors4xx = statusCol ? sfData.filter(r => {
        const s = Number(r[statusCol]);
        return s >= 400 && s < 500;
      }) : [];
      const errors5xx = statusCol ? sfData.filter(r => Number(r[statusCol]) >= 500) : [];
      const redirects3xx = statusCol ? sfData.filter(r => {
        const s = Number(r[statusCol]);
        return s >= 300 && s < 400;
      }) : [];

      const notIndexable = indexCol
        ? htmlRows.filter(r => r[indexCol] && String(r[indexCol]).toLowerCase() !== "indexable")
        : [];
      const noindexPages = indexStatusCol
        ? notIndexable.filter(r => String(r[indexStatusCol] ?? "").toLowerCase().includes("noindex"))
        : [];
      const canonicalizedPages = indexStatusCol
        ? notIndexable.filter(r => String(r[indexStatusCol] ?? "").toLowerCase().includes("canonical"))
        : [];

      const missingTitle = titleCol
        ? htmlRows.filter(r => !r[titleCol] || String(r[titleCol]).trim() === "")
        : [];
      const duplicateTitles = (() => {
        if (!titleCol) return [];
        const counts = new Map<string, number>();
        for (const r of htmlRows) {
          const t = String(r[titleCol] ?? "").trim();
          if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
        return htmlRows.filter(r => {
          const t = String(r[titleCol] ?? "").trim();
          return t && (counts.get(t) ?? 0) > 1;
        });
      })();
      const shortTitle = titleLenCol
        ? htmlRows.filter(r => {
            const len = Number(r[titleLenCol] ?? 0);
            return len > 0 && len < 30;
          })
        : [];
      const longTitle = titleLenCol
        ? htmlRows.filter(r => Number(r[titleLenCol] ?? 0) > 65)
        : [];

      const missingH1 = h1Col
        ? htmlRows.filter(r => !r[h1Col] || String(r[h1Col]).trim() === "")
        : [];
      const multipleH1 = h1CountCol
        ? htmlRows.filter(r => Number(r[h1CountCol] ?? 0) > 1)
        : [];

      const missingMeta = metaCol
        ? htmlRows.filter(r => !r[metaCol] || String(r[metaCol]).trim() === "")
        : [];
      const shortMeta = metaLenCol
        ? htmlRows.filter(r => {
            const len = Number(r[metaLenCol] ?? 0);
            return len > 0 && len < 70;
          })
        : [];

      const lowInlinks = inlinksCol
        ? htmlRows.filter(r => Number(r[inlinksCol] ?? 0) <= 1 && r[urlCol])
        : [];
      const zeroInlinks = inlinksCol
        ? htmlRows.filter(r => Number(r[inlinksCol] ?? 0) === 0 && r[urlCol])
        : [];

      const deepPages = depthCol
        ? htmlRows.filter(r => Number(r[depthCol] ?? 0) >= 4)
        : [];
      const veryDeepPages = depthCol
        ? htmlRows.filter(r => Number(r[depthCol] ?? 0) >= 5)
        : [];

      const thinContent = wordCol
        ? htmlRows.filter(r => {
            const wc = Number(r[wordCol] ?? 0);
            return wc > 0 && wc < 300;
          })
        : [];

      const sample = (arr: any[], n = 5) =>
        arr.slice(0, n).map(r => String(r[urlCol] ?? "")).filter(Boolean);

      if (errors4xx.length > 0) {
        techOpps.push({
          opportunity_title: `Fix ${errors4xx.length} 4xx Error Pages`,
          priority: "P0",
          impact: errors4xx.length > 10 ? "High" : "Med",
          effort: errors4xx.length > 50 ? "M" : "S",
          kpi_affected: "Indexation, Rankings, Link Equity",
          urls: sample(errors4xx),
          evidence: `Screaming Frog: ${errors4xx.length} URLs returning 4xx status codes out of ${total} total crawled (${((errors4xx.length / total) * 100).toFixed(1)}% of site). Sample: ${sample(errors4xx, 3).map(shortUrl).join(", ")}`,
          problem: `${errors4xx.length} pages are returning client errors. Googlebot is hitting dead ends, wasting crawl budget and losing any link equity that was pointing to these URLs. Internal links to 4xx pages also create a poor user experience.`,
          opportunity: "Redirect all 4xx URLs to the most relevant live page using 301 redirects. Update all internal links pointing to dead URLs. Submit an updated sitemap after remediation.",
          why_it_matters: "4xx pages drain crawl budget, lose accumulated link equity, and create dead ends for both users and Googlebot. Fixing these is one of the highest ROI technical SEO actions.",
          recommended_next_step: `Export all ${errors4xx.length} 4xx URLs from Screaming Frog. Categorize by type (deleted content, renamed pages, old blog posts). Implement 301 redirects for any URL with backlinks or internal links.`,
        });
      }

      if (errors5xx.length > 0) {
        techOpps.push({
          opportunity_title: `Fix ${errors5xx.length} 5xx Server Errors`,
          priority: "P0",
          impact: "High",
          effort: "M",
          kpi_affected: "Indexation, Rankings",
          urls: sample(errors5xx),
          evidence: `Screaming Frog: ${errors5xx.length} URLs returning server errors (5xx)`,
          problem: "Server errors prevent Googlebot from accessing and indexing pages. If these affect key service pages, rankings will degrade.",
          opportunity: "Diagnose the root cause of 5xx errors — could be server configuration, plugin conflicts (WordPress), or database issues. Resolve at the server level immediately.",
          why_it_matters: "Server errors on key pages can cause ranking drops within days and undermine the entire crawl.",
          recommended_next_step: "Escalate to the development team immediately. Check server logs for the specific error type and root cause.",
        });
      }

      if (noindexPages.length > 0 || notIndexable.length > 0) {
        const nonIndexCount = notIndexable.length;
        const noindexCount = noindexPages.length;
        const canonCount = canonicalizedPages.length;
        techOpps.push({
          opportunity_title: `Audit ${nonIndexCount} Non-Indexable Pages (${noindexCount} noindex, ${canonCount} canonicalized)`,
          priority: nonIndexCount > 5 ? "P0" : "P1",
          impact: nonIndexCount > htmlTotal * 0.1 ? "High" : "Med",
          effort: "M",
          kpi_affected: "Indexation, Rankings",
          urls: sample(notIndexable),
          evidence: `Screaming Frog: ${nonIndexCount} non-indexable pages out of ${htmlTotal} HTML URLs (${((nonIndexCount / htmlTotal) * 100).toFixed(1)}%). Breakdown: ${noindexCount} noindex, ${canonCount} canonicalized to alternate URL, ${nonIndexCount - noindexCount - canonCount} other.`,
          problem: `${nonIndexCount} pages are explicitly excluded from Google's index. While some may be intentional (thank-you pages, admin pages), non-indexability on service or content pages is a critical ranking issue. Each non-indexable service page is an invisible page that cannot rank.`,
          opportunity: "Audit every non-indexable page. Identify any service pages, location pages, or blog posts accidentally marked noindex or canonicalized to the wrong URL. Remove incorrect noindex tags and fix canonical mismatches.",
          why_it_matters: "A single service page accidentally excluded from the index represents zero organic traffic potential, no matter how good the content or backlinks.",
          recommended_next_step: `Filter non-indexable URLs to service/location/content pages only. Cross-reference with GSC Coverage report. Remove any accidental noindex tags. Update canonical tags on any pages pointing to wrong URLs.`,
        });
      }

      if (redirects3xx.length > 0) {
        techOpps.push({
          opportunity_title: `Resolve ${redirects3xx.length} Redirect Chains / Internal Redirect Links`,
          priority: "P1",
          impact: redirects3xx.length > 20 ? "High" : "Med",
          effort: "S",
          kpi_affected: "Indexation, Link Equity, Page Speed",
          urls: sample(redirects3xx),
          evidence: `Screaming Frog: ${redirects3xx.length} redirect (3xx) URLs crawled. Internal links pointing to redirect URLs waste crawl budget and pass diluted link equity.`,
          problem: "Internal links pointing to redirect URLs (not final destinations) pass diluted PageRank and create unnecessary redirect hops. Each redirect adds latency and reduces crawling efficiency.",
          opportunity: "Update all internal links to point directly to the final destination URL rather than through redirects. This improves crawl efficiency and ensures full link equity is passed.",
          why_it_matters: "Redirect chains accumulate over time from site migrations and content updates. Cleaning them up preserves link equity and improves crawl efficiency.",
          recommended_next_step: "In Screaming Frog, filter 'Inlinks' to redirect URLs. Update each source link to point to the final 200 URL. Prioritize links from high-authority pages.",
        });
      }

      if (missingTitle.length > 0) {
        techOpps.push({
          opportunity_title: `Write Title Tags for ${missingTitle.length} Pages Missing Them`,
          priority: missingTitle.length > 5 ? "P0" : "P1",
          impact: missingTitle.length > 10 ? "High" : "Med",
          effort: "S",
          kpi_affected: "CTR, Rankings",
          urls: sample(missingTitle),
          evidence: `Screaming Frog: ${missingTitle.length} HTML pages missing title tags (${((missingTitle.length / htmlTotal) * 100).toFixed(1)}% of HTML pages). Google will generate its own title, often suboptimal.`,
          problem: `${missingTitle.length} pages have no title tag. Google auto-generates titles for pages without them, typically pulling from H1 text or navigation links — rarely the keyword-optimized result you'd choose.`,
          opportunity: "Write unique, keyword-targeted title tags for all missing pages following the pattern: Primary Keyword – Secondary Keyword | Brand Name. Prioritize service and location pages first.",
          why_it_matters: "Title tags are among the strongest on-page ranking signals and are the first thing users see in search results. Missing titles represent a direct CTR and ranking penalty.",
          recommended_next_step: "Export missing title pages from Screaming Frog, sorted by inlinks (highest first). Write titles for top 20 immediately. Use format: [Service/Topic] in [Location] | [Brand].",
        });
      }

      if (duplicateTitles.length > 0) {
        const uniqueDupTitles = new Set(duplicateTitles.map(r => String(r[titleCol] ?? "")).filter(Boolean)).size;
        techOpps.push({
          opportunity_title: `Fix ${duplicateTitles.length} Duplicate Title Tags (${uniqueDupTitles} shared titles)`,
          priority: duplicateTitles.length > 10 ? "P1" : "P2",
          impact: duplicateTitles.length > 20 ? "High" : "Med",
          effort: "M",
          kpi_affected: "Rankings, CTR",
          urls: sample(duplicateTitles),
          evidence: `Screaming Frog: ${duplicateTitles.length} pages share titles across ${uniqueDupTitles} non-unique title strings.`,
          problem: "Duplicate title tags force Google to choose which page to rank for a given query — often resulting in neither page ranking well. This also causes keyword cannibalization.",
          opportunity: "Audit all duplicate title groups. Determine if pages are genuinely different content (write unique titles) or are duplicates that should be consolidated via canonical or redirect.",
          why_it_matters: "Duplicate titles signal content cannibalization to Google, splitting ranking authority and confusing the crawler about which page to serve for target queries.",
          recommended_next_step: "Export duplicate title report from Screaming Frog. Group by shared title. For service/location pages with duplicate titles, write unique titles incorporating page-specific location or service modifier.",
        });
      }

      if (missingH1.length > 0) {
        techOpps.push({
          opportunity_title: `Add H1 Tags to ${missingH1.length} Pages`,
          priority: missingH1.length > 10 ? "P1" : "P2",
          impact: missingH1.length > 15 ? "Med" : "Low",
          effort: "S",
          kpi_affected: "Rankings",
          urls: sample(missingH1),
          evidence: `Screaming Frog: ${missingH1.length} HTML pages have no H1 tag (${((missingH1.length / htmlTotal) * 100).toFixed(1)}% of HTML pages).`,
          problem: "H1 is a primary on-page relevance signal. Pages missing H1 tags send weaker keyword relevance signals to Google and have suboptimal content structure for both users and crawlers.",
          opportunity: "Add a single, descriptive H1 tag to each affected page that includes the primary target keyword for that page. Ensure H1 is distinct from the title tag but covers the same keyword intent.",
          why_it_matters: "H1 tags help Google understand the primary topic of a page. Missing H1s are a common technical SEO issue that's easy to fix with outsized impact on page-level relevance signals.",
          recommended_next_step: "Filter missing H1 pages to service and location pages first. Add H1 tags that incorporate primary keyword + geographic modifier where relevant.",
        });
      }

      if (multipleH1.length > 0) {
        techOpps.push({
          opportunity_title: `Fix ${multipleH1.length} Pages with Multiple H1 Tags`,
          priority: "P2",
          impact: multipleH1.length > 10 ? "Med" : "Low",
          effort: "S",
          kpi_affected: "Rankings",
          urls: sample(multipleH1),
          evidence: `Screaming Frog: ${multipleH1.length} pages have more than one H1 tag, diluting the primary keyword signal.`,
          problem: "Multiple H1 tags dilute the page's primary relevance signal and indicate disorganized page structure. Often caused by theme/template issues or CMS configuration.",
          opportunity: "Audit pages with multiple H1s — typically a theme issue where the site logo, navigation element, or sidebar is wrapped in an H1 tag. Fix at the template level to affect all pages simultaneously.",
          why_it_matters: "While not as severe as missing H1s, multiple H1s weaken the clarity of the page's primary topic signal for Google.",
          recommended_next_step: "Inspect the first 5 affected pages. If the duplicate H1 is in the header/nav, fix the template to change it to a div or span. One fix often resolves all instances.",
        });
      }

      if (zeroInlinks.length > 0 || lowInlinks.length > 0) {
        const orphanCount = zeroInlinks.length;
        const lowLinkCount = lowInlinks.length;
        techOpps.push({
          opportunity_title: `Internal Linking: ${orphanCount} Orphan Pages, ${lowLinkCount} Pages with ≤1 Inlink`,
          priority: "P1",
          impact: lowLinkCount > 30 ? "High" : "Med",
          effort: "M",
          kpi_affected: "Rankings, Indexation",
          urls: sample(zeroInlinks.length > 0 ? zeroInlinks : lowInlinks),
          evidence: `Screaming Frog: ${orphanCount} pages have ZERO internal inlinks (orphaned). ${lowLinkCount} pages have 0–1 internal inlinks total, making them extremely hard for Googlebot to discover and lowly valued by the crawl.`,
          problem: `${orphanCount} pages are completely orphaned — no internal links point to them. These pages rely entirely on their XML sitemap entry for discovery and receive no link equity from the rest of the site. An additional ${lowLinkCount - orphanCount} pages have only 1 internal link.`,
          opportunity: "Build a targeted internal linking plan. Identify which orphaned/low-linked pages are service, location, or blog pages. Add contextual internal links from the homepage, service hub pages, and relevant blog posts. Consider adding a related posts section to blog content.",
          why_it_matters: "Internal links are how PageRank flows through your site. Orphaned pages receive a PageRank score of nearly zero regardless of their content quality. A single internal link from a high-authority page can dramatically increase a page's crawl frequency and ranking potential.",
          recommended_next_step: `Export orphan pages from Screaming Frog. Filter to service/location pages. For each, identify 3 relevant pages on the site that could naturally link to it. Add contextual links using keyword-rich anchor text. Target: every service and location page should have at least 5 internal inlinks.`,
        });
      }

      if (deepPages.length > 0) {
        techOpps.push({
          opportunity_title: `${deepPages.length} Pages at Crawl Depth ≥4 (${veryDeepPages.length} at Depth ≥5)`,
          priority: deepPages.length > 50 ? "P1" : "P2",
          impact: deepPages.length > 100 ? "High" : "Med",
          effort: "M",
          kpi_affected: "Indexation, Rankings, Crawl Budget",
          urls: sample(deepPages),
          evidence: `Screaming Frog: ${deepPages.length} pages are buried at crawl depth 4+. ${veryDeepPages.length} pages are at depth 5+. Google crawls shallower pages more frequently.`,
          problem: "Pages more than 3 clicks from the homepage are effectively invisible to Googlebot unless they have significant external backlinks. Deep pages receive minimal crawl budget allocation, resulting in infrequent indexing and poor PageRank accumulation.",
          opportunity: "Flatten the site architecture by adding navigation links, breadcrumbs, or a filtered category landing page for deep sections. Add deep pages to the XML sitemap and internally link to them from category/hub pages.",
          why_it_matters: "Crawl depth directly affects how often Googlebot visits pages. A page at depth 5 may be crawled once a month vs. a depth-2 page crawled daily.",
          recommended_next_step: "Filter deep pages to service and location content. For pages at depth ≥4 that are important to the business, add direct links from the homepage sidebar, footer, or main navigation. Review sitemap to ensure all important pages are included.",
        });
      }

      if (thinContent.length > 0) {
        techOpps.push({
          opportunity_title: `${thinContent.length} Pages with Thin Content (<300 Words)`,
          priority: thinContent.length > 20 ? "P1" : "P2",
          impact: thinContent.length > 30 ? "High" : "Med",
          effort: "L",
          kpi_affected: "Rankings, CTR",
          urls: sample(thinContent),
          evidence: `Screaming Frog: ${thinContent.length} HTML pages have fewer than 300 words of content. These pages provide minimal informational value and are unlikely to rank for competitive queries.`,
          problem: "Thin content pages signal low quality to Google and rarely rank above position 15 for competitive queries. They can also dilute the overall site quality score for queries beyond their individual page.",
          opportunity: "Audit thin content pages — determine if they should be expanded (service/location pages worth targeting), consolidated (merge similar thin pages), or removed/noindexed (genuinely low-value pages).",
          why_it_matters: "Google's helpful content system evaluates site quality holistically. A large proportion of thin content pages can suppress the ranking potential of the entire domain.",
          recommended_next_step: "Filter thin content to service and location pages (ignore thank-you pages, contact pages). For each important thin page, expand content to 600+ words covering the primary service, local relevance, FAQs, and testimonials.",
        });
      }

      if (missingMeta.length > 0) {
        techOpps.push({
          opportunity_title: `Write Meta Descriptions for ${missingMeta.length} Pages`,
          priority: "P2",
          impact: missingMeta.length > 20 ? "Med" : "Low",
          effort: "S",
          kpi_affected: "CTR",
          urls: sample(missingMeta),
          evidence: `Screaming Frog: ${missingMeta.length} pages are missing meta descriptions. Google will auto-generate snippets, often pulling irrelevant text.`,
          problem: "Missing meta descriptions result in Google auto-generating search snippets from random on-page text — often uninspiring, off-topic, or truncated in a way that reduces click appeal.",
          opportunity: "Write unique, compelling meta descriptions of 140–160 characters for all service, location, and blog pages. Include the primary keyword, a key benefit, and an implicit call to action.",
          why_it_matters: "While meta descriptions don't directly affect rankings, they heavily influence CTR. A well-written description can improve CTR by 2–5% even without ranking changes.",
          recommended_next_step: "Prioritize missing meta descriptions for the top 20 landing pages by GSC impressions. Write descriptions that answer 'why click on this result?' in under 160 characters.",
        });
      }

    } else if (!sfAvailable) {
      techOpps.push({
        opportunity_title: "Upload Screaming Frog Data to Enable Technical Audit",
        priority: "P0",
        impact: "High",
        effort: "S",
        kpi_affected: "Indexation, Rankings",
        urls: [],
        evidence: "Not available — no Screaming Frog crawl data is uploaded for this client.",
        problem: "Without a crawl import, every technical issue on the site (broken pages, orphaned content, missing metadata, thin content, redirect chains) is invisible. Technical issues can silently suppress rankings across the entire domain.",
        opportunity: "Run a full Screaming Frog crawl of the domain and upload the CSV export. Enable all data columns including: Status Code, Indexability, Title, H1, Meta Description, Inlinks, Crawl Depth, Word Count, and Canonical.",
        why_it_matters: "Technical SEO issues are often the reason good content doesn't rank. A crawl audit identifies the structural barriers to ranking that cannot be seen from analytics data alone.",
        recommended_next_step: "Download Screaming Frog (free for up to 500 URLs). Set it to crawl the full domain. After crawl completes: File → Export → All Export → Bulk Export. Upload the Internal All export CSV in SmartEO Setup → Screaming Frog.",
      });
    }

    // ── Enforce minimum 8 technical opps ────────────────────────────────
    const TECH_MIN = 8;
    if (techOpps.length < TECH_MIN && sfAvailable) {
      // Supplemental technical best-practices (always applicable)
      const supplemental: Opportunity[] = [
        {
          opportunity_title: "Schema Markup Audit: Add MedicalCondition, FAQPage, and Organization",
          priority: "P2", impact: "Med", effort: "M", kpi_affected: "Rankings, CTR",
          urls: [],
          evidence: "Schema markup not verified — Screaming Frog structured data columns not available in current export.",
          problem: "Recovery center pages without schema markup miss out on rich results (FAQs, star ratings, service details) in SERP, reducing click appeal and AEO inclusion.",
          opportunity: "Implement FAQPage schema on all blog/resource pages. Add MedicalCondition schema to treatment service pages. Add Organization schema on homepage. Add BreadcrumbList sitewide.",
          why_it_matters: "Schema-enhanced SERP results earn 20–30% higher CTR. FAQPage schema directly enables FAQ rich results in Google Search and increases AEO snippet inclusion.",
          recommended_next_step: "Run site through Google's Rich Results Test. Identify pages where FAQPage or MedicalCondition schema applies. Implement via Yoast/RankMath or custom JSON-LD blocks.",
        },
        {
          opportunity_title: "Core Web Vitals Audit: LCP, CLS, INP for Key Service Pages",
          priority: "P1", impact: "High", effort: "M", kpi_affected: "Rankings, CVR",
          urls: [],
          evidence: "Core Web Vitals are a confirmed Google ranking signal. Recovery center pages with high LCP (>2.5s) and CLS (>0.1) are penalized relative to faster competitors.",
          problem: "Slow-loading service pages are penalized in Google Search and drive higher bounce rates. Mobile users in crisis leave immediately if a page loads slowly.",
          opportunity: "Run key service pages through PageSpeed Insights (mobile). Target: LCP < 2.5s, CLS < 0.1, INP < 200ms. Common fixes: optimize hero image format (WebP), defer non-critical JS, implement lazy loading.",
          why_it_matters: "Core Web Vitals affect both rankings and conversion rate — a slow page is doubly penalized. A 1-second improvement in LCP correlates with 7–12% higher conversion rates.",
          recommended_next_step: "Test top 5 service pages at web.dev/measure. Document LCP/CLS/INP scores. Prioritize fixes: image optimization (biggest LCP impact), remove render-blocking resources.",
        },
        {
          opportunity_title: "XML Sitemap Audit: Verify Coverage of All Money Pages",
          priority: "P1", impact: "Med", effort: "S", kpi_affected: "Indexation",
          urls: [],
          evidence: "Sitemap coverage not verified against crawled URLs in current export format.",
          problem: "XML sitemaps that exclude key service pages or contain non-200 URLs waste crawl budget and slow down indexation of new/updated content.",
          opportunity: "Download the XML sitemap and cross-reference with Screaming Frog crawl. Every service page, location page, and blog post should be in the sitemap with lastmod dates. Remove non-200 URLs from sitemap.",
          why_it_matters: "Sitemap submission is how Googlebot discovers and prioritizes pages. Excluding key pages slows down their crawl frequency and indexation.",
          recommended_next_step: "Download sitemap.xml. Paste URLs into Screaming Frog for a sitemap crawl. Identify: missing pages, non-200 URLs in sitemap, pages marked noindex but in sitemap.",
        },
        {
          opportunity_title: "Internal Linking Audit: Service Hub Architecture",
          priority: "P1", impact: "High", effort: "M", kpi_affected: "Rankings, Indexation",
          urls: [],
          evidence: "Internal linking structure not fully assessed without row-level Screaming Frog data.",
          problem: "Many recovery center websites lack a deliberate internal linking strategy — service pages don't link to each other, blog posts don't link to service pages, and the homepage doesn't distribute enough link equity to key service pages.",
          opportunity: "Build a hub-and-spoke internal linking model: (1) Each service page links to related service pages. (2) Every blog post that covers a treatment topic links to the corresponding service page. (3) Homepage has direct links to all primary service pages.",
          why_it_matters: "Internal links are how PageRank flows through a site. Without a deliberate strategy, link equity concentrates on the homepage and starves service pages of ranking authority.",
          recommended_next_step: "Upload Internal All Screaming Frog export. Identify pages with fewer than 3 internal inlinks. Create an internal linking plan: for each low-link page, identify 5 relevant source pages and add contextual links with keyword-rich anchor text.",
        },
        {
          opportunity_title: "Image Optimization: Alt Text, Format, and Compression Audit",
          priority: "P2", impact: "Med", effort: "M", kpi_affected: "Rankings, Page Speed",
          urls: [],
          evidence: "Image optimization status not assessed without row-level crawl data.",
          problem: "Images without descriptive alt text are invisible to Google Image Search and screen readers. Large uncompressed images (>300KB) significantly slow page load time and harm Core Web Vitals.",
          opportunity: "Audit all images on service pages: (1) Add descriptive alt text to every image (include primary keyword where natural). (2) Convert PNG/JPG to WebP format. (3) Compress all images to <150KB. (4) Implement lazy loading for below-fold images.",
          why_it_matters: "Alt text improves accessibility (required for ADA compliance) and provides ranking signals for both web and image search. Image optimization directly improves Core Web Vitals (LCP).",
          recommended_next_step: "Run top 5 service pages through Google PageSpeed Insights. Check 'Properly size images' and 'Image elements do not have alt attributes' recommendations. Fix via CMS media library.",
        },
      ];

      for (const s of supplemental) {
        if (techOpps.length >= TECH_MIN) break;
        techOpps.push(s);
      }
    }

    console.log(`[QBR Prep] Technical: ${techOpps.length} opportunities (min target: ${TECH_MIN})`);
    allCategories.push({
      category_name: "Technical SEO Opportunities",
      opportunities: scoreOpps(techOpps).slice(0, cap),
    });
  }

  if (input.includeLocal) {
    const localOpps: Opportunity[] = [];

    localOpps.push({
      opportunity_title: "Review Generation & Response Velocity",
      priority: "P1",
      impact: "High",
      effort: "M",
      kpi_affected: "GBP Actions, Rankings",
      urls: [],
      evidence: "GBP review velocity and response rate assessment — connect GBP in Setup or check dashboard manually for current velocity.",
      problem: "Review velocity and response rate are primary local ranking signals. Businesses that do not actively generate new reviews and respond to all reviews within 48 hours underperform in the local pack compared to competitors who do.",
      opportunity: "Implement a post-service review request workflow triggered automatically after service completion (via SMS or email CRM automation). Respond to all reviews — positive and negative — within 24 hours using templated but personalized responses.",
      why_it_matters: "Reviews signal trust to both Google and prospective patients/clients. Local pack positions 1–3 in recovery tend to have 3x the review volume of positions 4+. Review response rate is also confirmed by Google as a local ranking factor.",
      recommended_next_step: "Set up automated review request via CRM or a tool like Birdeye/Podium. Create 5 response templates (positive review, negative review, detailed positive, no-rating, treatment-related). Set a goal of 1 new review per week minimum.",
    });

    localOpps.push({
      opportunity_title: "GBP Services & Attributes Completeness",
      priority: "P1",
      impact: "Med",
      effort: "S",
      kpi_affected: "GBP Actions",
      urls: [],
      evidence: "Manual GBP audit required — check services, attributes, and profile completeness in Google Business dashboard.",
      problem: "Incomplete GBP profiles — missing service descriptions, attributes (e.g., insurance accepted, accessibility, languages spoken), and product/service listings — underperform in local pack and Local Finder results.",
      opportunity: "Complete all GBP profile sections: (1) Services with full descriptions; (2) Business attributes (insurance accepted, LGBTQ-friendly, accessible, languages); (3) Products/services with prices where applicable; (4) Business description (750 char) with primary keywords; (5) Q&A seeded with 5 common questions.",
      why_it_matters: "Google uses GBP completeness as a local relevance signal. More complete profiles are shown for more search queries. Attribute matching (e.g., 'accepts insurance') directly influences appearance for specific intent queries.",
      recommended_next_step: "Log into GBP dashboard. Check each section against a completeness checklist. Add/update: services with keyword-rich descriptions (each service separately listed), all applicable attributes, and 5 seed Q&A pairs.",
    });

    localOpps.push({
      opportunity_title: "GBP Post Cadence: Regular Content Publishing",
      priority: "P2",
      impact: "Med",
      effort: "S",
      kpi_affected: "GBP Actions",
      urls: [],
      evidence: "Review post history in GBP dashboard to assess current posting frequency.",
      problem: "GBP posts that are infrequent or absent signal an inactive profile to Google, which can reduce local pack prominence. Profiles with consistent weekly posts show higher engagement rates.",
      opportunity: "Establish a weekly GBP posting cadence. Content ideas: treatment approach spotlights, team member features, upcoming events/groups, seasonal mental health content, patient success stories (HIPAA-compliant), insurance education, and community involvement.",
      why_it_matters: "Active GBP profiles are shown more prominently in local search and map results. Posts also appear in branded searches, providing an additional touchpoint for prospective clients.",
      recommended_next_step: "Create a 13-post quarterly content calendar. Schedule one post per week using a tool like GBP directly or scheduling software. Include a CTA in every post (Call Now, Learn More, Book Appointment).",
    });

    if (callTrackingAvailable || ctReportAvailable) {
      localOpps.push({
        opportunity_title: "GBP Call Attribution & Source Analysis",
        priority: "P1",
        impact: "High",
        effort: "S",
        kpi_affected: "Calls, GBP Actions",
        urls: [],
        evidence: `Call tracking ${callTrackingAvailable ? "API connected" : "CSV data available"} — analyze GBP vs. organic vs. paid call source breakdown for ${pastWindowLabel}.`,
        problem: "Without understanding what percentage of calls originate from GBP vs. organic website vs. paid ads, it is impossible to assess the true ROI of local SEO efforts or identify which optimization levers drive the most phone leads.",
        opportunity: "Analyze call source attribution data to quantify GBP's contribution to call volume. If GBP calls are a small percentage of total calls relative to local pack prominence, the GBP profile needs optimization. Set up a dedicated GBP call tracking number.",
        why_it_matters: "GBP is often the #1 source of phone calls for local service businesses, but it's frequently untracked. Understanding this attribution changes how SEO resources are allocated.",
        recommended_next_step: "In call tracking dashboard, filter by source/medium to isolate GBP-attributed calls. Calculate GBP call % of total. If below 30% for a location-based service, prioritize GBP profile optimizations.",
      });
    } else {
      localOpps.push({
        opportunity_title: "Set Up GBP Call Tracking Number",
        priority: "P1",
        impact: "High",
        effort: "M",
        kpi_affected: "Calls, Tracking Integrity",
        urls: [],
        evidence: "Not available — no call tracking integration connected, so GBP call volume is unmeasured.",
        problem: "GBP is typically the largest source of phone leads for addiction treatment centers, but without a tracking number, GBP-generated calls are invisible and cannot be attributed, optimized, or reported on.",
        opportunity: "Set up a dedicated CallRail or CTM tracking number for GBP. Configure GBP to use this number as the primary call number. This immediately enables GBP call tracking and attribution.",
        why_it_matters: "Without tracking, GBP optimization decisions are made blind. A tracking number costs ~$30/month and provides full visibility into GBP's call contribution.",
        recommended_next_step: "Create a new tracking number in CallRail. Set the source to 'Google Business Profile'. Update the GBP profile to use this number as primary. Connect CallRail to SmartEO in Setup.",
      });
    }

    allCategories.push({
      category_name: "Local / GBP Opportunities",
      opportunities: scoreOpps(localOpps).slice(0, cap),
    });
  }

  if (input.includeCro) {
    const croOpps: Opportunity[] = [];

    if (ga4Available && ga4LandingRows.length > 0 && siteCvr !== null) {
      const deviceMap = new Map<string, { mobile: { s: number; c: number; e: number }; desktop: { s: number; c: number; e: number } }>();
      for (const row of ga4DeviceRows) {
        const key = row.page;
        if (!deviceMap.has(key)) deviceMap.set(key, {
          mobile: { s: 0, c: 0, e: 0 },
          desktop: { s: 0, c: 0, e: 0 },
        });
        const entry = deviceMap.get(key)!;
        if (row.device === "mobile") {
          entry.mobile.s += row.sessions;
          entry.mobile.c += row.conversions;
          entry.mobile.e = row.engagementRate;
        }
        if (row.device === "desktop") {
          entry.desktop.s += row.sessions;
          entry.desktop.c += row.conversions;
          entry.desktop.e = row.engagementRate;
        }
      }

      const mobileCvrGaps: Array<{
        page: string; mobileCvr: number; desktopCvr: number;
        mobileSessions: number; mobilePct: number;
      }> = [];
      for (const [page, data] of Array.from(deviceMap.entries())) {
        const mobileCvr = pct(data.mobile.c, data.mobile.s);
        const desktopCvr = pct(data.desktop.c, data.desktop.s);
        const totalSessions = data.mobile.s + data.desktop.s;
        if (data.mobile.s > 15 && desktopCvr > 0.005 && mobileCvr < desktopCvr * 0.65) {
          mobileCvrGaps.push({
            page,
            mobileCvr,
            desktopCvr,
            mobileSessions: data.mobile.s,
            mobilePct: totalSessions > 0 ? data.mobile.s / totalSessions : 0,
          });
        }
      }
      mobileCvrGaps.sort((a, b) => b.mobileSessions - a.mobileSessions);

      for (const gap of mobileCvrGaps.slice(0, 3)) {
        const isTop = ga4LandingRows.slice(0, 5).some((l: any) => l.page === gap.page);
        const cvrGapPct = ((1 - gap.mobileCvr / gap.desktopCvr) * 100).toFixed(0);
        const lostConvPerQ = Math.round(gap.mobileSessions * (gap.desktopCvr - gap.mobileCvr));

        croOpps.push({
          opportunity_title: `Mobile CVR Gap on ${shortUrl(gap.page)}: ${cvrGapPct}% Below Desktop`,
          priority: isTop ? "P0" : "P1",
          impact: isTop ? "High" : gap.mobileSessions > 100 ? "High" : "Med",
          effort: "M",
          kpi_affected: "Calls, Forms",
          urls: [gap.page],
          evidence: `GA4 (${pastWindowLabel}): Mobile CVR ${fmtPct(gap.mobileCvr)} vs Desktop CVR ${fmtPct(gap.desktopCvr)} (−${cvrGapPct}%). ${fmtNum(gap.mobileSessions)} mobile sessions (${fmtPct(gap.mobilePct)} of traffic). Estimated ${fmtNum(lostConvPerQ)} conversions lost per quarter vs desktop parity.`,
          problem: `Mobile visitors convert at ${fmtPct(gap.mobileCvr)} — ${cvrGapPct}% lower than desktop users on the same page. With ${fmtPct(gap.mobilePct)} of traffic on mobile, this gap represents a significant and compounding lead loss.`,
          opportunity: "Add a sticky click-to-call bar at the bottom of the viewport on mobile. Reduce form field count to 3 maximum on mobile. Ensure the primary CTA is above the fold on a 375px screen. Remove any mobile interstitials or pop-ups that interrupt the conversion path.",
          why_it_matters: `If mobile CVR matched desktop on this page alone, the site would generate approximately ${fmtNum(lostConvPerQ)} additional conversions per quarter from existing traffic.`,
          recommended_next_step: "Test this page on 3 different physical mobile devices. Check: (1) Is the CTA visible without scrolling? (2) Does the form load correctly? (3) Is click-to-call present? Implement sticky mobile CTA bar within 1 sprint.",
        });
      }

      const highEngageLowConvert = ga4LandingRows
        .filter((r: any) => r.engagementRate > 0.65 && r.sessions > 30 && pct(r.conversions, r.sessions) < siteCvr * 0.45)
        .sort((a: any, b: any) => b.sessions - a.sessions)
        .slice(0, 3);

      for (const row of highEngageLowConvert) {
        const pageCvr = pct(row.conversions, row.sessions);
        const prev = ga4PrevMap.get(row.page);
        const sessionNote = prev ? ` (sessions ${fmtPctChange(row.sessions, prev.sessions)} QoQ)` : "";

        croOpps.push({
          opportunity_title: `High Engagement, Low Conversion: ${shortUrl(row.page)}`,
          priority: row.sessions > 100 ? "P1" : "P2",
          impact: row.sessions > 150 ? "High" : "Med",
          effort: "S",
          kpi_affected: "Calls, Forms",
          urls: [row.page],
          evidence: `GA4 (${pastWindowLabel}): ${fmtPct(row.engagementRate)} engagement rate, avg session ${Math.round(row.avgDuration ?? 0)}s, ${fmtNum(row.sessions)} sessions${sessionNote}, CVR ${fmtPct(pageCvr)} vs site avg ${fmtPct(siteCvr)}.`,
          problem: `Visitors spend significant time engaging with this page (${fmtPct(row.engagementRate)} engagement rate, avg ${Math.round(row.avgDuration ?? 0)} seconds) but convert at only ${fmtPct(pageCvr)} — ${((1 - pageCvr / siteCvr) * 100).toFixed(0)}% below site average. The content is compelling but the conversion path is broken or invisible.`,
          opportunity: "Add a mid-content CTA block after the second or third content section. Include a trust element (testimonial, stat, or certification) directly adjacent to the primary CTA. Test a secondary conversion option (live chat or click-to-call) for users not ready to fill a form.",
          why_it_matters: "High engagement with low conversion is the most recoverable conversion problem — the audience is interested, the CTA is failing. This is a UX fix, not an SEO fix, and results can be seen within days of implementation.",
          recommended_next_step: "Add an inline CTA block after the 2nd paragraph of body content. Copy: 'Ready to take the first step? Call us now' with a large tap-to-call button. Track CTA click events in GA4 to measure improvement.",
        });
      }

      if (ga4Funnel && ga4PrevFunnel) {
        const cvrChange = ((siteCvr! - prevSiteCvr!) / prevSiteCvr!) * 100;
        if (cvrChange < -15) {
          croOpps.push({
            opportunity_title: `Site-Wide CVR Decline: ${cvrChange.toFixed(0)}% Drop QoQ`,
            priority: "P0",
            impact: "High",
            effort: "M",
            kpi_affected: "Calls, Forms",
            urls: [],
            evidence: `GA4: Site-wide organic CVR dropped from ${fmtPct(prevSiteCvr!)} to ${fmtPct(siteCvr!)} (${cvrChange.toFixed(1)}% change). Sessions: ${fmtNum(ga4Funnel.sessions)} vs ${fmtNum(ga4PrevFunnel.sessions)} prior quarter. Conversions: ${fmtNum(ga4Funnel.conversions)} vs ${fmtNum(ga4PrevFunnel.conversions)} prior quarter.`,
            problem: `Organic conversion rate fell by ${Math.abs(cvrChange).toFixed(0)}% quarter-over-quarter across the site. This is not a traffic issue — it's a conversion issue. Something changed with the site, CTAs, forms, or competitive landscape that is suppressing lead generation from the same organic traffic volume.`,
            opportunity: "Audit for recent site changes: CTA text changes, form modifications, page redesigns, pop-up changes. Check if a specific set of landing pages is driving the site-wide decline. Review GA4 form interaction events for submission errors.",
            why_it_matters: "A site-wide CVR drop means you are generating fewer leads from the same marketing investment. If traffic recovers but CVR stays low, every future organic session also underperforms.",
            recommended_next_step: "Segment the CVR decline by top 10 landing pages. Identify which pages drove the most decline. Check form submission success events in GA4 — a broken form can cause an apparent site-wide CVR drop instantly.",
          });
        }
      }
    }

    // ── Always-on: high-intent URL pattern CRO opportunities ────────────
    const HIGH_INTENT_PATTERNS = [
      { pattern: /\/verify[-_]?insurance/i, label: "Verify Insurance", priority: "P0" as const, note: "Insurance verification is the #1 conversion trigger for treatment centers — visitors reaching this page have high admission intent." },
      { pattern: /\/insurance/i, label: "Insurance Coverage", priority: "P0" as const, note: "Insurance acceptance pages drive high-intent traffic and should convert at the highest rate on the site." },
      { pattern: /\/admissions/i, label: "Admissions", priority: "P0" as const, note: "Admissions pages are the direct conversion funnel entry — friction here directly reduces intake volume." },
      { pattern: /\/contact/i, label: "Contact", priority: "P1" as const, note: "Contact pages are the last step before a lead is captured. Any friction here is costly." },
      { pattern: /\/get[-_]?help/i, label: "Get Help", priority: "P0" as const, note: "High-intent pages for users in acute need. Mobile optimization is critical." },
      { pattern: /\/detox/i, label: "Detox Program", priority: "P1" as const, note: "Detox pages rank for high commercial-intent queries and should drive clear intake CTAs." },
      { pattern: /\/residential/i, label: "Residential Treatment", priority: "P1" as const, note: "Residential pages target decision-stage visitors comparing treatment options." },
      { pattern: /\/programs/i, label: "Programs", priority: "P2" as const, note: "Program pages inform and qualify leads — conversion optimization here improves downstream intake rates." },
    ];

    const seenCroPatterns = new Set<string>();
    const sourceUrls = sfData.length > 0
      ? sfData.map(r => String(r[sfCol.url] ?? "")).filter(Boolean)
      : (client.moneyPages ?? []).map((p: string) => p.startsWith("http") ? p : `${siteBase}${p}`);

    for (const { pattern, label, priority, note } of HIGH_INTENT_PATTERNS) {
      if (seenCroPatterns.has(label)) continue;
      const matchingUrls = sourceUrls.filter(u => pattern.test(u)).slice(0, 3);
      if (matchingUrls.length === 0) continue;

      seenCroPatterns.add(label);
      const ga4Matches = matchingUrls.map(u => ga4ByNorm.get(normUrl(u))).filter(Boolean);
      const gscMatches = matchingUrls.map(u => gscByNorm.get(normUrl(u))).filter(Boolean);
      const ga4Note = ga4Matches.length > 0
        ? ` GA4: ${fmtNum(ga4Matches.reduce((s: number, r: any) => s + (r?.sessions ?? 0), 0))} organic sessions, ${fmtNum(ga4Matches.reduce((s: number, r: any) => s + (r?.conversions ?? 0), 0))} conversions.`
        : " GA4: no data yet for this page.";
      const gscNote = gscMatches.length > 0
        ? ` GSC: avg position ${((gscMatches.reduce((s: number, r: any) => s + (r?.position ?? 0), 0) / gscMatches.length)).toFixed(1)}, ${fmtNum(gscMatches.reduce((s: number, r: any) => s + (r?.impressions ?? 0), 0))} impressions.`
        : "";

      const alreadyCovered = croOpps.some(o => matchingUrls.some(u => o.urls.includes(u)));
      if (alreadyCovered) continue;

      croOpps.push({
        opportunity_title: `CRO Audit: ${label} Page${matchingUrls.length > 1 ? "s" : ""} (${matchingUrls.map(shortUrl).join(", ")})`,
        priority, impact: priority === "P0" ? "High" : "Med",
        effort: "M", kpi_affected: "Forms, Calls, Admissions",
        urls: matchingUrls,
        evidence: `Identified as high-intent ${label} page via URL pattern.${ga4Note}${gscNote}`,
        problem: `High-intent ${label} pages must convert at the highest rate on the site. Common issues: form too long (>5 fields), no mobile sticky CTA, weak trust signals above the fold, no phone number in hero, slow load time, or CTA buried below the fold.`,
        opportunity: `Audit the ${label} page for: (1) above-fold CTA with click-to-call on mobile, (2) insurance/payment objection handling, (3) social proof (reviews, certs, accreditations), (4) form field count ≤3 on mobile, (5) sticky mobile call bar, (6) clear next-step messaging ('We'll call you within 10 minutes').`,
        why_it_matters: note,
        recommended_next_step: `Run the page through Google PageSpeed Insights (mobile). Audit CTA visibility on 375px screen. Add 'We Accept [Insurer]' trust badges if insurance page. Implement sticky call bar via CSS position:fixed on mobile. Track CTA clicks as a GA4 event.`,
      });
    }

    // ── PASS 2: If still < 5 CRO opps, add generic fallbacks ───────────
    const CRO_MIN = 5;
    if (croOpps.length < CRO_MIN) {
      if (!ga4Available) {
        croOpps.push({
          opportunity_title: "Connect GA4 to Unlock Data-Driven CRO Analysis",
          priority: "P0", impact: "High", effort: "S",
          kpi_affected: "Forms, Calls, Tracking Integrity", urls: [],
          evidence: "GA4 not connected — CVR, device split, and engagement data unavailable.",
          problem: "Without GA4, landing page CVR, device split, and engagement analysis are impossible. CRO improvements cannot be measured or validated.",
          opportunity: "Connect GA4 in Setup → Analytics & Search. Configure conversion events (form submissions, click-to-call, chat). This unlocks automated per-page CRO identification.",
          why_it_matters: "CRO improvements on high-traffic pages are the fastest way to increase lead volume without additional traffic investment.",
          recommended_next_step: "Connect GA4 credentials in Setup. Configure lead events in Client settings. Regenerate this QBR Prep.",
        });
      }

      const fallbackCros: Opportunity[] = [
        {
          opportunity_title: "Mobile Sticky Call Bar: Implement Sitewide",
          priority: "P1", impact: "High", effort: "S", kpi_affected: "Calls",
          urls: [], evidence: "Industry benchmark: recovery centers with sticky mobile call bars see 15–30% higher call conversion rates on mobile traffic.",
          problem: "60–70% of recovery center organic traffic is mobile. If click-to-call requires scrolling to find, a significant portion of mobile visitors leave without calling.",
          opportunity: "Implement a fixed-position bottom bar on mobile with: click-to-call number, 'Free & Confidential' label, and insurance verification CTA. Show on all pages, hide on desktop.",
          why_it_matters: "A sticky call bar is the single highest-ROI mobile CRO improvement for treatment centers. Implementation takes <2 hours and impact is immediate.",
          recommended_next_step: "Add CSS: .mobile-call-bar { position:fixed; bottom:0; width:100%; z-index:9999 }. A/B test with GA4 event tracking. Target: 20%+ increase in mobile call clicks.",
        },
        {
          opportunity_title: "Form Friction Audit: Reduce Fields on All Lead Forms",
          priority: "P1", impact: "High", effort: "S", kpi_affected: "Forms",
          urls: [], evidence: "Data: Forms with >5 fields convert 50–60% worse than 3-field forms. Recovery forms often ask for name, email, phone, DOB, insurance, zip code, and message — 7+ fields.",
          problem: "Overly long forms — especially on mobile — create significant friction at the most critical conversion point. Every additional field reduces form completion rate.",
          opportunity: "Reduce all primary lead capture forms to 3 fields maximum: Name, Phone, and one optional field (email or insurance). Move additional qualification questions to a post-submission sequence.",
          why_it_matters: "Reducing form friction is the fastest conversion improvement with zero SEO risk. A 3-field form vs 7-field form can double form submission rates.",
          recommended_next_step: "Audit all forms on the site. Identify fields that can be collected post-submission. Implement 3-field version and track with GA4 form_submit event. A/B test over 2 weeks.",
        },
        {
          opportunity_title: "Above-Fold Trust Signal Audit: Add Accreditations & Reviews",
          priority: "P2", impact: "Med", effort: "M", kpi_affected: "Forms, Calls",
          urls: [], evidence: "Trust signals (JCAHO, CARF, state licensing, Google stars, BBB) directly reduce anxiety for prospective patients evaluating unfamiliar treatment centers.",
          problem: "Treatment center websites that don't prominently display accreditations, licensing, and social proof convert at lower rates because prospective clients evaluate safety before calling.",
          opportunity: "Add above-fold trust badges on all service and admissions pages: accreditation logos (JCAHO/CARF), Google/Yelp star rating with review count, 'Licensed in [State]' badge, HIPAA compliance badge.",
          why_it_matters: "Accreditation logos and review counts reduce perceived risk, especially for first-time help-seekers. This is especially important for pages targeting family members researching options.",
          recommended_next_step: "Create a trust badge component. Add to homepage hero, admissions page header, insurance page header. A/B test with GA4 scroll + CTA click events to measure impact.",
        },
      ];

      for (const fb of fallbackCros) {
        if (croOpps.length >= CRO_MIN) break;
        if (!croOpps.some(o => o.opportunity_title === fb.opportunity_title)) croOpps.push(fb);
      }
    }

    console.log(`[QBR Prep] CRO: ${croOpps.length} opportunities (min target: ${CRO_MIN})`);
    allCategories.push({
      category_name: "CRO / Conversion Opportunities",
      opportunities: scoreOpps(croOpps).slice(0, cap),
    });
  }

  if (input.includeAuthority) {
    allCategories.push({
      category_name: "Authority / Links Opportunities",
      opportunities: [{
        opportunity_title: "Authority Data Requires Ahrefs or SEMrush Connection",
        priority: "P2",
        impact: "Med",
        effort: "S",
        kpi_affected: "Rankings",
        urls: [],
        evidence: "Not available — no Ahrefs or SEMrush authority/backlink data connected via integration.",
        problem: "Without backlink data, it is impossible to identify pages that need link support, diagnose ranking suppression due to low authority, or find link-building opportunities.",
        opportunity: "Connect Ahrefs or SEMrush in Setup to unlock: (1) referring domain counts per page, (2) lost links to service pages, (3) competitor backlink gap analysis, and (4) linkable asset identification.",
        why_it_matters: "For competitive treatment-sector queries, domain and page authority is often the difference between position 1–3 and position 6–10. Identifying the authority gap is the first step to closing it.",
        recommended_next_step: "Connect SEMrush or Ahrefs credentials in Setup → SEO Tools. Regenerate this QBR Prep to populate the full authority opportunity section.",
      }],
    });
  }

  if (input.includeTracking) {
    const trackingOpps: Opportunity[] = [];

    if (ga4Available && ga4Funnel !== null) {
      if (ga4Funnel.conversions === 0) {
        trackingOpps.push({
          opportunity_title: "CRITICAL: Zero Conversions in GA4 — Tracking Broken",
          priority: "P0",
          impact: "High",
          effort: "M",
          kpi_affected: "Tracking Integrity, Forms, Calls",
          urls: [],
          evidence: `GA4: 0 conversion events recorded for entire period ${pastStart} → ${pastEnd}. This means either: (1) no one converted, or (2) conversion tracking is broken.`,
          problem: "Zero GA4 conversions across the entire analysis window almost always indicates a tracking problem, not zero actual conversions. This invalidates all CVR metrics and makes performance invisible.",
          opportunity: "Audit GA4 conversion event configuration. Use GA4 DebugView to test form submissions in real time. Check that thank-you page URLs fire the conversion event. Verify GA4 is installed on all pages including thank-you pages.",
          why_it_matters: "Broken conversion tracking means every business decision about which pages to optimize, which campaigns to scale, and which SEO changes worked is based on wrong data.",
          recommended_next_step: "Open GA4 → Admin → Events → Conversions. Verify at least one event is marked as conversion. Open DebugView and submit a test form. If no event fires, the tag is broken and needs immediate remediation.",
        });
      }

      if (gscAvailable && totalGscClicks > 0 && ga4Funnel.sessions > 0) {
        const ratio = ga4Funnel.sessions / totalGscClicks;
        if (ratio < 0.5 || ratio > 2.0) {
          const direction = ratio < 0.5 ? "far fewer" : "far more";
          const note = ratio < 0.5
            ? "GA4 is likely missing the analytics tag on some pages, or there are bot clicks inflating GSC click counts."
            : "GA4 may be counting non-organic sessions, or GSC is undercounting clicks.";
          trackingOpps.push({
            opportunity_title: `GSC vs GA4 Traffic Mismatch: ${fmtPct(ratio * 100)} Ratio (Should Be ~100%)`,
            priority: "P1",
            impact: "High",
            effort: "M",
            kpi_affected: "Tracking Integrity",
            urls: [],
            evidence: `GSC: ${fmtNum(totalGscClicks)} clicks for ${pastWindowLabel}. GA4 organic sessions: ${fmtNum(ga4Funnel.sessions)}. Ratio: ${ratio.toFixed(2)}x — GA4 shows ${direction} sessions than GSC shows clicks. ${note}`,
            problem: `A ${direction === "far fewer" ? "low" : "high"} ratio between GSC clicks and GA4 organic sessions indicates a tracking discrepancy. If GA4 is undercounting, conversion data understates true performance and pages without GA4 may be invisibly converting.`,
            opportunity: "Audit GA4 tag deployment across the full site. Check if tag is present on all page templates, especially high-traffic landing pages. Use a tag auditing tool to scan for missing tags.",
            why_it_matters: "Any GSC-to-GA4 ratio below 0.7 or above 1.5 indicates a significant data quality problem. All performance metrics derived from GA4 are unreliable until resolved.",
            recommended_next_step: "Export GSC top pages by clicks. Cross-reference with GA4 Source/Medium report filtered to organic. Identify specific pages getting GSC clicks but zero GA4 sessions — these pages are missing the analytics tag.",
          });
        }
      }
    }

    if (!callTrackingAvailable && !ctReportAvailable) {
      trackingOpps.push({
        opportunity_title: "Phone Calls Not Tracked — Organic ROI Is Understated",
        priority: "P0",
        impact: "High",
        effort: "M",
        kpi_affected: "Calls, Tracking Integrity",
        urls: [],
        evidence: "Not available — no call tracking integration (CallRail or CTM) connected and no call tracking report imported.",
        problem: "For addiction treatment centers, phone calls are typically the primary intake pathway — often 60–80% of all leads. Without call tracking, organic SEO's contribution to lead generation is systematically undercounted and undervalued.",
        opportunity: "Implement CallRail or CTM with dynamic number insertion (DNI) to attribute calls to their source (organic, GBP, paid, direct). Configure separate tracking numbers for: (1) website organic visitors, (2) GBP profile, (3) paid campaigns.",
        why_it_matters: "If organic SEO drives 40 calls and 10 form submissions per month, but only the 10 form submissions are tracked, the reported organic ROI is 5x smaller than reality. This undermines the business case for SEO investment.",
        recommended_next_step: "Sign up for CallRail (basic plan ~$45/month). Get a DNI snippet installed on the website. Create tracking pools for: website, GBP, and paid. Connect to SmartEO in Setup → Call Tracking.",
      });
    }

    if (gscAvailable && gscPageRows.length > 0 && totalGscClicks > 0) {
      const ctrTrend = totalGscClicks / Math.max(totalPrevGscClicks, 1);
      if (ctrTrend < 0.85) {
        trackingOpps.push({
          opportunity_title: `GSC Click Volume Down ${fmtPctChange(totalGscClicks, totalPrevGscClicks)} QoQ — Investigate Root Cause`,
          priority: "P1",
          impact: "High",
          effort: "S",
          kpi_affected: "Rankings, CTR, Tracking Integrity",
          urls: [],
          evidence: `GSC: ${fmtNum(totalGscClicks)} clicks in ${pastWindowLabel} vs ${fmtNum(totalPrevGscClicks)} prior quarter (${fmtPctChange(totalGscClicks, totalPrevGscClicks)} change). ${fmtNum(totalGscImpressions)} total impressions.`,
          problem: "A significant drop in GSC click volume quarter-over-quarter indicates either: (1) ranking losses on key pages, (2) CTR decline without ranking changes (SERP feature competition), (3) seasonal patterns, or (4) a GSC property issue.",
          opportunity: "Segment the click decline by page and by query to identify the specific source. Diagnose whether this is a ranking issue (pages fell in position) or a CTR issue (impressions stable but fewer clicks).",
          why_it_matters: "A click decline that goes undiagnosed compounds over quarters. Identifying the root cause — and whether it is reversible — is the first step to recovery.",
          recommended_next_step: "In GSC, compare top pages from prior quarter to current. Filter by 'impressions stable, clicks down' to isolate CTR issues. Filter by 'impressions down' to find ranking losses. For each category, generate targeted content or technical fix recommendations.",
        });
      }
    }

    // ── Always ensure minimum 3 tracking opportunities ───────────────────
    const TRACKING_MIN = 3;
    const trackingFallbacks: Opportunity[] = [
      {
        opportunity_title: "GA4 Conversion Event Audit: Verify All Lead Events Fire Correctly",
        priority: "P1", impact: "High", effort: "S", kpi_affected: "Tracking Integrity, Forms",
        urls: [],
        evidence: `Recommended audit for ${pastWindowLabel}. GA4 conversion events should include: form_submit, click_to_call, chat_start, and insurance_verification_start.`,
        problem: "GA4 conversion events frequently break due to CMS updates, form plugin changes, or GTM container errors. Broken events mean performance data is wrong — leading to misguided SEO decisions.",
        opportunity: "Audit all GA4 conversion events using GA4 DebugView. Submit each form on the site in test mode and verify the corresponding event fires. Check that all events are marked as conversions in GA4 Admin → Events.",
        why_it_matters: "Broken conversion tracking affects every optimization decision: content priority, CRO focus, reporting, and budget allocation. One unchecked change can break tracking sitewide for an entire quarter.",
        recommended_next_step: "Enable GA4 DebugView (add ?debug_mode=1 to URL). Navigate to each key page. Submit each form and click each call button. Confirm corresponding events appear in DebugView within 30 seconds.",
      },
      {
        opportunity_title: "Call Tracking Source Attribution Audit",
        priority: "P1", impact: "High", effort: "M", kpi_affected: "Calls, Tracking Integrity",
        urls: [],
        evidence: `${callTrackingAvailable ? "Call tracking connected — verify source attribution is correct for organic, paid, and GBP channels." : "No call tracking connected — phone leads are currently untracked and unattributed."}`,
        problem: `${callTrackingAvailable ? "Call tracking attribution can drift over time as tracking numbers change, DNI scripts fail, or new campaigns are added without corresponding tracking numbers." : "Without call tracking, the majority of organic leads (phone calls) are invisible. SEO ROI is systematically understated."}`,
        opportunity: `${callTrackingAvailable ? "Audit all tracking numbers: verify organic website, GBP, and any paid campaign numbers are active, correctly sourced in CallRail/CTM, and routing to the right destination." : "Implement CallRail or CTM with dynamic number insertion (DNI). Create separate tracking pools for: organic website, GBP profile, and paid campaigns."}`,
        why_it_matters: "For treatment centers, phone calls represent 60–80% of lead volume. Accurate call attribution is essential for understanding which channels and pages drive admissions.",
        recommended_next_step: `${callTrackingAvailable ? "Audit call tracking dashboard: check all number pools are active, verify source attribution matches expected channels, and confirm whisper messages are enabled for staff context." : "Sign up for CallRail. Install DNI snippet. Create 3 tracking pools. Connect to SmartEO in Setup → Call Tracking."}`,
      },
      {
        opportunity_title: "GSC Property Coverage Audit: Verify Sitemap & Index Status",
        priority: "P2", impact: "Med", effort: "S", kpi_affected: "Indexation, Tracking Integrity",
        urls: [],
        evidence: `${gscAvailable ? `GSC connected: ${fmtNum(gscPageRows.length)} pages tracked. Verify sitemap submission and Coverage report for errors.` : "GSC not connected — indexation status and sitemap errors are not visible."}`,
        problem: "GSC property configuration errors (wrong property type, unverified property, sitemap not submitted, or submitted sitemap returning 404) can cause significant gaps in data and indexation visibility.",
        opportunity: `${gscAvailable ? "In GSC → Sitemaps, verify the sitemap is submitted and returning 'Success'. Check Coverage → Errors for new issues not captured in the Screaming Frog crawl. Review Index Coverage trend for any sudden drops." : "Connect Google Search Console in Setup → Analytics & Search. Verify property ownership via DNS or HTML tag. Submit XML sitemap."}`,
        why_it_matters: "GSC is the primary diagnostic tool for indexation and visibility issues. Without a verified, correctly configured property, many technical problems go undetected until they cause ranking drops.",
        recommended_next_step: `${gscAvailable ? "GSC → Coverage → Errors. Export all errors. Cross-reference with SF crawl. Pay special attention to 'Submitted URL not found (404)' and 'Server error (5xx)' entries." : "Connect GSC and submit sitemap. Set up weekly Coverage report review as a standard QBR input."}`,
      },
    ];

    for (const fb of trackingFallbacks) {
      if (trackingOpps.length >= TRACKING_MIN) break;
      if (!trackingOpps.some(o => o.opportunity_title === fb.opportunity_title)) trackingOpps.push(fb);
    }

    console.log(`[QBR Prep] Tracking: ${trackingOpps.length} opportunities (min target: ${TRACKING_MIN})`);
    allCategories.push({
      category_name: "Tracking / Measurement Opportunities",
      opportunities: scoreOpps(trackingOpps).slice(0, cap),
    });
  }

  // Build wins from actual data comparison
  if (gscAvailable && gscPageRows.length > 0 && gscPrevPageRows.length > 0) {
    const topClickGain = gscPageRows
      .filter((r: any) => {
        const prev = gscPrevPageMap.get(r.keys?.[0]);
        return prev && (r.clicks ?? 0) > (prev.clicks ?? 0) + 10;
      })
      .sort((a: any, b: any) => {
        const prevA = gscPrevPageMap.get(a.keys?.[0]);
        const prevB = gscPrevPageMap.get(b.keys?.[0]);
        const gainA = (a.clicks ?? 0) - (prevA?.clicks ?? 0);
        const gainB = (b.clicks ?? 0) - (prevB?.clicks ?? 0);
        return gainB - gainA;
      })[0];

    if (topClickGain) {
      const prev = gscPrevPageMap.get(topClickGain.keys?.[0]);
      allWins.push({
        title: `Top Organic Click Gain: ${shortUrl(topClickGain.keys?.[0] ?? "")} +${fmtNum((topClickGain.clicks ?? 0) - (prev?.clicks ?? 0))} clicks`,
        evidence: `GSC: ${fmtNum(topClickGain.clicks ?? 0)} clicks (${pastWindowLabel}) vs ${fmtNum(prev?.clicks ?? 0)} prior quarter. ${fmtPctChange(topClickGain.clicks ?? 0, prev?.clicks ?? 0)} increase. Avg position: ${(topClickGain.position ?? 0).toFixed(1)}.`,
        source: "GSC",
      });
    }

    const bigPositionGain = gscPageRows
      .filter((r: any) => {
        const prev = gscPrevPageMap.get(r.keys?.[0]);
        return prev && (prev.position ?? 100) - (r.position ?? 100) > 3 && (r.impressions ?? 0) > 100;
      })
      .sort((a: any, b: any) => {
        const prevA = gscPrevPageMap.get(a.keys?.[0]);
        const prevB = gscPrevPageMap.get(b.keys?.[0]);
        return ((prevA?.position ?? 0) - (a.position ?? 0)) - ((prevB?.position ?? 0) - (b.position ?? 0));
      }).reverse()[0];

    if (bigPositionGain && allWins.length < 3) {
      const prev = gscPrevPageMap.get(bigPositionGain.keys?.[0]);
      const gain = ((prev?.position ?? 0) - (bigPositionGain.position ?? 0)).toFixed(1);
      allWins.push({
        title: `Ranking Improvement: ${shortUrl(bigPositionGain.keys?.[0] ?? "")} — up ${gain} positions`,
        evidence: `GSC: avg position improved from ${(prev?.position ?? 0).toFixed(1)} to ${(bigPositionGain.position ?? 0).toFixed(1)} (↑${gain} positions). Impressions: ${fmtNum(bigPositionGain.impressions ?? 0)}.`,
        source: "GSC",
      });
    }
  }

  if (ga4Available && ga4Funnel && ga4PrevFunnel && allWins.length < 3) {
    const sessChange = fmtPctChange(ga4Funnel.sessions, ga4PrevFunnel.sessions);
    const convChange = fmtPctChange(ga4Funnel.conversions, ga4PrevFunnel.conversions);
    if (ga4Funnel.sessions > ga4PrevFunnel.sessions || ga4Funnel.conversions > ga4PrevFunnel.conversions) {
      allWins.push({
        title: `Organic Growth: ${sessChange} sessions, ${convChange} conversions QoQ`,
        evidence: `GA4: ${fmtNum(ga4Funnel.sessions)} organic sessions (${sessChange}) and ${fmtNum(ga4Funnel.conversions)} conversions (${convChange}) vs prior quarter.`,
        source: "GA4",
      });
    }
  }

  if (sfAvailable && sfData.length > 0 && allWins.length < 3) {
    allWins.push({
      title: `Site Crawled: ${fmtNum(sfData.length)} URLs Analyzed`,
      evidence: `Screaming Frog: Full crawl of ${fmtNum(sfData.length)} URLs completed. Technical audit data available for all opportunity categories.`,
      source: "Multi-source",
    });
  }

  while (allWins.length < 3) {
    const placeholders = [
      { title: "Analytics Connections Needed for Win Detection", evidence: "Connect GSC, GA4, and call tracking to enable automated win detection from real data.", source: "N/A" },
      { title: "Manual Win Identification Required", evidence: "Review performance data in each connected tool to identify the top 3 positive outcomes from the quarter.", source: "N/A" },
      { title: "Prior Quarter Data Not Available", evidence: "Win comparison requires data from both the current and prior quarter.", source: "N/A" },
    ];
    allWins.push(placeholders[allWins.length] ?? placeholders[2]);
  }

  const allOpps: Array<Opportunity & { category: string }> = allCategories.flatMap(cat =>
    cat.opportunities.map(o => ({ ...o, category: cat.category_name }))
  );
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };
  const impactOrder = { High: 0, Med: 1, Low: 2 };

  const sortedForTop = [...allOpps].sort((a, b) => {
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pd !== 0) return pd;
    return impactOrder[a.impact] - impactOrder[b.impact];
  });

  const seenCats = new Set<string>();
  const topOpps: TopOpportunity[] = [];
  for (const o of sortedForTop) {
    if (topOpps.length >= 5) break;
    if (!seenCats.has(o.category) || topOpps.length < 3) {
      seenCats.add(o.category);
      topOpps.push({ title: o.opportunity_title, category: o.category, priority: o.priority, impact: o.impact, kpi: o.kpi_affected });
    }
  }

  const json: QbrPrepJson = {
    report_title: `QBR Prep – ${client.name} – ${pastWindowLabel} → Plan for ${futureLabel}`,
    client_name: client.name,
    past_window_label: pastWindowLabel,
    past_start: pastStart,
    past_end: pastEnd,
    future_window_label: futureLabel,
    generated_at: new Date().toISOString(),
    executive_summary: {
      wins: allWins.slice(0, 3),
      top_opportunities: topOpps.slice(0, 5),
    },
    opportunity_backlog: allCategories,
  };

  const markdown = buildMarkdown(json);
  console.log(`[QBR Prep] Done — ${allOpps.length} total opportunities across ${allCategories.length} categories`);
  return { json, markdown };
}

function buildMarkdown(j: QbrPrepJson): string {
  const lines: string[] = [];
  lines.push(`# ${j.report_title}`);
  lines.push(`**Generated:** ${new Date(j.generated_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`);
  lines.push(`**Analysis Window:** ${j.past_window_label} (${j.past_start} → ${j.past_end})`);
  lines.push(`**Planning Horizon:** ${j.future_window_label}`);
  lines.push("");
  lines.push("---");
  lines.push("## Executive Summary");
  lines.push(`### Top Wins — ${j.past_window_label}`);
  for (const win of j.executive_summary.wins) {
    lines.push(`- **${win.title}**`);
    lines.push(`  - *Evidence (${win.source}):* ${win.evidence}`);
  }
  lines.push("");
  lines.push(`### Top Opportunities for ${j.future_window_label}`);
  for (const opp of j.executive_summary.top_opportunities) {
    lines.push(`- **[${opp.priority} / ${opp.impact}] ${opp.title}** *(${opp.category})* — KPI: ${opp.kpi}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("## Opportunity Backlog");
  const catLetters = ["A", "B", "C", "D", "E", "F"];
  for (let ci = 0; ci < j.opportunity_backlog.length; ci++) {
    const cat = j.opportunity_backlog[ci];
    const letter = catLetters[ci] ?? String(ci + 1);
    lines.push(`### ${letter}. ${cat.category_name}`);
    lines.push("");
    if (cat.opportunities.length === 0) { lines.push("*No opportunities identified.*"); lines.push(""); continue; }
    for (let oi = 0; oi < cat.opportunities.length; oi++) {
      const o = cat.opportunities[oi];
      lines.push(`**${oi + 1}. ${o.opportunity_title}**`);
      lines.push(`- **Priority:** ${o.priority}  **Impact:** ${o.impact}  **Effort:** ${o.effort}  **KPI:** ${o.kpi_affected}`);
      if (o.urls.length > 0) lines.push(`- **URL(s):** ${o.urls.join(", ")}`);
      lines.push(`- **Evidence:** ${o.evidence}`);
      lines.push(`- **Problem:** ${o.problem}`);
      lines.push(`- **Opportunity:** ${o.opportunity}`);
      lines.push(`- **Why it matters:** ${o.why_it_matters}`);
      lines.push(`- **Recommended next step:** ${o.recommended_next_step}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
